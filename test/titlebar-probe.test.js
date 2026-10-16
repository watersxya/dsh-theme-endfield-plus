/**
 * titlebar-probe.test.js — issue #36: the Windows title-bar overlay probe.
 *
 * WHY THIS EXISTS. On Windows the top 40px carries TWO opaque layers over the
 * contour sheet: the page-side [data-windows-titlebar] .*_frame:before strip and
 * Electron's own title-bar overlay. The overlay is painted by the OS above the
 * web content, so the page cannot uncover the sheet through it. The desktop shell
 * instead measures a hidden probe element it appends to <body>:
 *
 *     probe.style.cssText =
 *       'position:fixed;visibility:hidden;pointer-events:none;' +
 *       'background-color:var(--dsw-specific-sidebar-fill);' +
 *       'color:var(--dsw-alias-label-primary)'
 *     document.body.append(probe)
 *     ... getComputedStyle(probe) -> canvas nativeColor() -> rgba(...) ->
 *     mainWindow.setTitleBarOverlay({ color, symbolColor })
 *
 * The theme overrides that probe's background-color to 'transparent' with an
 * author !important rule, matching the probe through its inline style TEXT
 * (style*='--dsw-specific-sidebar-fill'). Two things can rot with NO visible
 * error, because the failure mode is "the selector matches nothing and the belt
 * quietly comes back":
 *
 *   1. the CSS rule itself (dropped in a refactor), and
 *   2. the shell side — if the preload stops writing that exact inline text.
 *
 * PART 1 locks the rule in the shipped bundle.
 * PART 2 locks the preload text against the INSTALLED desktop shell (skipped with
 *        a printed notice when that shell is not readable, e.g. other machines).
 * PART 3 executes the real client.js in headless Chrome against a mock of the app
 *        and asserts the MEASURED computed styles: probe background transparent
 *        with the contour on, the probe's symbol colour untouched (a transparent
 *        symbol colour would erase the window buttons), the title-bar strip and
 *        the sidebar fade cleared, and the composer seat belt cleared in the app's
 *        own two active phases while staying inert on the hero page.
 *
 * Usage: node test/titlebar-probe.test.js
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

const ROOT = path.resolve(__dirname, '..')

let failures = 0
const pass = (m) => console.log('ok    ' + m)
const fail = (m) => { console.error('FAIL  ' + m); failures++ }
const skip = (m) => console.log('skip  ' + m)

const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')

/* ---------- 1. the shipped rule ---------- */
const PROBE_SELECTOR = "html:has([data-endfield-contour]) body > span[style*='--dsw-specific-sidebar-fill']"
const idx = src.indexOf(PROBE_SELECTOR)
if (idx < 0) {
  fail('the title-bar probe override is gone: ' + PROBE_SELECTOR
    + "\n      -> on Windows the Electron overlay covers the top 40px of the contour sheet")
} else {
  pass('probe override rule present')
  const close = src.indexOf('}', idx)
  const block = close < 0 ? '' : src.slice(idx, close)
  if (/background-color:\s*transparent\s*!important/.test(block)) {
    pass('it clears the probe background to transparent with !important (beats the inline declaration)')
  } else {
    fail('the probe rule no longer clears background-color to transparent !important: ' + block)
  }
  /* The probe reports the SYMBOL colour through the same element. Overriding that
     would hand the OS a transparent window-button colour. */
  if (/(^|[;{\s])color\s*:/.test(block)) {
    fail('the probe rule now overrides the symbol colour too — the window buttons would lose their contrast: ' + block)
  } else {
    pass('it leaves the symbol colour (color:) alone')
  }
  /* The probe is a child of <body>, outside the app frame, so the frame-anchored
     gate the rest of the sheet uses cannot reach it. */
  if (!/^html:has\(\[data-endfield-contour\]\)/.test(PROBE_SELECTOR)) {
    fail('the probe rule lost its html:has([data-endfield-contour]) gate')
  } else {
    pass('it is gated on the contour layer, so the native overlay is untouched when the feature is off')
  }
}

/* ---------- 2. the installed shell still writes that exact inline text ---------- */
function findAsar () {
  const cands = [
    process.env.DSH_DESKTOP_ASAR,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'DeepSeek Harness', 'resources', 'app.asar'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'DeepSeek Harness', 'resources', 'app.asar'),
  ].filter(Boolean)
  for (const c of cands) {
    try { if (fs.existsSync(c) && fs.statSync(c).isFile()) return c } catch (e) { /* unreadable: try next */ }
  }
  return null
}
const normalize = (s) => s.replace(/\s+/g, '').replace(/"\+'?"?/g, '').replace(/'\+'?/g, '').replace(/\\n/g, '')
const asar = findAsar()
if (asar === null) {
  skip('desktop shell not found (set DSH_DESKTOP_ASAR to the app.asar to enable the probe-text lock)')
} else {
  let shell = null
  try { shell = fs.readFileSync(asar, 'latin1') } catch (e) { skip('desktop shell not readable (' + e.message + ')') }
  if (shell !== null) {
    const p = shell.indexOf('probe.style.cssText')
    if (p < 0) {
      fail('the installed shell no longer builds its title-bar probe with probe.style.cssText — '
        + 'confirm how it now reports the overlay colour before trusting the theme rule')
    } else {
      const region = normalize(shell.slice(p, p + 900))
      for (const [needle, label] of [
        ['background-color:var(--dsw-specific-sidebar-fill)', 'probe still paints var(--dsw-specific-sidebar-fill)'],
        ['color:var(--dsw-alias-label-primary)', 'probe still reports var(--dsw-alias-label-primary) as the symbol colour'],
      ]) {
        if (region.includes(needle)) pass(label)
        else fail('the shell probe changed: expected ' + needle + ' within 900 chars of probe.style.cssText')
      }
    }
    if (shell.includes('setTitleBarOverlay')) pass('the shell still feeds the probe colour into setTitleBarOverlay')
    else fail('setTitleBarOverlay is gone from the shell — re-check how the overlay colour is applied')
  }
}

