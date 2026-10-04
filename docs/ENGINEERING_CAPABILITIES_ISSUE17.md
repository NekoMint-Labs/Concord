# Issue #17 engineering capability status

Current work uses the fork branch `feat/17-engineering-capabilities-rebased`, based on the latest `main` with merged PRs #19 and #20. Draft PR #22 tracks this continuation. The original Draft PR #21 still tracks the pre-rebase branch; it does not contain this continuation. Integration review uses the new Draft so the original branch history is preserved without a force push. CAD and Drawing surfaces consume the generated canonical targets. Real IDS violations map into source-revision- and SHA-256-bound canonical `Evidence` through the trusted publisher in integration tests, with requirements-bound cache identity. IDS validation is still not invoked by the product runtime. Issue #17 remains **incomplete**: coordinated runtime jobs, publication of other engineering outputs, product viewer composition and end-to-end acceptance are outstanding.

## Implemented and locally qualified

| Area | Delivered boundary | Evidence |
| --- | --- | --- |
| Documents | Existing Docling adapter extended to Office/XLSX, structured CSV, and opt-in image OCR. Table cells retain sheet/group ancestry, row/column addresses, spans, header flags, original source hash, and donor location. | Real Golden XLSX: 22 cells from two sheets. Real DOCX: instruction paragraphs and table cells. Boundary and archive tests. |
| Targeted clash | Published IfcClash 0.8.5 runs intersection/collision/clearance and donor selectors. Results retain both source identities/revisions, GlobalIds, location, engine version and timing. Byte/result limits reject overflow. | Real intersection story: R1 = 0 clashes, R2 = 1, R3 = 0. Real collision and clearance tests. |
| IDS | Published IfcTester 0.8.5 produces structured violations and specification counts. Schema-skipped specifications are separated from passes. Missing required applicability is reported as a violation. | Real naming failure, missing required element, schema skip, and Golden discipline checks. |
| BCF | Published bcf-client 0.8.5 transports BCF 2.1 viewpoints with selected GlobalIds, perspective/orthogonal cameras, snapshot bytes, clipping planes, topic/viewpoint IDs and comments. | Exact camera, snapshot and comment round trips; invalid camera/archive tests. |
| Golden sources | Nineteen original synthetic files (including standard perspective/orthogonal BCF sources), committed with SHA-256 manifest. Deterministic IFC identities, Office metadata, PDF metadata, DXF ordering and archive timestamps. | IFC schema validation, real imports/IfcDiff, targeted clash, Docling extraction; all 19 sources reproduced byte-for-byte (the two BCF archives are separately qualified). |
| Startup | Adapter module imports do not initialize or import engineering SDKs. New capability rows report dependency presence while disabled. | A subprocess verifies that IFC/BCF/Docling/OCR engines remain absent after adapter imports. |

IfcDiff remains at 0.8.5. The existing GUID-aware normalization/workaround and That Open Engine viewer are preserved. Golden IFC comparison verifies the changed beam/duct geometry; it does not claim that upstream relationship comparison has no additional noise.

BCF transport here is a per-viewpoint exchange. It does not claim complete round-trip preservation of every BCF extension, attachment, visibility/coloring state, or multi-viewpoint topic bundle. Concord coordination state is not inferred from imported topic status.

## Isolated drawing, CAD, IFC and document integrations

The C-owned lazy surfaces now include:

- `DrawingSurface`: OpenTakeoff preview/liveness mechanics, unchanged geometry
  helpers and the adapted native annotation workbench. Arrow/callout/cloud notes,
  highlighter, native PDF text selection/sweep, favorites, selection, drag/handle
  editing and note editing retain the donor implementation. The small host
  adapter binds annotation callbacks to source revision/hash/page and uses the
  donor's bounded, ID-specific undo/redo patches. Sheet navigation, zoom/scroll,
  per-sheet calibration and length/area remain available. Advanced measurement
  editing, grouped/stitch sheets and vector snapping are not yet adapted;
  complete OpenTakeoff workflow parity is not claimed.
- `PdfRevisionSurface`: the pinned pdf-diff-viewer algorithm runs in an
  OffscreenCanvas worker, including text page matching, alignment, pixel/word
  differences, crop/mask regions and PNG overlays. Results retain hashes,
  effective options, page numbers, alignment, crop coordinates and source-space
  regions. Unmatched pages are explicit. The worker owns loading-task/canvas
  cleanup; cancellation, timeouts and corrupt sources remain failures.
- A 32 MiB/four-entry in-memory PDF comparison cache keys both source hashes,
  engine/version and effective options. Hashes are verified even before a cache
  hit. Reused artifacts bind to the caller's current revision IDs. This is a
  viewer-local cache, not A's persisted derived-artifact service.
- `DocumentSurface`: renders actual Docling paragraph/table chunks with exact
  revision/hash/chunk/page/location targeting. XLSX sheets/cell addresses and
  DOCX paragraphs/table cells are addressable; faithful original Office layout
  is not reconstructed. Existing generated API chunk types are consumed.
- `CadSurface`: an independently built mlightcad 1.7.3 widget with its own
  locked Three 0.172.0 runtime. The original diff widget is vendored; its donor
  matching/classification logic is preserved through a recorded snapshot seam
  and invoked in a worker over the native render database's derived data. Only DXF is accepted; no DWG converter is installed/registered.
  Model-space results are normalized to adapter-local, revision/hash-bound
  candidates. These are not persisted canonical Changes.

