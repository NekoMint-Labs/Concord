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
