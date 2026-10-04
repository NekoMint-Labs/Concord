# Concord

Local development repository with a React/Vite frontend, Python REST/SSE service,
and optional Tauri desktop host. The default `CCA_REASONING=offline` path is
deterministic and credential-free; hosted providers are opt-in. See
[`.env.example`](.env.example).

## Start development

Prerequisites: Python 3.11–3.13, uv, Node 22+, and pnpm 10.17.1.

```sh
uv sync --frozen --group dev
pnpm --dir frontend install --frozen-lockfile
uv run --frozen --no-sync python scripts/dev.py
```

Open <http://127.0.0.1:5173>. The local workspace uses DBOS and SQLite by
default; it needs no Docker, PostgreSQL, or cloud credentials.

> **Security:** local-demo tokens and profiles are loopback-only. Do not expose
> them through a tunnel or public reverse proxy.

For API-only development, run `uv run --frozen --no-sync cca serve`. The API
serves the built UI when `frontend/dist` exists.

## Repository map

- `backend/app/`: service domain, application logic, adapters, API, and persistence.
- `frontend/src/`: web application composition, features, components, styles, and
  visualization modules.
- `desktop/`: Tauri host and sidecar packaging support.
- `specifications/`: durable technical constraints and explicitly retired handoffs;
  start with its index, then consult only relevant sections.
- [docs/PRODUCT_WORKFLOW.md](docs/PRODUCT_WORKFLOW.md): authoritative, code-derived
  product behavior and links to API/viewer seams; not an acceptance claim.

## Development and verification

The repository commits `uv.lock`, `frontend/pnpm-lock.yaml`, and
`desktop/src-tauri/Cargo.lock`. Use frozen/check modes for normal development and
CI; regenerate locks only when dependencies intentionally change.

Historical verified main records full source/integration CI and Windows
native/manual acceptance. **This dirty product worktree is not that accepted baseline**:
B's four-surface Evidence host depends on pending local PR22 C integration; IFC
preparation currently fails its archive hash check. Local source rehearsal and
focused tests do not establish product acceptance; VERIFICATION records actual gates. Current boundaries
and historical evidence are separated below:

- [DEVELOPMENT.md](DEVELOPMENT.md) — contributor workflow and focused checks.
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution workflow and pull request rules.
- [VERIFICATION.md](VERIFICATION.md) — verification commands and qualification
  boundaries.
- [STATUS.md](STATUS.md) — current project status.
- [TEAM_DEVELOPMENT.md](TEAM_DEVELOPMENT.md) — ownership and shared seams.
- [docs/DOCUMENTATION_AUDIT.md](docs/DOCUMENTATION_AUDIT.md) — audit and retired UI directions.
- [desktop/README.md](desktop/README.md) — native prerequisites and boundaries.

## Licensing

No open-source license is currently granted for Concord's project-owned code.
Third-party materials retain their own licenses; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), including pending PR22 dependency
and distribution obligations. Do not assume this repository notice grants rights
to reuse or redistribute Concord.
