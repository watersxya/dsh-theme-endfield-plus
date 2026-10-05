/* contourFrame reschedules itself unconditionally on its way out, but the refresh
   it calls earlier in the same callback can fall all the way through
   contourWorkerFail -> contourTeardown -> syncContour -> contourStartLoop, which
   has already queued the next frame. The tail then queues a SECOND chain, and
   contourStopLoop can only cancel the handle it can see — so one animation chain
   keeps redrawing at 2x per frame, and survives every later teardown. The seam
   that triggers it is a worker refusing the frame post; the count is taken by
   callback name so the layer needs no test-only hook. */
const assert = require('node:assert/strict'), path = require('node:path')
const { launch, boot } = require('./fixtures/chrome-cdp.js')
const root = path.resolve(__dirname, '..')
const prefix = `
  window.__byId=new Map();
  const nativeRaf=window.requestAnimationFrame.bind(window), nativeCancel=window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame=fn=>{const id=nativeRaf(()=>{__byId.delete(id);fn(performance.now())});__byId.set(id,fn);return id};
  window.cancelAnimationFrame=id=>{__byId.delete(id);return nativeCancel(id)};
  window.__loops=name=>[...__byId.values()].filter(fn=>fn.name===name).length;
  window.__frames=0;
  const post=Worker.prototype.postMessage;
  Worker.prototype.postMessage=function(m,...rest){if(m&&m.type==='frame')__frames++;return post.call(this,m,...rest)};
  window.__breakFrames=()=>{Worker.prototype.postMessage=function(m,...rest){
    if(m&&m.type==='frame')throw Error('frame refused');return post.call(this,m,...rest)}};
`
;(async () => {
  const browser = await launch()
  try {
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 960, height: 540, deviceScaleFactor: 1, mobile: false })
    await boot(browser, root, { contour: '1', contourRenderer: 'worker-webgl' }, prefix)
    // A healthy worker loop first: the frame path must be the one that is running
    // before anything can refuse it.
    await browser.until("/^worker-/.test(document.querySelector('[data-endfield-contour]')?.dataset.endfieldRenderer || '') && __frames > 2")
    assert.equal(await browser.evaluate('__loops("contourFrame")'), 1, 'one loop while the worker is healthy')

    await browser.evaluate('__breakFrames()')
    await browser.until("document.querySelector('[data-endfield-contour]')?.dataset.endfieldRenderer === 'main-canvas2d'")
    await browser.sleep(250)
    assert.equal(await browser.evaluate('__loops("contourFrame")'), 1,
      'the worker-refusal fallback must leave exactly one animation chain running')

    // The surviving chain has to be the live one: it keeps redrawing, and a second
    // teardown must still be able to stop it.
    const hash = `(() => { const c = document.querySelector('[data-endfield-contour-lines]');
      const a = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
      let h = 2166136261; for (let i = 3; i < a.length; i += 4) h = Math.imul(h ^ a[i], 16777619); return h >>> 0 })()`
    const before = await browser.evaluate(hash)
    await browser.sleep(300)
    assert.notEqual(await browser.evaluate(hash), before, 'the layer keeps animating')
    await browser.evaluate('__prefs.setItem("dsh-theme-endfield-contour-anim","0")')
    await browser.sleep(250)
    assert.equal(await browser.evaluate('__loops("contourFrame")'), 0, 'switching to static stops it')
    assert.deepEqual(browser.errors, [])
    console.log('PASS: a worker frame refusal reschedules one contour loop')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
