const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8')
function grab(name) {
  const start = source.indexOf('const ' + name + ' = ')
  assert(start >= 0, name)
  let depth = 0
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1)
  }
  throw Error('unbalanced ' + name)
}
const { createContourTrail, contourOverlayTrail } = vm.runInNewContext(
  grab('createContourTrail') + '\n' + grab('contourOverlayTrail')
  + '\n({createContourTrail,contourOverlayTrail})')
const makeField = () => ({ cols: 101, rows: 81, step: 6,
  F: new Float32Array(8181), previous: new Float32Array(8181) })
const peak = f => Math.max(...f.F)

test('sampling is bounded, spaced and expires by wall clock', () => {
  const trail = createContourTrail()
  for (let i = 0; i < 200; i++) trail.push(i * 3, 180, i * 10, i * 10)
  assert.equal(trail.view(1990).length, 24)
  assert.equal(trail.push(600, 180, 1991, 1991), false, 'time gate')
  assert.equal(trail.push(598, 180, 2000, 2000), false, 'distance gate')
  assert.equal(trail.push(NaN, 0, 2000, 2000), false)
  assert.equal(trail.view(4700).length, 0)
  assert.equal(trail.push(0, 0, 4701, 4701), true)
  trail.clear(); assert.equal(trail.view(4701).length, 0)
})
test('timestamps retain real age and reject out-of-order history', () => {
  const trail = createContourTrail()
  trail.push(0, 0, 900, 1000)
  assert.equal(trail.view(1000)[0].t, 900)
  assert.equal(trail.push(20, 20, 800, 1100), false)
  trail.push(20, 20, 1.7e12, 1100)
  assert.equal(trail.view(1100)[1].t, 1100)
  trail.push(40, 40, 1203, 1200)
  assert.equal(trail.view(1200)[2].t, 1200)
  assert.equal(trail.push(60, 60, 1200, 5000), false)
})
test('deformation is local, smooth, decays and never enters ambient history', () => {
  const values = []
  for (const now of [1000, 1300, 1900, 3700, 3701]) {
    const field = makeField()
    contourOverlayTrail(field, [{ x: 300, y: 240, t: 1000 }], now)
    values.push(peak(field))
    assert.equal(field.F[0], 0)
    assert(field.previous.every(v => v === 0))
    assert(field.F.every(Number.isFinite))
    assert(field.F.every(v => v >= 0 && v <= .900001))
    // At the Gaussian center, mirrored cells have equal weights.
    assert.equal(field.F[40 * 101 + 49], field.F[40 * 101 + 51])
  }
  for (let i = 1; i < values.length; i++) assert(values[i] < values[i - 1])
  assert.equal(values.at(-1), 0)
})
test('tail overlap is capped and pruning the oldest sample cannot brighten survivors', () => {
  const points = Array.from({ length: 24 }, (_, i) => ({ x: 300, y: 240, t: i * 10 }))
  const field = makeField(); contourOverlayTrail(field, points, 230)
  assert(peak(field) <= 1.5)
  const a = makeField(), b = makeField()
  contourOverlayTrail(a, points, 2750)
  contourOverlayTrail(b, points.filter(p => 2750 - p.t <= 2700), 2750)
  assert.deepEqual(a.F, b.F)
  const empty = makeField(); contourOverlayTrail(empty, [], 0)
  assert(empty.F.every(v => v === 0))
})
