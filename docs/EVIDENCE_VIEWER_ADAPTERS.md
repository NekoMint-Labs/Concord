# Evidence viewer adapter integration (#16 / #17)

B owns `frontend/src/app/EvidenceWorkspaceHost.tsx`: persisted Evidence lookup,
project/source/revision context, authenticated loading, viewer selection and
product failure presentation. C owns the surfaces and engineering navigation in
`frontend/src/viewers/`. The host implementation is not present on the current
`main` or C branch; these are the supplied adapter entry points, not a claim of
completed product composition.

## Mounting contract

Import only the active surface through a lazy boundary. Do not mount inactive
viewers hidden in the DOM or import SDKs into the product host.

| Target kind | Lazy surface                       | Source input                                         | Target prop                |
| ----------- | ---------------------------------- | ---------------------------------------------------- | -------------------------- |
| `drawing`   | `viewers/drawing/DrawingSurface`   | `source: DrawingSource`                              | Generated `DrawingTarget`  |
| `cad`       | `viewers/cad/CadSurface`           | `before: CadSource`, optional `after` for comparison | Generated `CadTarget`      |
| `bim`       | `viewers/ifc/IfcSurface`           | Stable `sources: readonly IfcSource[]`               | Generated `BimTarget`      |
| `document`  | `viewers/document/DocumentSurface` | `source: ExtractedDocument`                          | Generated `DocumentTarget` |

The host retains `Evidence.id`, `source_id`, `source_revision_id`, integrity hash
(`source_revision`) and `viewer_target`. Resolve the requested persisted revision
inside that project/source; never replace it with the latest revision. Verify
Evidence/target revision agreement before mounting. Raw binary viewers verify
bounded original bytes against the supplied full SHA-256. The document adapter
checks extraction provenance against its supplied source hash.

Source input types are adapter-local, not new domain contracts:

- Drawing: `{ revisionId, sourceHash, data: ArrayBuffer }`.
- CAD: the drawing input plus `name` (DXF only).
- BIM: `{ revisionId, sourceHash, name, data: ArrayBuffer }` per loaded revision.
- Document: `{ sourceRevisionId, sourceHash, filename, chunks }`, using generated
  `DocumentChunk` values from actual extraction. Do not reconstruct fake chunks
  from Evidence text or show an unrelated document when extraction is missing.

Memoize source objects/arrays per verified loaded revision. A target change need
not reload source bytes. Preserve existing disposal on replacement/unmount.
The host must generation-fence loading and associate callbacks with the current
Evidence context; old sessions must not overwrite a newly selected Evidence.

## Failure delivery

Every surface accepts `onError?: (message: string | null) => void`. A string
reports the same current failure that the surface displays; `null` clears the
active error. It does **not** prove loading finished, navigation succeeded or an
Evidence/Finding business decision was verified. The host owns those distinct
states. Supply a stable callback and retain the Evidence/source/revision/target
identity with the error rather than displaying it on another Evidence.

Load errors (including missing local viewer assets), invalid/stale targets and
navigation failures remain visible. Existing controllers/navigation promises
reject on failure. Render/import failures at the lazy component boundary still
need the host's error boundary; they cannot be delivered by a component which
never mounted. No callback is emitted during unmount to clear a later session's
failure. Changing Evidence contexts should reset the host boundary and discard
obsolete callbacks.

Document/CAD selections and BIM element selections return generated targets.
SDK instances and native entity objects remain inside C's adapter. Drawing keeps
its existing markup/annotation callbacks; annotations are not persisted Evidence
or approvals.

## Confirmed BIM behavior

A's October 4 reply on PR #22 supersedes the earlier proposed six-tuple camera
interpretation:

- `viewpoint=null` or omitted: validate the revision and GlobalIds, select every
  requested element and fit its verified native bounds.
- `global_ids=[]` or omitted, with no viewpoint: open the verified source without
  an element-navigation request. C clears any previous target selection through
  the existing SDK command and retains the loaded model lifetime.
- Non-null `viewpoint`: reserved/unsupported; fail visibly, including source-only
  requests. Do not guess camera position/direction/look-at, coordinate axes or units.
- Unknown revision, invalid/duplicated GUIDs, absent elements and non-geometric
  targets: fail explicitly. Never fit a different model as a successful fallback.

Saved camera exchange continues through the qualified BCF adapter, retaining the
camera/projection/up vector and exact loaded source revision/hash scope. No new
Concord camera format is introduced.

## Remaining owner deliverables

B supplies the host branch/PR and completes product mounting, Evidence failure
presentation and integrated Golden acceptance. C supplies the tested surfaces,
canonical navigation and failure callbacks. A supplies the formal dual-source
clash/ReCheck and selected IDS requirements fields and their durable fencing.
These coordination confirmations do not constitute final review approval.

## CAD comparison normalization

`viewers/cad/cadChangeMapping.mapCadChanges(comparison, context)` returns the
existing generated `Change[]` as drafts. `CadSurface.onComparison` retains its
C-owned result type and now supplies ordered `revisionIds` and `sourceHashes`,
including for empty output. No SDK types or new canonical contracts are exposed.

The trusted caller supplies project/source IDs, an immutable operation ID,
`before`/`after` revision/hash identities and a stable UTC `observedAt`. An
optional `rawArtifactKey` must identify the caller's retained artifact; the mapper
does not persist one. Input identities must match the result exactly. Do not
supply a new timestamp or operation identity for a retry. Native source buffers
are not required by mapping.

A reciprocal modified pair becomes one `changed` record targeting the later
revision; added records target the later revision and deleted records the earlier
one. Targets retain layer and finite native extents where available, including
zero-width LINE/POINT bounds. Contradictory provenance/pairs, duplicate handles
and oversized publications throw explicitly. The caller must surface that
failure rather than presenting partial output.

