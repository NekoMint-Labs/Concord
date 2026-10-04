# Deployment Profiles and Consolidated Final Decisions

## Decision status

These decisions supersede earlier handoff drafts.

## Profile A — Local Web (Default for development/demo)

Required:

- React/Vite Web UI;
- FastAPI Python core;
- SQLite application DB;
- DBOS with SQLite;
- LocalFileStore;
- StructuredBIMProvider;
- SimpleResolver;
- lightweight document parser;
- metadata/FTS search;
- offline/demo reasoning path;
- all core coordination/security behavior.

Advanced adapters may be installed but remain disabled unless selected.

No Docker, PostgreSQL, Temporal, MinIO, OTel collector, or cloud API key is required.

## Profile B — Desktop

Required:

- Tauri 2 shell;
- same React UI;
- bundled/supervised Python sidecar;
- SQLite + DBOS + local files;
- safe native file import;
- complete main coordination demo offline;
- ability to enable locally available IfcOpenShell/OR-Tools/Docling capabilities.

## Profile C — Server/Team

Required:

- Web UI + FastAPI service;
- PostgreSQL;
- DBOS with PostgreSQL or appropriately configured runtime DB;
- server-ready FileStore configuration;
- S3-compatible storage implementation available;
- pgvector implementation available;
- structured logs and optional OTel export;
- configuration suitable for internal/team deployment.

Do not claim public multi-tenant SaaS security unless actual identity/tenant isolation has been implemented and tested.

## Profile D — Full/Distributed

Required implemented profile path:

- PostgreSQL;
- TemporalRuntime selected instead of DBOS for workflow execution;
- S3-compatible object storage;
- OpenTelemetry exporter/collector path;
- pgvector semantic retrieval;
- real model reasoning/vision when credentials are provided;
- IfcOpenShell/OR-Tools/Docling enabled as relevant.

A single machine dev compose/profile may be used to prove these integrations; production topology is not required to mimic the demo topology.

## Frozen final technology decisions

Frontend: React/Vite/TypeScript + TanStack Query; OpenTakeoff-based product shell
with existing primitives/ThatOpen surfaces. The old shadcn-shell mandate is retired.
Current composition: `docs/PRODUCT_WORKFLOW.md`; versions: frontend manifest/lock.

Backend: Python + FastAPI + Pydantic + SQLAlchemy 2 + Alembic.

Package managers: uv + pnpm.

Reasoning: project-owned `ReasoningEngine`; PydanticAI is the real model adapter; offline deterministic demo path required.

Runtime: project-owned `DurableRuntime`; DBOS default and Temporal advanced adapter both implemented.

Persistence: SQLite local/desktop; PostgreSQL server/team.

Optimization: SimpleResolver default + OR-Tools implemented.

BIM backend: Structured provider default + IfcOpenShell. C owns viewers; current
interfaces are `docs/EVIDENCE_VIEWER_ADAPTERS.md`, not this historical donor mandate.

Documents: lightweight parser + Docling implemented.

Storage: LocalFileStore + S3-compatible adapter.

Retrieval: FTS/structured default + PostgreSQL/pgvector semantic path.

Observability: structured logging default + OpenTelemetry implemented optional.

GIS: MapLibre GL JS.

Desktop: Tauri 2, with Rust limited to desktop shell/OS integration and Python sidecar supervision.

Agent transport: REST/JSON for normal API; AG-UI event semantics over SSE for run streaming.

## Current implementation references verified near baseline creation

- DBOS official docs: Python uses SQLite by default and recommends PostgreSQL for production; workflows provide checkpoint/recovery/idempotent workflow identity.
- Tauri 2 official docs: sidecars can bundle external binaries such as Python applications/API servers; capabilities/permissions provide scoped native access.
- Docling official docs: supports PDF/Office/images/HTML/Markdown and local execution.
- MapLibre GL JS: TypeScript/WebGL interactive map library; current documentation is ESM/Vite-friendly.
- OpenTelemetry Python: traces and metrics are stable; logs are still less mature, so structured app logs remain primary.
- pgvector: vector similarity inside PostgreSQL.
- MinIO Python SDK: S3-compatible object storage access.

Always check current official APIs/versions before coding; do not pin stale version numbers from prose.

## Remaining non-blocking unknowns

Current integration and release blockers belong to `STATUS.md`/`VERIFICATION.md`.
This historical profile plan is not completion evidence or authority to expand scope.
