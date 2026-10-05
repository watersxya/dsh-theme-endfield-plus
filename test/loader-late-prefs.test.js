/**
 * loader-late-prefs.test.js — regression: the boot plate must still play when the
 * settings section settles AFTER apply().
 *
 * Bug it guards ("the startup loading animation silently never appears"):
 * the boot plate is started once, synchronously, from inside apply(), by reading
 * `loader` out of the settings section. On a real page load that section is NOT
 * there yet — the Host serves it over the wire, so `ctx.settingsScope` starts at
 * status:'loading' with no value and `prefsGet('loader')` falls back to the
 * schema default '0' ("default off"). The plate therefore never started, and the
 * preference reconciler deliberately refuses to replay the boot loader, so the
 * user's stored loader:"1" was read but never acted on. Every other prefs-driven
 * surface recovers on the later ready transition (mount/syncContour/syncThunder
 * all re-derive there); the loader was the only one whose boot read could not.
 *
 * The existing loader tests all miss this because the fixture scope answers
 * status:'ready' from the very first synchronous read, so apply() already sees
 * loader:"1". This test drives the real two-phase ordering instead, with a real
 * DOM: the scope reports 'loading' while apply() runs and flips to 'ready'
 * (carrying loader:"1") a moment later.
 *
 * The contract asserted here — three scenarios, one page each:
 *   A  stored loader:"1", section settles late   -> the plate PLAYS (the bug)
 *   B  stored loader:"0", section settles late   -> no plate
 *   C  section settles '0', later flips to '1'   -> no plate (still once-per-load)
 *
 * Usage: node test/loader-late-prefs.test.js
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')
const { BROWSER_SETTINGS_SCOPE_SNIPPET } = require(path.join(__dirname, 'fixtures', 'settings-scope.browser.js'))

const ROOT = path.resolve(__dirname, '..')
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-loader-late-'))
const chrome = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find((p) => fs.existsSync(p))
if (!chrome) { console.error('FAIL  no Chrome/Edge found (set CHROME_PATH)'); process.exit(1) }

/* Chrome's virtual time makes every timer in this budget fire immediately in
   wall-clock terms, so the page below finishes (and titles itself) long before
   the budget runs out. */
const BUDGET_MS = 16000

/**
 * One mock page. `initial` seeds the settings section, `readyDelayMs` is how long
 * the section stays status:'loading' after apply(), and `flip` optionally
 * changes a field later (a runtime edit, not the first authoritative read).
 */
