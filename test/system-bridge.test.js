/* The "close DSH" control.
 *
 * This is the only capability in the package that can END A RUNNING PROCESS, so
 * these tests are mostly about the boundary rather than the feature:
 *
 *   1. IT MUST NOT BE ABLE TO REACH THE MACHINE. The host half calls the
 *      launcher's `appExit` and has no other exit path. A test asserts the
 *      absence of any power-management route (shutdown.exe, Stop-Computer,
 *      powrprof) in the source, because a theme plugin being able to power off
 *      the user's computer is a categorically different thing from a theme
 *      plugin being able to stop the process it runs inside.
 *
 *   2. IT MUST REFUSE WITHOUT `appExit`. `appExit` is provided by the LAUNCHER,
 *      not by the framework, so on a surface that does not launch the app it is
 *      absent — and the correct behaviour there is a disabled button with a
 *      reason, not a live button that fails on click.
 *
 *   3. IT MUST ACTUALLY CALL appExit WHEN AVAILABLE, with the code the launcher
 *      treats as a user interrupt.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const sb = require(path.join(__dirname, '..', 'lib', 'system-bridge.js'))
const host = require(path.join(__dirname, '..', 'index.js'))

let failures = 0
const pass = (m) => console.log('ok    ' + m)
const fail = (m) => { console.error('FAIL  ' + m); failures++ }

/* ------------------------------------------------- 1. the machine boundary */
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'system-bridge.js'), 'utf8')
  // Strip comments so a routine "shutdown" mention in prose cannot pass a check
  // that is meant to find a CALL.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')
  for (const needle of [
    'shutdown.exe', 'Stop-Computer', 'powrprof', 'rundll32',
    'Exit-Windows', 'Restart-Computer', 'Stop-Computer',
    'WM_', 'taskkill',
  ]) {
    if (code.toLowerCase().includes(needle.toLowerCase())) {
      fail(`must not reference ${needle} — the capability is "end my own process", not "touch the machine"`)
    }
  }
  pass('no power-management / process-killing route in the host half')
  if (code.includes('appExit')) pass('the only exit path is the launcher-provided appExit')
  else fail('expected the exit to go through appExit')
}

/* ---------------------------------------------------- 2. refuses without it */
{
  const absent = { get() { throw new Error('service absent') } }
  const r = sb.canShutdown(absent)
  if (r.available === false) pass('canShutdown is false when appExit is absent')
  else fail('canShutdown must be false without appExit')
  if (typeof r.reason === 'string' && r.reason.includes('appExit')) {
    pass('the reason names appExit (so a user can tell "not supported here" from "broken")')
  } else fail('the reason should mention appExit, got ' + JSON.stringify(r.reason))
  if (sb.resolveAppExit(absent) === null) pass('resolveAppExit returns null rather than throwing')
  else fail('resolveAppExit must return null for an absent service')
}

/* A non-function appExit must also be refused: a truthy but non-callable value
   would pass a naive probe and then throw on click. */
{
  const weird = { get(k) { if (k === 'appExit') return { notAFunction: true }; throw new Error('absent') } }
  if (sb.canShutdown(weird).available === false) pass('canShutdown rejects a non-callable appExit')
  else fail('canShutdown must reject a truthy non-callable appExit')
}

/* ----------------------------------------------------- 3. acts when it can */
{
  let called = null
  const ctx = { get(k) { if (k === 'appExit') return (code) => { called = code }; throw new Error('absent') } }
  const r = sb.canShutdown(ctx)
  if (r.available === true) pass('canShutdown is true with a callable appExit')
  else fail('canShutdown must be true when appExit is callable')

  if (sb.SHUTDOWN_EXIT_CODE === 130) pass('the exit code is 130 (matches what Ctrl+C produces)')
  else fail('expected exit code 130, got ' + sb.SHUTDOWN_EXIT_CODE)

  /* Drive the route end to end. The handler defers the exit by a tick so the
     response can flush first (an inline call would dispose the fiber — and the
     socket being written to — before the bytes go out), so the assertion has to
     wait for that tick rather than checking synchronously. */
  const routes = []
  const webServer = { register(r) { routes.push(r); return () => {} } }
  /* ONE context answering BOTH services. The first version of this test handed
     registerSystemBridge a webServer-only context, so the handler's per-request
     appExit lookup (which is per-request BY DESIGN — see the note in the
     module) found nothing and answered 409. The failure read as "the route never
     calls appExit" when it was the test's context that was unrealistic. */
  const exit = (code) => { called = code }
  const liveCtx = {
    get(k) {
      if (k === 'appExit') return exit
      if (k === 'webServer') return webServer
      throw new Error('service absent: ' + k)
    },
  }
  assert.doesNotThrow(() => sb.registerSystemBridge(liveCtx))
  const route = routes.find((x) => String(x.path) === sb.SYSTEM_ROUTE)
  if (route === undefined) fail(`a prefix route mounts at ${sb.SYSTEM_ROUTE}`)
  else {
    pass(`a prefix route mounts at ${sb.SYSTEM_ROUTE}`)
    if (route.kind === 'prefix') pass('the route is a prefix route')
    else fail('expected kind=prefix, got ' + route.kind)
  }

  const finished = new Promise((resolve) => {
    const res = {
      statusCode: 0,
      body: null,
      writeHead(code, headers) { this.statusCode = code; this.headers = headers },
      end(payload) { this.body = payload ? JSON.parse(payload) : null; resolve() },
    }
    // Minimal request: an EventEmitter with the three events the handler uses.
    const listeners = {}
    const req = {
      method: 'POST',
      url: sb.SYSTEM_ROUTE + '/shutdown',
      on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); return this },
    }
    route.handler(req, res)
    for (const fn of listeners.data || []) fn('')
    for (const fn of listeners.end || []) fn()
  })

  setTimeout(() => {
    if (called !== null) pass(`POST /shutdown calls appExit(${called})`)
    else fail('POST /shutdown did not call appExit')

    /* And the refusal path: no appExit must be a 409, not a 200. */
    let refused = 0
    const routes2 = []
    const ws2 = { register(r) { routes2.push(r); return () => {} } }
    sb.registerSystemBridge({ get(k) { if (k === 'webServer') return ws2; throw new Error('absent') } })
    const r2 = routes2.find((x) => String(x.path) === sb.SYSTEM_ROUTE)
    const res2 = { writeHead(c) { refused = c }, end() {} }
    r2.handler({ method: 'POST', url: sb.SYSTEM_ROUTE + '/shutdown', on() { return this } }, res2)
    if (refused === 409) pass('POST /shutdown answers 409 when appExit is unavailable')
    else fail('expected 409 without appExit, got ' + refused)

    /* GET must report availability so the page can disable the button. */
    let statusBody = null
    const res3 = { writeHead() {}, end(p) { statusBody = JSON.parse(p) } }
    r2.handler({ method: 'GET', url: sb.SYSTEM_ROUTE, on() { return this } }, res3)
    if (statusBody && statusBody.available === false && typeof statusBody.reason === 'string') {
      pass('GET /theme-endfield/system reports availability with a reason')
    } else fail('GET status did not report availability: ' + JSON.stringify(statusBody))

    if (failures === 0) console.log('\nall system-bridge checks passed')
    process.exitCode = failures === 0 ? 0 : 1
  }, 220)
}
