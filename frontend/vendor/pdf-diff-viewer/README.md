# pdf-diff-viewer worker adaptation

Pinned upstream: `a-subhaneel/pdf-diff-viewer` at
`96af1ce5caa0b27b3b4a2e14ef3c16aed0842170`, package 1.3.3 (MIT).
Original license retained in `LICENSE`.

`PDFDiffViewer.js` retains the upstream page text matching, offset search,
pixel comparison, region crop/mask, connected diff regions and word-box
mapping algorithms. Local changes:

- ESM import of pinned PDF.js 4.10.38; no window global or CDN worker.
- Remove DOM presentation/compare orchestration. The Concord worker owns
  loading tasks, matching, added/deleted pages, cancellation and disposal.
- OffscreenCanvas allocation; asynchronous PNG Blob outputs with bounded
  page/alignment/crop sizes and explicit canvas release between page pairs.
- Return diff and word boxes in addition to overlays.
- Count changed pixels after masks, before highlight dilation.
- Clip masks to raster bounds; allow explicit zero-valued options.

The donor's heuristic text matching can misassociate low-text/scanned pages,
especially when pages are inserted or removed. The worker reports this risk.
Worker rasterization follows OpenTakeoff's DOM-less filter path, which does
not apply SVG PDF color filters; results explicitly report this limitation.
Mask coordinates are relative to the cropped raster. Donor output stays
inside C's adapter and is not a persisted Change/Evidence contract.

Do not replace these algorithms with a handwritten PDF diff.
