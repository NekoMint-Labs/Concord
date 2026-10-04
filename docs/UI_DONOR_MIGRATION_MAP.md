# Issue #16 substrate replacement map

## Scope and baseline (before implementation)

Current working tree on `feat/16-product-workspace`, including untracked production files; not merely HEAD. Existing changes are preserved. Baseline recorded in `.verification-work/issue-16-substrate-replacement/baseline.json`: **13,218 CSS lines**, **14,118 production TSX lines** in `app/components/features/layout` (tests and fixtures excluded). Vendor output is excluded. Production, tests and documentation are counted separately.

Previous implementation was a **partial donor migration**: donor containers existed, while Concord/native buttons, inputs, menus, two Work search/selection models and a large custom stylesheet substrate remained. This document specifies replacements, not claims of completion.

## Replacement/deletion map

| Existing owner | Classification | Replacement / retained responsibility |
|---|---|---|
| `components/ui/button.tsx`, native ordinary buttons | REPLACE / KEEP FORM SEMANTICS | Real `bim-button` for ordinary actions. Native buttons remain inside real forms because donor buttons are not form-associated; native file controls and protected viewer internals are explicit exceptions. |
| Native ordinary search/text/number inputs | REPLACE / KEEP FORM SEMANTICS | Donor inputs for ordinary query controls, with React value/property binding and donor DOM event listeners. Retain native form fields, secret/file/date/checkbox/radio inputs and unsupported constraints; donor inputs cannot provide native validation or FormData. |
| `AppSelect` | REPLACE / BRIDGE | Donor dropdown/options where semantics match; controlled donor values are arrays. The real shadow combobox owns naming and focus; the adapter blocks disabled interaction and waits for asynchronous options. Rich labels are normalized to donor option text. Form-associated selectors remain native exceptions. |
| `AppMenu` | TEMPORARILY BRIDGE | Radix retains application menu semantics, roving focus, typeahead, dismissal and durable focus restoration. Donor contextual floating dialog is not an equivalent application menu. Donor controls own qualified trigger presentation; do not introduce a second modal/keyboard engine. |
| `AppDisclosure` | REPLACE / BRIDGE | `bim-panel-section` within donor panels; retain the free-standing accessibility/animation bridge where a donor panel section cannot preserve focusable content and lifecycle. |
| `AppPopover`, `AppTooltip` | REPLACE / TEMPORARILY BRIDGE | Donor tooltip anchored inside its stable trigger where qualified; Radix remains for the general popover gap. No ordinary competing control visual family. |
| `AppDialog` | KEEP / REPLACE VISUAL | Radix modality, escape, focus trap and return focus stay; donor toolbar/panel/buttons/inputs own presentation. |
| `PaneSplit`, `WorkspaceLayout`, `workspaceLayout`, `focusMode` | TEMPORARILY BRIDGE | Keep resize/keyboard separator, persistence, dock/focus behavior. `bim-grid` owns area presentation; one resize/persistence engine, not two. |
| `WorkspaceChrome`, `WorkspaceHeader`, `ProjectSidebar` | REPLACE VISUAL / KEEP STATE | Donor toolbars/buttons/menus; React navigation, command execution, run state and project scope remain. |
| `EngineeringFindingList` independent search | DELETE / MERGE | One Work query/filter across Findings and project work; one count and one selected key. |
| `WorkList` custom rows, `useWorkSelection` + `WorkPeek` independent detail | REPLACE / MERGE | OpenTakeoff WorkspacePanel work/review structure: heading, summary, filters, compact list, bounded paging, selected receipt, action/footer. One persistent selected-item model; no competing peek. |
| `FindingWorkbench` bespoke parallel composition | REPLACE | Actual WorkspacePanel composition adapted to Concord facts + donor grid/panel/toolbar/tabs/controls; Finding receipt/mutation logic retained. |
| `FindingFollowUp`, `EvidenceWorkspaceHost` | KEEP DOMAIN / REPLACE VISUAL | Persisted decision/ReCheck/Evidence data, quality distinctions, exact targets and unavailable states; compact donor sections. No invented viewer capability. |
| `WorkspaceDetailPane` | KEEP OUTSIDE WORK | Existing coordination/investigation/action inspectors stay where needed; Work does not mount a second competing inspector. |
| `ProjectOverview`, `ProjectSourceRegister`, `ProjectHome` | REPLACE VISUAL | Dense donor panels/sections/tables; retain source lifecycle/actions and explicit readiness/source/Finding distinction. |
| `ProjectExplorer` | KEEP DATA / REPLACE CONTROLS | Donor retrieval table, query and filters; opaque identifiers searchable but technical provenance secondary. |
| `ModelWorkspaceView` | KEEP VIEWER / REPLACE CHROME | Donor viewport/toolbar/buttons around existing viewer. No viewer algorithm or engine edits. |
| `styles/ui.css`, duplicated custom controls and page presentation in composition/styles | DELETE / REDUCE | Delete replaced visual owners; keep layout, focus, semantic status, viewer geometry and required dialog modality only. |
| `styles/workbench.css` Concord donor-look overrides | DELETE / REDUCE | Keep minimal donor integration/layout, docking and domain semantics. No donor lookalike control family. |
| `styles/base.css` extensive visual commentary and token system | REDUCE | Small light neutral/teal/CJK donor token bridge; semantic compatibility aliases only for retained domain/viewer surfaces. |

## API qualification corrections

The initial replacement plan above was corrected after inspecting the installed donor APIs. `bim-button` and donor inputs are not native form-associated controls. `bim-context-menu` is a floating native modal dialog, not an application-menu keyboard implementation. `bim-tabs` owns panel visibility and is not a substitute for React routing. Local single-choice categories use donor `bim-selector`; React routing remains authoritative for workspace navigation. These gaps are explicit retained bridges, not claims of full donor parity.

Project package and source register rows are now donor tables with stable domain IDs and real `bim-button` row actions. React keeps exact callback targets and selected IDs; donor buttons expose both visual active state and `aria-pressed`. Table-cell status colours use inherited semantic variables because the donor cells are in shadow DOM, not Concord row skins.

## Donor references and boundaries

ThatOpen source checkout `/tmp/engine_ui-components`, revision `c998a4a49ff9b2fa09ef67eb91d36067e7897f2f`, installed package **3.4.14**. Read actual core implementations and Grid, Panel, Toolbar, Tabs, Table, Table/Searching, ContextMenu and ModelsList examples. OBC ModelsList is not a second authoritative project/model source; map Concord records into donor tables instead.

OpenTakeoff target **`788e39bfe9c42b3260ea75e84a655e4574f9bc8c8`**. `WorkspacePanel.jsx` structure/behavior is the source for Work, not merely its stylesheet. Takeoff geometry, measurement quantities, actors and accuracy semantics are not imported. `TakeoffCanvas.jsx` and `premiumWorkspace.css` are not production code sources. Existing adapted WorkspaceLayout/Chrome/focus behavior remains.

React owns routing, queries, callbacks, domain data, project fences, authoritative mutations and lifecycle. Lit owns adopted controls and visual surfaces. No backend, database, migration, DBOS, desktop architecture, detection, processing or `frontend/src/viewers/**` changes. No commits, pushes or PRs.

## Verification policy

Fresh typecheck/test/transport/lint/build/Chromium/IFC/real Finding-ReCheck/real-project checks and screenshot evidence are reported separately from historical logs. Passing tests do not prove visual donor conformance or production-engine certification. Native packaged Tauri, Windows WebView2 and macOS WKWebView qualification require their respective environments and must never be called passed from Linux browser results.
