# Agent and revision-import integration (Issue #9)

This follows PR #12's immutable source/baseline contracts. It does not close Issue
#9: Issue #10 owns the startup/workspace UI, and Issue #11 owns persisted revision
BIM snapshots, normalized IFC comparisons and source-level WP bindings.

## Interaction APIs

All routes use the existing bearer principals. Paths below start with
`/api/projects/{project_id}/agent`.

| Route | Permission | Behavior |
| --- | --- | --- |
| `GET /settings` | read | Defaults to `{"initiative":"suggest"}` without inserting a row. |
| `POST /settings` | execute | Set `manual`, `suggest`, or `auto-investigate`; policy change is audited. |
| `GET /notices` | read | Persisted revision notices, including source/revision IDs and an optional automatic run ID. |
| `POST /ask` | read | Read-only answer; no run, snapshot, evidence, proposal or audit is inserted. |
| `POST /investigate` | execute | Persist a scoped request and dispatch an `AgentRun` with category `investigation`. |
| `GET /investigations/{run_id}` | read | Latest committed report, or null while no result has committed. Report includes generation and analysis identity. |

Ask and Investigate accept the same request:

```json
{
  "instruction": "Investigate only L02 and WP-27",
  "scope": {
    "work_package_ids": ["WP-27"],
    "area_ids": [],
    "element_ids": [],
    "source_id": null,
    "from_revision_id": null,
    "to_revision_id": null
  }
}
```

Use actual IDs returned by the project APIs. Empty selectors mean project scope.
Selectors intersect; instructions can narrow recognized WP IDs and area IDs,
names or floors, but cannot enlarge them. Unknown WP codes and conflicting/empty
intersections are rejected. Unrecognized free-form restrictions require explicit
selectors; this is not a general natural-language scope parser. A source scope
binds concrete revision IDs at submission. An older explicit comparison remains
that comparison during a fresh project recheck.

Ask responses have `persisted: false`; their citations describe read results and
must not be presented as saved Evidence IDs. Investigation reports have
`persisted: true`; all their Evidence references commit atomically with analysis,
proposals and run status. Historical observations retain their original timestamp,
source revision and original Evidence/snapshot reference in the derived fact.
Read tools enforce scope, project/revision identities and snapshot freshness.
Readiness rows describe only the investigated scope; a missing row does not mean READY.

Act uses the existing `/api/proposals/{id}/approve` and `/execute` routes. Read the
current proposal IDs from the project workspace; never treat answer text as an
action command. R3/R4 approval, generation checks, receipts and fresh rechecks are
unchanged. The current executor remains explicitly **simulated**. A resumed or
rechecked investigation retains its persisted request scope. Run cancel/resume,
timeline and SSE are the existing `/api/runs/{run_id}` routes.

Manual and Suggest never dispatch an automatic investigation. Revision notices
are cheap persisted observations in both modes. Auto-investigate inserts its run
and request in the same transaction as a new source revision, then dispatches
outside the lock. Duplicate uploads do not create duplicate notices/runs. Startup
recovers committed QUEUED runs. Disabling Auto cancels its pending investigations;
it does not prevent a user from explicitly starting a new investigation.

## Tools and engineering boundary

Offline and configured PydanticAI agents use the same `AgentReadTools` port:
`project_state`, `compare_revisions`, `bim_changes`, `work_package_bindings`,
`persisted_evidence`, and `relevant_documents`. The offline policy branches on
returned source kinds, pending revisions, changed elements and blockers. The
model chooses its own subsequent read calls, with bounded requests/tool calls.
Neither path has a mutation tool. Deterministic project rules own constraints;
model text cannot change readiness, permissions, approval or execution.

`compare_revisions` reads actual immutable-file hashes/sequence metadata. It does
**not** infer geometric changes. `EngineeringReadPort` in `backend/app/ports/agent.py`
is the integration point for C's persisted normalized comparisons and bindings.
Until an implementation is injected into `InvestigationService`, those tools
return explicit unavailability. A source-only investigation cannot create
whole-project proposals in the absence of observed changes and related bindings.

C's adapter must return read-only, project-owned `ReadResult` values:

- `changes(snapshot, scope, RevisionQuery)` returns normalized `ElementChange`s
  and persisted supporting Evidence belonging to the requested source and hashes.
- `bindings(snapshot, scope, WorkPackageQuery)` returns `BindingFact`s for the
  queried WPs; an empty WP query means the bound source/selection's matching WPs.
- Evidence IDs/content must exist in the same project's repository. Each change
  needs Evidence naming its element; each binding needs Evidence naming its
  source, element and WP together. The tool rejects invented IDs, other
  revisions/sources, unrelated supporting records and unavailable results that
  nevertheless claim facts.
