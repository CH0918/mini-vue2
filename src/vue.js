class Vue {
  constructor(option) {
    this.$data = option.data;

    // 代理数据
    Object.keys(this.$data).forEach((key) => {
      Object.defineProperty(this, key, {
        enumerable: true,
        configurable: true,
        get() {
          return this.$data[key];
        },
        set(newVal) {
          this.$data[key] = newVal;
        },
      });
    });

    // 劫持所有数据
    Observe(this.$data);

    // 模板编译
    Compile(option.el, this);
  }
}

function Observe(data) {
  // 递归终止条件
  if (!data || typeof data !== 'object') return;
  const dep = new Dep();
  Object.keys(data).forEach((key) => {
    let value = data[key];
    Observe(value);
    Object.defineProperty(data, key, {
      enumerable: true,
      configurable: true,
      get() {
        // 收集依赖
        Dep.target && dep.addSub(Dep.target);
        return value;
      },
      set(newVal) {
        let oldVal = value;
        value = newVal;
        Observe(newVal);
        if (oldVal !== newVal) {
          // 触发依赖
          const keyArr = key.split('.');
          const targetKey = keyArr[keyArr.length - 1];
          dep.notify(targetKey);
        }
      },
    });
  });
}

function Compile(el, vm) {
  vm.$el = document.querySelector(el);
  const fragment = document.createDocumentFragment();
  while ((childNode = vm.$el.firstChild)) {
    replace(childNode);
    fragment.appendChild(childNode);
  }
  vm.$el.appendChild(fragment);

  function replace(node) {
    const regMustache = /\{\{\s*(\S+)\s*\}\}/;
    if (node.nodeType === 3) {
      const text = node.textContent;
      const result = regMustache.exec(text);
      if (result) {
        const mustacheValue = result[1].split('.').reduce((newObj, next) => {
          return newObj[next];
        }, vm);
        node.textContent = text.replace(regMustache, mustacheValue);
        new Watcher(vm, result[1], (newValue) => {
          node.textContent = text.replace(regMustache, newValue);
        });
      }
      return;
    }

    if (node.nodeType === 1 && node.tagName.toUpperCase() === 'INPUT') {
      const attrs = Array.from(node.attributes);
      const findResult = attrs.find((x) => x.name === 'v-model');
      if (findResult) {
        const key = findResult.value;
        const value = getValue(vm, key);
        node.value = value;
        // 为了model->view，添加订阅
        new Watcher(vm, key, (newValue) => {
          node.value = newValue;
        });
        // 监听input事件 实现view-model
        node.addEventListener('input', (e) => {
          const arr = key.split('.');
          const obj = arr
            .splice(0, arr.length - 1)
            .reduce((newObj, k) => newObj[k], vm);
          obj[arr[arr.length - 1]] = node.value;
        });
      }
    }

    node.childNodes.forEach((child) => {
      replace(child);
    });
  }
}

class Dep {
  constructor() {
    this.deps = [];
  }
  addSub(watcher) {
    this.deps.push(watcher);
  }
  notify(key) {
    const targetWatcherList = this.deps.filter((item) => {
      const keyArr = item.key.split('.');
      const targetKey = keyArr[keyArr.length - 1];
      return targetKey === key;
    });
    if (targetWatcherList?.length > 0) {
      targetWatcherList.forEach((targetWatcher) => {
        targetWatcher.update();
      });
    }
    // this.deps.forEach((watcher) => {

    //   watcher.update();
    // });
  }
}

class Watcher {
  constructor(vm, key, cb) {
    this.vm = vm;
    this.key = key;
    this.cb = cb;
    // 收集依赖
    Dep.target = this;
    getValue(vm, key);
    Dep.target = null;
  }
  update() {
    const newValue = getValue(this.vm, this.key);
    this.cb(newValue);
  }
}

function getValue(obj, key) {
  return key?.split('.').reduce((newObj, k) => {
    return newObj[k];
  }, obj);
}
