# Issue #17 engineering capability status

This branch contains Developer C's independent backend prework for Issue #17. The complete Issue is **not implemented**. None of the new adapters is wired into the product API, runtime, or source publication path.

## Implemented and locally qualified

| Area | Delivered boundary | Evidence |
| --- | --- | --- |
| Documents | Existing Docling adapter extended to Office/XLSX, structured CSV, and opt-in image OCR. Table cells retain sheet/group ancestry, row/column addresses, spans, header flags, original source hash, and donor location. | Real Golden XLSX: 22 cells from two sheets. Real DOCX: instruction paragraphs and table cells. Boundary and archive tests. |
| Targeted clash | Published IfcClash 0.8.5 runs intersection/collision/clearance and donor selectors. Results retain both source identities/revisions, GlobalIds, location, engine version and timing. Byte/result limits reject overflow. | Real intersection story: R1 = 0 clashes, R2 = 1, R3 = 0. Real collision and clearance tests. |
| IDS | Published IfcTester 0.8.5 produces structured violations and specification counts. Schema-skipped specifications are separated from passes. Missing required applicability is reported as a violation. | Real naming failure, missing required element, schema skip, and Golden discipline checks. |
| BCF | Published bcf-client 0.8.5 transports BCF 2.1 viewpoints with selected GlobalIds, perspective/orthogonal cameras, snapshot bytes, topic/viewpoint IDs and comments. | Exact camera, snapshot and comment round trips; invalid camera/archive tests. |
| Golden sources | Seventeen original synthetic files, committed with SHA-256 manifest. Deterministic IFC identities, Office metadata, PDF metadata, DXF ordering and archive timestamps. | IFC schema validation, real imports/IfcDiff, targeted clash, Docling extraction; all 17 sources reproduced byte-for-byte. |
| Startup | Adapter module imports do not initialize or import engineering SDKs. New capability rows report dependency presence while disabled. | A subprocess verifies that IFC/BCF/Docling/OCR engines remain absent after adapter imports. |

IfcDiff remains at 0.8.5. The existing GUID-aware normalization/workaround and That Open Engine viewer are preserved. Golden IFC comparison verifies the changed beam/duct geometry; it does not claim that upstream relationship comparison has no additional noise.

BCF transport here is a per-viewpoint exchange. It does not claim complete round-trip preservation of every BCF extension, attachment, visibility state, clipping plane, or multi-viewpoint topic bundle. Concord coordination state is not inferred from imported topic status.

## Qualified OCR and incomplete connector work

Chinese OCR is opt-in, local and lazy through Docling's RapidOCR/ONNX backend. Prefetch and parser use the same Docling artifact root and `RapidOcr/` layout. OCR chunks retain parser origin and the measured donor page confidence where available. Real Golden PNG and a PDF generated from the scanned image both pass Chinese recognition with network connections blocked after model setup. The Golden two-page specification and the existing HTML/PDF qualification also pass offline. Configuration tests are kept separate from these real-engine tests.

`AECConnectorBoundary` only validates and hashes staged exported bytes. It does not implement a Revit, AutoCAD or Navisworks host connector, authenticate a host, enforce persistence, or prove that a native application exports the accepted artifact. The `requires_project_source_revision` marker is an integration requirement, not enforcement. Native RVT/DWG/NWD/NWC inputs are rejected. Mature host integration and the upload/publication enforcement path remain to be delivered.

## Integration dependencies and next work

A's PR #19 remains the hard dependency for persistent integration. Engineering results in this branch are adapter-local staging records; they are not a second canonical domain or persistence contract. Once the foundation is merged, update this branch from `main` and:

1. Map actual engine outputs into A's `Change`, `Evidence`, `ViewerTarget`, derived artifact and re-check contracts; preserve both clash source revisions and source hashes.
2. Connect restricted jobs through A's preparation/publication path with cancellation, revision fencing, byte limits and cache keys containing source hash plus engine/version.
3. Integrate the pinned OpenTakeoff Drawing subsystem and pdf-diff-viewer; qualify matching, alignment, word/pixel diff, masks/crops and diff execution outside the interaction thread.
4. Integrate mlightcad DXF viewing/diff with local workers/assets and disposal. Surface donor comparison limitations. Keep GPL DWG support isolated until agreed.
5. Integrate the pinned IFC Viewer Online SDK behind a self-hosted viewer boundary. Complete model/GlobalId mapping, selection/reopen, section/measurement, cached derived data and worker/WebGL cleanup qualification.
6. Deliver real documented native-host connector boundaries and deterministic contract tests. Upload results through `ProjectSourceRevision` instead of treating staging validation as persistence.
7. Add the real offline engineering document suite to the A-owned SDK CI lane after the active workflow change merges; finish the Golden viewer/reopen/cache/cleanup scenario.

B owns product composition. Supply narrow viewer surfaces and consume the agreed ViewerTarget seam; coordinate any minimal changes to `App.tsx` or `WorkspaceViews.tsx`. They are not modified here.

Shared review points with A: optional dependencies/lock changes, BCF package licensing, capability job configuration, cache/publication mapping, packaging and SDK CI selection. PR #19 also owns the active workflow and notices changes, so those changes must be reconciled after merge. No workflow or domain/port/API/schema/bootstrap changes are made in this prework.

## Local evidence and reproduction

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

Full frontend/native qualification, production packaging, cache hit behavior and the complete coordination lifecycle remain unqualified. No new engine result confirms a Finding, promotes a baseline, approves coordination, or resolves a re-check as business state.
