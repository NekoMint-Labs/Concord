# A1 shared lifecycle contract

First integration slice of [Issue #9](https://github.com/NekoMint-Labs/Concord/issues/9),
based on merged PR #8. This supplies the shared project/source/revision/baseline
identities for #10 and #11. It does not close #9.

## Scope

Create a real project, Area and Work Package; register a logical source; store and
retrieve immutable original-file revisions; explicitly accept an immutable baseline.
All records and original bytes survive backend restart. Existing demo behavior remains
compatible. A clean pilot can run with `CCA_SEED_DEMO=false`; changing product startup,
the project picker and demo labeling is a follow-up coordinated with #10.

An upload returns `import_status: "STORED"`. This means the original file is durably
stored and hash checked, **not** that IFC parsing, document parsing or comparison has
completed. Attaching the existing durable capability job to a source revision, retaining
parsed BIM snapshots, comparison/binding tools, Agent controls and Windows packaged IFC
qualification follow this shared-contract PR. No new Agent endpoint or execution path
is introduced here.

## Endpoints

All paths below begin with `/api`. Authentication uses the existing bearer-token roles.

| Method | Path | Result |
| --- | --- | --- |
| POST | `/projects` | Create `Project`; 201 |
| GET | `/projects` | Existing project list |
| GET | `/projects/{project_id}` | Persisted `ProjectState`, including Areas and Work Packages |
| POST | `/projects/{project_id}/areas` | Create `Area`; 201 |
| POST | `/projects/{project_id}/work-packages` | Create `WorkPackage`; 201 |
| POST | `/projects/{project_id}/sources` | Create `ProjectSource`; 201 |
| GET | `/projects/{project_id}/sources` | Source statuses with latest and accepted revision IDs |
| GET | `/projects/{project_id}/sources/{source_id}` | One source status |
| POST | `/projects/{project_id}/sources/{source_id}/revisions` | Multipart `file`, optional `external_label` |
| GET | `/projects/{project_id}/sources/{source_id}/revisions` | Revision history, ascending sequence |
| GET | `/projects/{project_id}/sources/{source_id}/revisions/{revision_id}` | Revision metadata |
| GET | `/projects/{project_id}/sources/{source_id}/revisions/{revision_id}/content` | Original bytes as an attachment |
| POST | `/projects/{project_id}/baselines` | Explicit baseline acceptance; 201 |
| GET | `/projects/{project_id}/baselines` | Baselines, ascending sequence |
| GET | `/projects/{project_id}/baselines/{baseline_id}` | Immutable accepted revision set |

Create requests use these fields:

```json
{"name":"Campus laboratory","description":"Pilot","timezone":"Asia/Shanghai"}
{"name":"East wing","floor":"L02"}
{"name":"Ventilation","area_id":"<returned-area-id>","discipline":"MEP","owner":"Team A"}
{"name":"MEP model","kind":"BIM"}
{"name":"B1","entries":[{"source_id":"<returned-source-id>","revision_id":"<returned-revision-id>"}]}
```

## Semantics for consumers

- IDs are opaque UUIDs. Reuse returned IDs; filenames and external revision labels are
  display metadata, never identity. Source kinds are `BIM`, `DOCUMENT`, `DRAWING`,
  `SCHEDULE`. No generic parsed-data schema is imposed on these source types.
- Areas and Work Packages remain in the existing project aggregate. Validate a Work
  Package through `repo.state(project_id).package(work_package_id)`; do not infer its
  project from its name. New packages contain no Harbor East elements, dependencies,
  V16 labels or assumed two-person crews. The existing WorkPackage defaults remain
  compatible for legacy callers and fixtures.
- `ProjectState.sources` / `SourceRevision` remain internal freshness tokens.
  `ProjectSourceRevision` is the independent engineering artifact record. The initial
  real project has neutral internal revision tokens so existing coordination rules can
  later process events; these tokens are not imported engineering sources.
- A revision stores project/source/revision IDs, sequence, external label, original
  filename, SHA-256, MIME metadata, byte size, FileStore key, status and UTC timestamp.
  Downloads resolve the scoped revision and verify size/hash before returning bytes.
- A new upload returns 201 with `{"revision": ..., "duplicate": false}`. Identical
  content **within the same logical source** returns 200 with the original revision
  and `duplicate: true`, including when it is older than the current latest revision.
  It does not relabel the original, advance the sequence or move the latest pointer.
- The latest baseline is the highest project-local baseline sequence. Each baseline is
  a complete explicit set, not a patch to its predecessor: omitted sources have no
  accepted revision in that baseline. Entry order is canonical by source ID. Entries
  must reference revisions from that exact source and project, with one entry per source.
- `has_pending_revision` means a source has a latest revision different from the latest
  baseline's accepted revision; it is also true when no revision has been accepted.
  Upload never accepts a baseline or starts an investigation.
- Structure/source/upload writes require the existing `ingest` permission. Baseline
  acceptance requires `approve`; a coordinator/viewer cannot accept it. Agent proposals
  still use the existing ActionProposal / Approval / ActionExecution safety boundary.
- Authoritative lifecycle changes increment `ProjectState.version` and append an audit
  record in the same transaction. Existing stale-snapshot checks therefore reject old
  analyses/proposals after a new revision or accepted baseline. Duplicate upload does
  not change the project version.

## Persistence and verification

Migration `0004` adds `project_sources`, `project_source_revisions`, `baselines` and
`baseline_entries`. It leaves existing project/snapshot payloads untouched. Composite
foreign keys enforce project/source/revision membership; unique constraints enforce
per-source sequence and hash identity. The repository exposes insert/read methods for
history, with no update/delete operation. SQLite and PostgreSQL use the existing
project transaction lock for sequence allocation and concurrent upload deduplication.
File I/O happens before the write transaction; failed or losing attempts clean up their
own staged object. A process crash before metadata commit can leave an unreferenced
object, but cannot publish a revision with partially written bytes.

Regenerate contracts through the existing CI generators, never by editing generated files:

```sh
uv run --frozen --no-sync python scripts/export_openapi.py
uv run --frozen --no-sync python scripts/bootstrap_types.py
uv run --frozen --no-sync pytest -q backend/tests/test_project_lifecycle_api.py backend/tests/test_project_lifecycle_integrity.py
pnpm --dir frontend typecheck
```

Focused tests cover restart/readback, renamed R2 with unchanged R1/B1, hash deduplication,
concurrent uploads, failed publication rollback, cross-project/source references,
permissions, corrupted content, freshness fencing, and upgrade/downgrade of an existing
`0003` database. They validate original-file lifecycle, not parsed IFC or native UI.
