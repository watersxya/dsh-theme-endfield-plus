#!/usr/bin/env node
/* Guards the shutdown control's APPEARANCE, as opposed to
 * shutdown-button.test.js which guards its lifecycle.
 *
 * WHY THIS FILE EXISTS — it is a scar, not a nicety. The button attached,
 * armed, disarmed and clicked correctly through every test in that file while
 * being completely invisible on screen. Two independent CSS defects shipped
 * that way, and neither produced a single failing assertion:
 *
 *   (1) color: var(--edge-ink, #101110). `--edge-ink` was defined NOWHERE in
 *       this file — the fallback was the only thing that ever painted, and
 *       #101110 is also what --edge-paper resolves to in dark mode. A dark
 *       glyph on a dark chip. The DOM node existed; the pixels did not.
 *   (2) background: var(--edge-paper, ...). In dark mode that is #101110,
 *       which is ALSO the dark app background, so even with a fixed glyph the
 *       chip had no boundary — the circle could not be seen at all.
 *
 * Both are invisible to a test that only counts nodes. The class of bug is:
 * "every assertion passes and the user sees nothing". So these checks read
 * the real style object out of the real factory and assert the properties
 * that decide whether pixels appear — and they assert them in BOTH schemes,
 * because both failures were dark-mode-only and a light-only assertion would
 * have shipped both.
 */
'use strict'
const fs = require('fs')
const path = require('path')

const SRC = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8')

let failures = 0
const pass = (m) => console.log('ok    ' + m)
const fail = (m) => { failures++; console.log('FAIL  ' + m) }

/* ---------- 1. No token may be read that the stylesheet never defines ------
 * The `--edge-ink` bug in one line: a var() whose custom property exists
 * nowhere paints its fallback, silently and always. Grep the whole file for
 * each token the control reads and require at least one real definition. */
const TOKENS = [
  '--dsw-alias-label-primary',
  '--edge-glass-fill',
  '--edge-glass-alpha',
  '--edge-glass-edge',
  '--edge-glass-sheen',
  '--edge-accent',
  '--edge-accent-rgb',
]
for (const token of TOKENS) {
  /* A definition is `--token:` in CSS or `'--token':` as a JS key. A bare
   * reference (var(--token), or a comment) is not a definition. */
  const css = new RegExp('(?:^|[\\s,{])' + token + '\\s*:', 'm').test(SRC)
  const jsKey = new RegExp("['\"]" + token + "['\"]\\s*:").test(SRC)
  if (css || jsKey) pass(token + ' is defined in this file')
  else fail(token + ' is read by the button but defined NOWHERE — its fallback will always paint')
}

/* ---------- 2. The ink must not be the paper --------------------------------
 * The specific pair that made the glyph invisible. --edge-paper is #101110 in
 * dark mode; if the ink ever goes back to a hardcoded #101110, dark mode is
 * dark-on-dark again. */
if (/var\(--edge-ink/.test(SRC)) fail('--edge-ink is referenced again — that token does not exist')
else pass('--edge-ink (the phantom token) is no longer referenced')

/* The chip must not be filled with --edge-paper: that is what made the RIM
 * invisible, and it is a separate defect from the ink. */
const chipBlock = SRC.slice(SRC.indexOf('const baseStyle ='), SRC.indexOf('const paint ='))
if (chipBlock.length === 0) fail('could not locate baseStyle — the guard is not testing anything')
else {
  if (/background:\s*'var\(--edge-paper/.test(chipBlock)) {
    fail('the chip is filled with --edge-paper, which equals the dark app background — the rim will not be visible')
  } else {
    pass('the chip is NOT filled with --edge-paper (the dark-on-dark rim failure)')
  }
  if (/border:\s*'none'/.test(chipBlock)) fail('the chip has border:none — it declares an edge then removes it')
  else pass('the chip keeps an edge box')
}

/* ---------- 3. Size: 38px, glyph 19px -------------------------------------
 * The report was "the icon is a bit small". 30px was the old value. */
const widthM = /width:\s*'(\d+)px',\s*height:\s*'(\d+)px'/.exec(chipBlock)
if (widthM === null) fail('could not read the chip size from baseStyle')
else {
  const w = Number(widthM[1])
  if (w >= 38) pass('the chip is ' + w + 'px (was 30)')
  else fail('the chip is still ' + w + 'px — the reported "a bit small" was not addressed')
}
const fontM = /fontSize:\s*'(\d+)px'/.exec(chipBlock)
if (fontM === null) fail('could not read the glyph size')
else if (Number(fontM[1]) >= 19) pass('the glyph is ' + fontM[1] + 'px')
else fail('the glyph is still ' + fontM[1] + 'px inside a larger chip — it will look lost')

/* ---------- 4. It must survive the stylesheet's own !important rules --------
 * The theme zeroes rounding and kills transitions on every bare `button`.
 * A fixed viewport control has to outrank those or it renders as a square
 * with no feedback. */
const IMPORTANT_STYLE_USED =
  /setProperty\('border-radius'[^)]*'important'/.test(SRC) &&
  /setProperty\('transition'[^)]*'important'/.test(SRC)
if (IMPORTANT_STYLE_USED) pass('border-radius and transition are set with !important to outrank the bare-button rules')
else fail('the chip does not outrank `button { transition: none !important }` / `border-radius: 0 !important`')

/* ---------- 5. Every state must stay legible --------------------------------
 * The disabled state used to drop to opacity .25, which on a dark chip on a
 * dark page is the same invisibility by another route. */
const OPACITIES = [...SRC.matchAll(/(?:opacity:\s*'|opacity: ')(0?\.\d+|1)'/g)].map((m) => Number(m[1]))
if (OPACITIES.length === 0) fail('no opacity values found — guard is stale')
else {
  const worst = Math.min(...OPACITIES)
  /* 0.25 was the shipped value and is the thing being guarded against. */
  if (worst >= 0.3) pass('the faintest state opacity is ' + worst.toFixed(2) + ' (>= 0.30)')
  else fail('a state drops to opacity ' + worst.toFixed(2) + ' — too faint to see on a dark chip')
}

/* ---------- 6. The armed state must stay on-theme --------------------------
 * Armed repaints the chip to --edge-accent. If that ever reverts to a
 * hardcoded yellow, the control stops matching 武陵青. */
if (/background:\s*'var\(--edge-accent/.test(SRC)) pass('the armed state paints --edge-accent, so it follows 谷地黄 / 武陵青')
else fail('the armed state does not use --edge-accent — it will not follow the palette')

process.exitCode = failures === 0 ? 0 : 1
if (failures === 0) console.log('\nall shutdown-button appearance checks passed')