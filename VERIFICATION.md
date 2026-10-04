# Reproduce verification and finish release qualification

[STATUS.md](STATUS.md) owns the current integration boundary. Commands below are
reproduction entry points, **not results for the dirty product worktree**.

## Current integration — unaccepted

Actual main + PR22 + dirty B were locally combined without committing in
`/tmp/concord-seam-pass/full`. B + main was first rehearsed separately in
`/tmp/concord-seam-pass/integrated`. The original dirty tree was snapshotted.
Source composition and focused tests are not final integrated acceptance.

The reported C IFC preparation failure is an archive SHA-256 mismatch:

- expected in PR22 `frontend/viewer-integrations/ifc/prepare.py`:
  `cd2c89a3e0410ab492d92b0e2ccfa3b16441630132a8a0a837b9b1052248afd5`;
- observed archive with Git 2.53.0:
  `95f5e877366bdea8dfa3c0e4b65bc4fd46e0007f68092e025ffd880b51682f1d`.

This is the **source archive** check, not the separate npm lock hash
`cd7223b245b36d2e0534bbed4499185e94647ae56463ec95632f8dd105db7ea0`.
Do not bypass/update the pin merely to obtain a green build. Reconcile the pinned
source/archive reproducibility with C before preparing assets and collecting fresh
qualification. C’s unchanged preparation command failed in the local rehearsal. No checksum was
bypassed and no C viewer source was changed.

Earlier B donor-pass results in [UI_DONOR_VERIFICATION](docs/UI_DONOR_VERIFICATION.md)
and isolated C qualifications in the [PR22 handoff](docs/EVIDENCE_VIEWER_ADAPTERS.md)
are scoped evidence only. Neither proves this composed product works. After owner
integration, qualification must cover exact-revision/hash loading, all four real
surfaces, missing assets/targets/extraction, switching/reopening/cleanup, persisted
human decisions and fresh ReCheck closure, plus applicable native packaging and
license review. These are pending gates, not instructions to resume the stopped
visuals task.

## Historical verified main evidence

