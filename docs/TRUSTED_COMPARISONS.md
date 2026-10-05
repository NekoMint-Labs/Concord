# Trusted PDF/CAD comparison invocation

This is the A-owned execution/publication seam requested in Issue #17. C supplies
the pinned donor executor and mapper. B consumes canonical Changes/Evidence. The
default application has no registered PDF/CAD executor and reports that limitation;
the endpoint returns `503`, rather than accepting browser-produced facts.
Operators can explicitly enable C's fixed pack through ordinary startup using
[`COMPARISON_DEPLOYMENT.md`](COMPARISON_DEPLOYMENT.md). The configuration stays
disabled by default; installing assets alone does not register an executor.

## Product entry point

`POST /api/projects/{project_id}/engineering/comparisons` requires `ingest`:

```json
{
  "kind": "pdf_comparison",
  "operation_id": "drawing-R1-R2",
  "source_id": "persisted-source-id",
  "from_revision_id": "persisted-R1-id",
  "to_revision_id": "persisted-R2-id",
  "options": {}
}
```

`cad_comparison` selects the other executor. Both originals must belong to the same
Drawing source/project, have `.pdf` or `.dxf` filenames respectively, be ordered
oldest to newest, and end at that source's latest revision. Historical comparisons
that are no longer current cannot publish new authoritative facts. Options must be
finite JSON within 16 KiB; C validates the donor-specific option vocabulary.

Clients cannot supply hashes, original bytes, engine names/versions, artifact keys,
Changes or Evidence. Extra request fields are rejected. The response is an
`AgentRun` with status `202`; inspect `/api/jobs/{run_id}` and the existing run/SSE
endpoints. Existing cancellation/resume actions remain authoritative.

`ComparisonService.enqueue` commits the job without dispatch. `submit` commits and
dispatches through the existing DBOS/Temporal runtime. The run ID binds project and
operation ID. A repeated operation retains the exact pair, options and engine
identity; rebinding conflicts. No new queue, workflow engine or database table is
introduced. Existing JSON job records remain backward-compatible.

## C's consumable interface

Implement `backend/app/ports/comparisons.py::ComparisonExecutor` and inject its
lightweight instances through:

```python
build_services(settings, comparison_executors=(pdf_executor, cad_executor))
```

Registration precedes runtime construction and queued-job recovery. `kind` is
`pdf_comparison` or `cad_comparison`; `name` and `version` identify the actual pinned
donor plus adapter semantics/settings. Recovery refuses a different name/version.
Constructors must keep donor SDKs lazy. No client chooses programs, URLs or scripts.

The worker receives `ComparisonExecution` containing:

- project, run ID and generation;
- the persisted `BoundComparison`, including both complete source revision records;
- a persisted snapshot, reused on retries;
- the two original byte buffers, already checked against size and SHA-256.

`execute(context) -> bytes` runs C's pinned engine outside a project write
transaction and returns raw derived output, bounded to 8 MiB. Do not return a
browser-supplied Change list as proof of execution. Retain sufficient engine input,
options and result provenance for normalization. Large derived caches/overlays
remain C's separate bounded artifact responsibility.

A retains the raw output before calling:

```python
normalize(context, raw, artifact_key) -> EngineeringPublication
```

This is where C maps its actual PDF/CAD output to the existing canonical mapper
context: `projectId`, `sourceId`, `operationId=context.run_id`, ordered revision IDs
and hashes, stable observation time from the persisted snapshot, and the supplied
`rawArtifactKey`. CAD's current mapper requires UTC observation time with millisecond
precision; format that snapshot time accordingly. Do not generate a new observation
time on each retry. Normalized Changes must use the registered engine name/version,
the exact revision pair, and the supplied artifact key. Targets must reference one
of those revisions and use Drawing/CAD target kinds. Evidence, when supplied, must
reference the snapshot and exact source/revision/hash/target.

A validates every draft again, owns final record IDs and the publication operation,
and stamps Change/Evidence timestamps from the persisted snapshot observation time.
It invokes internal `engineering_publication.publish` in the same transaction as
job completion and audit. C does not call `EngineeringPublisher` directly from a
browser. Producing Changes does not confirm Findings, promote Baselines or close a
coordination item.

## Artifact, cache and stale-run fences

The retained key binds project/source, ordered revision identities/hashes,
engine/version/options and raw payload hash. Different output cannot overwrite an
existing artifact. Raw output is read back and integrity-checked; the job result
retains its key and SHA-256, even when the normalized comparison is unchanged.

Only a successful atomic publication stores the cache authorization digest. A
cancelled, obsolete or rolled-back attempt may leave an unreferenced content-addressed
artifact, but cannot authorize reuse. Cache reuse checks the verified originals,
recipe and payload digest and reruns normalization for the new persisted job context.
Missing cache objects may be recomputed; corrupt objects fail explicitly.

Both originals are verified before and after slow work. Execution input mutation,
artifact mutation, a newer source revision, cancellation, expiry, and an obsolete
generation prevent publication. Input/current-run validation and canonical
Changes/Evidence/cache authorization/job completion/audit commit atomically under
the existing project transaction. Retry and process recovery use the saved job
binding; no new upload silently replaces an input.

## Verification boundary

The platform suite uses deterministic executor fixtures and real persistence. A
separate test recovers an already committed outbox in fresh real DBOS processes.
These qualify A's lifecycle/publication interface, not the actual PDF/CAD engines,
Windows WebView, or the final R1/R2/R3 product walkthrough. C must implement and
qualify its real executor against this seam; its existing browser comparison tests
do not establish trusted backend execution or persisted publication.

```text
python -m pytest -q backend/tests/test_trusted_comparisons.py
python -m pytest -q backend/tests/integration/test_comparison_recovery.py
python scripts/export_openapi.py
python scripts/bootstrap_types.py
```

No detector is enabled, no dependency/lockfile or workflow is changed, and no new
raw-result write endpoint is introduced by this interface delivery.
