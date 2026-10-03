# Revision-aware coordination contract (#18)

The platform owns revision identities, normalized publication, persisted Findings,
Coordination, ReChecks, and durable execution. Engineering adapters own detection and
measurement; product UI consumes these contracts. No detector or viewer SDK type enters
the public models.

## Identities and compatibility

`ProjectSourceRevision.id` is the engineering revision identity. `SourceRevision` and
`ProjectSnapshot` retain their existing run-freshness semantics. SHA-256 identifies bytes,
not a business revision. Source uploads never promote a Baseline.

The existing `Evidence`, `Finding`, and `Impact` are extended, not replaced by per-format
models. New engineering Evidence includes `source_revision_id` and optionally
`viewer_target`; `source_revision` remains the integrity hash for compatibility.
Legacy records remain readable. When publishing or validating old Evidence, only an
exact project/source/hash match can establish the revision ID. Unresolved legacy
provenance cannot authorize a new Finding or ReCheck result.

Migration 0008 adds engineering changes, findings, indexed source dependencies,
append-only coordination decisions, ReChecks and idempotent publication receipts.
It does not rewrite legacy project, source, baseline, evidence or analysis payloads.
Downgrading removes the new coordination records only; back up new state before a
deliberate downgrade. Existing migration tests exercise upgrade/downgrade/re-upgrade.

## Adapter integration (Developer C)

Use `EngineeringPublisher.publish(project_id, EngineeringPublication(...))` inside the
trusted adapter boundary. The operation ID identifies one immutable publication;
repeating identical content succeeds, changed content under the same ID conflicts.
Changes carry source/from/to revision IDs, detector/version, kind/aspects, and a typed
subject. Evidence snapshots and revisions must belong to the same project. This method
is deliberately not a raw HTTP write endpoint or an Agent tool.

ViewerTarget examples (pages are one-based; drawing boxes use x0,y0,x1,y1 in [0,1]):

```json
{"kind":"drawing","source_revision_id":"R2","page":2,"normalized_bbox":[0.1,0.2,0.5,0.6]}
{"kind":"cad","source_revision_id":"R2","entity_id":"A17","layer":"MEP"}
{"kind":"bim","source_revision_id":"R2","global_ids":["GlobalId"]}
{"kind":"document","source_revision_id":"R2","structural_path":["Sheet1","row:4","cell:C4"]}
```

Register provider instances through
`build_services(settings, engineering_capabilities=(provider, ...))` before DBOS starts.
Each implements `EngineeringCapability.name`, `.version`, and
`.check(CapabilityCheck) -> CapabilityCheckResult`. The request binds project/source,
old/new revision IDs, the typed target, required capability and expected condition.
Only the platform assigns persisted evidence IDs and the current snapshot. Providers
must return truthful quality and exact new-revision provenance; raw draft snapshot/ID
values are replaced on publication. A provider may return:

- `RESOLVED`: the expected condition was verified with fresh structured evidence;
- `STILL_OPEN`: the condition still fails;
- `CHANGED`: the issue changed sufficiently to need reassessment;
- `NEEDS_REVIEW`: unavailable capability, insufficient evidence or uncertain outcome.

No registered provider means explicit `NEEDS_REVIEW`, never synthetic success. Empty,
extracted-only or inferred evidence cannot produce a resolved check. The platform tests
use deterministic test providers; these do not qualify real PDF/CAD/IFC algorithms.

## Product API (Developer B)

