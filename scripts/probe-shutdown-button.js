/* Direct probe: does syncShutdownButton attach the node when the store says on?
 * Bypasses the settings machinery entirely, so it answers the plugin question
 * without the harness standing in the way. */
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { settingsScopeStub } = require(path.join(__dirname, '..', 'test', 'fixtures', 'settings-scope.js'))

const attached = []
const makeEl = (tag) => ({
  tagName: String(tag).toUpperCase(), style: {}, dataset: {}, children: [], parentNode: null,
  attrs: {}, className: '', isConnected: true,
  setAttribute(k, v) { this.attrs[k] = String(v) },
  getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k] },
  removeAttribute(k) { delete this.attrs[k] },
  hasAttribute(k) { return this.attrs[k] !== undefined },
  appendChild(c) { this.children.push(c); c.parentNode = this; return c },
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c },
  insertBefore(c) { return this.appendChild(c) },
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null, querySelectorAll: () => [],
  getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0 }),
  getContext: () => null, appendData() {},
  classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
})
const body = makeEl('body')
const document = {
  body, head: makeEl('head'),
  createElement: (t) => makeEl(t),
  querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {},
}
const rawAppend = body.appendChild.bind(body)
body.appendChild = (c) => { attached.push(c); return rawAppend(c) }

let slotsRender = null
const slots = { inject(_n, fn) { fn() }, register(_o, r) { slotsRender = r; return () => {} } }
const React = {
  useState(init) { return [typeof init === 'function' ? init() : init, () => {}] },
  createElement(type, props, ...kids) {
    const out = []
    for (const k of kids) { if (Array.isArray(k)) out.push(...k); else if (k != null && k !== false) out.push(k) }
    return { type, props: props || {}, children: out }
  },
}

const prefStore = settingsScopeStub()
const sandbox = {
  window: {
    __ModuleLoader__: null, addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false }), innerWidth: 1440,
    setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 0 }, clearTimeout() {},
    setInterval: () => 0, clearInterval() {},
  },
  document, React,
  MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
  ResizeObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
  requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  performance: { now: () => 0 },
  setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 0 },
  clearTimeout() {}, setInterval: () => 0, clearInterval() {},
  console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
  fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
  Promise, Date, Math, JSON, Object, Array, String, Number, Boolean, Error, Set, Map,
}
sandbox.globalThis = sandbox
sandbox.window.document = document
sandbox.window.fetch = sandbox.fetch

let loaded = null
sandbox.window.__ModuleLoader__ = { load: (m) => { loaded = m } }
vm.createContext(sandbox)
new vm.Script(fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8'), { filename: 'client.js' }).runInContext(sandbox)

const mod = loaded.factory(() => null)
const ctx = {
  get: (n) => {
    if (n === 'theme') return { overrideTokens: () => () => {} }
    if (n === 'slots') return slots
    if (n === 'settingsScope') return prefStore.binder
    return undefined
  },
  effect: () => {},
}
prefStore.setField('enabled', '1')
mod.apply(ctx)

const buttons = () => body.children.filter((n) => n.attrs['data-endfield-shutdown'] !== undefined)

console.log('scope bound?           ', typeof prefStore.binder.bind().subscribe === 'function')
console.log('after apply (off):     ', buttons().length, 'button(s)')
prefStore.setField('shutdownButton', '1')
console.log('after setField on:     ', buttons().length, 'button(s)')
prefStore.setField('shutdownButton', '0')
console.log('after setField off:    ', buttons().length, 'button(s)')
prefStore.setField('shutdownButton', '1')
console.log('after second on:       ', buttons().length, 'button(s)')

if (buttons().length >= 1) {
  const b = buttons()[buttons().length - 1]
  console.log('node text              :', JSON.stringify(b.textContent))
  console.log('node position          :', b.style.position)
console.log('body.children          :', body.children.length)
console.log('buttons still in DOM   :', body.children.filter(n=>n.attrs['data-endfield-shutdown']!==undefined).length)
  console.log('VERDICT                : OK — the control attaches when the store says on')
} else {
  console.log('VERDICT                : FAIL — the control never attaches')
}