CAD messages require the active iframe, matching origin and a generation token.
The local build marker prevents a missing viewer from opening the main product
fallback page. Missing assets, engine failures and timeouts are explicit.
Leaving the surface destroys the iframe lifetime and terminates its workers.

`DrawingSurface` now accepts the generated canonical `DrawingTarget`.
Source revision IDs bind navigation; verified hashes remain inside the viewer.
Normalized regions are converted using the requested sheet's dimensions.
Stale identity, invalid or unavailable pages and invalid regions fail explicitly.
Native text highlighting retains donor page-space quads across zoom. Source
bytes are copied before asynchronous hash verification, and PDF comparison
options are snapshotted before cache/worker dispatch. Caller mutation cannot
make verification, comparison and published revision identities disagree.
Internal page-space navigation values do not redefine the canonical ViewerTarget contract.

Drawing preparation now opens one PDF loading task per cache miss, materializes
all bounded pages into native donor rasters/text quads, and destroys the parser
before the surface becomes ready. A 32 MiB/four-entry viewer-local LRU cache keys
the full source hash, exact donor/PDF.js version and fixed render options. All
pages, zoom and reopened source revisions reuse these artifacts without retaining
PDF documents, workers or decoded bitmaps. Each warm read verifies immutable
input bytes, and revision IDs remain outside the derived cache. Concurrent readers
share preparation; only the final cancelled reader aborts the engine. Failed or
partial work is never inserted. Cache eviction/reload still requires preparation;
this is not A's persisted derived-artifact service and it does not share parsing
with the separate PDF diff engine.

CAD comparison now snapshots the native render databases and sends bounded,
plain donor data to the worker. The worker receives no DXF bytes or native
entities and performs no source read. Snapshot cache keys include source hash,
effective geometry/property settings and the `concord-snapshots-v2` engine
marker. Preparation yields between batches; cancellation and limits reject
partial work. A 32 MiB/four-entry cache retains no database or GPU objects and
is cleared at exit. Matching and classification remain the donor's algorithm.
This removes the comparison-side second parse during an active viewer lifetime.
Reopening still rebuilds native render databases; persistent derived cache and
large-model qualification remain acceptance work.

The donor CAD comparison is limited to top-level model space; nested block/layout
contents and effective layer attributes are not fully compared. Its default
COMPAREPROPS ignores property-only changes until enabled. Local font provisioning
and exact glyph fidelity remain unqualified. PDF text matching is heuristic and
scan-only page identity can be ambiguous. The worker follows OpenTakeoff's
DOM-less SVG-filter limitation and reports it.

B's product shell is unchanged. The isolated qualification harness supplies real
bytes; it does not prove product upload/publication or product-level ViewerTarget
reopening. Isolated CAD entity targeting and BCF viewpoint reopening are qualified; product-level
ViewerTarget publication/reopening still requires A/B integration.

### IFC Viewer Online

The pinned donor application now builds independently and is served under
`/viewer/ifc/`. C's lazy `IfcSurface` verifies a local capability marker,
source revisions, byte bounds and full hashes before mounting one SDK iframe.
The native donor supplies rendering, tree/properties, scene tools, sections,
measurement and camera/snapshot capture. Concord's source selection controls the
iframe; the donor toolbar is suppressed and its properties rail stays available.
No product-shell files are changed.

The SDK and app restrict cross-frame messaging to the active same-origin peer.
A small query delegates GlobalId resolution to the donor's native fragment
index; navigation verifies the returned element identity. User selections return
C-owned revision/hash/GlobalId references. Missing or stale targets fail. The
fragment SDK's `_guid` attribute is used when GlobalId is not duplicated among
ordinary attributes; this fixes a real Golden navigation failure.

Workers and WASM are self-hosted. Geometry keys include the complete source
fingerprint, exact donor revision, original npm dependency-lock hash and
`fragment-index-v2` adaptation semantics. A bounded OPFS cache preserves the
donor spatial tree/decomposition data. Real
browser verification proves a warm geometry hit, a tree cache hit, zero warm
spatial-tree parses and worker exit after closing the surface. Cache misses or
unavailable storage still use the donor and report diagnostic counters.

Cold ModelTree indexing now reads the donor's already-converted native fragment
hierarchy, metadata and decomposition. It does not reopen IFC source bytes in
the validation worker. Native IFC schema definitions retain the donor's class
names and identify uncontained physical elements, including elements without
geometry. Those elements appear in an explicit non-IFC containment group.
This removes Concord's extra spatial-tree source parse; it is not a claim that
the fragment importer's internal geometry/property passes constitute one total
syntax parse. Full import pipeline and large-model memory qualification remain. BCF 3.0 byte export and BCF 2.1/3.0 viewpoint reopening now use the donor's native
parser/writer, axes mapping, sections and multi-model selection. Perspective and
orthogonal views retain optics, camera roll and clipping across iframe exit and
reopening. C's host adapter requires an explicit revision/hash source scope;
stale hashes and missing/ambiguous selections fail. The independent Python BCF
SDK reads browser exports to verify world axes, optical parameters, clipping,
selected GlobalIds and actual PNG snapshots. No proprietary viewpoint format or
coordination status ownership is introduced. Complete BCF extensions, visibility,
coloring and attachment preservation are not claimed. Large-model/GPU pressure
qualification and native packaging remain incomplete.

### Viewer qualification

Using the pinned pnpm runtime, install/build the independent CAD integration,
then run the frontend checks and isolated real-browser suite:

