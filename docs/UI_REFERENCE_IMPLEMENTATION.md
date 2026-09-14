# UI reference implementation map

Patterns are adapted to Concord's React/CSS/CVA/Radix Slot/Lucide stack; no dependency or copied source is introduced.

## App shell

**Reference:** `satnaing/shadcn-admin/src/components/layout/app-sidebar.tsx`; `supabase/supabase/apps/studio/components/layouts/DefaultLayout.tsx`; `supabase/supabase/apps/studio/components/layouts/ProjectLayout/index.tsx`.

**Borrow:** stable work-package navigation beside a dominant task workspace; secondary panels only consume space when opened.

**Do not borrow:** admin information architecture, resizable-panel dependency, analytics surfaces, product navigation, or visual identity.

## Sidebar / work-package navigation

**Reference:** `shadcn-ui/ui/apps/v4/registry/new-york-v4/ui/sidebar.tsx` (`SidebarProvider`, `Sidebar`, `SidebarInset`, `SidebarMenuButton`); `shadcn-ui/ui/apps/v4/registry/new-york-v4/blocks/sidebar-03/components/app-sidebar.tsx`; `satnaing/shadcn-admin/src/components/ui/sidebar.tsx` and `src/context/layout-provider.tsx`.

**Borrow:** header/content/footer hierarchy, quiet selected rows, and separation of persistent layout state from product state.

**Do not borrow:** the full provider/sheet/cookie implementation or a new layout-state store. Concord has one desktop-first shell and no installed Radix dialog/menu primitives.

## Contextual detail panel

**Reference:** `supabase/supabase/apps/studio/components/layouts/ProjectLayout/LayoutSidebar/LayoutSidebarProvider.tsx`; `triggerdotdev/trigger.dev/apps/webapp/app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.runs.$runParam/route.tsx` (`TraceView`).

**Borrow:** selection opens a supplementary panel; closing it restores the dominant work surface without losing the current selection.

**Do not borrow:** URL-persisted panel registration, resizable panel machinery, trace architecture, or Supabase/Trigger product behavior.

## Impact Graph

**Reference:** `xyflow/xyflow/examples/react/src/examples/CustomNode/index.tsx` (`CustomNodeFlow`).

**Borrow:** React Flow remains the graph implementation, uses explicit semantic node data, `fitView`, bounded zoom, and selection callbacks.

**Do not borrow:** custom graph-engine behavior, minimaps, animated edges, or decorative canvas treatment.

## Run status

**Reference:** `triggerdotdev/trigger.dev/apps/webapp/app/components/runs/v3/TaskRunStatus.tsx`; `RunStatusCellTooltip.tsx`; run list and detail routes above.

**Borrow:** one compact semantic status at the decision surface; detailed execution traces are opened deliberately rather than always displayed.

**Do not borrow:** debugger timeline UI, bulk operations, monitoring metrics, or Trigger status taxonomy.

## Status indicators

**Reference:** `triggerdotdev/trigger.dev/apps/webapp/app/components/runs/v3/TaskRunStatus.tsx`; `satnaing/shadcn-admin/src/styles/theme.css`.

**Borrow:** restrained semantic colour and a small token set for surfaces, borders, text, and status.

**Do not borrow:** status icon mappings, chart tokens, dark theme, or dashboard colour systems.

## Interaction primitives

**Reference:** `shadcn-ui/ui/apps/v4/registry/new-york-v4/ui/sidebar.tsx` (`SidebarTrigger`, tooltip-aware menu button) and existing Concord `frontend/src/components/ui/button.tsx`.

**Borrow:** accessible native buttons, visible focus treatment, concise labels, and disclosure before detail.

**Do not borrow:** additional shadcn/Radix components or dependencies. Existing native `<details>` and the project-owned Button cover this pass.

## Desktop softness: square frame, soft objects

**Reference:** `desktop/desktop` (`app/styles/_variables.scss`, `ui/_button.scss`, `ui/_popover.scss`, `ui/_popup.scss`, `ui/_tab-bar.scss`, `mixins/_textboxish.scss`); `spacedriveapp/spaceui` (`packages/primitives/src/Button.tsx`, `Layout.tsx`, `Tabs.tsx`, `Card.tsx`, `Badge.tsx`, `TabBar.tsx`); `spacedriveapp/spacedrive` (`packages/interface/src/ShellLayout.tsx`, `.tasks/interface/UI-000-interface-v2.md`).

**Borrow:** GitHub Desktop's calibration that controls, inputs, and popovers share one small radius (6px there, with a 3px variant for outlines) while tab items stay square, and SpaceUI's compact bordered controls whose interaction is carried by a hover overlay rather than a fill.

**Do not borrow:** GitHub Desktop's product identity, SpaceUI's full-round TabBar/Badge pills, or Spacedrive V2's deliberate move to larger radii (`rounded-lg` over `rounded-md`) and translucent floating chrome.

**Radius scale** (`frontend/src/styles/base.css`): `--radius-xs: 3px` for inline text highlights; `--radius-sm: 5px` for buttons, inputs, selects, selected/hover rows, and menu items; `--radius-md: 7px` for dropdowns, popovers, and small floating panels; `--radius-lg: 9px` for the modal overlay only.

The app shell, sidebar and topbar outer edges, the inspector and workspace split, the tab strip, tables, and large workspace regions stay at `0px`. Rounding an interactive object must never round the frame that contains it.

## Licenses

The references were inspected as implementation patterns only. Concord contains no copied external source. shadcn/ui and xyflow are MIT; shadcn-admin is MIT; Supabase and Trigger.dev are Apache-2.0; GitHub Desktop and SpaceUI are MIT; Spacedrive is Functional Source License 1.1, inspected for layout composition only. No attribution notice is required for the independently implemented adaptations in this repository.
