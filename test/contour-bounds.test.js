const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8')
function grab(name) {
  const start = source.indexOf('const ' + name + ' = ')
  assert(start >= 0, name)
  let depth = 0
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1)
  }
  throw new Error('unbalanced ' + name)
}
function harness(fullScan) {
  const functions = ['contourRng', 'contourBuildCandidate', 'contourExtractLevel', 'contourExtract'].map(grab).join('\n')
  const code = `
    const CONTOUR_STEP=6, CONTOUR_LEVELS=20, CONTOUR_SPAN=1.45
    const CONTOUR_MIN_LEN=40, CONTOUR_MIN_RING_BOX=21
    const CONTOUR_KEEP_LEN=CONTOUR_MIN_LEN*1.35, CONTOUR_KEEP_RING=CONTOUR_MIN_RING_BOX*1.5
    /* contourBuildCandidate() now takes the sampling step as an argument and floors
       the bump radius at CONTOUR_MIN_BUMPSAMPLES samples — mirror that constant here,
       and pass the shipped 6px step the way contourBuild() would. */
    const CONTOUR_MIN_BUMPSAMPLES=4
    let contourField=null, contourGeom=null, contourPaths=[], contourSeed=1
    const contourEvaluate=()=>{}
    ${fullScan ? functions.replace('if (f.boundsReady &&', 'if (false && f.boundsReady &&') : functions}
    ({ prepare(w,h,seed) {
       contourSeed=seed; const c=contourBuildCandidate(w,h,0,CONTOUR_STEP)
       contourField=c.field; contourGeom={w,h,cols:c.cols,rows:c.rows,step:CONTOUR_STEP}
       return contourField
     }, run() { contourExtract(0); return contourPaths } })`
  return vm.runInNewContext(code)
}
for (const [w,h] of [[97,121],[576,360],[713,419],[1440,900]]) {
  test(`bounds preserve paths at ${w}x${h}`, () => {
    const fast=harness(false), full=harness(true)
    for (const seed of [123456,0x5eed4242]) {
      const a=fast.prepare(w,h,seed), b=full.prepare(w,h,seed)
      const min=a.blockMin,max=a.blockMax
      for (const kind of ['terrain','plateau','steps','saddles']) {
        for (let j=0;j<a.rows;j++) for(let i=0;i<a.cols;i++) {
          const k=j*a.cols+i
          const value=kind==='plateau'?0:kind==='steps'?((i+j)%5-2)*.5:
            kind==='saddles'?(i%2===j%2?1:-1): Math.sin(i*.071+seed)*Math.cos(j*.093)*1.7
          a.F[k]=b.F[k]=value
        }
        assert.equal(JSON.stringify(fast.run()),JSON.stringify(full.run()),kind)
        assert.equal(a.blockMin,min);assert.equal(a.blockMax,max)
      }
    }
  })
}
