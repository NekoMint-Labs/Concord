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

| Target kind | Lazy surface | Source input | Target prop |
| --- | --- | --- | --- |
| `drawing` | `viewers/drawing/DrawingSurface` | `source: DrawingSource` | Generated `DrawingTarget` |
| `cad` | `viewers/cad/CadSurface` | `before: CadSource`, optional `after` for comparison | Generated `CadTarget` |
| `bim` | `viewers/ifc/IfcSurface` | Stable `sources: readonly IfcSource[]` | Generated `BimTarget` |
| `document` | `viewers/document/DocumentSurface` | `source: ExtractedDocument` | Generated `DocumentTarget` |

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
