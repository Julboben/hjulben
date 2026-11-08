// A minimal DOM stub, just enough to import the editor module and drive it.
//
// This exists because two real bugs were invisible to every other check: a
// malformed data path that threw, and a canvas call with a bad argument. Neither
// shows up in a source review, and a test that reimplements the editor's logic
// only verifies the copy rather than the code that runs. Importing the real
// module against a stub is what makes them visible.

class ClassList {
  constructor() { this.set = new Set(); }
  add(name) { this.set.add(name); }
  remove(name) { this.set.delete(name); }
  toggle(name, force) { if (force) this.set.add(name); else this.set.delete(name); }
  contains(name) { return this.set.has(name); }
}

class Element {
  constructor(tag, id) {
    this.tagName = String(tag).toUpperCase();
    this.id = id || '';
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.classList = new ClassList();
    this.attributes = new Map();
    this.listeners = new Map();
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.checked = false;
    this.textContent = '';
    this.innerHTML = '';
    this._html = '';
    this.options = [];
    this.width = 0;
    this.height = 0;
    // The editor sizes its view from these, and render() bails out when they are
    // zero, so the stub has to report a real size or nothing is ever drawn.
    this.clientWidth = 1200;
    this.clientHeight = 800;
  }
  get firstChild() { return this.children[0] || null; }
  append(...nodes) { for (const node of nodes) { this.children.push(node); if (node.id) byId.set(node.id, node); } }
  replaceChildren(...nodes) { this.children = []; for (const node of nodes) { this.children.push(node); if (node.id) byId.set(node.id, node); } }
  append(...nodes) { for (const node of nodes) { this.children.push(node); if (node.id) byId.set(node.id, node); } }
  prepend(...nodes) { this.children.unshift(...nodes); }
  scrollIntoView() {}
  get classList2() { return this.classList; }
  /** A stub element, as document.createElement would return. */
  appendChild(node) { this.children.push(node); return node; }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  removeEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    this.listeners.set(type, list.filter(entry => entry !== handler));
  }
  dispatch(type, event = {}) {
    for (const handler of this.listeners.get(type) || []) handler({ target: this, preventDefault() {}, stopPropagation() {}, ...event });
    runFrames();
  }
  setPointerCapture() {}
  releasePointerCapture() {}
  focus() {}
  blur() {}
  click() { this.dispatch('click'); }
  getContext(kind) { return contexts.get(this) || createContextStub(); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1200, height: 800 }; }
  querySelectorAll(selector) { return selectAll(selector); }
  querySelector(selector) { return selectAll(selector)[0] || null; }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  closest() { return null; }
  get offsetWidth() { return 100; }
  get offsetHeight() { return 100; }
  toDataURL() { return 'data:,'; }
}

const byId = new Map();
const byClass = new Map(); // class name -> elements, for querySelector('.name')
const contexts = new Map();

/** Parses ids and data-tool values out of the editor markup. */
export function buildDom(html) {
  byId.clear();
  byClass.clear();
  contexts.clear();
  registry.clear();
  const dom = installGlobals();
  // Tags are matched across newlines, because the editor writes attributes on
  // their own lines and a single-line match would miss elements such as the
  // playtest dialog, whose `hidden` is several lines below its id.
  const tag = /<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  for (const match of html.matchAll(tag)) {
    const name = match[1];
    const attributes = match[2];
    const id = /id="([^"]+)"/.exec(attributes)?.[1] || '';
    const element = new Element(name, id);
    const tool = /data-tool="([^"]+)"/.exec(attributes)?.[1];
    if (tool) element.dataset.tool = tool;
    const type = /type="([^"]+)"/.exec(attributes)?.[1];
    if (type) element.type = type;
    if (/\bhidden\b/.test(attributes)) element.hidden = true;
    if (/\bchecked\b/.test(attributes)) element.checked = true;
    if (id) {
      registry.set(id, element);
      byId.set(id, element);
    }
    for (const name of (/class="([^"]+)"/.exec(attributes)?.[1] || '').split(/\s+/).filter(Boolean)) {
      if (!byClass.has(name)) byClass.set(name, []);
      byClass.get(name).push(element);
    }
  }
  // Every tool button, so querySelectorAll('[data-tool]') resolves.
  for (const match of html.matchAll(/data-tool="([^"]+)"/g)) {
    const button = new Element('button');
    button.dataset.tool = match[1];
    byId.set(`tool:${match[1]}`, button);
  }
  return dom;
}

function selectAll(selector) {
  if (selector === '[data-tool]') return [...byId.entries()].filter(([id]) => id.startsWith('tool:')).map(([, element]) => element);
  if (selector.startsWith('#')) return byId.get(selector.slice(1)) ? [byId.get(selector.slice(1))] : [];
  if (selector.startsWith('.')) return byClass.get(selector.slice(1)) || [];
  return [];
}

