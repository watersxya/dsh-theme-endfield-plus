# Optional frosted glass

The `glass` setting is `off` by default. `subtle`, `standard` and `strong` add
bounded local blur (8/14/22 px) to the composer and docked right panel. The
sidebar receives a static tint/sheen only. Text, native geometry and the selected
palette remain under the theme's existing control. Dark surfaces use their own
opacity levels. Fullscreen panels, dialogs, code blocks and menus are excluded.

Unsupported backdrop filters use a .96 opaque fill; reduced-transparency uses
an opaque fill and removes blur. Disabling the theme removes the material
attribute and stylesheet. Stronger tiers increase opacity as well as blur, so
background motion competes less with foreground text. Blur still has a GPU cost;
this feature is not a performance optimization and does not promise video FPS.

Table hover now uses a 15% accent tint over the base surface with normal text,
while text selection retains the full accent with black text. This addresses
issue #18 independently of whether glass is enabled.

Validation: `npm run test:glass` (Node 22+, Chrome/Edge; `CHROME_PATH` supported)
checks four light/dark × valley/Wuling combinations, all opacity/blur tiers,
stable geometry, AA text contrast on hovered/selected cells, reduced-transparency,
fullscreen exclusion and teardown. The browser fixture uses isolated temporary
profiles and no account or model requests.