All following paths are relative to `/api/projects/{project_id}/engineering` and use
the existing bearer authentication. Generated OpenAPI and TypeScript schemas are the
source of exact request/response fields.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/changes?revision_id=...` | Normalized changes, optionally by target revision |
| GET | `/evidence/{evidence_id}` | One project-owned Evidence record |
| GET / POST | `/findings` | List / propose an evidence-bound Finding |
| GET | `/findings/{id}` | Finding, impact, evidence IDs and dependencies |
| POST | `/findings/{id}/decisions` | Human confirm, dismiss, edit, close or explicitly reopen |
| GET | `/findings/{id}/coordination` | Append-only human decisions |
| GET / POST | `/findings/{id}/rechecks` | History / request current-source checks |

List endpoints currently return at most 1,000 records. ReCheck IDs are also AgentRun
IDs: use the existing run, timeline/SSE, cancel and resume endpoints for execution
status. Business outcome and execution status are separate: `COMPLETED` with
`NEEDS_REVIEW` means the check finished without a conclusive engineering result.

A manual ReCheck POST takes `{"operation_id":"client-generated-unique-id"}`.
Retry the same operation ID for the same request; use a new one to recheck after a
provider becomes available. Manual requests affect only the selected Finding. Automatic
revision arrivals use deterministic IDs and indexed source dependency lookup.

Creating a Finding requires `ingest`; human decisions require `approve`. Every dependency
must have persisted revision-bound Evidence. Multiple Changes/Evidence may contribute
to one Finding. Closing requires a confirmed Finding and current resolved ReCheck
evidence for **every** dependency source. A newer revision, an Agent explanation or an
old resolved result cannot authorize closure. Baseline acceptance remains its existing,
separate explicit API. No new approval tool is exposed to the Agent.

Decision transitions are enforced: a `PROPOSED` Finding may be confirmed, dismissed or
edited; a `CONFIRMED` Finding may be dismissed, closed (with fresh ReCheck evidence) or
edited. `CLOSED` and `DISMISSED` Findings accept only `REOPENED`, which returns them to
`PROPOSED` for a new human confirmation. Invalid transitions return a conflict without
changing the Finding or its append-only decision history. Reopening never reuses old
closure authorization.

Any decision supplying `recheck_id` must reference an existing ReCheck in the same
project and Finding before any state or history is written. Missing or cross-project
IDs return not found; cross-Finding IDs return a conflict. Non-closure decisions may
reference historical checks; closure retains the stricter freshness/resolution rules.

Confirming a proposal also checks the latest revision of every dependency source inside
the decision transaction. If a revision arrived while the Finding was only proposed,
the platform queues a ReCheck against that latest revision, scoped only to this Finding.
Confirmation does not resolve it or rewrite its original Evidence/dependency provenance.
The outbox commits with the decision; dispatch follows the commit and survives restart.

## Runtime, storage and failure behavior

The revision and queued ReCheck are committed together. DBOS dispatch follows the
commit and existing bootstrap recovery resumes queued work after a dispatch outage.
Heavy capability execution and file/cache I/O occur outside project write transactions.
Publication checks cancellation, run generation, Finding version/state and latest source
revision; obsolete results cannot overwrite current evidence. Errors use the existing
failed-run lifecycle and may be resumed. No additional queue or workflow engine exists.

Original bytes use `project-sources/<sha256>`; legacy object keys remain readable.
Different logical sources may share bytes while keeping independent revision IDs.
Failed metadata publication may leave an unreferenced immutable object: it must not
delete bytes another source or concurrent upload owns. Garbage collection is separate.

`DerivedArtifacts` stores integrity-checked binary data through FileStore. Cache identity
includes ordered input hashes, engine/version and canonical parameters. ReCheck caches
also include source/project and target/expected-condition context, conservatively avoiding
cross-context reuse. Only validated non-stale publication makes an engine result reusable;
cancelled, failed and uncertain runs do not publish new cache entries. Cache hits still
create fresh project/revision-bound Evidence identities.

Default upload limits: IFC 512 MiB, DXF 256 MiB, PDF 128 MiB, other formats 25 MiB.
`CCA_MAX_UPLOAD_BYTES` is the global ceiling; `CCA_UPLOAD_FORMAT_LIMITS` is a JSON
extension-to-bytes map requiring a `"*"` fallback. Existing parser/archive expansion
limits remain independent. A file-size allowance does not advertise a parser capability.

## Verification

Run the engineering coordination/reliability tests and the real DBOS engineering outbox
test, followed by the complete backend suite, Ruff, Pyright, generated-contract checks
and frontend typecheck/tests. Native policy changes additionally require Rust tests and
the Windows native workflow. In restricted Windows sandboxes, process termination tests
must be repeated as the normal user with a distinct pytest temporary directory.

Real engineering-provider qualification belongs to #17 and integrated UX acceptance to
#16. Keep those results separate from deterministic platform contract verification.
