'use strict'
/**
 * src/host/manifest.js — index.js 的源片段清单（唯一权威的拼接顺序）。
 *
 * index.js 是插件的 Host 半部（CommonJS）：DSH 的 loader 直接 require 它，
 * 所以它本身必须是普通 CommonJS，而且 schemastery 的解析必须发生在模块求值期
 * （loader 在任何插件体运行之前就读走 Config）。
 *
 * package.json 的 `main` 与 `exports["."]` 都直接指向本产物 index.js（纯 CJS），
 * 没有条件导出、也没有单独的 ESM 入口。代价是求值期那次同步 require 可能撞上
 * DSH 并发启动里的 require(esm) 竞态（ERR_REQUIRE_ESM_RACE_CONDITION），此时
 * Config 降级为 undefined；失败与重试的判据见 src/host/12-schema-resolution.js
 * 里的 cacheableScan。本文件可直接 require：测试就是这么用它的。
 *
 * 1403 行里其实是四块彼此独立的工作——schemastery 解析与设置 schema、失败
 * 诊断报告、音频通知、余额桥——拆到本目录后每块都能单独读完。
 *
 * 改动规则与 src/client/manifest.js 相同：
 *   1. 只改片段，不要直接改 index.js（它会被下一次构建覆盖）。
 *   2. 片段顺序就是执行顺序，顶层 const 的 TDZ 依赖它，不要重排。
 *   3. 改完跑 npm run build:host，再跑 npm run test。
 */
module.exports = [
  /* ---- 模块头与两个顶层 require -------------------------------------- */
  { file: '00-shell-head.js' },

  /* ---- 插件身份与设置字段默认值 -------------------------------------- */
  { file: '10-identity.js' },

  /* ---- schemastery：候选规格 → 解析 → 建成设置 schema ---------------- */
  { file: '11-schema-specs.js' },
  { file: '12-schema-resolution.js' },
  { file: '13-schema-build.js' },

  /* ---- 设置表单缺失时的诊断报告 -------------------------------------- */
  { file: '14-diagnostics.js' },

  /* ---- 音频通知（Host 半部） ----------------------------------------- */
  { file: '20-audio.js' },

  /* ---- 余额桥：GET /theme-endfield/balance --------------------------- */
  { file: '30-balance-bridge.js' },

  /* ---- apply()：把上面几块接到 ctx 上 -------------------------------- */
  { file: '90-apply.js' },

  /* ---- 模块导出（Config 必须是字面量上的静态属性） ------------------- */
  { file: '99-shell-tail.js' },
]
