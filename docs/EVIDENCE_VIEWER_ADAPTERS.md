# Evidence viewer seam — B host / PR22 C dependency

Read with [PRODUCT_WORKFLOW](PRODUCT_WORKFLOW.md). This documents the actual B
composition and C's supplied entry points, not a second architecture or acceptance.
C source inspected: [PR22](https://github.com/NekoMint-Labs/Concord/pull/22), commit
[`9feb7120707e127a6f5280eaed453e2c7d2d099f`](https://github.com/NekoMint-Labs/Concord/tree/9feb7120707e127a6f5280eaed453e2c7d2d099f).
These C paths remain a **merge/rebase dependency**, absent from standalone B’s
viewer tree but exercised in the detached local A+B+C unit/type/build rehearsal.
This does not establish real browser navigation or product acceptance.

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

PR22's [adapter handoff](https://github.com/NekoMint-Labs/Concord/blob/9feb7120707e127a6f5280eaed453e2c7d2d099f/docs/EVIDENCE_VIEWER_ADAPTERS.md)
and [capability record](https://github.com/NekoMint-Labs/Concord/blob/9feb7120707e127a6f5280eaed453e2c7d2d099f/docs/ENGINEERING_CAPABILITIES_ISSUE17.md)
retain detailed C evidence. Earlier donor README statements about source-only BIM
being unsupported are superseded by that later canonical handoff. Current blocker
and qualification limits belong to [VERIFICATION](../VERIFICATION.md).
