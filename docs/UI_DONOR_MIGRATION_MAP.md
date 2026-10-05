# Issue #16: product UI is the OpenTakeoff workspace

## What this is

Scope: current B donor provenance, not an active migration plan or acceptance.
[PRODUCT_WORKFLOW](PRODUCT_WORKFLOW.md) owns behavior and [STATUS](../STATUS.md)
owns the stopped, unaccepted local integration. C's four viewer surfaces remain a
pending PR22 dependency; their [handoff](EVIDENCE_VIEWER_ADAPTERS.md) is separate from
the B shell. C Drawing uses OpenTakeoff `60c82e…`, **not** B's `788e39b…`.

The Concord product UI is OpenTakeoff's own workspace frontend, adopted as the
baseline and renamed. It is not a redesign, not a reference, and not a port of
individual widgets onto the previous Concord shell.

- Donor: https://github.com/Kentucky-ai/opentakeoff
- Fixed revision: `788e39bfe9c42b3260ea75e84a655e4574f9bc8c`
- License: Apache-2.0 (`frontend/public/licenses/OpenTakeoff-APACHE-2.0.txt`,
  upstream NOTICE at `frontend/public/licenses/OpenTakeoff-NOTICE.txt`)
- Vendored files and digests: `frontend/src/vendor/opentakeoff/README.md`

## 1. Donor files kept as-is

Copied byte-identical (unmodified) into `frontend/src/vendor/opentakeoff/` and
imported at the end of `frontend/src/styles.css`, so they own the workspace look:

| Vendored file | Donor path |
| --- | --- |
| `styles/tokens.css` | `web/src/styles/tokens.css` |
| `styles/app.css` | `web/src/styles/app.css` |
| `styles/premiumWorkspace.css` | `web/src/styles/premiumWorkspace.css` |
| `components/workspaceChrome.css` | `web/src/components/workspaceChrome.css` |
| `components/workspacePanel.css` | `web/src/components/workspacePanel.css` |

Ported with type annotations only: `brand/icons.tsx` (`brand/icons.jsx`),
`lib/ui.ts` (`lib/ui.js`), `lib/keys.ts` (`lib/keys.ts`).

## 2. Donor files ported with product edits

| Concord file | Donor source | Change |
| --- | --- | --- |
| `src/app/WorkspaceChrome.tsx` | `components/WorkspaceChrome.jsx` | Chinese copy, Concord slots (`conditionControl` = work package, `history` = Re-check, `aids` = model/document, `panelTools` unused, no Quantities/Takeoffs/Premium) |
| `src/app/ProjectSidebar.tsx` | donor tool rail (`[data-tool-rail]`, `TakeoffCanvas.jsx`) | Concord destinations instead of measuring tools |
| `src/features/WorkPanel.tsx` | `components/WorkspacePanel.jsx` | Findings + project work instead of measurements; donor heading/summary/tabs/query/filter/list/row/receipt/footer kept |
| `src/layout/WorkspaceLayout.tsx` | `components/WorkspaceLayout.jsx` | native `<dialog>` markup kept; Concord dock set (tools/sheets/work), no quantity/counter/palette toggles |
| `src/layout/workspaceLayout.ts` | `lib/workspaceLayout.js` | Concord dock set and storage key; defaults, bounds, saved-arrangement cap kept |
| `src/layout/focusMode.ts` | `lib/focusMode.js` | Concord storage key/event name; donor behaviour and compact breakpoint kept |
| `src/App.tsx` | donor shell composition (`TakeoffCanvas.jsx` `app-shell workspace-calm premium-workspace` → `calm-header`/`calm-context` → `[data-canvas-workspace]` → `footer.ink-panel.ticks`) | Concord routing, queries, dialogs and data |

## 3. Removed (donor business that was never Concord's)

Not copied into B's shell: flooring, measurements, takeoff quantities,
bidding, estimating, OCR engines, geometry/takeoff engines, condition business,
report business, agent takeoff logic, `TakeoffCanvas.jsx` and the
takeoff-specific `premiumWorkspace` rules. Deleted from Concord because the
vendored donor files now own their selectors: the `workbench.css` imitation port
(`.calm-*` / `.workspace-*` duplicates, −482 lines), the old 88px sidebar shell
CSS, `WorkspaceHeader.tsx` (breadcrumb/version/local-action toolbar, replaced by
the header and context slots), and 186 CSS rules whose classes no longer exist in
the product.

## 4. ThatOpen (`@thatopen/ui`) — only where the donor has nothing

Remaining uses include ModelWorkspaceView's `bim-viewport`; ProjectSourceRegister,
ProjectExplorer, ProjectOverview and Capabilities tables/sections/panels; ProjectHome,
WorkspaceState and EvidenceWorkspaceHost panels; AppMenu panels/AppDisclosure sections;
and AppDialog's `bim-toolbar`. The shell and WorkPanel use donor markup/CSS, not a
ThatOpen grid. The retained grid wrapper is not a production shell. Exact attribution
is in [THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES.md).

## 5. Token bridge

`frontend/src/styles/base.css` ends with a token-alias bridge that maps Concord's
existing token names onto the vendored donor palette. It is declared three times
(`:root`, `.premium-workspace[data-workspace-look="light"]`,
`.premium-workspace[data-workspace-look="graphite|hud"]`) because `var()`
substitutes at computed-value time and a single `:root` copy would freeze at the
light value. This is the only new CSS: it declares no visuals, only aliases, and
is what makes every existing Concord surface adopt the workspace look.

## 6. Known gaps (reported, not invented)

- No donor equivalent for the canvas sheet-tab strip (`[data-sheet-tabs]`) or the
  selected-object property editor (`.calm-property-editor`); Concord has neither.
- No donor equivalent for a project/browse data table. The donor's only table
  vocabulary is the inline-styled table in `components/RevisionsPanel.jsx`; the
  Concord data surfaces therefore keep their existing tables and only adopt the
  palette through the token bridge.
- The donor's Pin control, All-controls topbar and quantities counter have no
  Concord counterpart.

React owns routing, queries, callbacks and reconciliation; the backend owns
authoritative mutations/domain state. Lit/ThatOpen supplies remaining components,
not a competing shell. This map describes B shell adoption only; B's host now
requests C viewers, whose modules/assets/dependencies are pending locally. It does
not claim completed viewer/runtime integration or final tests.