```text
pnpm --dir frontend/viewer-integrations/cad install --frozen-lockfile
pnpm --dir frontend/viewer-integrations/cad build
pnpm --dir frontend viewer-assets
pnpm --dir frontend typecheck
pnpm --dir frontend test
pnpm --dir frontend exec playwright test --config playwright.engineering.config.ts
pnpm --dir frontend exec vite build --config vite.drawing.config.ts
pnpm --dir frontend build
pnpm --dir frontend lint
```

The drawing-only production harness additionally proves lazy surface and worker
bundling; it does not modify product composition. Generated viewer assets and
screenshots/test reports are ignored and must not be committed.

## Qualified OCR and incomplete connector work

Chinese OCR is opt-in, local and lazy through Docling's RapidOCR/ONNX backend. Prefetch and parser use the same Docling artifact root and `RapidOcr/` layout. OCR chunks retain parser origin and the measured donor page confidence where available. Real Golden PNG and a PDF generated from the scanned image both pass Chinese recognition with network connections blocked after model setup. The Golden two-page specification and the existing HTML/PDF qualification also pass offline. Configuration tests are kept separate from these real-engine tests.

`AECConnectorBoundary` only validates and hashes staged Revit/AutoCAD exported bytes. It does not implement a Revit, AutoCAD or Navisworks host connector, authenticate a host, enforce persistence, or prove that a native application exports the accepted artifact. The `requires_project_source_revision` marker is an integration requirement, not enforcement. Native RVT/DWG/NWD/NWC inputs are rejected. Navisworks has no accepted staging format: its IFC conversion path was not qualified, so it now reports an explicit unavailable state. Staging bounds byte size, external identifiers and filenames before hashing. The boundary now exposes a stable host capability description: Revit is IFC staging-only, AutoCAD is DXF/PDF staging-only, and Navisworks is explicitly unavailable. Mature host integration and the upload/publication enforcement path remain to be delivered.

## Integration dependencies and next work

PRs #19 and #20 are merged. Engineering results remain adapter outputs unless a caller passes canonical publications through A's trusted `EngineeringPublisher`; the IDS result mapper is implemented and qualified with real-engine persistence/retry tests, but no runtime job currently invokes it. The remaining integration work is:

1. Coordinate with A on how dual-source clash provenance is represented. Current canonical `Evidence` binds to one source revision, while clash results must retain two source IDs, revision IDs and byte hashes. Do not publish those results until both sides can be represented without loss.
2. Connect restricted jobs through A's preparation/publication path with cancellation, revision fencing, byte limits and cache keys containing ordered source hashes plus engine/version. IDS job configuration must also bind the requirements hash so rule changes cannot reuse an old validation result.
3. Map the remaining engine outputs into canonical `Change`, `Evidence` and `ViewerTarget` records with verified provenance.
4. Complete the adapted Drawing interaction/editor coverage and connect PDF worker results through A's shared contracts and B's viewer seam; retain the qualified matching/alignment/word/pixel/mask/crop path.
5. Complete the remaining local font provisioning and cache/parse reuse for the CAD surface, whose entity-targeting adapter already consumes canonical `CadTarget`. Connect the isolated mlightcad surface to B; retain explicit donor comparison limitations and the DXF-only boundary.
6. Qualify remaining IFC importer-internal source passes, canonical BCF publication/reopening, large-model/WebGL and native packaging. Consume A's canonical ViewerTarget seam for the already isolated SDK surface and verified stable GlobalId mapping.
7. Deliver real documented native-host connector boundaries and deterministic contract tests. Upload results through `ProjectSourceRevision` instead of treating staging validation as persistence.
8. Coordinate the real offline engineering document suite with the A-owned SDK CI lane; finish the Golden viewer/reopen/cache/cleanup scenario.

B owns product composition. Supply narrow viewer surfaces and consume the agreed ViewerTarget seam; coordinate any minimal changes to `App.tsx` or `WorkspaceViews.tsx`. They are not modified here.

Shared review points with A: optional dependencies/lock changes, BCF package licensing, capability job configuration, cache/publication mapping, packaging and SDK CI selection. PR #19 already merged the platform foundation and active workflow changes; any later workflow, dependency, notice, bootstrap or contract change must be coordinated with its current owner before editing. No workflow or domain/port/API/schema/bootstrap changes are made in this prework.

## Qualification history and reproduction

The following entries record earlier runs. Use the opening status and latest
continuation for the current integration boundary; earlier pre-merge dependency
statements are historical.

Use the committed lock and install the optional engines before qualification:

```text
uv sync --frozen --group dev --extra bim --extra documents
uv run --frozen --no-sync pytest -q backend/tests/test_engineering_adapters.py backend/tests/test_golden_engineering.py backend/tests/test_document_structure.py backend/tests/test_aec_connectors.py backend/tests/test_engineering_limits.py --junitxml=.verification-work/engineering.xml
uv run --frozen --no-sync python scripts/assert_junit.py .verification-work/engineering.xml
uv run --frozen --no-sync ruff check backend scripts
uv run --frozen --no-sync pyright
```

On Windows, select a short temporary test directory if the checkout path causes filesystem paths to exceed the platform limit. Missing optional packages must not be mistaken for real-engine qualification; `assert_junit.py` rejects skips for the selected required suite.

For offline document/OCR qualification, provision the public models explicitly, then set `DOCLING_ARTIFACTS_PATH` and `CCA_TEST_RAPIDOCR_ARTIFACTS` to that same directory and run:

