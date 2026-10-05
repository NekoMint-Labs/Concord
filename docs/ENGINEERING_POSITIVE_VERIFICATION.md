# Positive engineering ReCheck verification

This is C-owned adapter behavior over the merged #23 `CapabilityCheck` /
`CapabilityCheckResult` contracts. It does not change shared schemas, runtime,
provider registration, Finding decisions or product composition.

## Supported conditions

- IfcClash: `No clashes` / `Zero clashes` (case-insensitive).
- IfcTester: `All IDS requirements pass` / `No IDS violations`.
- Unknown conditions remain `NEEDS_REVIEW` without success Evidence.

A successful SDK call and an empty failure list are insufficient. The adapters
must establish the scope actually evaluated before returning `RESOLVED`.

## Clash verification

The existing exact, bounded GlobalId filters still drive the real IfcClash SDK.
A per-instance tree recorder observes shapes inserted by its unchanged
`add_collision_objects` method. It stores only GlobalIds of shapes with vertices
and faces, then restores the native tree before the SDK collision routines run.
No IFC reread, second geometry pass or replacement collision algorithm is added.

Success requires both nonempty geometry sets to exactly equal their requested
GlobalId sets, and no clash Evidence or Change rows. Missing targets, omitted
geometry, extra/duplicate scope, SDK failure and contradictory output remain
reviewable. Results without the new geometry coverage fields cannot resolve.

Two structured Evidence drafts are produced, one per model. Each retains its own
source/revision/hash, exact target and GlobalIds. Both facts record the complete
role-qualified input pair, expected condition, detection mode/settings, observed
geometry sets, engine/version, zero clash count and measured execution time.
A publishes them atomically with authoritative snapshots and new Evidence IDs.

## IDS verification

IfcTester continues parsing the selected, integrity-checked original IDS bytes
using its bundled schema and local-only XML resource policy. The adapter records
SDK applicability counts per specification and the union of applicable GlobalIds.
The default bound is 100,000 total specification/entity applicability entries;
overflow rejects the result instead of truncating it.

Success requires nonempty specifications, all specifications passed, none failed
or skipped, coherent applicability counts, at least one applicable entity, and
coverage of every requested model GlobalId. An optional specification may have
zero applicable entities if other specifications actually evaluate the requested
scope. All-vacuous validation remains reviewable. Empty/prohibited-only checks
are deliberately conservative and do not produce success Evidence in this path.

The structured model Evidence retains its revision/hash/target, SDK counts and
requirements hash. Its fact includes the complete persisted input set and selected
IDS source, revision, hash, selection identity and timestamp. Failure Evidence now
also retains this selection context, not only the requirements hash.

## Cache and closure

Provider semantics advance to `targeted-clash-v3` / `selected-ids-v3`, invalidating
older persisted capability cache keys. Existing engine/settings/input/selection
binding and A's publication/current-input fences remain unchanged. Warm success
reuses the verified result but publishes fresh Evidence under the current snapshot;
`observed_at` continues to identify the original SDK observation.

`RESOLVED` describes ReCheck verification. Findings remain `CONFIRMED` until an
explicit human `CLOSED` decision passes A's existing current-input and complete
dependency validation. A later model revision or IDS selection cannot reuse an
older success to authorize closure.

## Reproduction

Use the committed dependency lock with the BIM extra installed:

```sh
uv sync --frozen --group dev --extra bim
uv run --frozen --no-sync pytest -q backend/tests/test_engineering_capabilities.py backend/tests/test_engineering_capability_inputs.py backend/tests/test_engineering_positive_verification.py backend/tests/integration/test_engineering_provider_runtime.py backend/tests/integration/test_engineering_verification_scope.py
uv run --frozen --no-sync pytest -q backend/tests/integration/test_optional_local_sdks.py -k ifc --junitxml=.verification-work/required-ifc.xml
uv run --frozen --no-sync python scripts/assert_junit.py .verification-work/required-ifc.xml
```

The existing required IFC SDK test entry now invokes both real persisted provider
acceptance scenarios. Its existing skip-rejection gate applies without a workflow
change. Boundary fixtures are deterministic and distinct from real SDK acceptance.
The real scenarios exercise R2 failures, R3 positive pair publication, warm cache,
settings/restart invalidation, IDS selection/originals, stale closure rejection and
explicit human closure. Additional real cases reject missing/partial geometry and
optional IDS rules with no applicable elements.

Default deployment registration remains A-owned and pending. Product/Golden,
large-model, native packaging and native connector acceptance are separate work;
these tests do not qualify those boundaries or complete Issue #17.

## Local qualification on October 5, 2026

- 118 focused provider/input/positive/runtime cases and 225 broader engineering
  regressions passed with no skips.
- Statement/branch coverage over the four provider/input/verification/geometry
  observation modules is 99%; both new modules individually measure 100%.
  This is scoped evidence, not repository-wide coverage.
- The existing required IFC entry passed all 12 selected cases with no skips,
  including both persisted provider scenarios.
- Full-project Pyright and Ruff passed after installing the locked extras.
- The broader Windows backend run reproduced two existing same-key local-storage
  concurrency failures. A separate focused fix and owner review are being prepared;
  this isolated adapter continuation does not claim a complete local backend pass.

Current-head remote CI is recorded on the PR after pushing. Native, large-model
and combined product/browser acceptance are not established by these local results.
