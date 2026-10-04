# Final System Architecture

## Frozen architecture

```text
React/Vite UI ----------------------------------------------------+
  | Web Browser                         Tauri 2 Desktop            |
  |                                      | Rust shell             |
  +---------------- REST + AG-UI/SSE ----+ Python sidecar --------+
                               |
                            FastAPI
                               |
                  Application / Coordination Core
                 /              |                 \
              Domain          Policies            Ports
                                                  |
      +----------------+----------------+---------------------------+
      |                |                |            |              |
  Reasoning         Runtime          Providers    Storage       Resolution
      |                |                |            |              |
 PydanticAI     DBOS / Temporal   BIM/Docs/... Local/S3    Simple/OR-Tools
```

## Dependency direction

`UI/API/Adapters -> Application -> Domain`.

Domain/Application public contracts must not import framework-specific types from FastAPI, SQLAlchemy, PydanticAI, DBOS, Temporal, IfcOpenShell, OR-Tools, Tauri, Docling, MinIO, OpenTelemetry, MapLibre, or other peripheral libraries.

Adapters translate external/library models into project-owned Pydantic/domain contract objects at boundaries.

## State ownership

- authoritative project state: application database/domain repositories;
- workflow execution state: selected DurableRuntime;
- files/objects: FileStore;
- search index: derived/rebuildable from authoritative sources;
- LLM/model: transient reasoning only;
- UI: transient interaction state only.

## Stable Ports

At minimum:

- `ScheduleReader`, `ScheduleWriter`;
- `WorkforceReader`;
- `MaterialReader`;
- `EquipmentReader`;
- `InspectionReader`;
- `DocumentProvider` / `DocumentParser`;
- `BIMProvider`;
- `GeoProvider` or equivalent GIS-domain boundary;
- `VisionAnalyzer`;
- `ActionExecutor`;
- `ReasoningEngine`;
- `DurableRuntime`;
- `FileStore`;
- `ResolutionEngine`;
- `SearchProvider` / retrieval boundary.

Prefer narrow domain-semantic interfaces. Split read/write for safety-sensitive systems. No God Provider.

## Progressive enhancement — final interpretation

The final codebase contains default and advanced implementations behind stable boundaries.

| Capability | Lightweight/default implementation | Implemented advanced implementation |
|---|---|---|
| Runtime | DBOS | Temporal |
| DB | SQLite local | PostgreSQL server |
| Resolution | SimpleResolver | ORToolsResolver |
| BIM | StructuredBIMProvider | IfcOpenShellBIMProvider |
| BIM UI | existing C-owned BIM browsing | C-owned IFC evidence surface; current seams in `docs/EVIDENCE_VIEWER_ADAPTERS.md` |
| Documents | lightweight parser | Docling parser |
| Files | LocalFileStore | S3-compatible FileStore |
| Observability | structured JSON logs | OpenTelemetry |
| Retrieval | metadata + FTS | PostgreSQL + pgvector |
| Reasoning | offline/demo deterministic path | PydanticAI model adapter |
| Vision | disabled/no-op capability state | configured vision model adapter |
| GIS | no geo view when absent | MapLibre workspace/provider |
| Distribution | Web | Tauri Desktop |

Advanced implementations must not contaminate the core or become mandatory local startup dependencies.

## Capability registry

Implement a small, explicit capability registry/health surface owned by application/bootstrap code, not a dynamic plugin framework. It should report configured implementation, enabled state, health, missing dependency/credential, and relevant version if easy to expose.

Do not create a general marketplace/plugin engine.

## Failure model

Use explicit errors/statuses such as:

- `DomainError`;
- `ValidationError`;
- `ProviderError`;
- `TransientProviderError`;
- `ExternalSystemUnavailable`;
- `StaleSnapshotError`;
- `PermissionDenied`;
- `ApprovalRequired`;
- `CapabilityUnavailable`;
- `WorkflowError`.

Catch errors only where a recovery decision can be made. Do not blanket `except Exception: return None`.