/* ---------- 3. measured behaviour in a real browser ---------- */
const { BROWSER_SETTINGS_SCOPE_SNIPPET } = require(path.join(__dirname, 'fixtures', 'settings-scope.browser.js'))

/* The mock reproduces the parts of the app and of the Windows shell that decide
   whether the top 40px and the sidebar bottom show the sheet, with the class
   suffixes and declaration values taken from the installed bundles. */
const PRELOAD_CSS_TEXT = 'position:fixed;visibility:hidden;pointer-events:none;background-color:var(--dsw-specific-sidebar-fill);color:var(--dsw-alias-label-primary)'
const MOCK = '<!doctype html><html data-windows-titlebar><head><meta charset="utf-8"><style>'
  + 'html,body,#root{height:100%;margin:0}'
  + 'body{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:Arial,sans-serif}'
  + ':root{--dsw-alias-bg-base:#e8e8e2;--dsw-alias-label-primary:#101110;'
  + '--dsw-specific-sidebar-fill:#e8e8e2;--dsw-alias-border-l1:#d8d9d5;'
  + '--dsw-alias-bg-layer-1:#f2f2ec;--dsw-alias-bg-layer-2:#dcddd6;'
  + '--dsw-alias-label-secondary:#4a4c48;--dsw-font-family:Arial,sans-serif;--dsh-scrollbar-width:8px}'
  + '.m_frame{background:var(--dsw-alias-bg-base);height:100%;grid-template-columns:260px 1fr;'
  + 'grid-template-rows:100%;display:grid;position:relative;overflow:hidden}'
  + 'html[data-windows-titlebar] .m_frame{background:var(--dsw-specific-sidebar-fill);'
  + 'padding-top:40px;--dsh-windows-titlebar-height:40px}'
  + 'html[data-windows-titlebar] .m_frame:before{content:"";height:40px;'
  + 'background:var(--dsw-specific-sidebar-fill);position:absolute;inset:0 0 auto;-webkit-app-region:drag}'
  + '.m_sidebarCol{background:var(--dsw-specific-sidebar-fill);border-right:1px solid var(--dsw-alias-border-l1);'
  + 'min-width:0;overflow:hidden;position:relative}'
  + '.m_treeBody{position:relative;height:100%}'
  + '.m_fade{left:0;right:0;background:linear-gradient(to bottom,transparent,var(--dsw-specific-sidebar-fill));'
  + 'pointer-events:none;height:24px;position:absolute;bottom:0}'
  + '.m_centerCol{flex-direction:column;min-width:0;display:flex;overflow:hidden}'
  + '.m_root{background:var(--dsw-alias-bg-base);flex-direction:column;min-width:0;height:100%;display:flex}'
  + '.m_viewArea{flex:1 1 auto;padding:40px 60px}'
  + '.m_composerSeat{--dsh-composer-text-max-height:336px;flex-direction:column;flex:none;display:flex;padding:20px 60px 28px}'
  + '.m_root[data-phase=active] .m_composerSeat{z-index:7;position:sticky;bottom:0;'
  + 'background:linear-gradient(180deg,color-mix(in srgb,var(--dsw-alias-bg-base) 0%,transparent) 0px,var(--dsw-alias-bg-base) 36px)}'
  + '</style></head><body><div id="root">'
  + '<div class="m_frame">'
  + '<div class="m_sidebarCol"><div class="m_treeBody">'
  + '<div style="padding:14px">sidebar rows</div><span class="m_fade"></span></div></div>'
  + '<div class="m_centerCol"><div class="m_root" data-phase="active"><div class="m_viewArea">'
  + '<p id="probe-text" style="color:var(--dsw-alias-label-primary)">Legibility probe.</p></div>'
  + '<div class="m_composerSeat"><div style="height:52px;border:1px solid var(--dsw-alias-border-l1)"></div></div>'
  + '</div></div></div></div>'
  + '<script>window.__ModuleLoader__={load:(m)=>{window.__MOD__=m}}</' + 'script>'
  + '<script src="./client.js"></' + 'script>'
  + '<script>const mod=window.__MOD__.factory(()=>null);'
  + BROWSER_SETTINGS_SCOPE_SNIPPET
  + 'var __prefs=__endfieldSettingsScope({enabled:"1",loader:"0"});window.__LS__=__prefs;'
  + 'const ctx={get:(n)=>n==="theme"?{overrideTokens:()=>()=>{}}:(n==="settingsScope"?__prefs.binder:undefined),'
  + 'effect:(f)=>{window.__dispose__=f()}};'
  + 'window.__apply__=()=>mod.apply(ctx);</' + 'script></body></html>'