/**
 * The context methods the editor actually calls. Anything not listed returns a
 * no-op, which is what a real canvas would do for an unknown method name.
 */
const CONTEXT_METHODS = new Set([
  'fill', 'stroke', 'clearRect', 'save', 'restore', 'beginPath', 'closePath',
  'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'fillRect', 'strokeRect',
  'bezierCurveTo', 'quadraticCurveTo', 'translate', 'scale', 'rotate', 'setTransform',
  'resetTransform', 'clip', 'drawImage', 'putImageData',
]);

/**
 * A recording 2D context that rejects the calls a real canvas rejects.
 * `stroke()` takes no arguments; passing a fill rule to it is a TypeError.
 */
export function createContextStub() {
  const calls = [];
  const method = name => (...args) => {
    if (name === 'stroke' && args.length > 0) {
      throw new TypeError(`Failed to execute 'stroke' on 'CanvasRenderingContext2D': parameter 1 is not of type 'Path2D'`);
    }
    if (name === 'fill' && args.length > 1) {
      throw new TypeError(`Failed to execute 'fill': too many arguments`);
    }
    calls.push([name, ...args]);
  };
  return new Proxy({
    canvas: { width: 1200, height: 800 },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
    calls,
  }, {
    get(target, property) {
      if (property in target) return target[property];
      if (property === 'measureText') return () => ({ width: 10 });
      if (property === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (property === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      // Only real context methods go through the checking wrapper; anything
      // else (getters like fillStyle, unknown future methods) is a no-op.
      if (typeof property === 'string' && CONTEXT_METHODS.has(property)) return method(property);
      return () => {};
    },
    set(target, property, value) { target[property] = value; return true; },
  });
}

// One registry of stub elements, shared by buildDom and installGlobals so an
// element parsed from the markup is the same object the editor looks up, with
// its markup-derived state such as `hidden` intact.
const registry = new Map();

/** Installs the globals the editor module expects, and returns a teardown. */
// Animation frames run after each event, as a browser draws one before the
// next event could be seen. A frame asked for while they run waits for the
// next event, so an animation that keeps asking can't loop forever.
const frames = new Map();
let lastFrame = 0;

/** Run the animation frames asked for so far. */
export function runFrames() {
  const due = [...frames];
  frames.clear();
  for (const [, callback] of due) callback(0);
}

export function installGlobals() {
  const saved = new Map();
  const ids = registry;
  // Node defines some of these as accessor properties, so plain assignment is
  // not always allowed; defineProperty is.
  const set = (name, value) => {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  };
  set('window', globalThis);
  // The editor listens on the window, so the global object needs those methods.
  globalThis.addEventListener ||= () => {};
  globalThis.removeEventListener ||= () => {};
  globalThis.postMessage ||= () => {};
  set('document', {
    activeElement: null,
    getElementById: id => ids.get(id) || null,
    querySelectorAll: selector => selectAll(selector),
    querySelector: selector => selectAll(selector)[0] || null,
    createElement: tag => new Element(tag),
    createElementNS: (ns, tag) => new Element(tag),
    body: new Element('body'),
    getSelection: () => null,
    // Recorded so clipboard events can be driven.
    listeners: new Map(),
    addEventListener(type, handler) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(handler);
    },
  });
  set('localStorage', {
    store: new Map(),
    getItem(key) { return this.store.has(key) ? this.store.get(key) : null; },
    setItem(key, value) { this.store.set(key, String(value)); },
    removeItem(key) { this.store.delete(key); },
  });
  set('navigator', { userAgent: 'node' });
  set('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  set('WheelEvent', { DOM_DELTA_LINE: 1 });
  set('requestAnimationFrame', callback => {
    frames.set(++lastFrame, callback);
    return lastFrame;
  });
  set('cancelAnimationFrame', id => frames.delete(id));
  set('OffscreenCanvas', undefined);
  set('ImageData', class { constructor(data, width, height) { Object.assign(this, { data, width, height }); } });
  set('Image', class { set src(value) {} });
  set('HTMLElement', Element);
  // No stylesheets here, so every CSS token reads as unset.
  set('getComputedStyle', () => ({ getPropertyValue: () => '' }));
  return {
    ids,
    /** True when the element already exists, so its markup state is preserved. */
    has: id => ids.has(id),
    element: (id) => {
      if (ids.has(id)) return ids.get(id);
      const element = new Element('div', id);
      ids.set(id, element);
      return element;
    },
    restore() {
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
      registry.clear();
    },
  };
}