The mapper verifies adapter consistency, not persisted ownership or runtime
freshness. A's trusted publisher and execution path retain those checks. Keep
raw donor output and warnings with the artifact; canonical `Change` has no
limitations field. Empty output does not authorize a Finding or ReCheck decision.
The isolated Golden browser harness qualifies this mapping; product invocation
and persistent publication have not been delivered.

## PDF Change normalization

`viewers/drawing/pdfChangeMapping.mapPdfChanges` converts a validated PDF
comparison into page-level canonical `Change` drafts for the later viewer host.
The adapter carries the complete ordered revision/hash pair and immutable
operation context supplied by the trusted caller. A modified page points to the
later revision; inserted and removed pages point to their own revision. Visual,
page-order, page-size and page-presence aspects are explicit, and changed boxes
are mapped from the cropped/aligned raster into normalized full-page coordinates.

`pdfChangeValidation` rejects stale or mismatched engine identities, incomplete
page assignments, invalid source dimensions, crop contradictions, non-finite or
out-of-bounds regions, contradictory statistics and oversized results. The mapper
keeps raw artifacts outside the canonical `Change` and never writes Evidence,
Findings or ReCheck state. It therefore remains a C-owned adapter qualification,
not A's trusted dual-source runtime or B's `EvidenceWorkspaceHost` integration.

The PDF surface exposes the generated `DrawingTarget` for reopening a mapped
page. A missing revision or navigation failure must remain visible through the
surface error callback; the harness clears the prior diff status before opening
the mapped target so an old comparison result cannot appear to be a new one.

# Evidence viewer seam — B host / PR22 C dependency

Read with [PRODUCT_WORKFLOW](PRODUCT_WORKFLOW.md). This documents the actual B
composition and C's supplied entry points, not a second architecture or acceptance.
C source inspected: [PR22](https://github.com/NekoMint-Labs/Concord/pull/22), commit
[`0ffe50641b8bf253f9656acb5c3cca4add7484ed`](https://github.com/NekoMint-Labs/Concord/tree/0ffe50641b8bf253f9656acb5c3cca4add7484ed).
These C paths are supplied by the current #22 implementation and remain the
C-owned dependency of the combined tree. The B host is exercised only after this
local replay; this does not establish final browser navigation or product acceptance.

B owns [EvidenceWorkspaceHost](../frontend/src/app/EvidenceWorkspaceHost.tsx):
persisted Evidence identity, authenticated exact-revision loading, hash checks,
active surface selection and product failure presentation. C owns SDKs, geometry,
navigation and disposal. A owns generated targets and authoritative publication.

| Canonical kind | C module under `frontend/src/` | B input |
| --- | --- | --- |
| `drawing` | `viewers/drawing/DrawingSurface` | `source: {revisionId, sourceHash, data}`, canonical target |
| `cad` | `viewers/cad/CadSurface` | `before: {revisionId, sourceHash, name, data}`, canonical target |
| `bim` | `viewers/ifc/IfcSurface` | Stable `sources` array of verified revision/hash/name/bytes, canonical target |
| `document` | `viewers/document/DocumentSurface` | `{sourceRevisionId, sourceHash, filename, chunks}` from persisted extraction, canonical target |

Adapter-local source types are not new DTOs. Targets retain `source_revision_id`;
`Evidence.source_revision` is the integrity hash, not a revision ID. Never rewrite
a target, fall back to latest, infer geometry from prose, or expose SDK objects in
domain/API contracts. Mount only the active lazy surface, inside `ViewerBoundary`.
Changing context resets the boundary; obsolete loads cannot publish into a later
selection. Source objects remain stable for the loaded context.

Each C surface takes `onError?: (message: string | null) => void`. A string is the
current visible failure; null clears that error, **not** a ready/navigation-success
acknowledgment. B's `viewer_active` reports handoff only. Import/render errors may
occur before a callback exists, so the React error boundary remains necessary.
Loading/navigation failure must preserve selected Evidence and human state.

## Target semantics supplied by C

- Drawing pages are one-based; normalized boxes are `[x0,y0,x1,y1]` in `[0,1]`,
  converted against the requested page's real dimensions.
- CAD is DXF-only; entity ID and optional layer/native bounds remain revision-bound.
  B's Evidence host opens one revision; it does not invoke C's comparison mapper.
- BIM without viewpoint selects/fits every supplied GlobalId; an empty/omitted GUID
  set opens the verified source without element navigation. Non-null `viewpoint` is
  reserved/unsupported: fail visibly, never guess six-number camera semantics.
  BCF is the camera exchange boundary, not Concord Coordination state.
- Document targets resolve real extracted chunk/page/location/structural paths;
  faithful original Office layout is not reconstructed.

Missing assets, stale identities, absent geometry/entities/pages and unsupported
inputs are explicit failures. Viewer annotations, selections, caches and adapter
comparison outputs are not persisted Evidence, Findings, approvals or ReChecks.
Trusted publication and runtime fencing remain A/C integration work. No complete
PR22 runtime, native packaging or product acceptance is claimed.

PR22's [adapter handoff](https://github.com/NekoMint-Labs/Concord/blob/0ffe50641b8bf253f9656acb5c3cca4add7484ed/docs/EVIDENCE_VIEWER_ADAPTERS.md)
and [capability record](https://github.com/NekoMint-Labs/Concord/blob/0ffe50641b8bf253f9656acb5c3cca4add7484ed/docs/ENGINEERING_CAPABILITIES_ISSUE17.md)
retain detailed C evidence. Earlier donor README statements about source-only BIM
being unsupported are superseded by that later canonical handoff. Current blocker
and qualification limits belong to [VERIFICATION](../VERIFICATION.md).
