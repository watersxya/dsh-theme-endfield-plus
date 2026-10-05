# dsh-theme-endfield-plus

参考《明日方舟：终末地》官网风格的 DSH Web 主题插件。

奶油纸底、墨黑文字、信号黄/武陵青强调色、全直角工业编辑风。Client 侧（`client.js`）通过主题令牌和样式覆盖界面；Host 侧（`index.js`）负责设置持久化与可选的音频通知（派生系统播放器子进程），均不修改应用代码。

## 本仓库是上游的增强分支

上游：[ymh0000123/dsh-theme-endfield](https://github.com/ymh0000123/dsh-theme-endfield)（原作者，本仓库基于 v1.1.9 重建）

| | 上游 v1.1.9 | 本仓库 |
| --- | --- | --- |
| 终末地视觉、等高线、水印、加载屏、雷霆大字 | ✅ | ✅ 原样继承 |
| DSH 0.2 适配、Config 持久化、音频通知、余额胶囊 | ✅ | ✅ |
| **自定义背景图（整页 + 导航区覆盖）** | ❌ | ✅ **本仓库独有** |

本仓库版本号形如 `1.1.9-plus.N`：`1.1.9` 是它跟随的上游版本，`plus.N` 是本仓库自己的补丁序号。

**背景图是本仓库唯一的上游增量**——它原本是 fork 时期自己加的，上游主线从未合并，所以只能以补丁形式随附。代码里所有属于本仓库的部分都标了 `LOCAL PATCH` 注释，`index.js` 的 `FIELD_DEFAULTS` 与 `client.js` 的 `PREFS_FIELD_DEFAULTS` / `PREFS_KEY_TO_FIELD` 里能一一对应。

背景图能力：

- **整页背景图** —— 支持 URL / 本机图片（读成 dataURL），遮罩强度 `0–90%`（默认 55%），填充方式 填充 / 包含；
- **导航区独立覆盖图** —— 单独开关与图片，另有**不透明度**（`0–100%`）与遮罩强度（默认 65%）；不开启时自动沿用整页背景图；
- **两者接的是 DSH Config 而非 localStorage**，与上游的设置持久化体系一致（见下文），所以换端口、重启、DSH Desktop 均不丢；
- 附带修复：左导航不再「hover 才显示背景、移开又变黑」；导航列表底部不再出现黑色渐隐条。

同步上游新版本时，请留意 `client.js` 里 `LOCAL PATCH` 标记的四处接入点：字段默认值表、键→字段映射表、图层逻辑（挂在 `watermarkObserver` 上）、样式表（注入在 `::selection` 之前）。

## 版本支持

| DSH | 设置持久化 | 备注 |
| --- | --- | --- |
| **0.2.x**（在 **0.2.0-rc.2** 上实测） | Host 导出 `Config`，浏览器 `ctx.configForms` | 当前支持目标 |
| 0.1.7 – 0.1.x | 同一套 Config/configForms 接缝 | 无需改动 |
| ≤ 0.1.5 | `ctx.settings.register` + `ctx.settingsScope` | 自动回落，无需配置 |

实测环境：DSH `0.2.1-alpha.1` / Windows。

0.2 改动了三处本插件依赖的应用侧细节，本次已跟进（都验证过「旧写法在 0.2 上静默失效」）：

- **回合状态标签**（“Deep diving…”）从 `@deepseek-ai/dsh-client-ui-conversation` 的**渐变文字**搬到 `@deepseek-ai/dsh-client-ui-chat` 的**遮罩扫光文字**，不再有 `turnStatus` 类名，着色改由 `--dsw-alias-label-deep-diving` / `-shimmer` 两个令牌承担，所以旧规则已删除、改在 `theme.overrideTokens` 层换色（实测：留着旧规则时该令牌仍是应用自带值，标签完全没有主题色）；
- **右侧栏**列名由 `_detailsCol` 改为 `_rightbarCol`，且不透明底色移到列元素本身——等高线图层在右侧栏打开时不会再被整块盖住；
- **插件卡片展示文案**改由 `locale/<语言>.json` 的 `meta.title` / `meta.description` 提供；`package.json` 的 `dsh.client.inject` 也不再列 0.2 已删除的 `@deepseek-ai/dsh-client-runtime` 与 `@deepseek-ai/dsh-client-ui-slots`（改为列出 0.2 真正的提供方）。

> 本仓库的背景图补丁同时兼容两个列名（`_rightbarCol` 与 `_detailsCol` 并存），在 0.1.x 与 0.2 上都能工作。
>
> 补丁另有一处**刻意删除**：早期 fork 的样式里带着 `[class*='wSkVaW_root']` / `[class*='ydkMvW_root']` 这类哈希锁定的 CSS-module 类名。它们带构建哈希、下次 rehash 就会静默失效，上游 `test/selector-guard.test.js` 会直接判失败。现已改由稳定的 `[class$='_sidebarCol']` 一类后缀选择器覆盖。

## 安装

```bash
dsh plugin --profile web add github:watersxya/dsh-theme-endfield-plus
```

重启或重新加载 `web` profile 后生效。**更新插件文件时注意**：Client 半（`client.js`）由 Host 按请求从磁盘读取，浏览器刷新即可生效；Host 半（`index.js`）只在 profile 启动时 import 一次，**必须整进程重启 DSH** 才会重新加载（`dsh-hmr` 的 watch 默认忽略 `**/node_modules`，软链安装的仓库文件不在其观察范围内）。只刷新页面时，运行的仍是启动时那份 Host 代码。卸载：

```bash
dsh plugin --profile web rm dsh-theme-endfield
```

包名与 bundle id 沿用上游的 `dsh-theme-endfield` / `theme-endfield`（`cordis.patch.yml` 注入的正是这一行），因此与上游插件**不能并存**——两者在 DSH 眼里是同一个包，只能二选一。

## 功能

在 **设置 › 终末地主题设置** 中调整：

- 主题总开关、谷地黄/武陵青配色、直角/圆角模式；
- 等高线背景、动态开关、`24 / 60 / 120 FPS`；
- 等高线速度 `1x / 2x / 4x`；
- 可选鼠标轨迹：鼠标附近的等高线局部变形并逐渐恢复，默认关闭；
- **自定义背景图（本仓库独有）**：整页背景图与导航区独立覆盖图，各自的遮罩强度，导航区另有不透明度，填充方式填充/包含；支持 URL 与本机图片，默认关闭；
- 背景水印及持续显示；
- 启动加载动画；
- 雷霆大字及入场动画；
- 顶部余额胶囊：悬浮显示 DeepSeek API 余额与峰谷时段（高峰为工作日 `9-12` 点、`14-18` 点；周末、法定节假日与落在周末的调休日都按低谷半价），默认关闭；会话使用 [dsh-codearts-auth](https://www.npmjs.com/package/dsh-codearts-auth) 渠道模型时自动切换为该渠道的剩余额度与积分消耗进度，随渠道切换实时跟随，主读数可在设置中选择显示剩余或已用（详见 [docs/features.md](docs/features.md)「渠道额度模式」）；
- 可选音频通知：启动音、任务开始/结束音、需要回应时提示，音量与自定义音效目录可调（默认关闭，详见 [docs/audio-notifications.md](docs/audio-notifications.md)）。

所有设置由 DSH 自己的设置服务持久化，与页面 origin/端口无关：在 **DSH 0.2.0-rc.2 / 0.1.7-rc.1 及以后**，Host `index.js` 导出一份字段全部 `.volatile()` 的 schemastery `Config`（命名空间 = 本插件 profile entry id `theme-endfield`），浏览器 `client.js` 通过 `ctx.configForms` 读写并订阅，值随 `<profile>/cordis.patch.yml` 落盘；在**更旧的 DSH（≤ 0.1.5）** 上则回落到 `ctx.settings.register('dsh-theme-endfield', schema)` + `ctx.settingsScope`（`<dshHome>/settings.yaml`）。两代都与页面 origin 无关，因此 DSH web 与 DSH Desktop 都能正确保存并在重启/换端口后恢复，不再使用会被 Desktop 随机端口清空的 `localStorage`。详见 [docs/features.md](docs/features.md) 与 [docs/engineering-notes.md](docs/engineering-notes.md)；0.1.7 升级后旧设置需要在设置页重设一次（`settings.yaml` 已被 DSH 废弃，见 [engineering-notes.md § DSH 0.1.7-rc.1 换掉了整套 settings API](docs/engineering-notes.md#dsh-017-rc1-换掉了整套-settings-api-v110-已跟进)）。设置文案支持中英文；动态等高线尊重系统「减少动态效果」，动画帧率和速度可独立调整。

**如果开关总是「刷新后复位」**：先看 Host 侧有没有这份 `Config`（`Config.listConfigs` 对该 entry 报 `absent` 就是没有）。没有 Config 时 DSH 不投影任何表单，Host `apply()` 会打一行 warn 并在 profile 目录留下报告文件 `theme-endfield-diagnostic.json`（`Config` 构建成功时会自动删除它；报告里的 `schemaMode` / `loaded` / `loadError` 会写明走了哪条解析路径、以及某个副本是否「解析得到却加载失败」）——排查与判据见 [docs/testing.md](docs/testing.md#设置页)。另外注意：**改 Host 半（`index.js`）必须整进程重启 DSH**，刷新页面只重载 `client.js`。

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/design-language.md](docs/design-language.md) | 色板、令牌映射与对比度规则 |
| [docs/features.md](docs/features.md) | 功能行为、默认值、存储键与边界情况 |
| [docs/engineering-notes.md](docs/engineering-notes.md) | 算法、层叠、动画和性能实现说明 |
| [docs/testing.md](docs/testing.md) | 校验脚本与测试套件说明 |
| [docs/contour-trail.md](docs/contour-trail.md) | 鼠标轨迹的采样、衰减与验证 |

## 开发与验证

```bash
node check.js
node selftest.js
npm test
```

`npm test` 覆盖样式不变量、配色、设置页、真实浏览器渲染、等高线平滑/尖点、动画可访问性、覆盖率和 24/60/120 FPS 性能预算。部分浏览器测试需要本机安装 Chrome 或 Edge。跑测试请用 Node 22+（浏览器 fixture 依赖全局 `WebSocket`/`fetch`，版本不足会在测试处明确报错；插件本身的运行没有这个要求）。

## 项目结构

```text
client.js          Client 侧主题实现
index.js           Host 侧：导出 volatile Config，声明设置命名空间
lib/               音频通知：槽位定义、WAV 合成与播放运行时
locale/            插件卡片的展示文案（meta.title / meta.description）
sounds/            生成的通知音（npm run sound:build 重新生成）
cordis.patch.yml   Bundle 注入配置
check.js           样式表静态校验
selftest.js        校验器自检
test/              渲染、设置、配色与性能测试
docs/              设计、功能、工程与测试文档
```

## 素材归属

本插件是**非官方同人作品**，与鹰角网络（Hypergryph）不存在任何隶属、赞助或背书关系。

- 《明日方舟：终末地》（Arknights: Endfield）的游戏名称、标识、商标、官网视觉与设计语言及相关美术素材，版权归**鹰角网络（上海鹰角网络科技有限公司，Hypergryph Network Technology）**所有。
- 本仓库中的**部分素材**（如 `assets/` 下的界面截图，以及主题中还原的 `ENDFIELD` 字标、信号黄配色与工业编辑风版式）源自或参考上述作品及其官网，仅用于**学习、展示与非商业用途**；其权利仍归鹰角网络所有，**不在本项目的 MIT 许可证覆盖范围内**。
- **除背景图补丁外，本仓库的代码与上游同为 MIT 许可的原创代码**（`client.js`、`index.js`、`src/`、`scripts/`、`test/` 等），版权归原作者 `ymh0000123` 及本仓库贡献者所有。背景图补丁（整页图层、导航区图层、相关设置项与面板行）为本仓库新增，同以 MIT 发布。
- 若权利方认为本仓库中的任何素材使用不当，请通过 Issue 联系，我们会立即删除或替换相关内容。

## 许可证

MIT，仅覆盖本项目的原创代码；第三方素材的归属见[素材归属](#素材归属)。

## 致谢

本仓库的存在完全建立在 [@ymh0000123/dsh-theme-endfield](https://github.com/ymh0000123/dsh-theme-endfield) 之上。
原仓库把「奶油纸底 + 墨黑文字 + 信号黄 + 全直角」这套工业编辑风实现得极其扎实，
并为它写下了四篇设计/工程文档、一套会抓静默错误的静态校验器，以及 44 项测试。
本仓库只做了一件事：**把上游没有的自定义背景图以补丁形式带上**，
其余部分尽量保持与上游一致，以便日后继续同步。

若上游不接受这个改动，最干净的走法是本仓库整体回退到纯上游版本——
背景图相关的代码都标了 `LOCAL PATCH`，按这些标记删掉即可复原。

## Star History

<a href="https://www.star-history.com/?repos=watersxya%2Fdsh-theme-endfield-plus&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=watersxya/dsh-theme-endfield-plus&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=watersxya/dsh-theme-endfield-plus&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=watersxya/dsh-theme-endfield-plus&type=date&legend=top-left" />
 </picture>
</a>