```text
uv run --frozen --no-sync python scripts/prefetch_docling_models.py --output <model-directory> --with-rapidocr
uv run --frozen --no-sync pytest -q backend/tests/integration/test_engineering_documents.py --junitxml=.verification-work/engineering-documents.xml
uv run --frozen --no-sync python scripts/assert_junit.py .verification-work/engineering-documents.xml
```

Local evidence collected on October 2, 2026:

- Non-integration backend regression: 389 passed, 9 skipped, 33 integration/live tests deselected. Missing optional dependencies are not claimed as qualification.
- 102 focused provider/document/regression tests passed before the additional resource-boundary suite; that suite adds overflow, missing-engine, malformed-content and archive checks.
- Three real Golden offline document tests passed: PDF, Chinese PNG and Chinese scanned PDF. Both existing real Docling HTML/PDF tests also passed.
- Six new core adapter modules measured 95.25% combined statement/branch coverage (95.30% statements, 95.08% branches). This is scoped coverage, not a repository-wide 95% claim. The modified Docling parser and capability listing are outside that measurement.
- Ruff, changed-adapter Pyright, frozen Python lock validation and whitespace checks passed.
- Full Pyright reports 31 missing imports from locally uninstalled optional model/telemetry/storage/optimization/Temporal packages; a full typecheck pass is not claimed.

Representative Golden timings on this local machine: one-element IFC import 0.057–0.074 s, structural/MEP revision diff 0.047–0.116 s, targeted intersection 0.066–0.074 s. The first standalone Chinese PNG conversion, including cold model initialization, took 25.75 s and reported page OCR confidence 0.9382. These are measured sample timings, not throughput guarantees or warm-cache results. OCR retained imperfect punctuation in the source identifier line; extracted output is not structured engineering truth.

The isolated frontend suite verifies real PDF, DXF and IFC engines. IFC fragment/tree cache hits and worker cleanup are measured; cross-reopen CAD parse reuse, persistent shared cache integration and full frontend/native/production qualification remain incomplete. No new engine result confirms a Finding, promotes a baseline, approves coordination, or resolves a re-check as business state.

Additional IFC evidence: five source/target boundary tests, real IFC stable
selection/targeting, section/measurement activation, PNG capture, unavailable
GlobalId rejection and corrupt/native-input failure. A measured 13-element
Golden model opened in 705.4 ms cold and 239.7 ms warm in one local browser run.
Warm diagnostics recorded a tree hit and no spatial parse. These are sample
timings, not large-model performance guarantees. Multi-model revision isolation
and the final combined viewer regression are run separately before publication.

The repository-wide frontend formatting command reports pre-existing style
failures in B-owned files. C-owned changed viewer sources receive a separate
format check; those passes are not a claim that the whole formatting gate passes.

### October 3 viewer and BCF continuation

- Fifteen real browser scenarios passed together: six PDF/Drawing, two CAD,
  five IFC/BCF and two real Docling Office scenarios. These qualify exact cell
  targets across close/reopen. These use actual Golden source bytes and real local SDKs.
- Real CAD navigation verifies native SDK handles/extents, revision/hash binding,
  correct source activation, absent/stale failures, selection and worker exit.
  Metadata/byte limits are checked before immutable copies or iframe startup.
- Twenty-one backend BCF tests passed, including finite/nonzero clipping planes,
  camera basis, archive expansion and independent BCF 2.1 roundtrip mechanics.
- Thirty-four focused donor BCF tests passed. Original legacy parsing tests remain
  valid; stricter version requirements apply to the Concord host operation.
- Both new BCF Golden archives reproduce byte-for-byte. Ten source patches replay
  against the verified original archive and reproduce the adapted source files.
- A 13-element Golden IFC sample opened in 1013.2 ms cold and 248.2 ms warm; warm
  diagnostics recorded geometry/tree hits and zero spatial-tree builds. These
  measurements do not qualify large-model throughput or one-total-cold-parse.

All engineering results remain isolated prework. Issue #17 is not complete;
Draft PR #21 records the work for review.

Additional document surface evidence: real Docling XLSX exposes 22 addressable
cells across Coordination and Requirements sheets; real DOCX exposes the beam
change instruction and the C3 coordination action. Navigation retains the exact
chunk/source location, preserves unknown page numbers as unknown, rejects stale
hashes, and invalidates the controller on viewer exit. This surface displays
extracted Evidence; it does not claim faithful original DOCX/PDF page layout.
Frontend unit regression: 122 passed. Typecheck, product build and the independent
lazy-surface production harness passed. Focused BCF adapter/script Pyright and
Ruff passed; the previously recorded full Pyright/formatting limitations remain.

### October 3 Drawing editor continuation

The pinned OpenTakeoff annotation workbench is now adapted directly, replacing
the previous helper-only annotation boundary. The original annotation geometry
and stylesheet remain unchanged; five source hashes, the workbench patch and
unchanged history extraction are checked by `scripts/verify_drawing_donor.py`.
Estimating/condition/RFI state, donor persistence and symbol search are excluded.
The local adapter scopes keyboard handling to the focused editor and bounds
annotation/history data. Native text sweep remains the donor implementation.

New local checks cover annotation provenance, moving/deleting/undo/redo, cloud
note editing/cancellation, sheet isolation, native text alignment across zoom,
revision-bound target reopening and stale targets. A concurrent-input mutation
regression verifies real SHA-256 against the same snapshots sent to the worker.
Frontend unit regression: 134 passed. Source verification and the new verification
script's Ruff check passed. Typecheck, product build and the independent lazy
viewer build passed. The final combined browser suite passed all 20 scenarios: 11 Drawing/PDF,
two CAD, two real Docling Office and five IFC/BCF scenarios. Corrupt PDF input
disables annotation editing and releases its parser worker without requiring
viewer exit. The focused annotation regression also passed after fixing tool
panel layout stability and using viewport-aware drag gestures in the browser
qualification. Screenshot inspection confirms the native cloud and note ink.

