# Product Requirements and Scope

## Product definition — Frozen

The Construction Coordination Agent is a coordination and constraint-removal layer for construction projects. It observes project events and state changes, traces their effects across disciplines/resources/work packages, produces Evidence-backed Findings and Constraints, proposes resolutions and controlled actions, and re-checks readiness after state changes.

Invariant loop: `Event -> Impact -> Constraint -> Resolution -> Action -> Re-check`.

## Required event families

The final implementation must support at least:

1. design/drawing revision change;
2. task/predecessor/process conflict;
3. workforce/subcontractor availability or qualification conflict;
4. material availability/delay;
5. equipment contention/unavailability;
6. inspection/acceptance failure;
7. generic external/project event ingestion so new event families can be added without a new agent architecture.

Weather/GIS/vision-originated events may be enabled through the implemented capabilities but are not allowed to bypass the same event/domain path.

## Required outputs

- affected disciplines/spaces/elements/work packages;
- `ProjectSnapshot` with source revisions/observation timestamps;
- traceable Evidence;
- structured Findings and Constraints;
- explainable `READY/BLOCKED` status and blocker list;
- ResolutionOptions;
- ActionProposals with risk/approval requirements;
- workflow/run status and trace;
- re-check result after external state changes;
- audit history.

## Product capabilities

This is not a dashboard/layout rewrite mandate. Current OpenTakeoff-based product
composition is `docs/PRODUCT_WORKFLOW.md`; earlier custom frontend directions are retired.

- project/work-package navigation;
- visible server-owned project/work-package readiness;
- event/change workspace;
- Impact Graph;
- Evidence/constraint/resolution inspector;
- Agent Run timeline/status;
- approval/action interaction;
- document workspace;
- BIM workspace/viewer;
- optional GIS workspace when geo data exists;
- capability/integration status page;
- configuration/profile information suitable for local demo and server/team deployment.

## Required distributions

1. **Web App** — full product UI in a browser.
2. **Tauri 2 Desktop App** — same React UI and Python core, packaged as a desktop application with a supervised Python sidecar/equivalent bundled backend.

## Deployment behavior

The same product supports:

- `local` profile — zero external infrastructure requirement;
- `desktop` profile — bundled local app;
- `server` profile — PostgreSQL/team/server deployment;
- `full` or equivalent enhanced profile — advanced services such as Temporal/S3/OTel/pgvector enabled.

Profile names may vary, but capabilities and behavior must remain explicit.

## Required advanced capability implementations

These are no longer “future code”:

- OR-Tools optimization adapter;
- IfcOpenShell BIM adapter;
- mature C-owned BIM viewer; current interfaces in `docs/EVIDENCE_VIEWER_ADAPTERS.md`;
- Docling document parser;
- Temporal durable-runtime adapter alongside DBOS;
- S3-compatible object-store adapter alongside local storage;
- OpenTelemetry instrumentation/export path alongside structured logs;
- PostgreSQL server persistence and pgvector semantic retrieval path;
- Vision analysis capability using configured `vision_model` through the reasoning/provider boundary;
- MapLibre GIS workspace/provider boundary;
- Tauri desktop host.

They may be disabled by default but must be implemented and tested.

## Explicit non-goals

Even this final baseline does not require:

- BIM authoring or replacing Revit/authoring tools;
- a general project-management/ERP replacement;
- a generic multi-agent framework;
- building a workflow engine, solver, parser, graph renderer, map renderer, or vector DB from scratch;
- legal-liability or final safety authority;
- unrestricted autonomous stop-work/procurement/payment/formal BIM modification;
- fake C-SMART/Procore/vendor integrations without real API contracts;
- a full mobile client.

## Competition proof

The main five-minute story remains Design Change -> Blocked -> coordinated action -> Re-check -> Ready. A secondary workforce/resource/process case must reuse the same core. Advanced integrations should be demonstrable through capability toggles, fixtures, or focused secondary flows without making the five-minute story fragile.
