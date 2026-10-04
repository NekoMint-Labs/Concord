# Multi-source ReCheck and versioned IDS requirements

Platform follow-up for #17/#22, based on the merged #19/#20 runtime. Engineering
providers and product composition remain C/B-owned. This contract does not claim
that #22 has consumed it or that final Golden/native acceptance is complete.

## Paired model inputs

Create one `FindingDependency` per model. Both dependencies must cite their own
persisted Evidence and revision-bound target. Assign the same `group_id`, capability,
expected condition and `requirements_kind`, and distinct `input_role` and source IDs.
For example, use group `clash-1` with roles `structure` and `mep`. Ungrouped dependencies
continue through the existing single-source path.

The platform persists the complete group in `ReCheck.dependencies` and `ReCheck.inputs`.
Each `CapabilityInput` includes group, role, source ID, original Finding revision,
current bound revision, hash and current target. Updating either model captures both
latest model revisions, including the unchanged peer. One provider invocation executes
each group, rather than one independent invocation per model.

Durable run identity binds the Finding/version, operation ID and complete bound input
set (including group/role and IDS selection), independent of which model triggered it.
A manual ReCheck or IDS selection queues one run for the same paired inputs; retrying
the same operation does not create another run, even before execution/cache publication.

`EngineeringCapability.check(request)` receives:

- `request.inputs`: the ordered group of bound inputs;
- `request.input_bytes`: verified original bytes in exactly the same order;
- `request.dependency`: the first dependency, retaining the expected condition;
- `request.group_id`: the explicit group, when present;
- the existing primary `source_id/from_revision_id/to_revision_id` for compatibility.

Use all inputs for grouped checks. The compatibility primary is the first model role,
which can be the unchanged model; it is not a substitute for the complete group.
Original bytes are transient and excluded from request serialization. Do not relabel
Evidence for the second model as the triggering source.

The provider returns structured Evidence for every model source, each with its exact
bound revision/hash and optional target. The platform validates the entire result and
publishes the pair in one transaction. Empty/partial output cannot resolve a check.
For grouped/IDS `RESOLVED`, return `expected_condition_satisfied=True` only after actually
evaluating the Finding's condition. A bare zero-clash/zero-violation count is insufficient.

## Explicit IDS requirements selection

Upload the original `.ids` artifact through the normal project document source/revision
API. Select it explicitly:

```http
PUT /api/projects/{project_id}/engineering/ids-requirements
Content-Type: application/json

{"source_id":"requirements-source","revision_id":"requirements-r1"}
```

GET on the same route returns the current selection or null. The platform verifies
project/source ownership, document source kind, `.ids` filename and original hash.
The durable selection contains `source_id`, `revision_id`, `sha256` and a selection ID.
Repeating the current selection is idempotent and drains any committed queued work.

Mark model Finding dependencies with `requirements_kind="ids"`. Their provider request
adds an input with role `requirements`, the selected revision/hash, and its verified
original IDS bytes. `request.ids_requirements` identifies the selected configuration.
Pass these original bytes to the real IfcTester provider, without guessing the latest
requirements version or replacing them with reconstructed content.

Uploading a newer IDS revision does not change the selection. Explicitly switching the
selection invalidates old checks and transactionally queues the affected confirmed
Findings via the indexed IDS dependency lookup. Missing selection yields NEEDS_REVIEW.

## Registration and durable execution

Supply trusted provider objects through
`build_services(settings, engineering_capabilities=(clash_provider, ids_provider))`.
Registration checks unique nonempty names and versions before runtime recovery starts.
Providers continue implementing the existing `EngineeringCapability` port; runtime and
publication live in A's application services. No SDK or framework type enters the domain.
`ReCheckService.register(provider)` is also available for controlled in-process
qualification; deployment registration belongs in the composition root before recovery.

DBOS persists the job/input binding and recovers queued jobs after process restart.
Execution and cache reuse validate the full current input set; publication repeats the
check under the project write transaction. Closure requires current resolved Evidence
for every dependency, including all members of grouped checks. Cancellation and stale
run generations cannot publish or cache results. Cache identity binds engine/version,
expected condition, roles, source/revision/hash identities and the IDS selection ID.
Original I/O and heavy provider work run outside database write transactions.

Migration 0009 adds the IDS selection table and dependency index without rewriting
existing Finding/Evidence/ReCheck payloads. Existing single-source jobs remain readable.
The generated OpenAPI and frontend schema expose the configuration and durable inputs.

## Verification

```sh
uv run --frozen --no-sync pytest -q backend/tests/test_engineering_multisource.py backend/tests/test_engineering_ids.py
uv run --frozen --no-sync pytest -q backend/tests/integration/test_engineering_input_recovery.py
uv run --frozen --no-sync python scripts/export_openapi.py
uv run --frozen --no-sync python scripts/bootstrap_types.py
```

The provider fixtures test platform behavior; they do not qualify real collision
geometry or IfcTester correctness. C retains those engine and integrated Golden checks.
