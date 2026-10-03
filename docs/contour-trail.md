# Optional mouse trail

Enable the contour background, its animation, and **Mouse trail** in the theme
settings. The persisted `contourTrail` string defaults to `'0'`; `'1'` enables a
local deformation that follows the mouse and fades. Chinese and English labels
follow the host locale. Touch and pen input do not produce a trail.

The idea and bounded decay model are adapted from the Endfield Glass plugin.
This port integrates into the current upstream Canvas pipeline and preserves
the original ambient field, smoothing, contour levels and curve drawing.

## Cost and lifecycle

- Reuses the existing contour animation loop and selected FPS. It consumes only
  the latest pointer event per field frame, with 8 ms / 2 CSS px admission gates.
- The pointer handler only stores coordinates and timestamps. A frame reads the
  host rectangle once when consuming a pending point, not on every pointer event
  or streaming DOM mutation. Stored coordinates never leave page memory.
- At most 24 samples, a 900 ms exponential decay constant and 2700 ms lifetime.
  Head quota is .9; older samples share a fixed .6 geometric tail budget. Expiry
  cannot renormalize or brighten remaining samples. Only bounded neighborhoods
  around samples receive field contributions.
- Smooth Gaussian contributions are added after the ambient smoothing/temporal
  blend. They never enter ambient history, so expiry leaves no temporal ghost.
  This port uses a 28 CSS px kernel; it does not claim pixel identity with the
  Glass plugin's raw-field overlay followed by spatial smoothing.
- Static mode, reduced motion, hidden pages, scrolling (when pause is enabled)
  and the startup loader suspend sampling and clear deformation. Resize, blur,
  disabling and disposal also clear history. Mouse leave drops the pending event
  while already drawn samples decay normally.
- Disabling removes mouse listeners. Unmount/disposal also removes visibility,
  blur and media-query listeners. No second timer or animation loop is added.

This branch targets current upstream main independently of the proposed scan,
Worker/WebGL and glass PRs. Combining it with a Worker renderer requires carrying
the bounded samples and frame clock into that renderer's frame messages before
contour extraction; main-thread state must not be read inside a Worker.

## Validation

`npm run test:trail` runs dependency-free Node checks for bounded history,
timestamps, local support, monotonic decay, fixed total weight and expiry.

`npm run test:trail-browser` uses Chrome/Edge and Node 22+ (the same Node major
used by CI), with an isolated temporary browser profile. A controlled animation
clock and fixed terrain seed compare real Canvas pixels against a trail-off
control: idle and expired trails yield exactly the control image, while an active
mouse sample visibly deforms it. It also checks pointer-handler layout reads,
static mode, live reduced-motion changes, visibility/scroll pause, repeated
enable/disable and complete listener/canvas cleanup. This is not an FPS test.

The existing settings tests cover the default, disabled UI state, persisted
camelCase key and rereading that preference. Both new tests join `test:ci`.

Local validation (2026-09-19, Windows Chrome / Node 24.12): the new browser and
four logic checks pass. The final complete CI run passed 23 of 24 scripts; the
existing random-layout speck/coverage test reported one sparse region among five
random layouts. Its isolated rerun passed all five layouts. The original terrain
generator, coverage scorer, ambient evaluator, level extractor and curve painter
were also compared with the base commit and are unchanged. The initial random
failure is recorded rather than presented as an entirely green single CI run.