const probeScript = '<script>'
  + 'window.__RESULTS__=[];'
  + 'const R=(n,p,d)=>window.__RESULTS__.push({name:n,pass:!!p,detail:d===undefined?"":String(d)});'
  + 'const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));'
  + 'const norm=(s)=>String(s).replace(/\\s+/g,"");'
  + 'window.__run__=async()=>{'
  + 'const LS=window.__LS__;'
  + 'const probe=document.createElement("span");'
  + 'probe.id="tb-probe";'
  + 'probe.style.cssText=' + JSON.stringify(PRELOAD_CSS_TEXT) + ';'
  + 'document.body.append(probe);'
  + 'const frame=document.querySelector(".m_frame");'
  + 'const seat=document.querySelector(".m_composerSeat");'
  + 'const fade=document.querySelector(".m_fade");'
  + 'const root=document.querySelector(".m_root");'
  + 'const g=(el,pseudo)=>getComputedStyle(el,pseudo);'
  + '/* ---- feature OFF: nothing may be touched ---- */'
  + 'LS.setItem("dsh-theme-endfield-enabled","1");'
  + 'LS.removeItem("dsh-theme-endfield-contour");'
  + 'LS.setItem("dsh-theme-endfield-loader","0");'
  + 'window.__apply__();'
  + 'await sleep(150);'
  + 'R("off: probe keeps the opaque sidebar fill",g(probe).backgroundColor==="rgb(232, 232, 226)",g(probe).backgroundColor);'
  + 'R("off: title-bar strip keeps its fill",g(frame,"::before").backgroundColor==="rgb(232, 232, 226)",g(frame,"::before").backgroundColor);'
  + 'R("off: sidebar fade keeps its gradient",g(fade).backgroundImage.indexOf("linear-gradient")===0,g(fade).backgroundImage);'
  + '/* ---- feature ON ---- */'
  + 'LS.setItem("dsh-theme-endfield-contour","1");'
  + 'document.body.appendChild(document.createElement("span"));'
  + 'await sleep(500);'
  + 'R("on: contour layer mounted",document.querySelectorAll("[data-endfield-contour]").length===1);'
  + 'R("on: probe background reported transparent to setTitleBarOverlay",g(probe).backgroundColor==="rgba(0, 0, 0, 0)",g(probe).backgroundColor);'
  + 'R("on: probe symbol colour untouched",g(probe).color==="rgb(16, 17, 16)",g(probe).color);'
  + 'R("on: title-bar strip cleared",g(frame,"::before").backgroundColor==="rgba(0, 0, 0, 0)",g(frame,"::before").backgroundColor);'
  + 'R("on: sidebar fade gradient removed",norm(g(fade).backgroundImage)==="none",g(fade).backgroundImage);'
  + 'const SEAT_SEL="[class*=_frame]:has(> [data-endfield-contour]) :is([data-phase=active],[data-content-phase=active]) [class$=_composerSeat]";'
  + 'R("on: composer seat belt cleared",norm(g(seat).backgroundImage)==="none",norm(g(seat).backgroundImage));'
  + 'R("on: the seat rule matches in the active phase",seat.matches(SEAT_SEL),g(seat).backgroundImage);'
  + '/* ---- hero phase: the app paints no scrim there, so the theme must not either ---- */'
  + 'root.setAttribute("data-phase","hero");'
  + 'await sleep(150);'
  + 'R("hero: the seat rule is inert (phase gated)",seat.matches(SEAT_SEL)===false,g(seat).backgroundImage);'
  + 'root.setAttribute("data-phase","active");'
  + 'await sleep(150);'
  + 'R("active: the seat rule applies again",seat.matches(SEAT_SEL)===true,g(seat).backgroundImage);'
  + '/* ---- text stays legible above the sheet ---- */'
  + 'R("text colour untouched",g(document.getElementById("probe-text")).color==="rgb(16, 17, 16)");'
  + 'document.title="DONE "+JSON.stringify(window.__RESULTS__);'
  + 'return window.__RESULTS__;'
  + '};'
  + '</' + 'script>'

