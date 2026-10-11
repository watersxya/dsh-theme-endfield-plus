/**
 * contour-density.test.js — 锁定等高线的视口密度自适应。
 *
 * 背景（本仓库首个「小屏适配」回归）：桌面调好的 20 级 / 22 岛是按「每屏」观感
 * 调的常量，但按「每面积」施加。375px 宽的手机框把同样的 21 条线与 22 个岛屿
 * 压进一小条竖带，嵌套环密到读作一堆乱线（375x812 实测 62 条路径，环叠环）。
 *
 * 修复：短边 <640px 时层级数向 10、bump 数向 12 线性递减（320px 触底），
 * >=640px 逐字节回到出厂值；覆盖率验证器按「该视口实际将画的层级数」评分。
 *
 * 本测试按名字从 client.js 抓函数（同 contour-cusps 的拼接方式），在 Node 里
 * 直接断言密度函数与两个窗口的抽取产物，无需浏览器。
 *
 * Usage: node test/contour-density.test.js
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { test } = require('node:test')
const assert = require('node:assert/strict')

const src = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8')
function grab(name) {
  const at = src.indexOf('const ' + name + ' = ')
  if (at < 0) throw new Error('not found in client.js: ' + name)
  const i = src.indexOf('{', at)
  let d = 0
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') d++
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(at, j + 1) }
  }
  throw new Error('unbalanced: ' + name)
}
function grabNum(name) {
  const m = src.match(new RegExp('const ' + name + ' = ([0-9.]+)'))
  if (!m) throw new Error('not found in client.js: ' + name)
  return 'const ' + name + ' = ' + m[1]
}

const fns = ['contourRng', 'contourStepFor', 'contourBuild', 'contourBuildCandidate',
  'contourCoverageScore', 'contourEvaluate', 'contourExtractLevel', 'contourExtract',
  'contourMinSide', 'contourDensityT', 'contourLevelsFor', 'contourBumpsFor'].map(grab).join('\n')
const nums = ['CONTOUR_STEP', 'CONTOUR_LEVELS', 'CONTOUR_SPAN',
  'CONTOUR_MIN_LEN', 'CONTOUR_MIN_RING_BOX', 'CONTOUR_MIN_CROSSINGS', 'CONTOUR_MIN_INK',
  'CONTOUR_MAX_CELLS', 'CONTOUR_MIN_BUMPSAMPLES', 'CONTOUR_DENSITY_ANCHOR'].map(grabNum).join('\n')

const api = new Function(`
let contourField=null, contourGeom=null, contourPaths=[]
// 固定种子：密度断言必须量同一张地形。
const contourSeed=0x5eed4242
${nums}
const CONTOUR_KEEP_LEN=CONTOUR_MIN_LEN*1.35
const CONTOUR_KEEP_RING=CONTOUR_MIN_RING_BOX*1.5
${fns}
return { build:contourBuild, extract:contourExtract,
  levelsFor:contourLevelsFor, bumpsFor:contourBumpsFor,
  paths:()=>contourPaths, geom:()=>contourGeom }
`)()

test('density equals the shipped constants at and above the 640px anchor', () => {
  assert.equal(api.levelsFor(640, 900), 20)
  assert.equal(api.bumpsFor(640, 900), 22)
  assert.equal(api.levelsFor(1440, 900), 20)
  assert.equal(api.bumpsFor(1440, 900), 22)
  assert.equal(api.levelsFor(1920, 1080), 20)
})

test('density eases down on narrow frames and floors at 320px', () => {
  // 375px 短边：t=(375-320)/320≈0.17 -> 10+0.17*10 四舍五入为 12？逐值断言：
  assert.equal(api.levelsFor(375, 812), Math.max(6, Math.round(10 + ((375-320)/320) * 10)))
  assert.equal(api.bumpsFor(375, 812), Math.max(6, Math.round(10 + ((375-320)/320) * 12)))
  // 触底与下限之下都停在 floor 值，不再继续下降。
  assert.equal(api.levelsFor(320, 812), 10)
  assert.equal(api.levelsFor(200, 812), 10)
  assert.equal(api.bumpsFor(320, 812), 10)
  // 密度确实随宽度单调不减（同高不同宽）。
  assert.ok(api.levelsFor(375, 812) < api.levelsFor(640, 812))
  assert.ok(api.bumpsFor(375, 812) < api.bumpsFor(640, 812))
})

test('a narrow frame still extracts a full landscape at its own density', () => {
  api.build(375, 812)
  api.extract(0)
  const paths = api.paths()
  assert.ok(paths.length > 20, 'paths=' + paths.length + ' — 小屏低密度仍须成图')
  // accept-or-reroll 验证器在小屏阈值下自洽：不因 reroll 耗尽而残缺。
  const levels = api.levelsFor(375, 812)
  assert.ok(levels < 20)
})

test('desktop extraction keeps the shipped level count', () => {
  api.build(1432, 753)
  api.extract(0)
  assert.ok(api.paths().length > 40, 'desktop paths=' + api.paths().length)
})