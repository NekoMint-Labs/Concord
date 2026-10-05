# Contributor constraint routing

Read [00_READ_ME_FIRST](00_READ_ME_FIRST.md) first. This is a constraint map,
not an autonomous execution contract. Current user scope takes priority.

## Mission

Preserve Concord's local-first construction coordination loop: trace project change
through impacts, constraints, resolutions, controlled actions and readiness rechecks.
Implement only the assigned scope; this document never authorizes a full rebuild.

Invariant loop:

`Event -> Impact -> Constraint -> Resolution -> Action -> Re-check`

The finished product is not a chatbot, not a generic project-management suite, and not an architecture-only proof.

## Authority

Priority: explicit current user scope; relevant durable safety/technical constraints;
current contracts and PRODUCT_WORKFLOW; retained requirements/intent; historical prose.
Retired UI directions, prompts and superseded frontend mandates have no authority.

If current third-party APIs differ from an example, consult current official documentation and make the smallest compatible adjustment without changing project-owned boundaries. Record the adjustment.

## Read by task

Read only the constraints needed for the concrete change. Architecture (`04`),
snapshot/Evidence (`05`) and security (`13`) apply when their boundaries are touched.
Routes below are relative to the repository root for `docs/` and to this directory
for numbered specifications:

| Work | Read |
|---|---|
| Product/UI/demo | `docs/PRODUCT_WORKFLOW.md`, then retained constraints in `02`, `03`, `10` |
| Domain/persistence/snapshot/evidence | `05`, `12` |
| Agent/LLM/vision | `06` |
| DBOS/Temporal/events/context/tools | `07` |
| Provider interfaces/integrations | `08` |
| IFC/Docs/OR-Tools | `09` |
| Frontend/BIM/GIS | `docs/PRODUCT_WORKFLOW.md`, `docs/EVIDENCE_VIEWER_ADAPTERS.md`, then `10` |
| Tauri/Desktop | `11` |
| Storage/retrieval/Postgres/pgvector | `12` |
| Security/approval/privacy | `13` |
| OTel/operations/capability health | `14` |
| Tests/CI/dependencies/licenses | `15` |
| Profiles/decision rationale | `16` |

## Non-negotiable invariants

1. Database/domain state is authoritative; LLM/chat/UI state is not.
2. Material analysis binds to `ProjectSnapshot`; consequential Findings cite Evidence.
3. Relevant revisions are revalidated before side effects; stale results stop and recompute.
4. LLM output is a structured Proposal only.
5. Side effects pass through `Schema -> Permission -> Business Rule -> Snapshot -> Approval -> Idempotency -> Execute -> Verify -> Audit`.
6. Domain/Application public contracts do not import peripheral framework types.
7. No arbitrary SQL, shell, unrestricted network, or unrestricted file-write tools are exposed to the agent.
8. Numeric constraints, permissions, geometry, scheduling, and readiness rules are deterministic code/tool responsibilities.
9. Demo data may be synthetic; final outcomes must not be hard-coded.
10. Advanced adapters must be real implementations, not empty interfaces, but the local default profile remains lightweight.
11. Never make PostgreSQL, Temporal, MinIO, OTel collector, cloud LLM credentials, or a dedicated service mandatory for local demo startup.
12. Do not fake vendor integrations when no real API contract/credential exists.

## Task scope and evidence

The former autonomous implementation posture and `17_FINAL_IMPLEMENTATION_PROMPT.md`
are retired. Follow current user scope, owner coordination and review gates in
[TEAM_DEVELOPMENT](../TEAM_DEVELOPMENT.md). Do not resume stopped work, widen a
documentation task or claim acceptance from requirements. [PRODUCT_WORKFLOW](../docs/PRODUCT_WORKFLOW.md)
owns current product behavior; [STATUS](../STATUS.md) and [VERIFICATION](../VERIFICATION.md)
separate historical main evidence from the unaccepted local integration.

When an in-scope external integration cannot be live-verified because credentials/service/runtime are unavailable:

- implement the adapter against the real documented API/library;
- add contract/unit tests and a deterministic fake where appropriate;
- add a health check and explicit capability state;
- add a reproducible integration-test/profile path;
- report live verification as unavailable, never as passed.
