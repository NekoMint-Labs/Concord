# Concord frontend surface audit

This audit is scoped to presentation only. Backend APIs, domain models, persistence,
source/revision/baseline semantics, BIM mappings, investigations, generated schema,
and desktop packaging remain unchanged.

Decision terms: **KEEP** retains the existing presentation structure; **REFACTOR**
keeps the surface and behavior but moves it onto the shared grammar; **REWRITE**
replaces the composition while preserving contracts; **REMOVE** deletes a redundant
presentation destination after its unique content is relocated.

## Checkpoint A — foundation and project flows

| Surface | Decision | Notes |
| --- | --- | --- |
| `frontend/src/App.tsx` | REFACTOR | Keep state and wiring; replace the shell framing and navigation placement. |
| `frontend/src/app/StartupView.tsx` | KEEP | Existing Chinese startup/recovery flow is compact and desktop-safe. |
| `frontend/src/app/ProjectSidebar.tsx` | REWRITE | Adopt sidebar-07 header/content/footer and switcher grouping; add compact workflow navigation, search, and project/work-package hierarchy. |
| `frontend/src/app/WorkspaceHeader.tsx` | REWRITE | Separate project/object context, destination navigation, and local actions into distinct compact bands. |
| `frontend/src/app/WorkspaceTabs.tsx` | REWRITE | Use `概览 / 模型 / 变更 / 问题 / 文档 / 运行检查`; keep project sources and site map secondary. |
| `frontend/src/app/WorkspaceViews.tsx` | REFACTOR | Preserve routing/pane behavior; consume shell navigation and shared states. |
| `frontend/src/app/AdvancedMenu.tsx` | REFACTOR | Keep temporary access now; consolidate diagnostic/runtime destinations in checkpoint C. |
| New Project dialog | REFACTOR | Compact Supabase-like field rhythm and secondary timezone disclosure. |
| Open Project dialog | REFACTOR | Keep searchable list; normalize spacing, localized demo names, and empty state. |
| Project Settings dialog | REFACTOR | Remove developer copy and keep a compact project fact/action surface. |
| Area / Work Package creation | REWRITE | Replace parallel CRUD columns with area selection/helper followed by one work-package form. |
| `frontend/src/features/CreateSourceDialog.tsx` | REFACTOR | Replace native select with the shared Radix select and natural Chinese labels. |
| `frontend/src/features/EventComposer.tsx` | REFACTOR | Keep the compact operational dialog; final copy/field pass in checkpoint C. |
| `frontend/src/components/WorkspaceState.tsx` | REWRITE | One grouped loading/empty/error grammar for workspaces and viewer failures. |
| `frontend/src/components/ViewerBoundary.tsx` | REFACTOR | Use the shared recoverable error state. |
| `frontend/src/components/Status.tsx` | REFACTOR | Preserve centralized vocabulary; present semantic states as restrained dot-and-label indicators rather than capsules. |
| `frontend/src/components/PropertyTable.tsx` / `DetailInspector.tsx` | REWRITE | Shared property rows, grouped metadata, inspector headers, tabs, and close behavior across engineering surfaces. |
| `frontend/src/components/ui/*` | KEEP | Radix/shadcn-style implementation primitives remain the sole control layer. |
| `frontend/src/layout/PaneSplit.tsx` / `paneBudget.ts` | REFACTOR | Preserve resize and keyboard behavior; add vertical inspector stacking at constrained desktop width. |

## Checkpoint B — engineering workspaces

| Surface | Decision | Notes |
| --- | --- | --- |
| `frontend/src/features/CoordinationWorkspace.tsx` | REWRITE | Build the approved overview composition: dominant model/overview area, version/resources, right inspector, and lower operational lists. |
| `frontend/src/features/ProjectSources.tsx` | REWRITE | Use a Supabase-like list/detail/revision rhythm with fewer stacked blocks. |
| `frontend/src/features/Documents.tsx` | REFACTOR | Preserve evidence behavior; align toolbar, rows, empty states, and inspector rhythm. |
| `frontend/src/features/WorkPackages.tsx` | REWRITE | Repurpose the redundant package table as the `问题` workspace: blocking constraints, affected packages, package readiness, and recent handling activity. |
| `frontend/src/features/ImpactGraph.tsx` | REWRITE | Keep React Flow as selected-change detail beside a scanable engineering change register. |
| `frontend/src/features/RevisionImpact.tsx` | REFACTOR | Replace native comparison controls and localize change metadata. |
| `frontend/src/features/BimMappingWorkspace.tsx` | REWRITE | Preserve mapping semantics; replace the custom control island with shared panes and selects. |
| `frontend/src/viewers/BIMWorkspace.tsx` | REFACTOR | Preserve the engine; rebuild viewer chrome, filters, model context, and detail treatment. |
| `frontend/src/viewers/IFCViewer.tsx` | KEEP | Focused engine boundary; surrounding chrome changes at the parent surface. |
| `frontend/src/viewers/GISWorkspace.tsx` | REFACTOR | Preserve MapLibre behavior; align toolbar, selection, fallback, and neutral palette. |
| `frontend/src/features/BaselineHistory.tsx` | REFACTOR | Move native disclosure to the shared disclosure/details grammar. |

## Checkpoint C — operational detail and diagnostics

| Surface | Decision | Notes |
| --- | --- | --- |
| `frontend/src/features/ConcordAgent.tsx` | REWRITE | Replace AI-form/popover composition with a compact operational investigation entry. |
| `frontend/src/features/InvestigationInspector.tsx` | REWRITE | Trigger.dev-like context/evidence/activity/metadata/linked-entity detail pane. |
| `frontend/src/features/Inspector.tsx` | REFACTOR | Preserve evidence, approval, and risk behavior; unify tabs/property groups and action hierarchy. |
| `frontend/src/features/Timeline.tsx` | REMOVE | Delete the detached global strip; selected-run activity now belongs to the persistent Run History detail pane. |
| `frontend/src/features/RunHistory.tsx` | REWRITE | Operational run list/detail instead of a diagnostic selector plus raw disclosure. |
| `frontend/src/features/Operations.tsx` | REWRITE | Replace the developer test bench with coherent checks, results, and selected-run detail. |
| `frontend/src/features/Capabilities.tsx` | REFACTOR | Keep health facts; localize backend terminology and use shared property/table rows. |
| `frontend/src/features/SemanticRetrieval.tsx` | REFACTOR | Preserve consent and retrieval behavior; move provider/debug language into advanced detail. |
| Menus, popovers, tooltips, confirmations, toasts | REFACTOR | Final consistency/copy pass; no browser-native core-flow control leakage. |
| `frontend/src/styles/features/operations.css` | REWRITE | Remove the developer-console/card stack after the operations composition changes. |
| Remaining feature styles | REFACTOR | Delete obsolete selectors and retain one presentation system after migration. |

## Cross-surface findings

- The previous shell used a visibly grey navigation slab and separate tab band; both
  conflicted with the approved wide mock.
- Native select leakage existed in project structure, source creation, BIM mapping,
  revision comparison, investigation settings, and advanced tools. Production core
  flows now use the shared Radix select; the only native select is a test mock.
- The largest presentation islands are Coordination, Project Sources, BIM Mapping,
  Concord Agent, and Operations.
- Fixture-owned English project/area/work-package names are localized only at the
  existing demo presentation boundary. User-authored/imported content remains intact.
