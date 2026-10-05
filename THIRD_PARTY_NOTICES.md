# Third-party notices

B attribution below describes current local files. The PR22 C section records the
actual inspected dependency at `9feb7120707e127a6f5280eaed453e2c7d2d099f`, locally
rehearsed but pending merge/rebase; its paths/versions do not imply installation in this B worktree,
accepted product integration or approved release distribution.

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

These are historical interaction references for project-owned components, not
current alternative shell architectures. No source package from these four projects
is vendored or installed; actual B shell vendoring and C viewer dependencies are
listed separately below. Their public implementations were reviewed for interaction
patterns and the design lineage is retained.

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
- Remaining production components: `bim-toolbar`, `bim-panel`, `bim-panel-section`, `bim-table`, and `bim-viewport`. `bim-grid` still has an adapter/test but no current production composition. Registration uses `Manager.init("", false)` in `frontend/src/main.tsx`; Concord retains its reduced-motion policy.
- Actual remaining integration: `ThatOpenUI.tsx` / `ThatOpenDataTable.tsx`; AppDialog toolbar; AppMenu panel and AppDisclosure sections; EvidenceWorkspaceHost panel; ProjectHome/ProjectOverview panels; ProjectSourceRegister sections/table; ProjectExplorer and Capabilities tables; ModelWorkspaceView viewport; WorkspaceState panel. WorkspaceHeader and WorkList were removed; WorkspaceChrome, WorkPanel and the docked shell are now OpenTakeoff markup, not ThatOpen grid/toolbar composition.
- Modifications: thin React adapters assign Lit properties through element refs, retain header-action events through stable slot portals, and append a reduced-motion override to TableRow static styles before Lit finalization; Concord retains its domain data, routing, query identities, viewer ownership, palette, typography, and interaction semantics. No donor branding, estimating semantics, fonts, or palette were copied.

## OpenTakeoff B workspace donor

- Project: OpenTakeoff, Copyright 2026 Kentucky AI and the OpenTakeoff contributors
- Source revision: `788e39bfe9c42b3260ea75e84a655e4574f9bc8c`
- Source: https://github.com/Kentucky-ai/opentakeoff/tree/788e39bfe9c42b3260ea75e84a655e4574f9bc8c
- License: Apache-2.0; distributed copy: `frontend/public/licenses/OpenTakeoff-APACHE-2.0.txt`
- Upstream NOTICE: retained in `frontend/public/licenses/OpenTakeoff-NOTICE.txt`
- Copied verbatim into `frontend/src/vendor/opentakeoff/` (byte-identical, unmodified):
  `web/src/styles/app.css` → `styles/app.css`,
  `web/src/styles/premiumWorkspace.css` → `styles/premiumWorkspace.css`,
  `web/src/components/workspaceChrome.css` → `components/workspaceChrome.css`,
  `web/src/components/workspacePanel.css` → `components/workspacePanel.css`.
- Adapted: `web/src/styles/tokens.css` → `frontend/src/vendor/opentakeoff/styles/tokens.css`; the sole Concord adaptation is removal of the remote Google Fonts `@import` for local/offline-safe operation. Typography tokens and font-family fallback stacks are unchanged; this file is no longer byte-identical.
  Provenance and per-file digests: `frontend/src/vendor/opentakeoff/README.md`.
- Ported to TypeScript with only type annotations added: `web/src/brand/icons.jsx` → `brand/icons.tsx`, `web/src/lib/ui.js` → `lib/ui.ts`, `web/src/lib/keys.ts` → `lib/keys.ts`.
- Ported with product edits (dock set / layout key / copy): `web/src/lib/workspaceLayout.js` → `frontend/src/layout/workspaceLayout.ts`; `web/src/lib/focusMode.js` → `frontend/src/layout/focusMode.ts`; `web/src/components/WorkspaceLayout.jsx` → `frontend/src/layout/WorkspaceLayout.tsx`; `web/src/components/WorkspaceChrome.jsx` → `frontend/src/app/WorkspaceChrome.tsx`; `web/src/components/WorkspacePanel.jsx` → `frontend/src/features/WorkPanel.tsx`.
- Modifications: TypeScript, Chinese product copy, Concord navigation and Finding/evidence data, and the Concord dock set (Work and the source navigator; the donor measuring-tools/Sheets/Takeoffs docks have no Concord counterpart). Removed estimating, quantities, pricing, premium, OCR, geometry and alternative-appearance concepts.
- No upstream font binaries or replacement font assets are installed; `styles/tokens.css` no longer imports remote Google Fonts. No-egress behavior still requires build/browser verification, not an assumption from this notice. B copied no engineering parser/viewer runtime or donor-specific domain contract. C's separately pinned Drawing adaptation is listed below. Fixtures are not production fallback records.

## Lit runtime

