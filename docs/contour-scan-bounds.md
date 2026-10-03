# Exact bounds for contour extraction

Each row is divided into blocks of 16 cells. A block records the exact minimum
and maximum of its two vertex rows, including its shared right boundary. One
range pass is reused for all contour levels; blocks wholly on one side of a
level skip the original per-cell scan. Retained cells keep their original order,
interpolation, saddle handling, path stitching and filters. The grid, level
count, spatial smoothing and drawing functions are unchanged (with one
exception, noted after the buffer paragraph below).

The range buffers are allocated with the field and reused each frame. Calling
`contourEvaluate()` invalidates the ranges; direct level extraction falls back
to the full scan until `contourExtract()` prepares matching bounds.

> Since v1.1.6 the sampling STEP may coarsen on very large canvases
> (`contourStepFor()` / `CONTOUR_MAX_CELLS`), and the block layout follows
> `contourGeom.step` rather than a hard-coded 6. Every ordinary window still
> samples at the shipped 6px grid, which is what the comparison below covers.

Run `npm run test:bounds` for complete coordinate-array comparisons against a
forced full scan, including partial blocks, equality, plateaus and saddle cells.
The existing browser render, smoothness, coverage and performance runners remain
applicable. CPU extraction measurements do not establish GPU presentation FPS or
video dropped-frame improvements.
