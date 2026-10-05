# Documentation integration audit

Code, not historical plans, is authoritative. Product behavior is consolidated in
[PRODUCT_WORKFLOW](PRODUCT_WORKFLOW.md); canonical types originate in
`backend/app/domain/{models,engineering,engineering_refs}.py` and API routes,
generated into `frontend/openapi.json` and `frontend/src/api/schema.ts`. Viewer
interfaces are the actual PR22 C exports; this branch consumes them after merge/rebase.
STATUS owns integration state; VERIFICATION owns measured gate evidence.

| Document | Action | Reason | Replacement/source of truth |
| --- | --- | --- | --- |
| README.md | UPDATE | Separate historical main acceptance from this dirty branch | STATUS / VERIFICATION |
| STATUS.md | UPDATE | Verified #19/#20/#22 heads; no false acceptance | Actual source/rehearsal results |
| PROJECT_LIFECYCLE_API.md | UPDATE | Retire A1-only milestone limits, preserve API semantics | A lifecycle source / generated contracts |
| TEAM_DEVELOPMENT.md | UPDATE | Explicit B host vs C SDK ownership | Actual A/B/C paths |
| VERIFICATION.md | UPDATE | Record reproducible blockers and unexecuted gates | Executed commands/artifacts |
| THIRD_PARTY_NOTICES.md | MERGE | Distinguish B and C donor revisions; retain all obligations | Vendor licenses, patches, manifests/locks |
| docs/PRODUCT_WORKFLOW.md | KEEP | Single current behavior description, code-derived | App / WorkPanel / FindingWorkbench / hooks |
| docs/EVIDENCE_VIEWER_ADAPTERS.md | MERGE | One B/C seam description, no competing abstractions | PR22 surface exports / generated targets |
| docs/ENGINEERING_COORDINATION.md | KEEP | Canonical #19 engineering contract explanation | A domain/API/application source |
| docs/AGENT_INTEGRATION.md | UPDATE | Scope current APIs and historical packaging evidence | A API / B selected Evidence context |
| docs/UI_DONOR_MIGRATION_MAP.md | UPDATE | OpenTakeoff owns product shell, ThatOpen remaining surfaces only | Actual vendor/source imports |
| docs/UI_DONOR_VERIFICATION.md | UPDATE | Prior visual results are historical, not integrated acceptance | VERIFICATION |
| docs/UI_REFERENCE_IMPLEMENTATION.md | MERGE | Remove competing Quiet Instrument/WP-01/fixture/ThatOpen-shell plans; redirect only | PRODUCT_WORKFLOW / donor map |
| docs/UI_SURFACE_AUDIT.md | ARCHIVE/DELETE | Retire old rewrite checklist; historical body removed, redirect retained | PRODUCT_WORKFLOW |
| docs/INTERACTION_INVENTORY.md | ARCHIVE/DELETE | Clearly label historical #10 evidence, not active guidance | PRODUCT_WORKFLOW / VERIFICATION |
| docs/INTERACTION_CONVERGENCE_GAPS.md | UPDATE | Separate canonical Findings from unsupported world-space/assignment semantics | A contracts / C target validation |
| PR22 docs/ENGINEERING_CAPABILITIES_ISSUE17.md | KEEP | C qualification/history and unfinished runtime work; not product authority | C source and its recorded tests |
| specifications/00_READ_ME_FIRST.md | UPDATE | Retire upload/execution bundle authority | Current scope / living source / product workflow |
| specifications/01_AGENTS.md | UPDATE | Route to current contracts and product behavior | Current owner/source paths |
| specifications/02_PRODUCT_REQUIREMENTS.md | UPDATE | Retire layout/donor mandates while keeping capability/safety intent | PRODUCT_WORKFLOW / A source |
| specifications/03_USER_EXPERIENCE_AND_DEMO.md | MERGE | Remove superseded fixed shell plan; keep behavior constraints | PRODUCT_WORKFLOW |
| specifications/04_SYSTEM_ARCHITECTURE.md | UPDATE | Keep dependency direction; retire single-viewer mandate | A core / B composition / C exports |
| specifications/05_DOMAIN_DATA_SNAPSHOT_EVIDENCE.md | KEEP | Durable snapshot/evidence ownership, not substitute DTO definitions | Canonical #19 domain source |
| specifications/06_AGENT_REASONING_MODELS.md | KEEP | Proposal-only reasoning safety | A policies/application |
| specifications/07_RUNTIME_WORKFLOWS_EVENTS.md | KEEP | Runtime/SSE safety boundaries | A runtime/application |
| specifications/08_PROVIDERS_INTEGRATIONS.md | KEEP | Provider boundary, no fake integrations | Actual A/C ports/adapters |
| specifications/09_BIM_DOCUMENTS_OPTIMIZATION.md | UPDATE | Retire frontend donor monopoly; retain backend constraints | C interfaces / A publication |
| specifications/10_FRONTEND_WEB_GIS_BIM_UI.md | MERGE | Retire old shell/layout plan; retain durable frontend constraints | PRODUCT_WORKFLOW / viewer seam |
| specifications/11_DESKTOP_TAURI.md | KEEP | Native safety and local runtime constraints | A desktop source / native evidence |
| specifications/12_PERSISTENCE_STORAGE_RETRIEVAL.md | KEEP | Persistence/derived-index boundaries | A persistence/application |
| specifications/13_SECURITY_PRIVACY_ACTIONS.md | KEEP | Permission/freshness/approval invariants | A policies/application |
| specifications/14_OBSERVABILITY_OPERATIONS.md | KEEP | No secret logging; explicit capability failure | Actual runtime/health source |
| specifications/15_ENGINEERING_TESTING_CI.md | KEEP | Verification discipline, not proof of completion | Workflows and executed gates |
| specifications/16_DEPLOYMENT_PROFILES_DECISIONS.md | UPDATE | Retire frozen shadcn/single-viewer direction and completion claim | Current manifests / STATUS |
| specifications/17_FINAL_IMPLEMENTATION_PROMPT.md | ARCHIVE/DELETE | Old autonomous build-everything prompt removed; retired redirect only | Current user scope / owner workflow |
| DEVELOPMENT.md / CONTRIBUTING.md | KEEP | Contributor process, not competing UI architecture | TEAM_DEVELOPMENT / VERIFICATION |

No historical filename was physically deleted in this pass. Superseded architecture
bodies were removed or explicitly retired; tiny redirects preserve incoming links.
No backend/API behavior was rewritten from documentation assumptions.