The actual main snapshot inspected for this audit is
`4124fc8d98a8d94abe8af33ea7d204452db16cf4` (merged #20). Its documentation records
the established maintainability baseline's full `verify.yml` source/integration
qualification: TypeScript, React/Vitest, production build, Prettier, Ruff, Pyright,
real IFC, DBOS and Temporal, plus Windows native qualification. It also records
manual Windows installer/startup, packaged sidecar/DBOS, coordination demo and
restart acceptance. These historical records are not rerun evidence for this tree.

Historical supplemental counts were backend `235 passed, 23 skipped` and
transport/style-entry `24 passed`, plus Python compilation, offline lock validation,
generated-contract/CSS comparisons and archival integrity. They are not current
suite totals or proof of PR22 integration. Linux/macOS native, signing/notarization
and final production release were not established by that evidence.

## Dependency locks and installation

The repository commits real dependency locks:

- `uv.lock`
- `frontend/pnpm-lock.yaml`
- `desktop/src-tauri/Cargo.lock`

Use frozen/check modes with these locks for normal development and CI:

```sh
python scripts/lock_dependencies.py --check
uv sync --frozen --group dev --extra models --extra telemetry
pnpm --dir frontend install --frozen-lockfile
```

The check script validates the full lock set with uv, pnpm, and Cargo. Regenerate locks
only for an intentional manifest change, review the resulting lockfile changes, and
commit manifests with their locks. The manual `resolve-locks` workflow produces
reviewable lockfile artifacts; it does not push changes.

`--no-sync` in the commands below retains the explicitly installed environment.

## Normal CI qualification

The [verification workflow](.github/workflows/verify.yml) is the normal CI
qualification path. On its supported locked environment, it verifies committed locks,
backend tests and DBOS recovery, OpenAPI/schema generation, frontend transport tests,
production TypeScript and React checks, browser coverage, real IFC coverage, quality,
services, and optional runtime/SDK lanes.

```sh
uv run --frozen --no-sync pytest -q backend/tests
pnpm --dir frontend test:transport
uv run --frozen --no-sync python scripts/node_api_smoke.py --runtime dbos --output artifacts/node-api.json
uv run --frozen --no-sync python scripts/export_openapi.py
uv run --frozen --no-sync python scripts/bootstrap_types.py
pnpm --dir frontend typecheck
pnpm --dir frontend test
pnpm --dir frontend build
pnpm --dir frontend lint
uv run --frozen --no-sync ruff check backend scripts
uv run --frozen --no-sync pyright
```

The Node/API smoke exercises production TypeScript HTTP/SSE code against a real backend;
it does not render React. The API contract gate compares generated
`frontend/openapi.json` and `frontend/src/api/schema.ts` with source output. Do not
hand-edit those generator-owned files to resolve a mismatch.

## Browser, durable-runtime, services, and SDKs

```sh
pnpm --dir frontend exec playwright install --with-deps chromium
pnpm --dir frontend e2e
uv run --frozen --no-sync python scripts/generate_ifc_fixture.py
pnpm --dir frontend e2e:ifc
uv run --frozen --no-sync python scripts/dbos_recovery_smoke.py
```

Normal CI runs browser and real IFC checks with `CCA_E2E_RUNTIME=dbos`. An explicit
`CCA_E2E_RUNTIME=diagnostic` or `--runtime diagnostic` is supplemental,
non-durable diagnostic evidence only; it does not qualify DBOS or Temporal recovery.

The service and SDK CI lanes provision required test fixtures and reject skipped suites.
They cover configured PostgreSQL/MinIO storage, PydanticAI, OR-Tools, IfcOpenShell,
Temporal, OpenTelemetry, and Docling paths. Run the relevant extras and commands from
[`.github/workflows/verify.yml`](.github/workflows/verify.yml) when reproducing a
specific lane. Do not substitute mocks or synthetic checks for those qualifications.

## Native qualification

Build on the target OS, not through cross-platform assumptions:

```sh
uv sync --frozen --group dev --extra desktop
pnpm --dir frontend install --frozen-lockfile
uv run --frozen --no-sync python scripts/build_desktop.py
cargo test --locked --manifest-path desktop/src-tauri/Cargo.toml
```

The manual [native workflow](.github/workflows/native.yml) builds the packaged sidecar,
exercises restart behavior, and performs Windows/Linux native WebView coordination
and real IFC rendering/import checks. The IFC scenario uses the desktop provider
default without an internal BIM switch; see [desktop/README.md](desktop/README.md).
Windows native qualification and manual Windows installer/startup/demo/restart
acceptance are recorded for historical verified main only, not this worktree's new
shell/viewer composition. Linux and macOS native qualification,
code signing/notarization, and final production release qualification remain separate
future release work. A successful source build is not evidence of a signed, notarized,
or distributable production release.

The native workflow's packaged Agent smoke imports two IFC revisions and creates a
persisted R1-to-R2 comparison with official IfcDiff through the built sidecar. The
historical main evidence qualifies those default Desktop dependencies, not PR22's
new isolated viewers, B's changed shell or their pending packaged integration.

## Regression coverage

The regression suites cover worker fencing, cancellation/resume generations, stale
publication rejection, approval/idempotency behavior, SSE replay, document publication
rollback, and isolated fixture/schema tooling. They are valuable local evidence, but
do not replace applicable CI or platform-native qualification.

## Issue #18 engineering coordination

Focused platform verification:

```sh
uv run --frozen --no-sync pytest -q backend/tests/test_engineering_coordination.py backend/tests/test_engineering_reliability.py backend/tests/integration/test_engineering_dbos.py
```

These checks cover normalized publication, persisted dependencies, explicit closure,
cache/provenance isolation, cancellation/resume and real DBOS process-to-process outbox
recovery. They use deterministic engineering fixtures, not qualified detection algorithms.
See `docs/ENGINEERING_COORDINATION.md` for the shared contract and integration boundary.

## Final fast integration checkpoint — 2026-07-13

Executed against the actual uncommitted A+B+C rehearsal, not standalone B:

- `pnpm test`: **86 files / 628 tests passed**, including C viewer unit tests and
  23 host seam regressions. Test duration 70.94s. These are not browser acceptance.
- `pnpm test:transport`: **43/43 passed**, including binary fetch cancellation.
- `pnpm lint`: passed.
- Initial typecheck/build stopped on a newly added test’s invalid `queryByRole`
  `exact` option. Removed only the unsupported option; exact string accessible-name
  matching/assertion is unchanged. Final rerun result is recorded below.
- Original and integrated staged/unstaged `git diff --check`: passed.
- Original HEAD remains `466d7a789328876adebb0fde68b7d1a2e5012af0`.
- No remaining integration conflict markers/unmerged index entries. No B change to
  `frontend/src/viewers/**`; C implementation remains owned by C.

At the user’s explicit expedited-stop request, no final Chromium, real-project,
engineering-real, strict four-surface product, IFC or C viewer browser suites were
started. C backend integration/publication/adapters suites were not run in this
final checkpoint. New strict `evidence-integration.spec.ts` exists but is **unrun**.
Do not report real product flows, persistence or native navigation as accepted.

Open blockers: C IFC donor archive checksum mismatch; absent production
engineering-capability registration; decision replay/version fence and durable
manual ReCheck retry limitations; coherent multi-source check fencing unresolved.
No commit, push, PR creation or ownership-bypassing workaround was performed.

Final rerun: `pnpm typecheck` and `pnpm build` both **passed**. Build includes all
four C surface chunks. Existing donor CSS import-order, runtime URL, mixed
static/dynamic BIM import and bundle-size warnings remain; these are not silently
fixed in this non-visual pass. The corrected filter regression was rerun alone:
**1 passed / 33 unrelated tests deselected**, and its formatting check passed.
Full suite was not repeated after this type-only test correction.