function makePage({ initial, readyDelayMs, flip }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body,#root{height:100%;margin:0}
  :root{--dsw-alias-bg-base:#101110;--dsw-alias-label-primary:#f5f5f0;
    --dsw-specific-sidebar-fill:#101110;--dsw-alias-border-l1:#343633;
    --dsw-font-family:Arial,sans-serif}
  body{background:var(--dsw-alias-bg-base)}
  .pI_x6G_frame{background:var(--dsw-alias-bg-base);height:100%;
    grid-template-columns:248px 1fr;display:grid;position:relative;overflow:hidden}
  .pI_x6G_centerCol{display:flex;flex-direction:column;overflow:hidden}
  .wSkVaW_root{background:var(--dsw-alias-bg-base);height:100%;display:flex}
</style></head><body><div id="root">
  <div class="pI_x6G_frame"><div class="pI_x6G_sidebarCol"></div>
  <div class="pI_x6G_centerCol"><div class="wSkVaW_root"></div></div></div></div>
<script>window.__ModuleLoader__={load:(m)=>{window.__MOD__=m}}</script>
<script src="./client.js"></script>
<script>
  document.body.setAttribute('data-ds-dark-theme','')
  ${BROWSER_SETTINGS_SCOPE_SNIPPET}
  var __prefs = __endfieldSettingsScope(${JSON.stringify(initial)}, { readyDelayMs: ${readyDelayMs} })
  var mod = window.__MOD__.factory(function () { return null })
  window.__dispose__ = mod.apply({
    get: function (n) {
      return n === 'theme' ? { overrideTokens: function () { return function () {} } }
        : (n === 'settingsScope' ? __prefs.binder : undefined)
    },
    effect: function (f) { return f() },
  })
  var t0 = performance.now()
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
  ;(async function () {
    ${flip ? `await sleep(${flip.atMs})
    __prefs.setItem(${JSON.stringify(flip.key)}, ${JSON.stringify(flip.value)})
    document.body.appendChild(document.createElement('span'))` : ''}
    // Poll for the whole plate lifetime (~3.5s) rather than sampling once: the
    // plate is removed when it finishes, so a single late sample would miss it.
    var seen = false, seenAt = null, stillUpAtEnd = false
    for (var i = 0; i < 160; i++) {
      var el = document.querySelector('[data-endfield-loader]')
      if (el && !seen) { seen = true; seenAt = Math.round(performance.now() - t0) }
      if (el) stillUpAtEnd = true
      await sleep(50)
    }
    var gone = !document.querySelector('[data-endfield-loader]')
    document.title = 'LDR ' + JSON.stringify({ seen: seen, seenAt: seenAt, gone: gone, stillUpAtEnd: stillUpAtEnd })
  })()
</script></body></html>`
}

function run(label, spec) {
  const page = path.join(OUT, 'loader-' + label + '.html')
  fs.writeFileSync(page, makePage(spec))
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loader-late-prof-'))
  let dom = ''
  try {
    dom = execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--virtual-time-budget=' + BUDGET_MS, '--window-size=334,900',
      '--user-data-dir=' + tmp, '--dump-dom',
      'file:///' + page.replace(/\\/g, '/'),
    ], { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'ignore'] })
  } catch (e) {
    console.error('FAIL  [' + label + '] browser run failed: ' + e.message)
    process.exit(1)
  }
  const m = dom.match(/<title>LDR (.*?)<\/title>/s)
  if (!m) { console.error('FAIL  [' + label + '] page did not report results'); process.exit(1) }
  return JSON.parse(m[1].replace(/&quot;/g, '"'))
}

fs.copyFileSync(path.join(ROOT, 'client.js'), path.join(OUT, 'client.js'))

let failures = 0
const ok = (s) => console.log('ok    ' + s)
const fail = (s) => { console.error('FAIL  ' + s); failures++ }

const BASE = { enabled: '1', contour: '0', watermark: '0', thunder: '0' }

/* A — the reported bug: the section settles late and carries loader:"1". */
const a = run('a', { initial: Object.assign({}, BASE, { loader: '1' }), readyDelayMs: 250 })
if (a.seen) ok('A: plate plays when the stored loader:"1" arrives after apply() (' + a.seenAt + 'ms)')
else fail('A: stored loader:"1" never played the plate — it was read before the section settled and never revisited')
if (a.gone) ok('A: the plate still cleans itself up after playing')
else fail('A: the plate was left on screen')

/* B — the stored value is off: the late section must NOT start anything. */
const b = run('b', { initial: Object.assign({}, BASE, { loader: '0' }), readyDelayMs: 250 })
if (!b.seen) ok('B: no plate when the settled section says loader:"0"')
else fail('B: a plate played even though the stored loader is "0"')

/* C — once-per-page-load: a LATER change to "1" is a runtime edit, not a boot
   read, and must not replay a startup animation over a running app. */
const c = run('c', {
  initial: Object.assign({}, BASE, { loader: '0' }),
  readyDelayMs: 250,
  flip: { atMs: 1500, key: 'dsh-theme-endfield-loader', value: '1' },
})
if (!c.seen) ok('C: a later runtime switch to loader:"1" does not replay the boot plate')
else fail('C: the boot plate replayed from a mid-session settings change')

if (failures) { console.error('\n' + failures + ' loader late-prefs check(s) failed'); process.exit(1) }
console.log('\nall loader late-prefs checks passed')