The final 13-element IFC sample opened in 697.6 ms cold and 238.4 ms warm.
These are sample timings only; the cold double-parse and large-model acceptance
gaps remain as documented above.

Full Issue #17 remains unfinished: A's contract/runtime seam is not integrated
on this branch, canonical publication/cache/job/recheck is unavailable, and the
previously listed connector, cold-parse and packaging/license work remains.
The prework is tracked in Draft PR #21.

### October 3 Drawing artifact cache continuation

All-page drawing preparation now retains only bounded PNGs, donor native text
quads and metadata. The donor preview budget remains six million pixels, with
up to 100 pages, a 32 MiB derived budget and explicit failure on overflow.
Drawing workers are destroyed after preparation; warm painting closes each
ImageBitmap and resets the active canvas on exit. Cache metadata is defensively
cloned and source revision identity is rebound outside the source-hash key.

The real two-page Golden specification was prepared once, then changed sheets,
zoomed, closed, reopened under a different revision with identical bytes and
selected native text on page 2. Exactly one parser worker was created; zero
remained active after preparation and after exit. The second source revision
received the correct selection provenance. One measured sample opened in
1429.9 ms cold and 104.8 ms warm; these include browser interaction/painting and
are not general throughput guarantees or standalone syntax-parser timings.

Focused deterministic tests cover metadata isolation, LRU count/byte eviction,
source mutation before hashing, warm hash revalidation, shared preparation,
last-reader cancellation, missing engine errors, late bitmap decode cancellation
and bitmap release on failed painting. Partial derived results are not cached.

The native staging correction removes the unqualified Navisworks IFC path and
adds bounded bytes/metadata checks. Thirty-six connector/resource backend tests
passed. This is a truthful staging boundary, not a completed native connector.
The pinned Speckle Sharp Connectors tree inspected here contains Revit/AutoCAD
send bindings, common send executors and artifact builders, but no Navisworks
implementation; a verified Navisworks donor/interface still needs qualification.
No proprietary native reader or invented host export API is introduced.

Canonical A-owned publication/cache/jobs/recheck and B-owned product composition
remain pending. CAD/IFC cold source reuse and real native host connector work
remain acceptance items. The published prework does not close Issue #17.

Final Drawing cache continuation checks: 144 frontend unit tests and all 21
combined real browser scenarios passed. Frontend typecheck, product build,
independent lazy viewer build, changed-source formatting, donor verification
and whitespace checks passed. Focused native staging Pyright reported zero
errors. The cached page-2 native text screenshot was inspected. These results
do not supersede the full-repository check limitations above.


### October 3 native fragment ModelTree continuation

Cold ModelTree preparation now consumes native fragment hierarchy, metadata,
physical-element categories and decomposition relationships. No extra IFC
source-parser worker is created for tree preparation. The original donor
ModelTree is enabled through its existing embed option. Native schema class
names preserve tree badges and storey breadcrumb compatibility. Uncontained
physical elements, including elements without geometry, appear in an explicitly
non-IFC containment group; property-set and relationship records are excluded.

Native metadata queries are batched at 256 items; traversal is bounded at
500,000 records and depth 128. Invalid metadata, cycles and missing referenced
children fail; model removal/replacement fences cache and store publication.
Geometry/index cache identities now include `fragment-index-v2`, invalidating
older preparation semantics. Both source and SDK adaptations replay exactly
from the verified donor archive: eleven patches, ten overlays, twenty-one files.
The vendored host SDK matches the independently built donor SDK source.

Sixty-six focused independent donor tests passed, including thirty-two new
native-index/publication cases plus thirty-four existing BCF cases. Combined
coverage of the four new native-index modules is 97.87% statements, 96.40%
branches and 100% lines/functions. This is scoped coverage and does not claim
repository-wide coverage or qualification of optional runtime dependencies.

Six real IFC browser scenarios passed together. Native tree search finds the
Golden beam; a generated assembly/child and uncontained duct without geometry
remain addressable through the donor tree/SDK. Cold indexing starts no validator
worker; warm reopening records a geometry/index hit, and exit releases workers.
BCF perspective/orthogonal interoperability and multi-model identity isolation
remain green. A 13-element sample opened in 974.2 ms cold and 263.6 ms warm;
these are local sample timings, not large-model throughput guarantees. The
screenshot showing the native tree was visually inspected.

The fragment importer still owns internal geometry/property passes. Removing
Concord's extra spatial-tree parse does not prove one total syntax parse across
those importer passes. CAD display/compare source reuse, large-model/native
qualification, real host connectors and A's canonical integration remain open.
The reviewed PR #19 head was `3c16dd98af8aed63da93c2fc3994f6ab00354228`;
its current review/merge state is not established by this qualification.
These adapter qualifications are included in Draft PR #21.

Final combined verification: 144 root frontend unit tests and all 22 real
browser scenarios passed (12 Drawing/PDF, two CAD, two Docling Office, six
IFC/BCF). Product typecheck/build, isolated lazy-surface build, independent IFC
SDK/application build, changed native-index formatting and whitespace checks
passed. No dependencies were changed for this continuation. Final combined-run
samples were IFC 1011.8 ms cold / 364.2 ms warm and Drawing 1415.1 ms cold /
126.4 ms warm; parser/index diagnostic assertions passed. Previously recorded
full-repository Pyright/formatting and native/license limitations remain.


