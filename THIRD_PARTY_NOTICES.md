# Third-party notices

## IfcDiff 0.8.5

- Project: IfcDiff, distributed by the IfcOpenShell project
- Source: https://github.com/IfcOpenShell/IfcOpenShell/tree/main/src/ifcdiff
- Package: https://pypi.org/project/ifcdiff/0.8.5/
- License: GNU Lesser General Public License v3.0 or later
- Use: compares two IFC revisions and reports added, deleted, and changed GlobalIds
- Modification: none; Concord imports the published package through an adapter
- Replaceability: isolated behind `IfcComparisonEngine`; stored Concord records use project-owned models

IfcDiff is an optional BIM dependency. It is not vendored into this repository. The upstream
license and source remain available at the links above.

## Frontend interaction references

The Concord workspace uses project-owned React and CSS. No source package from the
projects below is vendored or installed. Their public implementations were reviewed
for established interaction patterns and are attributed here so the design lineage is
explicit.

### shadcn/ui

- Project: shadcn/ui
- Source revision: `98a1fe67b439324ddc857f47fbdce056600a4329`
- Source: https://github.com/shadcn-ui/ui/tree/98a1fe67b439324ddc857f47fbdce056600a4329/apps/v4/registry/bases/base/blocks/sidebar-07
- Referenced files: `components/app-sidebar.tsx`, `components/team-switcher.tsx`, `components/nav-main.tsx`, `components/nav-projects.tsx`, and `page.tsx`
- License: MIT, https://github.com/shadcn-ui/ui/blob/98a1fe67b439324ddc857f47fbdce056600a4329/LICENSE.md
- Use: directly adapted sidebar header/content/footer composition, project switcher action grouping, primary navigation rows, and grouped project/work-package navigation
- Modification: interaction structure was adapted to Concord's existing components, project lifecycle, work-package hierarchy, and Chinese interface; no upstream component was copied verbatim

### Supabase Studio

- Project: Supabase Studio
- Source revision: `1608b166872581ed84691f3025968efd0f3c2474`
- Sources:
  - https://github.com/supabase/supabase/blob/1608b166872581ed84691f3025968efd0f3c2474/apps/studio/components/layouts/DefaultLayout.tsx
  - https://github.com/supabase/supabase/tree/1608b166872581ed84691f3025968efd0f3c2474/apps/studio/components/layouts/ProjectLayout
  - https://github.com/supabase/supabase/blob/1608b166872581ed84691f3025968efd0f3c2474/apps/studio/components/interfaces/ProjectCreation/ProjectCreationForm.tsx
  - https://github.com/supabase/supabase/blob/1608b166872581ed84691f3025968efd0f3c2474/apps/studio/components/interfaces/Functions/FunctionsEmptyState.tsx
  - https://github.com/supabase/supabase/blob/1608b166872581ed84691f3025968efd0f3c2474/apps/studio/components/interfaces/Settings/Logs/LogTable.tsx
- License: Apache-2.0, https://github.com/supabase/supabase/blob/1608b166872581ed84691f3025968efd0f3c2474/LICENSE
- Use: directly adapted full-height shell composition, fixed chrome plus scrollable work region, compact project creation rhythm, first-run state hierarchy, persistent list/detail layout, and dense revision rows
- Modification: patterns were reimplemented with Concord's existing dialog, split-pane, button, and API contracts; no Supabase package or source file was copied

### Trigger.dev

- Project: Trigger.dev
- Source revision: `d8c3530cbe2cf42cb6c946c5ea98fcdc401c933f`
- Sources:
  - https://github.com/triggerdotdev/trigger.dev/blob/d8c3530cbe2cf42cb6c946c5ea98fcdc401c933f/apps/webapp/app/components/navigation/SideMenu.tsx
  - https://github.com/triggerdotdev/trigger.dev/tree/d8c3530cbe2cf42cb6c946c5ea98fcdc401c933f/apps/webapp/app/routes/_app.orgs.%24organizationSlug.projects.%24projectParam.env.%24envParam.runs.%24runParam
  - https://github.com/triggerdotdev/trigger.dev/tree/d8c3530cbe2cf42cb6c946c5ea98fcdc401c933f/apps/webapp/app/routes/_app.orgs.%24organizationSlug.projects.%24projectParam.env.%24envParam.webhooks.deliveries.%24deliveryParam
- License: Apache-2.0, https://github.com/triggerdotdev/trigger.dev/blob/d8c3530cbe2cf42cb6c946c5ea98fcdc401c933f/LICENSE
- Use: durable-run status placement, selected-run execution trace, property table, and evidence-oriented detail pane
- Modification: the detail pattern was reimplemented for Concord's existing `AgentRun` and `InvestigationReport` records; no Trigger.dev package or source file was copied

### Twenty UI

- Project: Twenty UI
- Source revision: `413ae94b2e7c226b174d22d8bd3deedddc6bbf88`
- Sources:
  - https://github.com/twentyhq/twenty/blob/413ae94b2e7c226b174d22d8bd3deedddc6bbf88/packages/twenty-ui/design-tokens/spacing.ts
  - https://github.com/twentyhq/twenty/blob/413ae94b2e7c226b174d22d8bd3deedddc6bbf88/packages/twenty-ui/design-tokens/table.ts
- License: MIT, https://github.com/twentyhq/twenty/blob/413ae94b2e7c226b174d22d8bd3deedddc6bbf88/packages/twenty-ui/LICENSE
- Use: visual reference for compact spacing and table density
- Modification: no Twenty application code, component, or token value was copied
