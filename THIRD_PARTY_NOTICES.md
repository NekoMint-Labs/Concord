# Third-party notices

## MinIO RELEASE.2025-09-07T16-13-09Z (CI fixture only)

- Source: https://github.com/minio/minio/releases/tag/RELEASE.2025-09-07T16-13-09Z
- License: GNU Affero General Public License v3.0; upstream source and license are available at the release link
- Use: ephemeral loopback-only S3 service for real storage integration tests
- Modification: none; CI downloads the official binary and verifies its pinned SHA-256 as on main
- Distribution: not bundled in the application, desktop installers or release artifacts
- Replaceability: test-service provisioning only; the application retains its S3-compatible storage adapter

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

## ThatOpen UI component donor

- Project: `@thatopen/ui` from ThatOpen/engine_ui-components
- Source revision: `c998a4a49ff9b2fa09ef67eb91d36067e7897f2f` (donor checkout used for the migration audit)
- Source: https://github.com/ThatOpen/engine_ui-components/tree/c998a4a49ff9b2fa09ef67eb91d36067e7897f2f/packages/core
- Package: `@thatopen/ui@3.4.14`, installed as a frontend runtime dependency
- License: MIT; upstream license: https://github.com/ThatOpen/engine_ui-components/blob/c998a4a49ff9b2fa09ef67eb91d36067e7897f2f/LICENSE.md; distributed copy: `frontend/public/licenses/ThatOpen-UI-MIT.txt`
- Adopted components: `bim-grid`, `bim-toolbar`, `bim-panel`, `bim-panel-section`, `bim-table`, and `bim-viewport`. Registration is initialized once through `Manager.init("", false)` in `frontend/src/main.tsx`; Concord retains its own reduced-motion policy rather than donor load animations.
- Concord integration: `frontend/src/components/ThatOpenUI.tsx` and `ThatOpenDataTable.tsx`; WorkspaceHeader/WorkspaceChrome/AppDialog toolbars; WorkList/FindingWorkbench/EvidenceWorkspaceHost panels and grid; ProjectHome/ProjectOverview/ProjectSourceRegister panels and sections; ProjectExplorer tables; ModelWorkspaceView viewport host; WorkspaceState panels; token bridge in `frontend/src/styles/base.css`.
- Modifications: thin React adapters assign Lit properties through element refs, retain header-action events through stable slot portals, and append a reduced-motion override to TableRow static styles before Lit finalization; Concord retains its domain data, routing, query identities, viewer ownership, palette, typography, and interaction semantics. No donor branding, estimating semantics, fonts, or palette were copied.

## OpenTakeoff workbench donor

- Project: OpenTakeoff, Copyright 2026 Kentucky AI and the OpenTakeoff contributors
- Source revision: `60c82e34b389384401a083cefeb9389f89fbaae1`
- Source: https://github.com/Kentucky-ai/opentakeoff/tree/60c82e34b389384401a083cefeb9389f89fbaae1
- License: Apache-2.0; distributed copy: `frontend/public/licenses/OpenTakeoff-APACHE-2.0.txt`
- Upstream NOTICE: retained in `frontend/public/licenses/OpenTakeoff-NOTICE.txt`
- Directly ported/adapted: `web/src/lib/workspaceLayout.js`, `web/src/lib/focusMode.js`, `web/src/components/WorkspaceLayout.jsx`, `web/src/components/WorkspaceChrome.jsx`, `web/src/components/WorkspacePanel.jsx`, and applicable `workspaceChrome.css` / `workspacePanel.css` rules.
- Concord files: `frontend/src/layout/workspaceLayout.ts`, `WorkspaceLayout.tsx`, `focusMode.ts`; `frontend/src/app/WorkspaceChrome.tsx`; `frontend/src/features/FindingWorkbench.tsx`; `frontend/src/styles/workbench.css`.
- Modifications: TypeScript, Chinese localization, Concord navigation and fixture Finding/evidence data, existing Concord UI primitives/Panes/motion/tokens. Removed estimating, quantities, pricing, premium and alternative appearance concepts. Panel resizing remains in Concord's existing `PaneSplit` rather than a competing resize mechanism.
- No upstream fonts/tokens, engineering parsers, viewer runtime or donor-specific domain contracts are installed or copied. Fixtures never enter project persistence.

- Issue #16 content-conformance pass additionally inspected current donor revision `788e39bfe9c42b3260ea75e84a655e4574f9bc8c`: `WorkspacePanel.jsx`, `workspacePanel.css`, `WorkspaceChrome.jsx`, `workspaceChrome.css`, `WorkspaceLayout.jsx`, and `lib/workspaceLayout.js`. Adapted its filters → compact rows → selected-object inspector → receipt-note/progressive-disclosure composition for engineering Findings, Evidence and separate Coordination/ReCheck records. Existing shell/layout ports remain based on the revision above; no estimating-domain code or new viewer runtime was added.

## Lit runtime

- Package: `lit@3.3.1`, the same version used by `@thatopen/ui@3.4.14`
- Source: https://github.com/lit/lit
- License: BSD-3-Clause; distributed copy: `frontend/public/licenses/Lit-BSD-3-Clause.txt`
- Use: the native `css` tagged template to extend the donor shadow-root reduced-motion policy, without copying its implementation
- Modification: none to Lit; no separate Lit application, state owner or component family is introduced
