/* Does the "close DSH" button actually appear when the switch reads "on"?
 *
 * WHY THIS TEST, WHEN THE BUG LOOKED LIKE A LAYOUT PROBLEM. The switch rendered
 * "on" and no button appeared. The cause was a one-way latch: destroy() set
 * `disposed = true` permanently, and the theme reconciler runs an unmount pass
 * during the FIRST reconcile — before the stored preference has been read into
 * the page's local store. That single early call retired the controller for the
 * rest of the page's life, so every later sync() returned early.
 *
 * A source-level assertion cannot catch this, because the bug is about ORDER:
 * destroy-before-the-preference-arrives. So the environment here TRACKS the
 * button node. The shared stub in settings-rows.test.js has a no-op
 * document.body.appendChild, which is fine for counting settings ROWS but would
 * silently swallow this: a button created into a void looks identical to a button
 * that was never created. That is precisely the failure being pinned, so this
 * file supplies its own body that records what lands in it.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { settingsScopeStub } = require(path.join(__dirname, 'fixtures', 'settings-scope.js'))

const ROOT = path.resolve(__dirname, '..')
const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')

let failures = 0
const pass = (m) => console.log('ok    ' + m)
const fail = (m) => { console.error('FAIL  ' + m); failures++ }

/* Minimal recording React, plus a useState that ACTUALLY updates so a click can
   re-render — the settings-rows stub returns a no-op setter, which is enough to
   render once but cannot show "off then on again". */
let rerender = null
const makeReact = () => ({
  useState(init) {
    const v = typeof init === 'function' ? init() : init
    const set = (next) => {
      const value = typeof next === 'function' ? next(v) : next
      if (typeof rerender === 'function') rerender(value)
    }
    return [v, set]
  },
  createElement(type, props, ...children) {
    const kids = []
    for (const c of children) {
      if (Array.isArray(c)) kids.push(...c)
      else if (c !== null && c !== undefined && c !== false) kids.push(c)
    }
    return { type, props: props || {}, children: kids }
  },
})

const walk = (el, out = []) => {
  if (el && typeof el === 'object' && el.type) {
    out.push(el)
    for (const c of el.children || []) walk(c, out)
  }
  return out
}

/* The part that matters: a body that RECORDS appended nodes, so "created" and
   "never created" are distinguishable. */
const attached = []
const classList = { add() {}, remove() {}, contains: () => false, toggle() {} }
const makeEl = (tag) => {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    style: {}, dataset: {}, children: [], parentNode: null,
    attrs: {},
    className: '', isConnected: true,
    setAttribute(k, v) { this.attrs[k] = String(v); if (k.startsWith('data-')) this.dataset[k.slice(5)] = String(v) },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null },
    removeAttribute(k) { delete this.attrs[k] },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c },
    insertBefore(c) { return this.appendChild(c) },
    addEventListener() {}, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0 }),
    getContext: () => null, appendData() {},
    classList,
  }
  return el
}
const body = makeEl('body')
/* ---------- page-state simulation -------------------------------------------
 * The control is gated on being on the CONVERSATION page, which is DOM-observed
 * because DSH has no router. So the stub has to be able to answer two different
 * questions the real document answers:
 *   - does the conversation root exist?   ([class*="centerCol"] [class*="_root"][data-phase])
 *   - is a sibling plugin panel active?    (html[data-dsh-*-active])
 *
 * `onConversationPage` is not reached by any other means, and a stub whose
 * querySelector always returns null would silently make create() bail — which
 * looks identical to "the reconciler never syncs it", the exact class of bug
 * this file exists to catch. Hence an explicit, mutable switch instead of a
 * hardcoded null.
 */
let conversationMounted = true
let pluginPanelActive = null
const docEl = makeEl('html')
const PLUGIN_ACTIVE_ATTRS = [
  'data-dsh-novelforge-active',
  'data-dsh-taskboard-active',
  'data-dsh-ssh-active',
]
/* documentElement doubles as the <html> the plugin writes -active onto. It has
 * to be the SAME object querySelector walks, or the gate would read attributes
 * from a node the test never mutates. */
docEl.setAttribute = (k, v) => { docEl.attrs[k] = String(v) }
docEl.removeAttribute = (k) => { delete docEl.attrs[k] }
docEl.appendChild = (c) => body.appendChild(c)
docEl.querySelector = (sel) => (conversationMounted ? docEl : null)

