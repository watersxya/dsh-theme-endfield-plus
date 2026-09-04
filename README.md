# dsh-theme-endfield-plus

参考《明日方舟：终末地》官网风格的 DSH Web 主题插件改进版。

奶油纸底、墨黑文字、信号黄/武陵青强调色、全直角工业编辑风。插件只运行在 Client 侧，通过主题令牌和样式覆盖界面，不修改应用代码。

> 本仓库基于 [@ymh0000123/dsh-theme-endfield](https://github.com/ymh0000123/dsh-theme-endfield) 的原作进行功能增强与修复，非常感谢原作者 `@ymh0000123` 的出色设计与实现。
>
> English documentation: [README.en.md](README.en.md)

## 安装

```bash
dsh plugin --profile web add github:YOUR_GITHUB_USERNAME/dsh-theme-endfield-plus
```

重启或重新加载 `web` profile 后生效。卸载：

```bash
dsh plugin --profile web rm dsh-theme-endfield
```

## 功能

在 **设置 › 终末地主题设置** 中调整：

- 主题总开关、谷地黄/武陵青配色、直角/圆角模式；
- 等高线背景、动态开关、`24 / 60 / 120 FPS`；
- 等高线速度 `1x / 2x / 4x`；
- **背景图拆分为两套独立模块**：
  - 全局整页背景图（URL / 本地图片上传、遮罩强度、填充方式）；
  - 导航区独立覆盖背景图（URL / 本地图片上传、**不透明度**、**遮罩强度**、填充方式）；
- 背景水印及持续显示；
- 启动加载动画；
- 雷霆大字及入场动画。

所有设置均使用 `localStorage` 持久化，设置文案支持中英文。动态等高线支持系统减少动态效果偏好，动画帧率和速度可独立调整。

## 本仓库更新内容

相比原版 `dsh-theme-endfield`，本仓库主要增加/修复：

### 新增：背景图作用范围拆分
- 原来只有一个“自定义背景图”；
- 现在拆成 **全局整页背景图** + **导航区独立覆盖背景图**；
- 导航区未单独设置时，自动沿用全局整页背景图。

### 新增：导航区背景图独立控制
- 导航区可单独上传/填写图片；
- 支持 **不透明度（0–100%）**；
- 支持 **遮罩强度（0–90%）**；
- 支持填充方式：填充 / 包含。

### 修复：左导航 hover 才显示背景、移开又变黑
- 背景图开启时，通过稳定 body class + 内联透明兜底，左导航不再依赖鼠标 hover；
- 移除鼠标后也不会几秒后变回黑底。

### 修复：导航列表底部黑色渐隐条
- 左侧列表底部的 `.fade` 渐隐层在背景图开启时改为透明终点，不再出现黑色横条。

### 修复：设置页无法点击
- 移除了 frame/sidebar 上不必要 `isolation` 层叠上下文；
- 设置页的 `position: fixed` 全屏层不再被侧栏困住，可正常点击。

### 保持兼容
- 原有等高线、水印、启动动画、雷霆大字等功能全部保留；
- 原有设置存储键继续使用，不破坏已有配置。

## 适配版本

| 项目 | 版本 |
| --- | --- |
| 插件版本 | `1.1.0` |
| DSH 根包 | `@deepseek-ai/dsh-root` `0.1.3-alpha.1` |
| 工作区 | `harness-alpha-v013` |
| 运行端 | `web` profile |

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/design-language.md](docs/design-language.md) | 色板、令牌映射与对比度规则 |
| [docs/features.md](docs/features.md) | 功能行为、默认值、存储键与边界情况 |
| [docs/engineering-notes.md](docs/engineering-notes.md) | 算法、层叠、动画和性能实现说明 |
| [docs/testing.md](docs/testing.md) | 校验脚本与测试套件说明 |

## 开发与验证

```bash
node check.js
node selftest.js
npm test
```

`npm test` 覆盖样式不变量、配色、设置页、真实浏览器渲染、等高线平滑/尖点、动画可访问性、覆盖率和 24/60/120 FPS 性能预算。部分浏览器测试需要本机安装 Chrome 或 Edge。

## 项目结构

```text
client.js          Client 侧主题实现
index.js           Host 侧空实现
cordis.patch.yml   Bundle 注入配置
check.js           样式表静态校验
selftest.js        校验器自检
test/              渲染、设置、配色与性能测试
docs/              设计、功能、工程与测试文档
```

## 许可证

MIT

## 致谢

特别感谢原插件作者 [@ymh0000123](https://github.com/ymh0000123) 提供的优秀主题设计与实现。
