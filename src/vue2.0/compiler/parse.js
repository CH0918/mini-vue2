import { isUnaryTag } from '../utils.js';
/**
 * 解析模版字符串，生成 AST 语法树
 * @param {*} template 模版字符串
 * @returns {AST} root ast 语法树
 */
export default function parse(template) {
  // 存放所有的未配对的开始标签的 AST 对象
  const stack = [];
  // 最终的 AST 语法树
  let root = null;
  // <div id="app">xxxxxx</div>
  let html = template;
  while (html.trim()) {
    // 过滤注释标签
    if (html.indexOf('<!--') === 0) {
      // 说明开始位置是一个注释标签，忽略掉
      html = html.slice(html.indexOf('-->') + 3);
      continue;
    }
    // 匹配开始标签
    const startIdx = html.indexOf('<');
    if (startIdx === 0) {
      // <div></div>
      if (html.indexOf('</') === 0) {
        // 说明是闭合标签
        parseEnd();
      } else {
        // 处理开始标签
        parseStartTag();
      }
    } else if (startIdx > 0) {
      // 说明在开始标签之间有一段文本内容，在 html 中找到下一个标签的开始位置
      const nextStartIdx = html.indexOf('<');
      // 如果栈为空，则说明这段文本不属于任何一个元素，直接丢掉，不做处理
      if (stack.length) {
        // 走到这里说说明栈不为空，则处理这段文本，并将其放到栈顶元素的肚子里
        processChars(html.slice(0, nextStartIdx));
      }
      html = html.slice(nextStartIdx);
    } else {
      // 说明没有匹配到开始标签，整个 html 就是一段文本
    }
  }
  return root;

  // parseStartTag 函数的声明
  /**
   * 解析开始标签
   * 比如： <div id="app">...</div>
   */
  function parseStartTag() {
    // 先找到开始标签的结束位置 >
    const end = html.indexOf('>');
    // 解析开始标签里的内容 <内容>，标签名 + 属性，比如: div id="app"
    const content = html.slice(1, end);
    // 截断 html，将上面解析的内容从 html 字符串中删除
    html = html.slice(end + 1);
    // 找到 第一个空格位置
    const firstSpaceIdx = content.indexOf(' ');
    // 标签名和属性字符串
    let tagName = '',
      attrsStr = '';
    if (firstSpaceIdx === -1) {
      // 没有空格，则认为 content 就是标签名，比如 <h3></h3> 这种情况，content = h3
      tagName = content;
      // 没有属性
      attrsStr = '';
    } else {
      tagName = content.slice(0, firstSpaceIdx);
      // content 的剩下的内容就都是属性了，比如 id="app" xx=xx
      attrsStr = content.slice(firstSpaceIdx + 1);
    }
    // 得到属性数组，[id="app", xx=xx]
    const attrs = attrsStr ? attrsStr.split(' ') : [];
    // 进一步解析属性数组，得到一个 Map 对象
    const attrMap = parseAttrs(attrs);
    // 生成 AST 对象
    const elementAst = generateAST(tagName, attrMap);
    // 如果根节点不存在，说明当前节点为整个模版的第一个节点
    if (!root) {
      root = elementAst;
    }
    // 将 ast 对象 push 到栈中，当遇到结束标签的时候就将栈顶的 ast 对象 pop 出来，它两就是一对儿
    stack.push(elementAst);

    // 自闭合标签，则直接调用 end 方法，进入闭合标签的处理截断，就不入栈了
    if (isUnaryTag(tagName)) {
      processElement();
    }
  }
  // ...
  // processElement 函数的声明
  /**
   * 处理元素的闭合标签时会调用该方法
   * 进一步处理元素上的各个属性，将处理结果放到 attr 属性上
   */
  function processElement() {
    // 弹出栈顶元素，进一步处理该元素
    const curEle = stack.pop();
    const stackLen = stack.length;
    // 进一步处理 AST 对象中的 rawAttr 对象 { attrName: attrValue, ... }
    const { tag, rawAttr } = curEle;
    // 处理结果都放到 attr 对象上，并删掉 rawAttr 对象中相应的属性
    curEle.attr = {};
    // 属性对象的 key 组成的数组
    const propertyArr = Object.keys(rawAttr);

    if (propertyArr.includes('v-model')) {
      // 处理 v-model 指令
      processVModel(curEle);
    } else if (propertyArr.find((item) => item.match(/^v-bind:(.*)/))) {
      // 处理 v-bind 指令，比如 <span v-bind:test="xx" />
      processVBind(curEle, RegExp.$1, rawAttr[`v-bind:${RegExp.$1}`]);
    } else if (propertyArr.find((item) => item.match(/^v-on:(.*)/))) {
      // 处理 v-on 指令，比如 <button v-on:click="add"> add </button>
      processVOn(curEle, RegExp.$1, rawAttr[`v-on:${RegExp.$1}`]);
    }

    // 处理插槽内容
    processSlotContent(curEle);

    // 节点处理完以后让其和父节点产生关系
    if (stackLen) {
      stack[stackLen - 1].children.push(curEle);
      curEle.parent = stack[stackLen - 1];

      // 如果节点存在 slotName，则说明该节点是组件传递给插槽的内容
      // 将插槽信息放到组件节点的 rawAttr.scopedSlots 对象上
      // 而这些信息在生成组件插槽的 VNode 时（renderSlot）会用到
      if (curEle.slotName) {
        const { parent, slotName, scopeSlot, children } = curEle;
        // 这里关于 children 的操作，只是单纯为了避开 JSON.stringify 的循环引用问题
        // 因为生成渲染函数时需要对 attr 执行 JSON.stringify 方法
        const slotInfo = {
          slotName,
          scopeSlot,
          children: children.map((item) => {
            delete item.parent;
            return item;
          }),
        };
        if (parent.rawAttr.scopedSlots) {
          parent.rawAttr.scopedSlots[curEle.slotName] = slotInfo;
        } else {
          parent.rawAttr.scopedSlots = { [curEle.slotName]: slotInfo };
        }
      }
    }
  }

  // processVModel 函数的声明
  // ...
  // processVOn 函数的声明

  /**
   * 处理结束标签，比如: <div id="app">...</div>
   */
  function parseEnd() {
    // 将结束标签从 html 字符串中截掉
    html = html.slice(html.indexOf('>') + 1);
    // 处理栈顶元素
    processElement();
  }

  /**
   * 解析属性数组，得到一个属性 和 值组成的 Map 对象
   * @param {*} attrs 属性数组，[id="app", xx="xx"]
   */
  function parseAttrs(attrs) {
    const attrMap = {};
    for (let i = 0, len = attrs.length; i < len; i++) {
      const attr = attrs[i];
      const [attrName, attrValue] = attr.split('=');
      attrMap[attrName] = attrValue.replace(/"/g, '');
    }
    return attrMap;
  }

  /**
   * 生成 AST 对象
   * @param {*} tagName 标签名
   * @param {*} attrMap 标签组成的属性 map 对象
   */
  function generateAST(tagName, attrMap) {
    return {
      // 元素节点
      type: 1,
      // 标签
      tag: tagName,
      // 原始属性 map 对象，后续还需要进一步处理
      rawAttr: attrMap,
      // 子节点
      children: [],
    };
  }

  /**
   * 处理文本
   * @param {string} text
   */
  function processChars(text) {
    // 去除空字符或者换行符的情况
    if (!text.trim()) return;

    // 构造文本节点的 AST 对象
    const textAst = {
      type: 3,
      text,
    };
    if (text.match(/{{(.*)}}/)) {
      // 说明是表达式
      textAst.expression = RegExp.$1.trim();
    }
    // 将 ast 放到栈顶元素的肚子里
    stack[stack.length - 1].children.push(textAst);
  }

  /**
   * 处理 v-model 指令，将处理结果直接放到 curEle 对象身上
   * @param {*} curEle
   */
  function processVModel(curEle) {
    const { tag, rawAttr, attr } = curEle;
    const { type, 'v-model': vModelVal } = rawAttr;

    if (tag === 'input') {
      if (/text/.test(type)) {
        // <input type="text" v-model="inputVal" />
        attr.vModel = { tag, type: 'text', value: vModelVal };
      } else if (/checkbox/.test(type)) {
        // <input type="checkbox" v-model="isChecked" />
        attr.vModel = { tag, type: 'checkbox', value: vModelVal };
      }
    } else if (tag === 'textarea') {
      // <textarea v-model="test" />
      attr.vModel = { tag, value: vModelVal };
    } else if (tag === 'select') {
      // <select v-model="selectedValue">...</select>
      attr.vModel = { tag, value: vModelVal };
    }
  }

  /**
   * 处理 v-bind 指令
   * @param {*} curEle 当前正在处理的 AST 对象
   * @param {*} bindKey v-bind:key 中的 key
   * @param {*} bindVal v-bind:key = val 中的 val
   */
  function processVBind(curEle, bindKey, bindVal) {
    curEle.attr.vBind = { [bindKey]: bindVal };
  }

  /**
   * 处理 v-on 指令
   * @param {*} curEle 当前被处理的 AST 对象
   * @param {*} vOnKey v-on:key 中的 key
   * @param {*} vOnVal v-on:key="val" 中的 val
   */
  function processVOn(curEle, vOnKey, vOnVal) {
    curEle.attr.vOn = { [vOnKey]: vOnVal };
  }

  /**
   * 处理插槽
   * <scope-slot>
   *   <template v-slot:default="scopeSlot">
   *     <div>{{ scopeSlot }}</div>
   *   </template>
   * </scope-slot>
   * @param { AST } el 节点的 AST 对象
   */
  function processSlotContent(el) {
    // 注意，具有 v-slot:xx 属性的 template 只能是组件的根元素，这里不做判断
    if (el.tag === 'template') {
      // 获取插槽信息
      // 属性 map 对象
      const attrMap = el.rawAttr;
      // 遍历属性 map 对象，找出其中的 v-slot 指令信息
      for (let key in attrMap) {
        if (key.match(/v-slot:(.*)/)) {
          // 说明 template 标签上 v-slot 指令
          // 获取指令后的插槽名称和值，比如: v-slot:default=xx
          // default
          const slotName = (el.slotName = RegExp.$1);
          // xx
          el.scopeSlot = attrMap[`v-slot:${slotName}`];

          // 直接 return，因为该标签上只可能有一个 v-slot 指令
          return;
        }
      }
    }
  }
}
