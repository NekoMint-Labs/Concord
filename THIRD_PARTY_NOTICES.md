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

## IfcClash 0.8.5

- Project: IfcClash, distributed by the IfcOpenShell project
- Source: https://github.com/IfcOpenShell/IfcOpenShell/tree/16723d11cab9bc8a13b4e025a00d39445ccc462e/src/ifcclash
- Package: https://pypi.org/project/ifcclash/0.8.5/
- License: GNU Lesser General Public License v3.0 or later
- Use: targeted intersection, collision, and clearance runs behind `IfcClashAdapter`
- Modification: none; SDK records are normalized into project-owned changes and evidence

## IfcTester 0.8.5

- Project: IfcTester, distributed by the IfcOpenShell project
- Source: https://github.com/IfcOpenShell/IfcOpenShell/tree/16723d11cab9bc8a13b4e025a00d39445ccc462e/src/ifctester
- Package: https://pypi.org/project/ifctester/0.8.5/
- License: GNU Lesser General Public License v3.0 or later
- Use: IDS parsing and validation behind `IfcTesterAdapter`
- Modification: none; failures are normalized into project-owned IDS evidence

## bcf-client 0.8.5

- Project: IfcOpenShell BCF client
- Source: https://github.com/IfcOpenShell/IfcOpenShell/tree/16723d11cab9bc8a13b4e025a00d39445ccc462e/src/bcf
- Package: https://pypi.org/project/bcf-client/0.8.5/
- License: GNU General Public License v3.0
- Use: optional BCF 2.1 viewpoint read/write behind `BCFAdapter`
- Modification: none; BCF XML remains the interchange format
- Boundary: the 0.8.5 package metadata declares GPLv3; the upstream source tree also contains COPYING and COPYING.LESSER. Treat the published package as GPLv3 for this pre-integration work until the discrepancy is resolved. Optional installation does not remove license obligations. IfcTester also depends on bcf-client, so this is a BIM-extra distribution consideration, not only a BCF feature switch. No production packaging qualification is claimed here.

## RapidOCR 3.9.2

- Project: RapidOCR
- Source: https://github.com/RapidAI/RapidOCR/tree/v3.9.2
- Package: https://pypi.org/project/rapidocr/3.9.2/
- License: Apache License 2.0 (upstream project)
- Use: explicit, local, lazy-loaded Chinese OCR through Docling; model files are provisioned separately
- Modification: none; OCR confidence and source provenance remain attached to extracted chunks

## ONNX Runtime 1.24.4

- Project: ONNX Runtime
- Source: https://github.com/microsoft/onnxruntime/tree/v1.24.4
- Package: https://pypi.org/project/onnxruntime/1.24.4/
- License: MIT License
- Use: local RapidOCR execution provider
- Modification: none

## Docling 2.126.0

- Project: Docling
- Source: https://github.com/docling-project/docling
- Package: https://pypi.org/project/docling/2.126.0/
- License: MIT License (upstream project)
- Use: structured PDF, Office, CSV, Markdown, HTML, and opt-in image ingestion
- Modification: none; the Concord normalizer retains source locations and table structure

## Viewer and reference donors

The following repositories are pinned for Issue #17. Drawing and CAD now have
isolated local integrations; product composition, authoritative publication and
complete product qualification remain incomplete. Original licenses are kept
beside vendored source. C-owned adaptation notes are in each vendor README.

| Repository | Revision | License | Concord use |
| --- | --- | --- | --- |
| Kentucky-ai/opentakeoff | `60c82e34b389384401a083cefeb9389f89fbaae1` | Apache-2.0 | Unchanged geometry/preview/annotation helpers; adapted native annotation workbench and render/worker factories; bounded donor history; no estimating model imported |
| a-subhaneel/pdf-diff-viewer | `96af1ce5caa0b27b3b4a2e14ef3c16aed0842170` | MIT | Vendored engine adapted for OffscreenCanvas workers, local PDF.js, bounded regions and Blob output |
| mlightcad/cad-viewer | `250533a861e9fa1feca739b6783286ed4e91674a` | MIT | Independently locked SDK plus vendored diff widget; comparison moved to a worker; native entity selection/targeting; DXF-only; no DWG converter installed |
| j03rul4nd/ifc-viewer-online | `5073adf1f5fadef76129460555482b6507c2be74` | MIT | Independently built self-hosted app and vendored SDK; native GUID lookup, same-origin messaging, local WASM/worker assets and hash/engine geometry/tree caches |

### Native AEC connector boundary

Revit, AutoCAD, and Navisworks files are not parsed by reverse-engineered readers in Concord. A future connector must run in the host application or an approved conversion service, emit a documented artifact, and upload that artifact through `ProjectSourceRevision`. The connector boundary is informed by Speckle's public connector architecture:

- Source: https://github.com/specklesystems/speckle-sharp-connectors/tree/195556ba551be739b8313526cceea0ecb254ef72
- License: Apache-2.0
- Use: architecture reference only; Speckle Server types are not imported into Concord's domain

