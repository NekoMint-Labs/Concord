# OpenTakeoff Drawing adaptation

Pinned upstream: `Kentucky-ai/opentakeoff` at
`60c82e34b389384401a083cefeb9389f89fbaae1` (Apache-2.0).
Original license is retained in `LICENSE`.

`geometry.js`, `sheetPreview.js`, `annotationTools.js` and
`AnnotationWorkbench.css` are copied byte-for-byte from upstream. The
`recordCommand` function is extracted unchanged from `shapeCommands.js`, with
its original 100-command cap. `noteFields.ts` retains only the donor display
constant; estimating quantity fields are excluded.

`AnnotationWorkbench.jsx` adapts the complete donor annotation workbench hook,
SVG ink and controls. It retains arrow/callout/cloud notes, freehand/straight/native
text highlighting, text sweep review, favorites, selection/multi-selection,
move/handle editing, note editing, cancellation and keyboard deletion. The
recorded patch redirects display dependencies, removes the unused compact
workspace control, excludes condition/RFI association, bounds stored preference
reads and exposes only native PDF text sweep (symbol search is not integrated).
`annotationIcons.tsx` supplies display glyphs; it contains no tool logic.

`annotation-upstream.json` records the five fetched source hashes. Verify the
original cached files, unchanged helpers and exact recorded patch with:

```text
python scripts/verify_drawing_donor.py --source <opentakeoff>/web/src
```

Concord's small host adapter binds ink to a source revision/hash and physical
page, normalizes annotation callbacks to C-owned transient values, scopes donor
keyboard handling to the focused SVG, applies bounded donor history and limits
annotation count/points. It does not persist authoritative coordination state.

The drawing surface also ports the render-task/liveness logic from
`web/src/components/SheetPreview.jsx`. `drawing/workerCanvas.ts` adapts the
OffscreenCanvas and DOM-less filter factories from `web/src/pdfTile.worker.ts`.
`drawing/drawingInteraction.ts` adapts TakeoffCanvas's calibrated
units-per-page-point convention and calls donor geometry for length/area/clouds.
Estimating, prices, conditions, donor project persistence, remote login and donor
OCR are excluded. Concord OCR stays in the Docling adapter.

`RevisionsPanel.jsx` was inspected. Its quantity deltas, snapshot restoration and
estimating persistence are not imported. Engineering visual revision comparison
remains the separate pinned pdf-diff-viewer integration. Sheet group/stitch,
vector snapping and advanced measurement editing are not yet adapted. This is
an isolated engineering surface pending A's canonical contracts and B's product
seam; full OpenTakeoff feature parity is not claimed.

Drawing now prepares every bounded page once per cache miss using PDF.js and the
unchanged donor preview/text geometry helpers. A 32 MiB/four-entry LRU stores
only PNGs, native text quads and metadata, keyed by source hash + exact engine +
render options. No PDF document, worker, source revision ID or decoded bitmap
is retained by the cache. Shared readers cancel preparation only when the last
reader exits; incomplete artifacts fail without cache publication. Warm reads
verify bytes and rebind revision identity before using the derived sheets.
The generic preview declaration also describes the donor's numeric viewport
helper for derived page dimensions; the JavaScript helper is unchanged.

This cache is viewer-local/in-memory. Eviction and browser reload require a new
preparation, and PDF visual diff retains its own separately pinned engine/cache.
A's persistent derived-artifact service has not yet been connected.
