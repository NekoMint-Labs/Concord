# Pinned trusted PDF/CAD executors — Issue #17

This C-owned optional pack consumes A's `ComparisonExecutor` from Draft #26
at `ed4f3a3`. It has been qualified in an isolated combination of C/#22
`c1b7f51` and that platform interface. It does not enable a detector in ordinary
startup and does not establish final Issue #17, native or product acceptance.
Do not merge the dependent C work into main before the platform contract lands.

## Execution and ownership

`backend/app/adapters/trusted_comparisons.py::PinnedComparisonExecutor` receives
only the platform's bound ordered revision pair and verified original bytes.
The adapter checks size, SHA-256, project/source, filenames, revision order,
snapshot project and pinned executor identity again. Requests cannot select a
program, file path, URL, browser binary, script or browser-produced Change list.

An operator-owned fixed Node runner launches a fresh headless Chromium context
only for execution. It serves the built pack on an ephemeral loopback port;
a random HttpOnly cookie protects local assets. Browser requests outside that
origin are blocked and fail qualification. No Vite development server is needed
at execution time. Service workers/downloads are disabled. No shell receives
source content, filenames or request options. Input is a bounded stdin protocol.
Timeouts terminate the owned Node/browser process tree; normal completion closes
the context/browser and loopback server. Constructors never load a viewer/SDK.

PDF uses the existing pinned OffscreenCanvas worker and PDF.js assets. CAD uses
the existing isolated mlightcad parser, native databases and donor comparison
worker. A narrow separate CAD entry opens both verified originals and compares
with requested settings after the native default comparison completes. It reuses
the parsed native databases, not a second DXF parser. The interactive CAD surface
and B's host signatures are unchanged; no donor matching algorithm is replaced.

A retains the raw output before normalization. A second fixed Node invocation
reuses C's existing canonical TypeScript mappers. It verifies the retained recipe,
engine/version, settings, complete page partition or reciprocal CAD pairs and
revision/hash scope. C returns canonical Changes and one extracted Evidence per
Change; Evidence includes both revision/hash identities, engine, retained artifact
key and donor limitations. A assigns final identities/timestamps and publishes
atomically with job completion/cache authorization. No Finding, discipline,
Baseline or Coordination state is confirmed by this adapter.

Raw output is finite canonical-key JSON bounded to 8 MiB. PDF overlays are not
serialized into the fact artifact; they can be regenerated in the viewer and are
not claimed as a separately retained overlay pack. Runtime elapsed time is
measured separately and represented as zero in the PDF fact artifact, so a cache
miss cannot create a different content hash just because execution took longer.
Cache authorization, current-pair fencing, cancellation, generation/recovery and
artifact retention remain A-owned.

## Pinned environment and provisioning

The existing frontend lock pins Playwright `1.63.0`; Chromium is
`153.0.8010.12` (Playwright revision `1243`). Both are checked at runtime and are
part of executor version identity. A mismatch fails explicitly; do not silently
change an engine version or substitute an installed browser. The donor/PDF.js
versions remain exactly those documented in `THIRD_PARTY_NOTICES.md`.
No manifest or dependency lock was changed. The runtime pack is an explicit
operator provision, not a mandatory local/Desktop startup dependency.

From the repository root, install using the existing frozen locks, then build:

```text
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend exec playwright install chromium
pnpm --dir frontend viewer-assets
pnpm --dir frontend/viewer-integrations/cad install --frozen-lockfile
pnpm --dir frontend/viewer-integrations/cad build
node frontend/viewer-integrations/trusted/build.mjs
```

These outputs remain ignored. Use an operator-controlled checkout/assets and Node
runtime (Node 24.15.0 was used locally). Do not point the pack at writable project
uploads. Explicit injection before recovery is the supported interface:

```python
pdf = PinnedComparisonExecutor("pdf_comparison", frontend_root)
cad = PinnedComparisonExecutor("cad_comparison", frontend_root)
services = build_services(settings, comparison_executors=(pdf, cad))
```

