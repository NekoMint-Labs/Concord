# Isolated mlightcad integration

Pinned donor: `mlightcad/cad-viewer` at
`250533a861e9fa1feca739b6783286ed4e91674a`, MIT; packages 1.7.3.
Data-model 1.15.1 and Three 0.172.0 are independently locked here to match the
donor. They do not replace Concord's existing Three/IFC runtime.

`vendor/` contains upstream cad-diff-viewer sources and LICENSE. The viewer changes are limited to DXF-only picker/extension guards, a
recorded adapter around the donor comparison seam, a dedicated comparison
worker, and native entity selection. The renderer and matching algorithm are
not rebuilt. The adapter extracts bounded plain entity snapshots from the
render database, then sends those snapshots to the worker; comparison does not
parse a second DXF copy.

Concord's wrapper validates the source hash/revision and registers its bytes
against the donor database. The viewer uses the SDK's DXF parser once per active render database.
The worker receives no source bytes, SDK database, or entity pointers.
Snapshot cache keys include the source hash, effective compare settings, and
the `concord-snapshots-v2` engine marker; cache size, entity count, and
structured-clone payloads are bounded. Extraction yields between batches and
cancellation clears partial results. The donor matching/classification logic is
kept intact and is qualified against the pinned upstream implementation. Entity navigation resolves the revision/hash and actual SDK
handle, activates the matching comparison side, selects and frames native
geometric extents. Missing or stale targets fail explicitly. Disposal terminates the worker and destroys the SDK manager.

No LibreDWG/proprietary DWG converter is installed or registered. This path
does not accept DWG/RVT/NWD/NWC or publish native artifacts. A's authoritative
source upload path remains a separate integration dependency.

Limits: donor comparison covers top-level model-space entities; it does not
prove equivalent nested block/layout contents or effective layer attributes.
Font files must be legally supplied locally; missing font quality must remain
explicit. No remote font repository should be contacted.

Install using pinned pnpm, frozen mode after the first resolution. Build runs
into ignored `frontend/public/viewer/cad/`. B will consume the C-owned adapter
after shared ViewerTarget contracts land. No product composition changes here.

## CAD comparison qualification

The isolated tests cover donor-equivalent results across compare settings, source-hash/settings cache separation, option immutability, cancellation, timeout, worker failure, snapshot limits, concurrent preparation, LRU/byte eviction, and viewer disposal. The real browser suite verifies Golden DXF navigation, warm compare-setting reuse, and a 1,028-entity pressure sample. The measured pressure sample yielded eight times during snapshot preparation and reported zero comparison-side source parses.

This is an adapter-local derived cache. Reopening the viewer still rebuilds the native render databases. Top-level model-space comparison, font fidelity, nested block/layout contents, and A-owned canonical publication remain outside this qualification.

Run the isolated adapter tests with Concord's pinned frontend toolchain:

```text
pnpm --dir frontend exec vitest run --config viewer-integrations/cad/vitest.config.ts
pnpm --dir frontend exec playwright test --config playwright.engineering.config.ts tests/cad/cad.spec.ts
```

`vendor/compare/Concord-snapshot-adaptation.patch` and
`vendor/AcApDiffViewer.patch` record the complete source adaptations against
the pinned donor revision. The donor source and license remain under the
isolated vendor boundary; no production dependency is changed by this seam.