### October 3 CAD render-data reuse

- Thirty-seven focused snapshot/worker lifecycle tests passed, including six
  configurations compared against the installed unmodified donor algorithm.
  Cooperative scheduling, concurrent preparation, byte/count overflow, LRU
  eviction, immutable options, cancellation, worker failures and timeout are
  covered. The two new adapter modules (`cadSnapshots`, `cadCompareClient`)
  measured 100% statements/branches/functions/lines; this excludes the donor,
  worker, host and repository-wide gates.
- Four real CAD browser scenarios passed: Golden DXF comparison/navigation,
  DWG rejection, 514 native entities per source and injected live-comparison
  failure. Closing or capability failure releases the iframe and workers.
- Golden cold snapshot preparation measured 0.8 ms plus 0.6 ms worker diff;
  changing only the donor revision-cloud margin reused snapshots (0 ms
  preparation / 0.1 ms diff). The 1,028-snapshot sample yielded eight times,
  measured 98.8 ms preparation / 1.6 ms diff, and verified the changed native
  entity handle. Comparison-side source parsing is zero by implementation:
  the worker has no database reader or source-byte input. These samples do not
  qualify large production drawings or cap the cost of a single complex entity.
- Independent CAD typecheck/build, host frontend typecheck and changed-source
  formatting passed. Recorded patches and pinned-source verification preserve
  donor provenance. No manifest, dependency lock, shared contract, workflow,
  B-owned composition file or native connector was changed in this continuation.

CAD full-document reload, font fidelity, nested block/layout comparison, native
host connectors, canonical publication and shared persisted caches remain.
The local CAD navigation target now carries an optional bounded native `layer` hint.
Selections report the loaded entity layer, and navigation rejects a target whose layer
no longer matches the loaded revision. This is an adapter-local bridge for the future
canonical `ViewerTarget.layer` field; it does not introduce a second persisted contract.
The local target also accepts an optional model-space `viewBounds` hint and validates
its ordering and finite numeric values. Native entity extents remain authoritative for
selection and zoom; the hint is preserved for the later canonical `view_bounds` mapping.
On October 3, 2026, the team confirmed that `layer` is optional for CAD targets and
that `Evidence.source_revision` must carry the source SHA-256 while
`source_revision_id` remains the formal engineering revision identity. Persistent
mapping waits for A's contract/runtime seam. Issue #17 is not ready to be marked complete.


Connector boundary continuation on October 3, 2026: the staging adapter now exposes deterministic host capability descriptors and rejects unknown hosts before extension policy evaluation. Twenty connector tests and nineteen resource-limit tests passed with a repository-local temporary directory; Ruff and changed-file Pyright passed after formatting.


### October 3 CAD cache invalidation continuation

Clearing the viewer-local CAD snapshot cache now invalidates any preparation
started before the clear. Old work rejects after yielding and before cache
publication, so completed old work cannot repopulate a cleared cache or replace
newer cached results. Abort signals remain authoritative and the donor comparison
algorithm, cache keys, limits and source/output contracts are unchanged.

Two regression tests first reproduced stale cache repopulation and replacement
of a fresh cached result. Both pass with the generation guard. All 39 CAD
snapshot/worker tests and 12 host boundary tests passed using the locked frontend
Vitest 3.2.7 runtime. The existing isolated Vitest 4.1.4/V8 qualification harness
measured 100% statements, branches, functions and lines for cadSnapshots and
cadCompareClient; this is scoped coverage, not repository-wide coverage.
All 145 root frontend unit tests also passed.

All four real CAD browser scenarios passed, including native layer navigation
and rejection of a mismatched layer, Golden comparison, cooperative preparation,
and failure cleanup. Golden cold preparation/diff measured 1.1/1.0 ms;
warm reuse measured 0/0.2 ms. The 1,028-snapshot sample yielded eight times,
with 106.4 ms preparation and 2.1 ms diff. Independent CAD and product frontend
typechecks/builds passed. The root frontend lint command still reports formatting
issues in 88 unchanged files; no formatting sweep is included in this change.

No dependency manifest, lockfile, shared API/domain, workflow or B-owned
composition file is changed. Frontend dependencies were restored offline with
pnpm 10.17.1 and the existing frozen lockfile. GitHub API review metadata could
not be refreshed because its TLS certificate did not match api.github.com.
The review/merge state must be rechecked before shared integration proceeds.


### October 3 CAD navigation and cleanup continuation

CAD navigation accepts finite, non-inverted native bounds, including zero-width
or zero-height LINE extents and point extents. Nullable layer and viewport hints
are treated as absent; non-string layers, inverted bounds and non-finite values
still fail explicitly. The loaded revision/hash, native entity and layer remain
authoritative. A supplied viewport hint cannot replace the entity's native zoom
bounds. No canonical or persisted contract is introduced by this staging change.

The revision drop guard is now removed during viewer disposal. Deterministic
lifecycle tests reuse the same container across two lifetimes and cover cleanup
after opening failure. Real Chromium qualification reopens native horizontal and
vertical lines, verifies nullable hints and rejects stale/mismatched targets.
The existing close/failure checks continue to verify worker release.

The web job on `a365b59` failed because Node Response Blob and jsdom Blob have
different constructors. The source-download test now reads through the available
byte reader and checks exact original content, size and media type. Both native
Response and DOM Blob cases exercise authenticated retry/download behavior.
Only the test changed; B's product implementation is unchanged.

