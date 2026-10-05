'use strict';
/**
 * System bridge — the host half of the "close DSH" button.
 *
 * WHAT THIS IS, AND WHY IT IS SO NARROW
 * ------------------------------------
 * The page asks the host to end the DSH process, and that is ALL this does. It
 * calls the launcher-provided `appExit`, which the CLI defines as "request exit
 * once the tree has been disposed" (`createProcessShutdown(dispose)` →
 * dispose the Cordis fiber, then exit the process).
 *
 * It does NOT power off, restart, log out, or touch the machine in any way. That
 * distinction is the whole design constraint, and it is why this goes through
 * `appExit` rather than shelling out to `shutdown.exe` / `Stop-Computer` /
 * `Rundll32 powrprof`: those would end the USER'S MACHINE from a THEME PLUGIN,
 * which is not a thing a colour scheme should be able to do. The capability
 * available to a plugin is "end the process I am running inside", and the button
 * is labelled as exactly that.
 *
 * WHY A HOST ROUTE AT ALL. The browser page has no access to the process that
 * is serving it — same reason the audio bridge exists. So the page POSTs here and
 * the host does it.
 *
 * WHY THE AVAILABILITY PROBE IS PER-REQUEST, NOT ONCE AT MOUNT. `appExit` is
 * provided by the LAUNCHER (`ctx.provide('appExit', host.exit)` in
 * packages/boot/cmdline), not by the host framework, and the two mount in an
 * order the plugin does not control — a probe cached at install time can read
 * "absent" and then stay wrong for the life of the process, which is precisely
 * the "the switch is on but nothing happens" failure this feature exists to
 * avoid. Cordis service lookups are cheap map reads, so they run per request.
 *
 * WHY A LAUNCHER-GATED SURFACE IS DISABLED RATHER THAN BROKEN. On a surface that
 * does not launch the app (`appExit` absent) the page renders a disabled button
 * with the reason attached, instead of a live button that fails on click.
 */

/** Route prefix. Separate from /theme-endfield/balance and /theme-endfield/audio
 *  so this can be reasoned about — and disabled — independently. */
const SYSTEM_ROUTE = '/theme-endfield/system';

/** Grace period handed to the shutdown. 0 = "use whatever the process treats as a
 *  clean exit"; the launcher distinguishes SIGINT (130, a user interrupt) from
 *  SIGTERM (0, a supervisor stop) and this is a user action, so it reports 130
 *  to match what Ctrl+C would have produced. */
const SHUTDOWN_EXIT_CODE = 130;

/** Maximum accepted body. The route takes no meaningful input; the cap exists so
 *  an unbounded body cannot become a memory hole. */
const MAX_BODY = 1024;

/**
 * Read `appExit` from the plugin context without throwing.
 *
 * `ctx.get` raises when a service is absent, and the whole point of this probe
 * is to discover absence, so every access is guarded.
 *
 * @param {object} ctx the plugin context
 * @returns {((code: number) => void) | null} the callable, or null.
 */
function resolveAppExit(ctx) {
  let candidate
  try {
    candidate = ctx.get('appExit')
  } catch (error) {
    return null
  }
  if (typeof candidate !== 'function') return null
  return candidate
}

/**
 * Whether this surface can end the process at all.
 * @param {object} ctx the plugin context
 * @returns {{ available: boolean, reason?: string }}
 */
function canShutdown(ctx) {
  if (process.platform !== 'win32' && process.platform !== 'darwin' && process.platform !== 'linux') {
    return { available: false, reason: 'unsupported platform' }
  }
  if (resolveAppExit(ctx) === null) {
    /* The exact wording matters to the user: this is the difference between
       "this build cannot do it" and "you are running it somewhere it is not
       supported", and they will want to tell those apart when reporting it. */
    return { available: false, reason: 'appExit not provided by the launcher' }
  }
  return { available: true }
}

/**
 * Mount the system routes:
 *   GET  /theme-endfield/system          capability + state
 *   POST /theme-endfield/system/shutdown request the exit
 *
 * @param {object} ctx the plugin's cordis context
 */
function registerSystemBridge(ctx) {
  const mount = (webServer) => {
    if (webServer === undefined || typeof webServer.register !== 'function') return
    const send = (res, code, payload) => {
      res.writeHead(code, {
        'content-type': 'application/json; charset=utf-8',
        // A status read must never be cached: the page renders "available" as
        // the difference between a live and a dead button.
        'cache-control': 'no-store',
      })
      res.end(JSON.stringify(payload))
    }

    webServer.register({
      kind: 'prefix',
      path: SYSTEM_ROUTE,
      handler: (req, res) => {
        const pathname = String(req.url || '').split('?')[0]
        const suffix = pathname.slice(SYSTEM_ROUTE.length) || '/'

        if (req.method === 'GET' && (suffix === '' || suffix === '/')) {
          const avail = canShutdown(ctx)
          return send(res, 200, {
            ok: true,
            available: avail.available,
            reason: avail.reason || null,
            platform: process.platform,
            pid: process.pid,
          })
        }

        if (suffix === '/shutdown') {
          if (req.method !== 'POST') return send(res, 405, { ok: false, why: 'method not allowed' })

          const avail = canShutdown(ctx)
          if (!avail.available) {
            return send(res, 409, { ok: false, why: avail.reason || 'shutdown unavailable' })
          }
          /* Drain the request body before exiting. The process is about to go
             away and a half-read socket would turn a clean shutdown into an
             ERR_STREAM error in the log that looks like a crash. */
          let body = ''
          req.on('data', (chunk) => {
            if (body.length <= MAX_BODY) body += chunk
          })
          req.on('end', () => {
            send(res, 200, { ok: true, exiting: true, code: SHUTDOWN_EXIT_CODE })
            /* The response has to reach the page before the tree is disposed, so
               the exit is deferred by a tick rather than called inline. An inline
               call would dispose the fiber — and with it the socket being written
               to — before the bytes are flushed. */
            setTimeout(() => {
              try {
                resolveAppExit(ctx)(SHUTDOWN_EXIT_CODE)
              } catch (error) {
                /* Nothing useful can be reported at this point: the response is
                   already sent and the caller is going away. Log it so the reason
                   a click did nothing is still on record. */
                console.error(`[theme-endfield/system] appExit threw: ${error && error.message ? error.message : error}`)
              }
            }, 60)
          })
          req.on('error', () => { /* a client that hung up changes nothing */ })
          return undefined
        }

        return send(res, 404, { ok: false, why: 'no such system route' })
      },
    })
  }

  // webServer may already be available, or may arrive later; both are normal.
  let webServer
  try {
    webServer = ctx.get('webServer')
  } catch (error) {
    webServer = undefined
  }
  if (webServer !== undefined) mount(webServer)
  else if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (scope) => mount(scope.webServer))
  }
}

module.exports = {
  SYSTEM_ROUTE,
  SHUTDOWN_EXIT_CODE,
  resolveAppExit,
  canShutdown,
  registerSystemBridge,
};