A owns any production profile/settings registration, recovery packaging and native
bundling. A missing pack/Node/Chromium reports unavailable; donor failure or invalid
content fails explicitly and publishes nothing. Registry status describes
registration, not an independently probed healthy browser. No packaged Desktop
browser runtime or Autodesk host qualification is claimed here.

## Supported settings and limits

PDF accepts only `scale`, `maxShift`, `colorTolerance`, `minHighlightArea`,
`cropRegions`, `maskRegions`, with the existing worker's bounds and defaults.
Region coordinates are rendered pixels; crops/masks retain existing semantics.
CAD accepts only `tolerance`, `includeUnchanged`, `compareProps`, `compareHatch`,
`compareText`, `compareTolerance`, `compareRcMargin`, with pinned donor bounds.
Unknown keys/types or out-of-range values fail before browser initialization.

Each original is at most 32 MiB. Existing engine limits still apply: 100 PDF pages,
bounded raster/region output, 100,000 CAD model-space snapshot entities and bounded
canonical publication. This pack accepts complete text DXF envelopes only; the native donor still owns
all DXF parsing/entity interpretation. CAD remains top-level model-space comparison, with nested
blocks/layouts/effective layer attributes and font fidelity limitations explicit.
Textless PDF identity, alignment/noise and color-filter limitations remain explicit.
This is a headless browser pack and needs more resources than core startup; no
50,000-entity CAD or pressure PDF qualification is inferred from IFC measurements.

## Reproduction and evidence

```text
python -m pytest -q backend/tests/test_pinned_comparison_executor.py backend/tests/test_comparison_process.py
pnpm --dir frontend exec vitest run --config viewer-integrations/trusted/vitest.config.ts
pnpm --dir frontend exec tsc --noEmit -p viewer-integrations/trusted/tsconfig.json
```

Set `CCA_TEST_PINNED_COMPARISONS=1`, then run:

```text
python -m pytest -q backend/tests/integration/test_pinned_comparisons.py backend/tests/integration/test_pinned_comparison_dbos.py
```

Opted-in missing engines fail rather than skip. The real suite uses Golden R1/R2
PDF and DXF bytes through the actual workers and SQLite lifecycle, not a canned
executor. It verifies canonical publication/retained provenance, warm authorized
reuse, same-operation replay, no fabricated Changes for equivalent content,
new-revision rejection, malformed artifact identity and missing-cache recomputation.
Non-default settings and malformed original failure are also qualified.

Local first qualification measured PDF cold execution about 4.63 seconds and CAD
about 3.52 seconds, with 5,212/1,571 raw bytes respectively. Warm publication took
about 1.50/1.35 seconds and did not invoke the browser executor again. These are
small-fixture Node/browser execution and mapping measurements, not product import,
server concurrency, native WebView or final Golden walkthrough timings. Timings
are written to local temporary reports rather than committed generated output.

Final local qualification on October 5, 2026: 143 focused adapter/platform cases
passed, including 14 real Golden executor cases; a separate real DBOS test passed
three fresh processes (committed outbox, real execution/recovery, persisted warm
cache replay). The two new Python adapter modules measured 100% statements and
99% combined branch/statement coverage, not repository coverage. The canonical
recipe/option suite passed 21 cases; the isolated CAD adapter suite passed 45.
All 565 existing frontend tests, product/pack/isolated CAD typechecks, product and
pack builds, Ruff/Pyright/format/whitespace checks passed. The 16 existing real
Drawing/CAD browser scenarios passed; the Golden Drawing output case needed a
rerun after creating its expected ignored local report directory. No production
assertion was removed. The first invalid-input checks exposed the text-DXF envelope
and optional-field serialization issues; both were repaired before final acceptance.
The diagnostic suite's malformed-original cases verify persisted FAILED state and
zero publication after the explicit exception, not a manufactured empty success.

These results qualify the C executor and A's pinned lifecycle combination; they
do not qualify B's latest product tree, a packaged Node/Chromium distribution,
server concurrency or Autodesk connector hosts. The exact final C commit is posted
on #22/#26 after the source checkpoint. #22 stays Draft pending those dependencies
and remaining Issue #17 acceptance.