Final local verification: 371 root frontend tests, 41 isolated CAD tests and all
four real CAD browser scenarios passed. Host typecheck, product build, independent
CAD typecheck/build, changed-source Prettier and whitespace checks passed. Point
extents are boundary-tested; this run does not qualify every native entity type,
large production drawings, packaged native hosts or the complete Issue.

### October 3 formal CAD ViewerTarget integration after #19 and #20

PRs #19 and #20 have merged into `main`; this branch now includes both. The CAD
surface consumes the generated `CadTarget` schema and converts the formal
`source_revision_id`, `entity_id`, optional `layer` and optional `view_bounds`
to the viewer-local navigation message. The local source hash is used only for
integrity validation and is never emitted in the canonical target. Missing
revisions/entities and hash mismatches fail explicitly. Nullable optional hints
are treated as absent, matching the confirmed contract. This adapter integration
does not connect B's product composition or complete Issue #17.

Validation on this continuation: all 375 root frontend tests passed, including
30 CAD viewer/boundary tests; changed-source Prettier and scoped CAD runtime
typecheck passed. The full frontend typecheck was attempted but is blocked by the
reused local dependency tree missing `pdfjs-dist`; TypeScript reported only those
two unresolved imports. No package manifest or lockfile was changed. PR #21
remains Draft and Issue #17 remains incomplete pending the remaining integration
and acceptance work.


### October 3 IDS publication mapping continuation

The IfcTester result now records the SHA-256 of the exact IFC byte input it
validated. A C-owned mapper converts each structured IDS violation into the
canonical `Evidence` shape, binding the evidence to its source revision ID,
source hash and snapshot, retaining the IDS requirements hash, and using a BIM
`ViewerTarget` when the violation identifies a GlobalId. The mapper rejects inconsistent violation provenance.
This provides an adapter-to-publication boundary for IDS results; job
registration, product invocation and the full R1/R2/R3 workflow remain open
and require A/B integration. Real IfcTester output was published through the
existing `EngineeringPublisher` into SQLite in a diagnostic service test;
this does not qualify durable DBOS or the product UI. Repeating the mapping
and publication of one immutable result preserves evidence IDs/timestamps and
creates no duplicate records. Incorrect IFC hashes are rejected transactionally.
Missing-applicability violations retain no invented element target, and empty
violation lists do not generate success evidence or confirm Findings.

The status and qualification entries above are chronological history. Earlier
statements that #19 was unmerged or that all results were isolated prework do
not describe the current local continuation.

Latest discussion check: the browser confirmed #19/#20 as merged, and PR #21
as Draft with 11 successful checks on the original `cee8cd1` head. PR #21's
visible conversation showed no review comments; its old description still says
#19 is open. Those remote checks do not cover this local continuation. #20's
review explicitly retains DXF as unsupported by the native import dialog; the
C-owned web CAD surface does not alter that desktop policy.

Final verification for this continuation: 77 tests passed with zero skips,
including real IfcTester publication/retry and incorrect-hash rollback, real
IFC/IfcDiff/clash/Docling Golden checks, and the existing platform coordination
regressions. The new IDS mapper has 100% statement/branch coverage (scoped to
`engineering_result_mapping.py`, not repository-wide coverage). Repository-wide
Ruff, changed-file formatting and adapter Pyright passed. Regenerated OpenAPI
was compared in an ignored output directory and is unchanged. Reports remain
under `.verification-work/`; no cache, report or generated output is published.

Reproduce the focused continuation with the locked BIM/document extras:

```text
uv run --frozen --no-sync pytest -q backend/tests/test_engineering_result_mapping.py backend/tests/integration/test_ids_publication.py backend/tests/test_engineering_adapters.py backend/tests/test_engineering_limits.py backend/tests/test_golden_engineering.py backend/tests/test_engineering_coordination.py
uv run --frozen --no-sync ruff check backend scripts
uv run --frozen --no-sync pyright backend/app/adapters/engineering_results.py backend/app/adapters/ifc_tester.py backend/app/adapters/engineering_result_mapping.py
```

On Windows, use a new `--basetemp` beneath an existing short path when the default
temporary directory is inaccessible or long storage paths exceed OS limits.
The successful local run used that arrangement; the validation content was
unchanged. Optional SDK warnings from corrupt IFC cleanup remain upstream
warnings rather than test failures. Full repository Pyright, durable SDK CI,
frontend/native and complete Issue acceptance are not claimed for this
backend-only continuation.

Remaining C-owned work can continue with the existing contracts: normalize other
engine outputs, consume canonical drawing/document/BIM targets, and qualify the
remaining viewer/connector/resource acceptance items. A/B coordination is needed
for dual-source clash association, versioned IDS job configuration, runtime
registration/cancellation/publication, and product composition. A proposed clash
representation must preserve both authoritative source revisions and byte hashes
without weakening ReCheck freshness validation; no shared-field change is made
here.

### October 4 IDS cache identity continuation

The engineering adapter now derives a stable cache identity for each bounded
calculation. Canonical serialization sorts parameter-map keys, preserves the
order of source hashes because paired inputs have distinct roles, and rejects
non-finite JSON values. IDS identities include the exact requirements-document
SHA-256 in addition to the IFC source hash, engine name and engine version; a
requirements-file change therefore cannot reuse an earlier validation result.
The `cache_key` is optional on hand-built result fixtures for compatibility, but
real `IfcTesterAdapter` results populate it from the validated bytes and engine
metadata. This key remains an adapter-boundary identity. It is not a replacement
for A's persisted derived-artifact key or publication contract.