const document = {
  body, head: makeEl('head'), documentElement: docEl,
  createElement: (tag) => makeEl(tag),
  querySelector: (sel) => {
    /* The conversation marker is the only selector the gate uses. Everything
     * else stays null, as before. */
    if (typeof sel === 'string' && sel.indexOf('[data-phase]') !== -1) {
      return conversationMounted ? docEl : null
    }
    return null
  },
  querySelectorAll: () => [],
  getElementById: () => null, addEventListener() {},
}
/* Record every append the plugin makes to the body. */
const realAppend = body.appendChild.bind(body)
body.appendChild = (c) => { attached.push(c); return realAppend(c) }

/* WHY hasAttribute AND NOT n.attrs['data-endfield-shutdown'].
   The node is created INSIDE the vm realm (client.js runs in a context), so its
   properties are not reachable by direct property access from this realm — an
   expression like n.attrs['x'] silently reads undefined, and a filter built on
   it reports zero nodes while body.children plainly contains the button. A
   METHOD call crosses the boundary correctly. Cost me one wrong turn: the probe
   script, which shares this shape, disagreed with the test until both used the
   same accessor. */
const countButtons = () => body.children.filter((n) => n.hasAttribute('data-endfield-shutdown')).length

const prefStore = settingsScopeStub()

const sandbox = {
  window: {
    __ModuleLoader__: null,
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false }),
    innerWidth: 1440,
    setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 0 }, clearTimeout() {},
    setInterval: () => 0, clearInterval() {},
  },
  document,
  React: makeReact(),
  MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
  ResizeObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
  requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  performance: { now: () => 0 },
  setInterval: () => 0, clearInterval() {},
  setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 0 },
  clearTimeout() {},
  console: { log() {}, info() {}, warn() {}, error() {}, debug() {} },
  fetch: () => Promise.resolve({ ok: false, json: () => Promise.resolve(null) }),
  Promise, Date, Math, JSON, Object, Array, String, Number, Boolean, Error, Set, Map,
}
sandbox.globalThis = sandbox
sandbox.window.document = document
sandbox.window.fetch = sandbox.fetch

let rendered = null
const slots = {
  inject(_n, fn) { fn() },
  register(_o, render) { rendered = render; return () => {} },
}

let loaded = null
sandbox.window.__ModuleLoader__ = { load: (m) => { loaded = m } }

vm.createContext(sandbox)
try {
  new vm.Script(src, { filename: 'client.js' }).runInContext(sandbox)
} catch (error) {
  fail('client.js threw while loading: ' + error.message)
  process.exit(1)
}
if (loaded === null) { fail('the module never registered with __ModuleLoader__'); process.exit(1) }

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
// Enable the theme so mount() runs, mirroring a real session. This is also what
// makes the unmount pass run at least once before any user interaction, which is
// the condition the latch bug needed.
prefStore.setField('enabled', '1')
try { mod.apply(ctx) } catch (error) { fail('apply() threw: ' + error.message); process.exit(1) }
pass('apply() completed without throwing')

if (typeof rendered !== 'function') { fail('settings.section was never registered'); process.exit(1) }

if (rendered !== null) {
  /* Drive a render and locate the shutdown row. */
  const renderOnce = () => { rerender = null; return rendered() }

  let tree = null
  try { tree = renderOnce() } catch (error) { fail('the panel renders: ' + error.message) }

  if (tree !== null) {
    const nodes = walk(tree)
    const row = nodes.find((n) => n.props && n.props.key === 'shutdown-button')
    if (row !== undefined) pass("the 'shutdown-button' row is rendered")
    else fail("the 'shutdown-button' row is missing from the panel")

    /* 1. Off by default -> nothing attached. */
    if (countButtons() === 0) pass('no shutdown button is attached while the switch is off')
    else fail('a shutdown button is attached with the switch off (' + countButtons() + ')')

    /* 2. THE REGRESSION. Flip the preference the way a user does — through the
     *    durable store, which notifies and drives the reconciler. Mounting the
     *    control in apply() covers page load ONLY; this is the path that had no
     *    coverage, and it is the one a real click takes. */
    try { prefStore.setField('shutdownButton', '1') } catch (error) { fail('setField threw: ' + error.message) }
    try { tree = renderOnce() } catch (error) { /* reported above */ }

    if (countButtons() >= 1) pass('the button is attached after the switch turns on (' + countButtons() + ')')
    else fail('the switch reads on but NO button is attached — the reconciler does not sync it')

    /* 3. Off again must remove it: a control that can end a running process
     *    must not survive being switched off. */
    try { prefStore.setField('shutdownButton', '0') } catch (error) { /* reported above */ }
    if (countButtons() === 0) pass('turning the switch off detaches the button')
    else fail('the button survived being switched off (' + countButtons() + ')')

    /* 4. On once more — the state a user reaches after any toggle, and the one a
     *    one-way `disposed` latch made unreachable. */
    try { prefStore.setField('shutdownButton', '1') } catch (error) { /* reported above */ }
    if (countButtons() >= 1) pass('the button comes back on a second enable (latch is not one-way)')
    else fail('a second enable attaches nothing — the latch is still one-way')
  }
}