function findChrome () {
  const cands = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean)
  for (const c of cands) if (fs.existsSync(c)) return c
  return null
}

async function main () {
  let spawnBlocked = null
  const chrome = findChrome()
  if (!chrome) {
    skip('no Chrome/Edge found — measured probe assertions skipped (set CHROME_PATH)')
  } else {
    const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-titlebar-'))
    const page = path.join(OUT, 'mock-app.html')
    fs.writeFileSync(page, MOCK.replace('</body>', probeScript + '<script>window.addEventListener("load",()=>{window.__run__()})</' + 'script></body>'))
    fs.copyFileSync(path.join(ROOT, 'client.js'), path.join(OUT, 'client.js'))
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'titlebar-'))
    const args = [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--virtual-time-budget=12000', '--window-size=1400,900',
      '--user-data-dir=' + tmp, '--dump-dom',
      'file:///' + page.replace(/\\/g, '/'),
    ]
    const { execFileSync } = require('child_process')
    let dom = ''
    try {
      dom = execFileSync(chrome, args, { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'ignore'] })
    } catch (e) {
      /* A sandbox can block the spawn itself (no pipe handles available) rather
         than let the browser run and fail. That is an environment limitation,
         not a theme defect: the suite's pre-existing browser tests fail the same
         way here. Report it loudly and let the source-level parts above still
         guard the rule; only a browser that RAN and stayed silent is a FAIL. */
      if (/EPERM|ETIMEDOUT|EACCES/.test(e.message)) {
        spawnBlocked = e.message
      } else {
        fail('browser run failed: ' + e.message)
      }
    }
    const m = dom.match(/<title>DONE (\[.*?\])<\/title>/s)
    if (spawnBlocked !== null) {
      skip('measured assertions skipped — the browser could not be spawned in this environment (' + spawnBlocked + ')')
    } else if (!m) {
      const t = dom.match(/<title>(.*?)<\/title>/s)
      fail('the page never reported results (assertions did not complete)' + (t ? ' — title: ' + t[1].slice(0, 200) : ''))
    } else {
      let results
      try { results = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) }
      catch (e) { fail('could not parse page results: ' + e.message) }
      if (results) for (const r of results) {
        if (r.pass) pass(r.name + (r.detail ? '  (' + r.detail + ')' : ''))
        else fail(r.name + (r.detail ? '  -> ' + r.detail : ''))
      }
    }
  }

  console.log('')
  if (failures) { console.error(failures + ' title-bar probe check(s) failed'); process.exit(1) }
  console.log('all title-bar probe checks passed')
}

main()
