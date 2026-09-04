# dsh-theme-endfield-plus

An enhanced DeepSeek Harness (DSH) web theme plugin inspired by the official Arknights: Endfield website.

Cream paper base, ink text, signal-yellow / Wuling-cyan accents, and a zero-radius industrial editorial style. The plugin runs entirely on the Client side and overrides the UI through theme tokens and styles without modifying application code.

> This repository is based on [@ymh0000123/dsh-theme-endfield](https://github.com/ymh0000123/dsh-theme-endfield) by the original author `@ymh0000123`. Special thanks to the original author for the excellent design and implementation.

## Installation

```bash
dsh plugin --profile web add github:watersxya/dsh-theme-endfield-plus
```

Restart or reload the `web` profile to apply. To uninstall:

```bash
dsh plugin --profile web rm dsh-theme-endfield
```

## Features

Adjustable in **Settings › Endfield Theme**:

- Theme master switch, Valley Yellow / Wuling Cyan palette, square/rounded corners;
- Contour background, animation toggle, `24 / 60 / 120 FPS`;
- Contour speed `1x / 2x / 4x`;
- **Background images are split into two independent modules**:
  - Global full-page background image (URL / local upload, scrim, fit);
  - Navigation-area overlay background image (URL / local upload, **opacity**, **scrim**, fit);
- Background wordmark and keep-visible option;
- Boot loading animation;
- Task announcement (thunder text) and its entry animation.

All settings are persisted with `localStorage` and support Chinese/English. Animated contours respect the system reduced-motion preference, and frame rate and speed can be tuned independently.

## Updates in this repository

Compared with the original `dsh-theme-endfield`, this repository adds/fixes:

### New: split background-scope model
- The original single "custom background image" setting is now split into:
  - **Global full-page background image**
  - **Navigation-area overlay background image**
- If no navigation image is configured, the navigation area automatically uses the global full-page image.

### New: independent navigation image controls
- Upload or enter a separate image for the left navigation area;
- Supports **opacity (0–100%)**;
- Supports **scrim (0–90%)**;
- Supports fit: Cover / Contain.

### Fix: navigation image only appeared on hover
- When the global background is enabled, the navigation area stays transparent through a stable body class plus inline transparency fallback;
- Moving the mouse away no longer restores the black background after a few seconds.

### Fix: black fade bar above the footer
- The `.fade` gradient at the bottom of the workspace list now ends at transparent while a background image is active.

### Fix: settings panel could not be clicked
- Removed unnecessary `isolation` stacking-context traps on the frame/sidebar;
- The settings full-screen `position: fixed` layer is no longer trapped by the sidebar and can be clicked normally.

### Compatibility
- All original features (contour, wordmark, boot animation, thunder text, etc.) are preserved;
- Existing local storage keys remain compatible.

## Compatibility

| Item | Version |
| --- | --- |
| Plugin version | `1.1.0` |
| DSH root package | `@deepseek-ai/dsh-root` `0.1.3-alpha.1` |
| Workspace | `harness-alpha-v013` |
| Runtime | `web` profile |

## Documentation

| Document | Content |
| --- | --- |
| [docs/design-language.md](docs/design-language.md) | Palette, token mapping and contrast rules |
| [docs/features.md](docs/features.md) | Behaviour, defaults, storage keys and edge cases |
| [docs/engineering-notes.md](docs/engineering-notes.md) | Algorithms, stacking, animation and performance notes |
| [docs/testing.md](docs/testing.md) | Validation scripts and test suite documentation |

## Development & Validation

```bash
node check.js
node selftest.js
npm test
```

`npm test` covers style invariants, palettes, the settings page, real-browser rendering, contour smoothness/cusps, animation accessibility, coverage and 24/60/120 FPS performance budgets. Some browser tests require a local Chrome or Edge installation.

## Project structure

```text
client.js          Client-side theme implementation
index.js           Host-side empty implementation
cordis.patch.yml   Bundle injection configuration
check.js           Static stylesheet validation
selftest.js        Validator self-test
test/              Rendering, settings, palette and performance tests
docs/              Design, feature, engineering and testing documentation
```

## License

MIT

## Acknowledgements

Special thanks to the original plugin author [@ymh0000123](https://github.com/ymh0000123) for the excellent theme design and implementation.