### DWG boundary

LibreDWG and other GPL-based DWG paths are not dependencies of Concord Core. DWG support remains an explicitly isolated optional capability or an approved native AutoCAD conversion path until licensing and distribution are separately approved.


## xmlschema 4.3.2

- Project: xmlschema
- Source: https://github.com/sissaschool/xmlschema
- Package version: `uv.lock` records the resolved version
- License: MIT
- Use: validate against IfcTester's bundled IDS XSD with local schema imports, defused XML resources and uploaded schema hints disabled
- Modification: none; IDS semantics and parsing remain in IfcTester

## PDF.js 4.10.38

- Project: Mozilla PDF.js
- Package: `pdfjs-dist` 4.10.38; integrity is recorded in `frontend/pnpm-lock.yaml`
- License: Apache-2.0
- Use: local PDF rendering/parsing for the adapted OpenTakeoff drawing surface and pdf-diff-viewer worker
- Modification: none; worker, standard fonts and CMaps are bundled locally

## mlightcad isolated SDK dependencies

`frontend/viewer-integrations/cad/pnpm-lock.yaml` pins the viewer's own runtime:
`cad-simple-viewer`, `cad-diff-viewer` and `three-renderer` 1.7.3;
`data-model` 1.15.1; `mtext-parser` 1.5.3; `mtext-renderer` 0.13.2;
Three.js 0.172.0 and lodash-es 4.17.21. These packages declare MIT licenses.
The independent runtime does not replace Concord's existing Three/IFC versions.
No LibreDWG or proprietary DWG converter is installed or registered.

The original cad-diff-viewer source is kept under the isolated viewer's `vendor/`
with its MIT license. Its only widget adaptations restrict DXF input and await
an off-thread comparison. The donor compare algorithm remains unchanged.

## IFC Viewer Online isolated build

The original npm package-lock is verified against SHA-256
`cd7223b245b36d2e0534bbed4499185e94647ae56463ec95632f8dd105db7ea0`.
It isolates its React/That Open/Three runtime inside one active iframe and does
not upgrade Concord's existing IFC packages. The build copies original npm
license/notice texts and a dependency/version/license inventory next to its
local assets; this is attribution preparation, not production license approval.
The SDK's original MIT license is kept under frontend/vendor/ifc-viewer-online.

Ten recorded source patches add origin checks, SDK GUID/diagnostic/BCF queries,
local workers/WASM, the fragment SDK's native GUID attribute fallback,
full-hash/versioned geometry keys, native fragment-based ModelTree indexing
and bounded spatial-tree caching, and remove the site's
service-worker/font-stylesheet hooks. The Concord SDK uses the donor's existing
toolbar/sidebar URL overrides. No renderer, inspector, section or measurement
engine is independently rewritten. Cache/tree output remains viewer-local;
canonical contracts remain separate acceptance work. BCF overlays use the donor's
XML parser/writer and coordinate conversion, native cameras, sections and
selection. Narrow changes retain orthogonal camera optics and bound archive
expansion. Export uses BCF 3.0 bytes; no proprietary viewpoint format is added.
Perspective/orthogonal Golden browser outputs are read independently by the
pinned IfcOpenShell BCF SDK to verify source axes, selection, clipping and PNG
snapshots. Complete BCF extension/visibility/coloring roundtrip is not claimed.

### OpenTakeoff annotation workbench adaptations

The pinned `AnnotationWorkbench.jsx` hook, native SVG ink and controls are adapted
behind C's Drawing surface. `AnnotationWorkbench.patch` records the changes;
`annotation-upstream.json` records five original SHA-256 hashes. Annotation
helpers/styles are unchanged; the donor history function is extracted unchanged.
The host excludes estimating/RFI links and symbol sweep, replaces unused compact
chrome and icon dependencies, scopes keyboard handling and bounds preference
reads, history and annotation data. Source/hash/page identity is normalized by
Concord's local adapter. Native PDF text highlighting uses PDF.js and donor text
geometry. Original Apache-2.0 attribution and source adaptation verification are
retained. These files do not add donor persistence or coordination semantics.

### Drawing raster artifact reuse

OpenTakeoff's unchanged preview budget and native text quad helper are used with
PDF.js to derive bounded all-page rasters and text. The C-owned cache retains
only PNG blobs/metadata, keyed by full source hash, the recorded donor revision,
PDF.js 4.10.38 and fixed raster options. The parser worker is destroyed after
preparation; cache painting uses browser ImageBitmap and closes decoded pixels.
The TypeScript preview binding is generalized to its consumed numeric viewport
shape without modifying the donor helper. No additional dependency, native
parser, server persistence or authoritative coordination model is introduced.

Navisworks IFC staging is unavailable until a real host conversion path is
qualified. The pinned Speckle Sharp Connectors reference inspected above has no
Navisworks implementation. Revit/AutoCAD staging is exported-byte validation;
these boundaries are not redistributed native Autodesk SDKs or host installers.
