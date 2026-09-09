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
- `specifications/`: approved technical specifications; consult only the sections
  relevant to a change.

## Development and verification

The repository commits `uv.lock`, `frontend/pnpm-lock.yaml`, and
`desktop/src-tauri/Cargo.lock`. Use frozen/check modes for normal development and
CI; regenerate locks only when dependencies intentionally change.

The established team baseline has passed full source/integration CI and Windows
native/manual acceptance. Current evidence and remaining platform boundaries are
recorded in the documents below:

- [DEVELOPMENT.md](DEVELOPMENT.md) — contributor workflow and focused checks.
- [CONTRIBUTING.md](CONTRIBUTING.md) — contribution workflow and pull request rules.
- [VERIFICATION.md](VERIFICATION.md) — verification commands and qualification
  boundaries.
- [STATUS.md](STATUS.md) — current project status.
- [TEAM_DEVELOPMENT.md](TEAM_DEVELOPMENT.md) — ownership and shared seams.
- [desktop/README.md](desktop/README.md) — native prerequisites and boundaries.

## Licensing

No open-source license is currently granted. Do not reuse, redistribute, or assume
license rights without written authorization.