Validation for this continuation: 45 focused backend tests passed, including the
new canonicalization, ordered-source, requirements-hash, non-finite-parameter and
real IfcTester cache-identity checks. Existing adapter, IDS mapping and SQLite
publication tests passed in the same run; only the repository's existing FastAPI
and Starlette deprecation warnings were reported.

The remaining integration points are unchanged. A still owns versioned job
configuration, cancellation/run fencing, durable cache/publication and re-check
integration. The dual-source clash evidence shape requires agreement with A, and
B still owns the BIM ViewerTarget product composition. No domain, port, API,
schema, bootstrap, workflow or dependency files were changed here.


### October 4 canonical DrawingTarget continuation

`DrawingSurface.target` now consumes the generated `DrawingTarget`, matching the
merged platform contract. A normalized `x0,y0,x1,y1` box is converted into page-space
coordinates using the requested sheet's actual dimensions. The active verified source
supplies the byte hash internally; B needs only the canonical revision identity.
Wrong revisions, malformed/out-of-range boxes and unavailable pages report explicit
navigation failures, without showing a success region or navigating to an absent page.
Zoom and close/reopen retain the normalized target; donor annotation and measurement
behavior is unchanged. The isolated harness now uses the formal target as well.

Validation on October 4, 2026:

- 395 root frontend tests passed with two workers. The earlier default-concurrency run
  recorded 394 passes and one timeout in the unchanged BIM mapping pressure test; the
  bounded-concurrency full rerun passed without changing assertions or timeouts.
- Twenty new contract/surface tests cover revision identity, geometry conversion,
  nullable/page-only targets, malformed regions, absent pages and explicit errors.
- Three real browser cases passed: canonical DrawingTarget reopening, corrupt-parser
  failure/worker exit, and multi-page cached reopening without a second parser worker.
  The canonical case also verifies zoom-stable coordinates and records a rendered image.
- Seventy-four engineering/cache/IDS/publication/coordination backend tests passed;
  complete backend/scripts Ruff and changed-adapter Pyright passed. Existing
  FastAPI/Starlette and corrupt-IFC cleanup warnings remain SDK warnings.
- Complete frontend typecheck, production build and Prettier checks passed. The
  missing local PDF.js dependency was restored with a frozen install. Local Windows
  CRLF-only formatting warnings were resolved by restoring canonical LF checkout bytes;
  no formatting changes to other members' source files appear in the commit.

This continuation changes only C's Drawing adapter, viewer tests and status document.
It does not change product composition, generated schemas, dependencies, shared
contracts or runtime ownership. Canonical BIM/Document targets, remaining engine output
publication and the integration/acceptance items listed above remain outstanding.


### October 4 required SDK lane correction

The first #22 backend CI run exposed a test placement error: the real IfcTester
cache-identity test lived in the lightweight unit module, whose lane deliberately
does not install the optional BIM pack. The test is now in the existing real SDK
integration module, selected by the required `ifcopenshell` lane's `-k ifc` command.
Its original cache-identity assertion and Golden bytes are preserved. Optional
package absence is explicit in the lightweight profile; the required SDK lane's
`assert_junit.py` continues to reject skipped qualification tests. No workflow,
dependency, production adapter or shared-contract changes were made for this fix.

Local correction verification: the unchanged required IFC lane command ran all seven
selected real SDK tests successfully, including IfcTester cache identity; the
no-skip JUnit gate passed. The four dependency-light cache unit tests also passed.

An isolated frozen environment matching the lightweight backend lane (models/telemetry,
without BIM) ran the four cache unit tests successfully and explicitly skipped the
optional real IfcTester test. That skip is not engine qualification; the separate
BIM-enabled seven-test required suite and no-skip gate provide that evidence.


### October 4 canonical DocumentTarget continuation

The extracted-document surface now consumes the generated `DocumentTarget` and
returns that contract for user selections and controller navigation. Public
navigation binds to `source_revision_id`, page, structural path and exact source
location; extraction chunk IDs and the verified source hash remain internal.
Reopening the same source location works after chunk IDs are regenerated.
Page and section targets open the first matching excerpt; exact cell/item targets
reject ambiguous split excerpts or duplicated cell addresses unless an exact
location distinguishes them. Every supplied selector must agree. Unknown/stale
revisions, invalid selectors, corrupt extraction hashes and missing provenance
produce visible failures and clear previous highlights. Source replacement and
unmount invalidate the old controller, while target changes retain its lifetime.

Verification: 405 frontend tests passed with two workers, including thirteen
Document navigation/lifecycle cases. Production TypeScript/build, complete frontend
Prettier and changed-file whitespace checks passed. Two real Chromium scenarios
used Docling's Golden XLSX/DOCX output to reopen cells/paragraphs, reject a stale
revision and reopen regenerated extraction IDs with the same canonical target.
The XLSX screenshot was inspected and shows the exact C4 selection with source
provenance. Browser screenshots/reports remain ignored local artifacts.

B confirmed the current ownership/integration direction on #22, while explicitly
withholding final approval until remaining acceptance work is complete. A still
needs to confirm dual-source clash/ReCheck inputs and versioned IDS requirements
selection. A separate question records the six-number BIM viewpoint semantics;
C can proceed with GlobalId navigation without inventing a shared camera meaning.
This continuation changes no generated schema, shared contract, dependency,
workflow or B-owned product composition. Canonical BIM navigation and the other
remaining #17 acceptance items are still open; #22 remains Draft.
