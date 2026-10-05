# Optional Worker / WebGL contours

`contourRenderer` defaults to `canvas`, retaining the original rendering path.
Select **Worker / WebGL** in the contour settings to compute and draw the same
terrain in a dedicated Worker using a transferred OffscreenCanvas. WebGL2 batches
the smoothed curve segments in a single instanced draw. Canvas2D in the worker is
the fallback when WebGL2 is unavailable. Unsupported workers, transfer failure,
render timeouts, message errors or context loss fall back to the main Canvas2D
path on a fresh canvas; a transferred canvas is never reused for getContext.

The worker source is generated from the exact build/evaluate/extract/draw
functions in client.js, preserving field generation, smoothing, phase policy,
level filters, stroke colors and DPR. The GPU painter approximates cubic curves
within 0.04 backing pixels (with a bounded subdivision depth), so antialiasing
is not claimed to be pixel-identical to Canvas2D. No external URL, CDN, eval or
runtime dependency is used; a local Blob contains the embedded worker source.

The queue has one in-flight job plus at most one latest pending job. Pending
geometry work survives a later paint-only update. Hidden pages stop submitting
work; static/reduced-motion/scroll policies retain the existing switches.
Teardown terminates the worker, revokes its Blob URL and removes its canvas.
Failure is latched until the backend preference changes, preventing retry loops.

The contour wrapper exposes `data-endfield-renderer` (starting, worker-webgl2,
worker-canvas2d or main-canvas2d) and an explanatory fallback reason attribute.
CPU/worker completion rate is not display FPS; external video dropped frames
and total GPU cost require separate measurement on the target hardware.

## Developing

- `npm run build:worker`: regenerate the embedded source after kernel edits.
- `npm run check:worker`: fail if the embedded source is stale.
- `npm run test:worker`: real Chrome test (Node 22+, `CHROME_PATH` supported).

The browser test checks the actual backend, paused/static behavior, visibility
handler, injected message failure with a fresh-canvas fallback, explicit retry,
repeated enable/disable and final teardown. The temporary profile contains only
fixture data. The legacy CI suite continues to validate the default backend.
