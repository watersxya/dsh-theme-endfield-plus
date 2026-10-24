/* Manual driver for the shutdown route — prints what actually happens.
 * Kept as a file because the flow spans a setTimeout, and an inline -e string
 * cannot be read or edited when it misbehaves. */
const sb = require('../lib/system-bridge.js')

let called = null
/* One context that answers BOTH services. The first version of this probe gave
   registerSystemBridge a webServer-only context, so the handler's appExit lookup
   (which runs per request, by design) found nothing and answered 409 — the probe
   was wrong, not the bridge. A realistic context must serve both. */
const appExit = (code) => { called = code }
const ctx = {
  get(k) {
    if (k === 'appExit') return appExit
    if (k === 'webServer') return { register(r) { routes.push(r); return () => {} } }
    throw new Error('service absent: ' + k)
  },
}

const routes = []
sb.registerSystemBridge(ctx)

console.log('routes mounted :', routes.length, '| path:', routes[0] && routes[0].path)
console.log('canShutdown    :', JSON.stringify(sb.canShutdown(ctx)))

const listeners = {}
const req = {
  method: 'POST',
  url: '/theme-endfield/system/shutdown',
  on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); return this },
}
const res = {
  statusCode: 0,
  body: null,
  writeHead(code) { this.statusCode = code },
  end(payload) { this.body = payload; console.log('response       :', this.statusCode, payload) },
}

routes[0].handler(req, res)
console.log('listeners      :', Object.keys(listeners).join(', '))
for (const fn of listeners.data || []) fn('')
for (const fn of listeners.end || []) fn()

setTimeout(() => {
  console.log('appExit called :', called)
  console.log(called === sb.SHUTDOWN_EXIT_CODE
    ? 'VERDICT        : OK — the route asked the launcher to exit'
    : 'VERDICT        : FAIL — appExit was never called with the expected code')
}, 250)
