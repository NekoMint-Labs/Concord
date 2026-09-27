# Concord interaction inventory — Issue #10 hardening baseline

Audited before the hardening edits on `feat/10-real-project-workspace`. `FAKE` means an affordance is visible but has no observable result; `BROKEN` means its result is incomplete, inaccessible, or inconsistent with its label.

| Surface | Control | Current behavior | Intended behavior | Status |
| --- | --- | --- | --- | --- |
| Global header | Model / issue / document search | Text input has no state or submit handler | Search or route to a matching project context | FAKE |
| Global header | Version `R…⌄` / baseline text | Plain spans with dropdown-looking chevrons | Show the current revision context without false dropdown chrome | FAKE |
| Global header | Notification bell | Button has no handler or menu | Open real notifications, or do not present as a button | FAKE |
| Global header | Account `J` | Non-button marker with account aria label | Decorative identity marker unless account menu exists | DECORATIVE |
| Left navigation | Collapse / expand sidebar | Panel ref collapses and restores | Collapse/restore and expose keyboard state | WORKING |
| Left navigation | Project picker | Radix menu opens; new/open/settings/recent/current items route or open dialogs | Same | WORKING |
| Left navigation | Work-package search | Filters visible work-package rows | Filter rows and truthful empty state | WORKING |
| Left navigation | Workspace links | Set the selected workspace tab | Navigate while preserving selected project/work package | WORKING |
| Left navigation | New work package / settings | Open real dialogs | Open real dialogs | WORKING |
| Workspace header | Context breadcrumb | Displays current context but is not a link | Context display | DECORATIVE |
| Workspace header | Agent | Popover, mode select, question, investigation, saved report | Operate against current context | WORKING |
| Workspace header | Advanced menu | Opens real secondary views/demo actions | Navigate or run real action | WORKING |
| Overview | Overview/schedule/issues tabs | Change local content state | Change content and selected state | WORKING |
| Overview | Recheck / impact / model / documents / detail actions | Invoke real callbacks and dialogs/navigation | Same | WORKING |
| Overview | Other construction conditions | Shared disclosure toggles | Toggle and expose `aria-expanded` | WORKING |
| Models | Model source disclosure/actions | Native disclosure and file/project/import/close actions work | Same, with truthful busy states | WORKING |
| Models | Upper viewer `选择` | Button renders no handler/state | Select mode or current-mode indicator | FAKE |
| Models | Lower viewer `选择` | Button renders no handler/state | Select mode or current-mode indicator | FAKE |
| Models | Upper/lower focus/isolate/show-all | SDK calls exist, but availability is not selection-aware and duplicate controls diverge | Truthful enabled state and shared viewer state | BROKEN |
| Models | 2D / 3D | Text chrome only; camera never changes | Orthographic top view / perspective orbit | FAKE |
| Models / Changes / Issues | Right spatial Inspector | Fixed CSS grid; no divider | Persisted PaneSplit with pointer and keyboard resize | BROKEN |
| Spatial Inspector | Overview/changes/issues/documents tabs | Tabs change rendered content; counts are partial and selected state is visual only | Valid tab semantics, content, correct counts | BROKEN |
| Spatial Inspector | Ellipsis | Decorative `MoreHorizontal` with `aria-hidden` | Real context menu with useful actions | FAKE |
| Spatial Inspector | Technical details | Shared disclosure opens raw/technical values | Toggle technical details | WORKING |
| Spatial Inspector | Related element / issue / change rows | Buttons select or switch context | Keep viewer, inspector, and context selection synchronized | WORKING |
| Bottom context panel | 变更 / 问题 tabs | Switch table and open list | Switch content and selected state | WORKING |
| Bottom context panel | Work package tab | Routes only when a related package exists; disabled otherwise | Disabled with truthful prerequisite | WORKING |
| Bottom context panel | Ellipsis | Toggles list and updates `aria-expanded` | Expand/collapse context list | WORKING |
| Bottom context panel | Change/issue table rows | Pointer click selects; table rows are not keyboard controls | Keyboard-accessible row navigation and synchronized selection | BROKEN |
| Changes | Model source select | Changes source query | Change comparison source | WORKING |
| Changes | Change filters / revision buttons | Filter and switch displayed revision | Same | WORKING |
| Changes | Compare latest / model versions / work package | Start comparison or route | Same | WORKING |
| Issues | Issue selection / resolution / work package | Selects issue, element, and route | Preserve issue and element context | WORKING |
| Documents | Search / clear / type filters | Filter and query parsed chunks | Same | WORKING |
| Documents | Document rows / source menu | Select source and update reader | Same | WORKING |
| Documents | Save / import | Download or import with busy/status feedback | Same | WORKING |
| Documents | Pane divider | Shared resizable pane with persistence | Same | WORKING |
| Investigation | Model/document/image tabs | Static spans; model and document are both always rendered; image has no content | Real source switching, or hide unavailable source | FAKE |
| Investigation | Investigation viewer selection | `onSelected={() => {}}`; selection-looking viewer controls cannot affect investigation context | Read-only viewer controls or real selection callback | BROKEN |
| Investigation | Evidence technical details / process | Native disclosures expand | Toggle details | WORKING |
| Investigation | Review proposal / close | Route to action or close inspector | Same | WORKING |
| Dialogs | New/open project, settings, structure | Inputs, menus, mutations, and close actions work | Same | WORKING |
| Dialogs | Advanced settings disclosure | Toggles local form section and `aria-expanded` | Same | WORKING |
| Empty/loading/error | Startup, no work package, no model, loading, failed import/query | Mostly truthful states; some viewer actions remain enabled without a selection | Enabled controls must have a valid target; otherwise disabled/hidden | BROKEN |
| Accessibility | Icon buttons and menus | Most have labels/tooltips; fake viewer controls and table rows lack complete keyboard behavior | Real semantics, focus state, keyboard operation | BROKEN |

The statuses above describe the **pre-pass** behavior. Final disposition:

| Controls | Resolution |
| --- | --- |
| Header search, version/baseline chevrons, notification bell | Removed false affordances; revision/baseline remain read-only labels. Search/notifications need an actual product workflow before returning. |
| Two selection toolbars, focus/isolate/show-all, 2D/3D | One toolbar per viewer; buttons reflect actual targets and isolation. `选择` exits isolation; 2D switches the SDK to an orthographic top-plan camera, 3D restores the saved perspective orbit. |
| Spatial Inspector layout, ellipsis, tabs | Shared persistent `PaneSplit` with 270–460px Inspector, keyboard/pointer divider, reset/collapse/expand; Concord menu handles reset, technical details, copy and collapse. Tabs have keyboard navigation and real counts; unsupported document tab removed. |
| Context tables, selection across workspaces | Named buttons inside rows provide keyboard activation, current-row state and synchronized viewer/Inspector/context selection; selected element/issue carried through Models, Changes and Issues. |
| Investigation sources/viewer | Model and document switch content, unavailable image tab removed; viewer selection updates the selected GUID and focus/label rather than using a no-op callback. |
| Empty/loading/disabled | Selection-dependent actions disabled without a valid target; unavailable content gets explicit empty/loading messages. |

Decorative icons, read-only fact rows, and already-working controls are intentionally excluded. Account management, image evidence and real per-element document associations have no current backing workflow and remain deferred rather than advertising dead controls.
