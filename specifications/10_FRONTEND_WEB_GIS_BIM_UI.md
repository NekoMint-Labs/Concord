# Frontend constraints — former direction retired

**Retired:** the old frozen shadcn/frontend direction and required-view layout list
are not a current UI implementation plan. Do not reconstruct a dashboard, six-tab
shell or a competing ThatOpen shell from the previous handoff.

[PRODUCT_WORKFLOW](../docs/PRODUCT_WORKFLOW.md) owns code-derived product behavior.
[UI_DONOR_MIGRATION_MAP](../docs/UI_DONOR_MIGRATION_MAP.md) owns B donor provenance;
[EVIDENCE_VIEWER_ADAPTERS](../docs/EVIDENCE_VIEWER_ADAPTERS.md) owns the B/C boundary.
C modules/assets/dependencies remain pending local integration; source composition
is not acceptance. [VERIFICATION](../VERIFICATION.md) records that limit.

## Retained durable constraints

- React/Vite/TypeScript UI is shared by Web and Tauri; Web builds independently.
- Generate schemas from backend OpenAPI; do not invent parallel domain DTOs or
  hand-edit generated files. Query owns server cache; local React state owns
  transient interaction. No speculative global store or second workflow engine.
- Reconcile final server facts after run events/mutations. Execution completion,
  viewer handoff and AI explanation never authorize a human engineering decision.
- Keep SDK instances/geometry in viewers; lazy-mount only active heavy surfaces.
  Preserve revision/hash/target identities and fail explicitly rather than guessing.
- Impact Graph uses relevant domain subgraphs, not the whole project universe.
- GIS uses MapLibre/project-owned geo data where available; no mandatory commercial
  tile API for local startup. Missing data/capability is visible, not fabricated.
- Keyboard/focus/accessible names, bounded lists, reduced motion and usable navigation
  during long runs remain constraints, not evidence that every current path passed.