- Package: `lit@3.3.1`, the same version used by `@thatopen/ui@3.4.14`
- Source: https://github.com/lit/lit
- License: BSD-3-Clause; distributed copy: `frontend/public/licenses/Lit-BSD-3-Clause.txt`
- Use: the native `css` tagged template to extend the donor shadow-root reduced-motion policy, without copying its implementation
- Modification: none to Lit; no separate Lit application, state owner or component family is introduced

## PR22 C engineering dependencies — pending local integration

Merged from the actual PR22 notice/provenance record, not the obsolete PR21 branch.
Source snapshot: [9feb7120707e127a6f5280eaed453e2c7d2d099f](https://github.com/NekoMint-Labs/Concord/tree/9feb7120707e127a6f5280eaed453e2c7d2d099f).
Paths in this section are **PR22 paths**, currently absent unless separately noted
above. Adapter-local qualifications do not qualify B's composed product, durable
runtime publication or native packaging. IFC asset preparation currently fails its
source-archive hash check; see [VERIFICATION.md](VERIFICATION.md).

### Python engineering/document packages

| Package | License / upstream | C use and modifications |
| --- | --- | --- |
| IfcClash 0.8.5 | LGPL-3.0-or-later; [IfcOpenShell source](https://github.com/IfcOpenShell/IfcOpenShell/tree/16723d11cab9bc8a13b4e025a00d39445ccc462e/src/ifcclash), [package](https://pypi.org/project/ifcclash/0.8.5/) | Targeted intersection/collision/clearance behind `IfcClashAdapter`; package unmodified, results normalized into project-owned records |
| IfcTester 0.8.5 | LGPL-3.0-or-later; [source](https://github.com/IfcOpenShell/IfcOpenShell/tree/16723d11cab9bc8a13b4e025a00d39445ccc462e/src/ifctester), [package](https://pypi.org/project/ifctester/0.8.5/) | IDS validation behind `IfcTesterAdapter`; package unmodified, violations mapped into revision/hash-bound Evidence |
| bcf-client 0.8.5 | Published package metadata: GPLv3; [source](https://github.com/IfcOpenShell/IfcOpenShell/tree/16723d11cab9bc8a13b4e025a00d39445ccc462e/src/bcf), [package](https://pypi.org/project/bcf-client/0.8.5/) | Optional BCF 2.1 viewpoint read/write behind `BCFAdapter`; package unmodified |
| RapidOCR 3.9.2 | Apache-2.0; [source](https://github.com/RapidAI/RapidOCR/tree/v3.9.2), [package](https://pypi.org/project/rapidocr/3.9.2/) | Explicit lazy local Chinese OCR through Docling; package unmodified, model files provisioned separately |
| ONNX Runtime 1.24.4 | MIT; [source](https://github.com/microsoft/onnxruntime/tree/v1.24.4), [package](https://pypi.org/project/onnxruntime/1.24.4/) | RapidOCR execution provider; unmodified |
| Docling 2.126.0 | MIT; [source](https://github.com/docling-project/docling), [package](https://pypi.org/project/docling/2.126.0/) | Structured PDF/Office/CSV/Markdown/HTML and opt-in image ingestion; unmodified package, Concord normalizer preserves locations/table structure |
| xmlschema 4.3.2 | MIT; [source](https://github.com/sissaschool/xmlschema) | IfcTester's bundled IDS XSD validation with local imports, defused resources and uploaded schema hints disabled; unmodified; resolved version in PR22 `uv.lock` |

**BCF license boundary:** upstream includes COPYING and COPYING.LESSER, but the
published bcf-client 0.8.5 metadata declares GPLv3. Treat that package as GPLv3 until
the discrepancy is resolved. IfcTester also depends on bcf-client: this affects
BIM-extra distribution, not only a BCF feature switch. Optional/lazy installation
never removes license obligations. No production packaging approval is claimed.

### Viewer donors

| Repository | Pinned revision | License | Actual C use |
| --- | --- | --- | --- |
| [Kentucky-ai/opentakeoff](https://github.com/Kentucky-ai/opentakeoff/tree/60c82e34b389384401a083cefeb9389f89fbaae1) | `60c82e34b389384401a083cefeb9389f89fbaae1` | Apache-2.0 | Drawing helpers, adapted annotation workbench and render/worker factories; **not** the B shell at `788e39b…` |
| [a-subhaneel/pdf-diff-viewer](https://github.com/a-subhaneel/pdf-diff-viewer/tree/96af1ce5caa0b27b3b4a2e14ef3c16aed0842170) | `96af1ce5caa0b27b3b4a2e14ef3c16aed0842170` | MIT | Vendored PDF diff engine adapted for OffscreenCanvas workers, local PDF.js, bounded regions and Blob output |
| [mlightcad/cad-viewer](https://github.com/mlightcad/cad-viewer/tree/250533a861e9fa1feca739b6783286ed4e91674a) | `250533a861e9fa1feca739b6783286ed4e91674a` | MIT | Independently locked SDK and vendored diff widget; worker comparison/native entity selection; DXF-only, no DWG converter |
| [j03rul4nd/ifc-viewer-online](https://github.com/j03rul4nd/ifc-viewer-online/tree/5073adf1f5fadef76129460555482b6507c2be74) | `5073adf1f5fadef76129460555482b6507c2be74` | MIT | Independently built self-hosted app/SDK; native GUID lookup, same-origin messaging, local WASM/workers and hash/versioned geometry/tree caches |

PR22 keeps original licenses with vendored source and adaptation notes in
`frontend/vendor/opentakeoff/README.md`, `frontend/vendor/pdf-diff-viewer/README.md`,
`frontend/vendor/ifc-viewer-online/`, and `frontend/viewer-integrations/{cad,ifc}/README.md`.
These are distinct from B's current `frontend/src/vendor/opentakeoff/README.md`.

**Drawing:** unchanged `geometry.js`, `sheetPreview.js`, `annotationTools.js` and
`AnnotationWorkbench.css`; unchanged extracted `recordCommand` history;
`noteFields.ts` retains a display constant only. `AnnotationWorkbench.jsx` is
adapted with `AnnotationWorkbench.patch` and five hashes in `annotation-upstream.json`.
Edits remove estimating/condition/RFI links and symbol sweep, redirect display
imports, scope keyboard handling and bound preferences/history/annotation data.
SheetPreview render/liveness and PDF worker canvas factories are adapted separately.
Native PDF text geometry and bounded raster artifacts use PDF.js. Annotation and
cache state is viewer-local, not authoritative Coordination/persistence.

**PDF.js 4.10.38:** [Mozilla PDF.js](https://github.com/mozilla/pdf.js), Apache-2.0,
`pdfjs-dist` integrity in PR22 `frontend/pnpm-lock.yaml`; unmodified package for
Drawing and PDF diff, with locally bundled worker, standard fonts and CMaps.

**CAD isolated dependencies:** PR22 `frontend/viewer-integrations/cad/pnpm-lock.yaml`
pins `cad-simple-viewer`, `cad-diff-viewer`, `three-renderer` 1.7.3; `data-model`
1.15.1; `mtext-parser` 1.5.3; `mtext-renderer` 0.13.2; Three.js 0.172.0 and lodash-es
4.17.21 (declared MIT). Recorded vendor patches restrict DXF, expose donor snapshots
and move matching/classification to a worker; the renderer/algorithm is not rewritten.
This independent runtime does not upgrade Concord's existing Three/IFC dependencies.
No LibreDWG or proprietary DWG converter is installed/registered by this integration.

**IFC isolated build:** original npm lock SHA-256
`cd7223b245b36d2e0534bbed4499185e94647ae56463ec95632f8dd105db7ea0`.
The React/That Open/Three runtime is isolated inside one active iframe. Twelve
recorded patches/overlays add origin checks, native GUID fallback and acknowledged
navigation, local workers/WASM, bounded native fragment/tree caches and BCF
queries; site service-worker/font-stylesheet hooks are removed. Donor selection,
cameras, sections, measurement and rendering are reused, not independently rebuilt.
The build copies npm license/notice texts and a dependency/version/license inventory
beside local assets. This is attribution preparation, **not release license approval**.
BCF uses donor XML/axes/native camera/selection tools (3.0 export, 2.1/3.0 reopening);
complete extension/visibility/coloring/attachment roundtrip is not claimed.

### Native AEC reference and unsupported inputs

[Speckle Sharp Connectors](https://github.com/specklesystems/speckle-sharp-connectors/tree/195556ba551be739b8313526cceea0ecb254ef72),
revision `195556ba551be739b8313526cceea0ecb254ef72`, Apache-2.0, is an architecture
reference only; no Speckle Server types enter Concord's domain. Staged Revit IFC
and AutoCAD DXF/PDF exported-byte validation is not a native host connector or a
redistributed Autodesk SDK. RVT/DWG/NWD/NWC are not reverse-engineered in Core.
Navisworks staging is unavailable: no real conversion path is qualified and that
Speckle revision has no Navisworks implementation. A future approved host/service
must upload documented artifacts through `ProjectSourceRevision`.

LibreDWG/GPL DWG paths are not Core dependencies. Any optional DWG/native host
integration requires separate license/distribution approval; web CAD support does
not change the existing desktop native import policy.

## Distribution obligations

Retain upstream copyright, license texts and applicable NOTICE files for B copies
and C adaptations; mark modified source and preserve recorded provenance/patches.
Apache-2.0 attribution is not permission to discard NOTICE; MIT/BSD notices must
travel with redistributed copies. LGPL/GPL components require a distribution review
covering corresponding source and other applicable obligations, including the
bcf-client transitive dependency. Check model/font asset rights and the full isolated
npm/runtime inventory before bundling. Concord's own no-license notice does not
replace third-party rights or satisfy these obligations. No release is approved by
this documentation merge.
