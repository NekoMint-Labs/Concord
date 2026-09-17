# Reproduce verification and finish release qualification

[STATUS.md](STATUS.md) records the current boundary. Commands below are verification
entry points and reproduction guidance for the established team-development baseline.

## Verification state and terminology

The maintainability refactor is complete and this revision is the intended
**team-development baseline**. The full source/integration `verify.yml` qualification
passed, including TypeScript typecheck, Vitest/React tests, the frontend production
build, Prettier, Ruff, Pyright, real IFC verification, DBOS verification, and Temporal
verification. Windows native qualification passed as well.

The Windows installer was generated and manually accepted on a real Windows machine:
the desktop application launched, the packaged Python sidecar and DBOS runtime worked,
the coordination demo worked, and restart behavior was accepted. This is not a claim of
Linux or macOS native qualification, code signing/notarization, or final production
release qualification; those remain separate release work.

### Supplemental local evidence

- Backend suite: `235 passed, 23 skipped`.
- Dependency-light frontend transport/style-entry suite: `24 passed`.
- Python compilation passed.
- Offline Python lock validation passed: `uv lock --check --offline`.
- API/OpenAPI comparison, generated schema comparison, and CSS structural comparison
  were performed.
- An archival integrity check passed.

The comparisons and archive check are supplemental structural evidence. The full CI
and Windows-native qualification above establish the current baseline.

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
Windows native qualification and the manual Windows installer/startup/demo/restart
acceptance are established for this baseline. Linux and macOS native qualification,
code signing/notarization, and final production release qualification remain separate
future release work. A successful source build is not evidence of a signed, notarized,
or distributable production release.

## Regression coverage

The regression suites cover worker fencing, cancellation/resume generations, stale
publication rejection, approval/idempotency behavior, SSE replay, document publication
rollback, and isolated fixture/schema tooling. They are valuable local evidence, but
do not replace applicable CI or platform-native qualification.