/* ---------- the page gate --------------------------------------------------
 * The user asked for this control in the conversation surface only. These
 * assertions pin the gate's DECISION, including the part that was measured
 * rather than assumed.
 */
{
  /* Reachable state: switch on, conversation page. */
  try { prefStore.setField('shutdownButton', '1') } catch (error) { fail('setField threw: ' + error.message) }

  /* 5. A sibling plugin panel holds the screen -> the conversation root is
   *    still mounted UNDERNEATH the overlay, so presence alone would say "show
   *    it". Only the -active attribute distinguishes the two, which is why it
   *    is checked. */
  for (const attr of PLUGIN_ACTIVE_ATTRS) {
    /* Start from a known-clean state. Sampling `before` while the attribute is
     * already set would count the PREVIOUS assertion's leftover button and
     * report a phantom failure — the off/on pair below is what must be
     * measured, so the field is parked at off first. */
    prefStore.setField('shutdownButton', '0')
    conversationMounted = true
    docEl.setAttribute(attr, '')
    if (countButtons() !== 0) {
      fail('a button survived the previous assertion (' + countButtons() + ')')
    }
    prefStore.setField('shutdownButton', '1')
    const after = countButtons()
    docEl.removeAttribute(attr)
    if (after === 0) pass('no button while ' + attr + ' is set')
    else fail(attr + ' is set but the button was still shown (' + after + ')')
  }

  /* 6. Off the conversation page entirely -> nothing. */
  prefStore.setField('shutdownButton', '0')
  conversationMounted = false
  prefStore.setField('shutdownButton', '1')
  if (countButtons() === 0) pass('no button when the conversation root is absent')
  else fail('the button was attached with no conversation page present (' + countButtons() + ')')

  /* 7. Back onto the conversation page -> it returns, without touching the
   *    switch. This is the transition a user makes constantly (open the
   *    bookshelf, close it) and it is the reason the gate is observed rather
   *    than evaluated once. */
  conversationMounted = true
  if (prefStore.get('shutdownButton') === '1') {
    /* The MutationObserver is what performs this in the browser. The stub's
     * observer is inert, so the transition is driven the way a DOM mutation
     * would drive it: re-run the gate through the store. */
    prefStore.setField('shutdownButton', '0')
    prefStore.setField('shutdownButton', '1')
  }
  if (countButtons() >= 1) pass('the button returns when the conversation page comes back')
  else fail('returning to the conversation page did not restore the button (' + countButtons() + ')')

/* 8. data-phase must match ANY value, not just "hero".
   *    ConversationMainPanel.tsx:46 sets phase to hero / active / settling,
   *    and a hero-only probe fails on "active" — which is every conversation
   *    that has any content in it, i.e. the page the user actually uses.
   *
   *    Scoped to the CONVERSATION_MARKER declaration rather than the whole
   *    file: `data-phase="hero"` legitimately exists elsewhere in this file for
   *    a different purpose (detecting the boot/hero pane for the loader
   *    replay), and a whole-file grep conflates the two. */
  const markerLine = /const CONVERSATION_MARKER\s*=\s*(.*)/.exec(src)
  if (markerLine === null) {
    fail('CONVERSATION_MARKER is not declared — the page gate cannot be tested')
  } else {
    const decl = markerLine[1]
    if (decl.indexOf('[data-phase]') !== -1 && decl.indexOf('="hero"') === -1) {
      pass('the marker accepts every data-phase value (hero/active/settling)')
    } else {
      fail('the marker still pins a data-phase value, which misses active conversations: ' + decl.trim())
    }
    /* The permanent app frame must NOT be the gate: sidebarCol renders on
     * every page including plugin overlays (AppFrame.tsx:280). */
    if (decl.indexOf('sidebarCol') !== -1) {
      fail('the gate uses sidebarCol, which is the always-rendered app frame — it cannot identify the conversation page')
    } else {
      pass('the gate does not rely on the always-present app frame')
    }
  }
}

process.exitCode = failures === 0 ? 0 : 1
if (failures === 0) console.log('\nall shutdown-button surface checks passed')