- Publication of changed BIM/binding facts must advance the project freshness
  fence. Do not silently run IfcDiff or create bindings in a read tool.

For source scopes, persisted source-level bindings determine element-to-WP
membership, even when legacy `WorkPackage.element_ids` is empty. Explicit WP/area
selectors still intersect and may never be enlarged by returned bindings. Element
selectors are read queries against the selected source/revisions, so removed
historical elements need not appear in the current BIM index. A source selection
without validated changed-element/binding matches publishes no WP readiness rows
or proposals. Without a source selector, existing current-index validation remains.

The application joins changes and bindings by **source ID and GlobalId**, records
affected WPs/elements, and persists Findings with both comparison and binding
Evidence under the new snapshot. A raw BIM difference alone does not establish
a blocking condition or authorize an action. Existing authoritative constraints
still generate proposals; affected WPs without an applicable engineering rule
have their readiness omitted with an explicit report limitation. Missing readiness
does not mean READY. C's real adapter and agreed review/readiness rules remain
necessary for the joint change-to-action acceptance.

Document chunks without authoritative WP/element associations
are unavailable in those narrow scopes; source scopes filter by revision hashes.
Tool/source content is untrusted data. Model egress omits storage keys, raw files
and personnel records, and sanitizes bounded excerpts.

## Importing an already stored revision

`POST /api/projects/{project_id}/sources/{source_id}/revisions/{revision_id}/import`
returns the existing or newly queued `AgentRun` (202). `GET` on the same path
returns the linked run, or null. Failed/cancelled imports use the normal run resume
API. The import request reuses the original object key/hash; identity validation,
job insertion and a unique revision-to-run link share a transaction.

BIM/document jobs carry `source_id` and `source_revision_id`, as do their results;
the current BIM index carries the same identities. Document publication advances
project freshness. Approval of an older proposal returns 409 and requests a fresh
analysis on its existing run; approve the new proposal after that recheck.
A stored revision's immutable `import_status: STORED` describes
the original upload, not parsing success: use the linked run/result for that.
Import does not accept a baseline or create WP bindings. Historic per-revision
BIM indexes and comparisons remain C's responsibility.

## Desktop and verification

The desktop profile starts without demo seeding and defaults to IfcOpenShell.
`uv sync --frozen --group dev --extra desktop` includes the IFC SDK, and the
sidecar build includes it without `--feature` or `CCA_BIM` switches. Existing
demo regression scripts now opt into their synthetic data explicitly. Local
development's existing demo default is retained; the product desktop default is
empty. B's startup/project selection UI is needed to complete that product flow.
The HTTP host explicitly serves module workers as JavaScript and WASM as
`application/wasm`, independent of Windows file-type associations.

```powershell
python scripts/agent_lifecycle_smoke.py --output artifacts/agent-dbos.json
python scripts/build_sidecar.py
python scripts/agent_lifecycle_smoke.py --sidecar artifacts/sidecar/cca-sidecar.exe --output artifacts/agent-packaged.json
```

The smoke runs an actual DBOS HTTP subprocess, creates a fresh project, imports
two IFC originals, preserves B1, reads notices, investigates a scoped recorded
constraint, rejects execution without approval, kills/restarts the process, then
approves/executes and checks a new analysis. It explicitly reports simulated
actions, an unconnected engineering provider, and absence of Tauri WebView
validation. Native CI also runs this against its packaged sidecar.

The engineering-port tests use clearly named contract fixtures, not an IFC diff
implementation. They cover fresh projects without seeded blockers or legacy
element membership, removed-element selection, persisted citation chains,
unrelated evidence and identical GlobalIds in different sources. Model tests use
real PydanticAI with FunctionModel and paid requests disabled. Full UI/IFC-diff
joint acceptance remains pending B/C work.

Windows native regression now drives the packaged Tauri WebView2 UI with matching
Edge WebDriver, using current Chinese controls and isolated data. It verifies
change submission, approval, simulated execution and fresh READY recheck; see
`desktop/README.md` and `artifacts/native-webview.json`. This is a synthetic
coordination regression, separate from the future B/C project/IFC workflow.

The Windows follow-up also exercised the actual native file picker with a local
text fixture, displayed its parsed content, closed normally, checked SQLite handle
release, and read the same document after restarting the isolated desktop.
The full local Windows backend run passed 310 tests with 14 explicit optional/
platform skips; the subsequent final engineering contract subset passed 8 tests.
The native host's four Rust tests passed. Native GUI checks do not imply installer
installation, signing or the unfinished real engineering change-to-action flow.
