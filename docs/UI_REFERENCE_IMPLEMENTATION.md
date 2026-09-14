# UI reference implementation map

Patterns are adapted to Concord's React/CSS/CVA/Radix Slot/Lucide stack; no dependency or copied source is introduced.

## Frontend UI system: ownership, and where the next thing goes

**Start here.** This is the frontend-system pass's record, and it is also the practical answer to "where does this belong". Everything after it is the design record of the earlier visual passes, newest first within each topic; where an earlier pass states a policy this one changed, the change is called out in place.

The pass introduced four layers, each with one owner, and the point of the split is that product views stay thin:

| Layer | Owner | What lives there |
| --- | --- | --- |
| Tokens | `frontend/src/styles/base.css` | colour, radius, spacing, type, elevation, motion steps. Asserted by `frontend/tests/design-tokens.test.mjs` |
| Motion | `frontend/src/motion/index.ts` (+ keyframes in `frontend/src/styles/ui.css`) | durations, easing, `paneEnter` / `detailSwap` / `fade`, and the reduced-motion branch |
| Panes | `frontend/src/layout/PaneSplit.tsx` (+ `frontend/src/styles/layout.css`) | the only place the resizable-panel library is imported; pane defaults, the divider, local persistence |
| Primitives | `frontend/src/components/ui/` (+ `frontend/src/styles/ui.css`) | `Button`, `AppTooltip`, `AppMenu`, `AppPopover`, `AppDialog`, `AppToaster` + `notify` |

**Where do I add a new colour?** In `base.css`, as a token. A value that is *for* something (a surface, a border, text) goes in the semantic block (`--workspace`, `--border`, `--text-muted`, `--warning`, `--success`, `--focus-ring`); a value that *is* something goes on the physical ladder it aliases. `frontend/tests/design-tokens.test.mjs` fails if any other stylesheet declares a colour literal, so a feature stylesheet physically cannot invent one. OKLCH was considered and skipped: the ladder is a fixed set of hex values with a contrast contract written against hex, so converting would not change a single rendered pixel and would move the contract into a colour space the test would have to reimplement.

**Where do I add an animation?** Two mechanisms, split by what is being animated:

- *React state, mounting, or identity* - a pane arriving, detail content being replaced because its subject changed, a shared indicator moving. Use `useMotion()` from `frontend/src/motion`. It is the only place `prefers-reduced-motion` is read on the JS side, and it collapses every duration to zero while keeping the same variant keys, so no call site has to know about the preference.
- *Keybinding-free hover, press, focus, colour* - plain CSS in the owning stylesheet, using `--motion-instant` / `--motion-fast` / `--motion` and `--ease`.
- *Floating surfaces* - `AppMenu`, `AppPopover`, `AppDialog`, and the tooltip animate from keyframes in `styles/ui.css` keyed off Radix's `data-state`. This is deliberate: Radix keeps a surface mounted until its exit animation ends, so a dismissed menu leaves the way it arrived, and it costs no JavaScript. `prefers-reduced-motion` collapses those keyframes through the global rule in `base.css`.

**Should I import Radix here?** No. Product code imports `components/ui/*`. A primitive wrapper exists to hold *policy* (the accessible name, the surface class, the entry/exit keyframes, the `onSelect`-not-`onClick` rule), which is also what makes a future library swap a single-file edit. Do not add a wrapper that only re-exports a library component.

**Where does resize behaviour live?** In `layout/PaneSplit.tsx`, and only there. `PaneSplit` / `Pane` / `PaneDivider` are the whole API; the library's class names, its `data-panel` direct-child requirement, the 1px divider with its 9px invisible target, the drag/focus states, and the local-storage persistence all live behind them. Panes are declared in pixels (`defaultSize="264px"`, `minSize="200px"`) because the widths that matter are reading widths, and every pane gets a 160px floor unless it states its own. Layout is never sent to the backend; `persist` is opt-in and uses `localStorage` with an in-memory fallback, and a split that mounts and unmounts (the Inspector) does not persist at all.

**When should I use a toast?** When a user just did something whose result is not visible where they are: a document import finished, a source was saved, a change was recorded, an operation failed. `notify` from `components/ui/AppToaster` is the only entry point, and `useWorkspaceMutation.perform(operation, completed?)` is the one place most of them are raised - failures automatically, completions only when the caller names what finished. A toast never replaces authoritative state: run status, readiness, BLOCKED, STALE, evidence, and approvals stay in the workspace, where they can be read again after the toast has gone.

### Dependencies adopted by this pass

| Package | Why it exists |
| --- | --- |
| `motion` | React-owned state and identity animation that CSS cannot express (shared `layoutId` indicators, mount/swap), with one reduced-motion branch. |
| `@radix-ui/react-tooltip` | The product had no tooltip at all; an icon-only control needs an accessible name that is also visible on hover. |
| `@radix-ui/react-dropdown-menu` | Replaces the `<details>` disclosures, which dismissed only on a second click of their own summary. Radix supplies dismiss-on-outside-click, Escape, roving focus, and the menu ARIA wiring. |
| `@radix-ui/react-popover` | The run trace is a floating detail with content too large for a tooltip; dismissal and focus return are the same problem as the menu's. |
| `@radix-ui/react-dialog` | The event composer's hand-written focus trap, which had no outside-click dismissal and left the page behind it scrollable. |
| `react-resizable-panels` | Desktop pane resizing in Documents, BIM, and the workspace/Inspector split; it also brings the separator role, arrow-key resizing, and the ARIA values. |
| `sonner` | Short-lived feedback with a queue, stacking, swipe dismissal, and a live region, styled from Concord's own tokens (`unstyled` + `styles/ui.css`). |

Each one is reached through a Concord-owned module, so the dependency graph has seven leaves and one owner each. The bundle cost is in the main chunk (`dist/assets/index-*.js`, ~602 kB minified / ~193 kB gzip with the workspace shell, Documents, BIM's structured mode, and the coordination surface); the three.js and IFC chunks are unchanged and still load only when a viewer opens.

### Spacing, deliberately incomplete

The 4px `--space-*` rhythm is declared and used by everything new (the primitive stylesheets, the pane divider, the toast surface). The older feature stylesheets were **not** mechanically rewritten onto it: that is a large no-visual-change diff against a layout that was already calibrated, and the pass's job was the system, not a search-and-replace. New work uses the scale; existing padding keeps its measured values until a change actually touches them.

This document is a design record, and the sections below are ordered newest first within their topic. Two boundaries apply throughout, and both were tightened in the visual-language pass:

- **shadcn is a source of primitives and structure, not of visual identity.** shadcn-admin and shadcn/ui remain the reference for how a sidebar, a toolbar, or a control is *composed*; they are not the reference for what Concord *looks like*. A generated shadcn admin template is the failure mode this document exists to steer away from, and the palette, radius, and shell sections below were rewritten specifically because an earlier pass drifted toward it.
- **Colour, radius, and motion are declared once**, in `frontend/src/styles/base.css`, and asserted by `frontend/tests/design-tokens.test.mjs`. Feature stylesheets consume tokens and never restate them.

## Quiet Instrument: the current visual direction

**This section supersedes any visual-value statement below it** (the surface ladder, the radius usage, the accent's role, and the product-text floor are all restated here). The section after it records *composition* decisions that are still current: one edge-to-edge workspace, one `PaneSplit` API, one docked Inspector, and no cards. **The final-polish section at the end of this block supersedes the value statements again** - read it before trusting any hex or type size in this document.

**Where the previous pass went wrong.** It was internally consistent and it was wrong in three ways the owner named, and each one is now a rule rather than a taste:

1. **Its hierarchy was linework.** Five planes sat within 1.06:1 of each other while seven 1px rules were drawn across them, so the only structure the eye could reliably detect was the line. It read as a ruled table. The same measurement is why it looked "old": line-dominated structure *is* what old enterprise software looks like.
2. **Its type had nowhere to go.** Every role sat in a 12-14px band with 400/500/600, and 500-versus-600 is invisible in the CJK faces this product actually renders in. The pass said hierarchy was carried by weight, spacing, and contrast, and then removed the room for all three.
3. **It had no composition.** `READY` rendered three lines in the top-left corner of a 730px region, and the pass recorded the resulting 561px of whitespace as "a product question, not a styling one". That was honest and it was still the most visible defect in the product.

**A fourth cause is worth recording because it predicts the next regression.** The pass's visual decisions were frozen into `frontend/tests/design-tokens.test.mjs` (radius capped at 10, neutrals within a 12-point channel spread and warm-biased, a 12px text floor) and it was reviewed by *measuring* rendered geometry rather than by looking at it - `.visual-check.mjs` still says so in its own header. Numbers were satisfied and the result was flat, because no test asserted that two planes were *distinguishable* or that the type scale had a step. Those two are asserted now.

**What the direction is.** Calm material, loud typography, dense facts. Three rules:

- **Lines to surfaces.** Structure is plane value, spacing, typography, selected-state surfaces, and pane headers. The shell draws **no structural hairline at all**; a line is spent only on content (a table row, an evidence boundary) or on a boundary that identifies a control. Plane steps are asserted, not eyeballed: every neighbouring pair in the ladder clears 1.08:1 and the work plane is the unique maximum.
- **Surfaces recede, they do not float.** A grouped block of engineering values is a *recessed* or same-material object (chrome, or `--surface-detail`), never white-on-white with an edge and a shadow. This is why the earlier card pass could not work: white on the work plane is 1.02:1, so a "card" was only visible by its border - the exact failure rule 1 removes. Elevation is spent on floating objects only, and a control has no shadow at all.
- **Hierarchy is type.** Seven roles (22 / 20 / 15 / 14 / 13 / 12 / 11), two weights (400 and 600, the only two this font stack can render as *different* in both Latin and CJK), and tabular figures by default with parsed prose opting out.

**Where things live now.**

| Concern | Owner | What changed |
| --- | --- | --- |
| Planes, lines, type, radius, elevation, motion | `frontend/src/styles/base.css` | New ladder (`--bg-app` `#cbcdcf` → `--surface-nav` `#d9dbdd` → `--surface-detail` `#e6e8e9` → `--surface-chrome` `#f0f1f2` → `--surface-workspace` `#fbfbfc`), four line tokens with one documented job each, seven type roles, radius `0/4/6/8/10` with the *usage* redefined, `--shadow-control` deleted, a denser `--accent-strong` step for a mark inside running text, tabular figures global, and `--status-bar-h` as the one number the analysis footer and every scroll reserve share |
| Pane identity | `frontend/src/styles/layout.css` | `.pane-stack` / `.pane-header` / `.pane-body`: a pane is a chrome header band above its own surface with its own scroll. The divider is left to be what it is - the grab handle - instead of the only thing distinguishing one column from the next |
| Pane budget | `frontend/src/layout/paneBudget.ts` | The Inspector wins the column it needs and opens 300px instead of 336px on a constrained window. Below the owner's 1280 boundary the nested list yields its column and is reached as a menu in the reading pane's header. Asserted in `paneBudget.test.ts` |
| A surface's own degradation | `frontend/src/styles/features/documents.css` | Pane policy decides how many panes there are; the surface decides what it does with its column. The evidence sheet collapses its 156px metadata gutter into a row above the text when its own width drops below 460px, which is what happens at 860 and at 1280 with the Inspector open. Without this, a caption would have taken a third of the pane it was annotating. *(This block was declared above the base rules it overrides and so did nothing until the final-polish pass moved it - see that section.)* |
| Floating surfaces | `frontend/src/styles/ui.css` | Four roles instead of one white rectangle: container (menu/popover), label (tooltip, inverted ink), notice (toast, compact), modal (dialog, the only largest radius) |
| Selection | `.package-nav`, `.document-list > button`, `.bim-element`, `.constraint-list button`, `.menu-item.active` | One grammar for a selected *row* everywhere: an `--accent-muted` surface at `--radius-sm`. The 2px left rule is gone from all three lists. Position that is not a row - the workspace view tabs and the Inspector detail switch - is stated with full-ink typography over a 2px accent rail instead, because a 10% tint on a 24-40px chrome band renders as a grey box rather than as a slate one |

**What this pass did not do**, on purpose: no new dependency, no font, no dark mode, no URL or state-ownership change, no backend or API change, and no re-litigation of the shell architecture. Two known gaps are recorded rather than fixed: the three remaining `<select>` elements and the four remaining native `<details>` disclosures, all in secondary capability views - and the one product-facing `<select>` in the event composer, which has no Concord primitive to replace it with yet.

**Invariants this pass left guarded by tests** (`frontend/tests/design-tokens.test.mjs`, `frontend/src/layout/paneBudget.test.ts`). Each one is a relationship, not a value, so the palette and the pane policy stay editable: every neighbouring pair of structural planes clears 1.08:1 and the work plane is the unique lightest; every text token clears AA on every plane it can land on; a control boundary clears 3:1 on the darkest plane a control is actually placed on; the accent is a visible surface on every plane a selected row sits on, and its denser step is a highlight rather than a tint; content rules stay visible where they are drawn; the radius scale is monotonic and stops short of the dialog; and the pane budget yields the nested list to the Inspector below 1280 and never without it.

## Final polish pass: cool-stone neutral, ink/slate commitment, one composed record

**Supersedes the value statements above and below.** This was a visual-only refit: no new dependency, no new pane, no new data, no backend or API change, and no change to the motion vocabulary. What changed is the palette's temperature, where the amber is allowed to be spent, which family the primary control belongs to, and the composition of the coordination record.

**The neutral ladder is cool-stone graphite, and the bias contract was rewritten rather than worked around.** The previous ladder carried a few points of warmth in every plane (`--bg-app` `#d3d3cd` and friends, red and green six points above blue). At this density that did not read as *material*; it read as a yellow-green cast, and the workspace looked slightly dirty next to the white objects sitting on it. The new ladder is `#cbcdcf` → `#d9dbdd` → `#e6e8e9` → `#f0f1f2` → `#fbfbfc`, with `--ink` `#17191b`, `--ink-2` `#373a3d`, `--muted` `#525558`, `--muted-2` `#5a5d60`, `--line` `#d8dbdd`, `--line-soft` `#e5e8e9`, `--line-control` `#787b7e` and `--line-float` `#c8cbce`.

This is a deliberate contract change, not a palette edit that happens to violate the old one. `design-tokens.test.mjs` used to assert `r >= g >= b` on every neutral ("stays warm-biased"); it now asserts a 12-point channel spread and `blue - red` inside `[-3, +7]`, which forbids the olive cast at one end and a blue-grey theme at the other, and still lets the ladder carry the cool cast the review asked for. Every other invariant is unchanged and still passes on the new values, including the 1.08:1 plane step and the 4.5:1 text floor on the darkest plane.

**Amber stopped being a panel.** `.state-block.is-blocked` was a full `--warning-muted` fill, which at that area read as a sticky note and out-shouted the page it was warning about; `--warn-bg` was also dropped from a saturated cream `#fbf1ce` to a very low-chroma `#f7f2e8`, and `--warn-fg` / `--warn-line` to `#7a4e00` / `rgba(122, 78, 0, 0.42)`. A blocked work package is now stated by a 3px amber rail inset on the record's own left edge, the `已阻塞` badge, and the one or two values that are actually wrong. Nothing else on the screen is amber.

**Commitment joined the accent's family.** `--primary` was `#232322`, the one black object in a graphite product. It is now `#2f3d4f` with `--primary-hover: #3e4f64` - the accent taken down to a working depth, so a committed action and the current position belong to one identity instead of two. `design-tokens.test.mjs` asserts both stay cool and that white clears AA on each (11.05:1 and 8.38:1).

**The coordination record is one record.** It used to be three independent objects: a grey conclusion block on the left, a fact stack on the right, and the recommendation as a card below both - the reader had to work out that they were about the same work package. `.coordination-record` is now the `--surface-detail` well the system's own "a grouped block is cut into the plane" rule calls for, holding the conclusion, the condition matrix and the recommendation inside one surface, on one top edge, with one label tier. `READY` and `BLOCKED` are the same composition in two states, and either state's action spans the record on its own line rather than competing with the fact column for a share of the first one. The fact grid's column floor dropped to 120px: the earlier 190px could not fit two columns inside the record, so the condition matrix collapsed into a single tall stack in exactly the layout that made the right half of the page look empty. *(Superseded on one value: the well is `--surface-chrome`, not `--surface-detail` - see the human-review micro-polish pass. The composition described here is unchanged.)*

**Type calibration, not a new scale.** `--fs-display` 20 → 22 and `--fs-title` 19 → 20: the object title sat one pixel under the application's own name on the startup surface, which left the one line that names the page with no presence. `--fs-body` / `--fs-action` / `--fs-meta` / `--fs-label` are unchanged, and so is the 400/600 two-weight rule. Chinese line-heights moved up where UI text carries them (list-row titles 1.4 → 1.5, fact values → 1.55), because 1.4 is tight for CJK at 13px. `--status-bar-h: 36px` was added so the analysis footer's height and every scroll region's bottom reserve are literally the same number.

**Two dead rules were found and fixed**, both of the same kind - a stated value that a later rule silently outranked:

- `@container (max-width: 460px)` in `documents.css` was declared *above* the base `.chunk-gutter` and `.chunk-body` rules it overrides. Same specificity, later wins, so the evidence sheet collapsed to one column while the gutter kept standing as a 350px-wide vertical stack inside it. The block now sits after the rules it overrides, with the ordering written down as load-bearing.
- `.inspector-header`'s padding and `.inspector-scope`'s tier were both outranked by shared `.pane-header.is-stacked` / `.pane-header .mono` rules. Both are now scoped so the pane renders what it declares.

**The 860px coordination case.** The report was "lower content extends behind the analysis footer". The footer is not fixed or sticky - it is an in-flow flex sibling of the workspace split, so nothing can render behind it. What was happening is that the content was taller than the scroll region and got clipped flush against the footer's top edge, mid-glyph, with a zero-width (overlay) scrollbar as the only affordance. Two things changed: the scroll region declares `scroll-padding-bottom: var(--status-bar-h)` and the workspace content reserves `space + --status-bar-h`, so the end of the content can always be brought clear of the band; and the record composition is now short enough to mostly fit, which is the fix that matters. Measured at maximum scroll: 1440 462px of clearance and no scroll, 1100 225px and no scroll, 860 READY 173px and no scroll, 860 BLOCKED 66px of clearance after 46px of scroll - exactly the reserved `--space-6` + `--status-bar-h`. Before the pass the same 860 case needed 139px of scroll and the primary action sat below the fold.

**Review set.** Rendered and reviewed at 1440 (READY, BLOCKED, Inspector, BIM selected, BIM empty, Documents, menu, toast, dialog), 1100 (BIM + Inspector, Documents + Inspector) and 860 (coordination READY, coordination BLOCKED, BIM, Documents). Geometry probes were regression helpers; the acceptance gate was human review of the pixels.

**Left as found, deliberately.** The project picker stays a bordered control: its resting boundary is `--line-control`, which is the 3:1 control-boundary floor on the navigation plane, and the surface step alone would not meet WCAG 1.4.11. It is a Concord-owned menu trigger, not a native `<select>` - that replacement happened in an earlier pass. The reading-pane body measure is unchanged: the fixture's lines are set by the source document's own line breaks, so the 680px track is a cap rather than the binding constraint, and the rendered lines run about 75 characters. The BIM empty state still says 选择左侧构件 in the case where the element list has yielded its column to the Inspector and is reached from the pane header menu - a copy inaccuracy that a layout pass should not silently paper over.

## Human-review micro-polish pass: five surfaces, no new material

**Scope.** A visual-only refit of the five surfaces a human review named, after the direction above was accepted. No dependency, no new token, no new pane, no behaviour change, no backend or API change; the shell, the palette's temperature, the pane budget, the motion vocabulary, the Radix wrappers and the responsive strategy are untouched. Every change below is either a value in the stylesheet that already owned it, or the composition of a block that already existed.

**1. The coordination record's well was demoted one plane.** `.coordination-record` took `--surface-detail`, and at that density the rectangle arrived before its content: the record read as a disabled form and a large grey block. It now takes `--surface-chrome`, the quietest step that still groups a block of engineering values, and the internal rhythm carries the grouping the fill gave up - the fact grid's row gap went 12 → 16px, and `.blocking-fact` moved to `--fs-section` so a blocked record's conclusion is the largest line in its column, exactly as a ready record's already was. *(Supersedes "the `--surface-detail` well" in the final-polish section.)* The amber rail and badge, the two-column composition, the progressive disclosure, the data, the actions and the recommendation-inside-the-record decision are unchanged.

**2. The sidebar's area heading became a heading.** `L02 东翼` / `L03 东翼` were `--fs-meta` at 400 in `--muted` - the register the work-package metadata uses directly beneath them - so position was the only thing separating an area from a row. They are now the label tier at 600 with `0.06em` tracking in `--muted`: clearly a grouping label, still quieter than the 13px ink of the packages it owns, and told apart from the section's own eyebrow by ink and tracking rather than by another size. Width, structure and the `PROJECT → AREA → WORK PACKAGE` navigation are untouched.

**3. `--accent-muted` moved 10% → 13%.** One token, not a per-surface exception: on the navigation plane the sidebar's selected row sat on, the 10% tint rendered as one more grey and the row stopped answering "where am I". The denser step is the same token the document source list and the BIM element list already use, so the one selection grammar survives and no list needed a rule of its own. *(The paragraphs that quote "a 10% tint on a 24-40px chrome band" now quote 13%; what they are for - a tint on a short chrome band renders as a grey box rather than as a slate one - is unchanged.)*

**4. The BIM empty state sits where its content would start.** It was a tinted, rounded placeholder centred in the property pane, which is a component library's "no data" card on a surface that is already the workspace. The container is gone, the icon is a 15px low-contrast mark, and the existing sentence now sits at the property body's own origin and inset - the position the first property group takes once an element is selected. *(Supersedes the centred composition in "Empty states: an instruction where the content would be"; the copy and the one Lucide icon are unchanged.)* The element list, the property sheet and every selected state are untouched.

**5. The event dialog's rhythm, and the status strip as one line.** The dialog inherited margins from the shared `.form-label` that the Inspector owns, so two fields stood 40px apart while the header opened the form 27px above the first one; its fields now take the surface's own 16px gap and nothing else, a label sits 6px above its control, and the close control is centred on the heading block so its × lands on the title's line rather than the eyebrow's. The select keeps the platform's popup and keyboard behaviour and loses only the operating system's arrow, replaced by the chevron the project picker already carries. In the analysis strip, `当前分析` dropped to the label tier and `查看过程` lost its trigger padding, so the label, the state badge and the trace action share one gap and read as one status sentence instead of three links along a footer.

**Left as found, deliberately.** The dialog's select stays a native `<select>`: the one primitive that could replace it is the project-owned menu, and swapping a `combobox` for a `button` + `menu` changes the control's role and keyboard contract inside a modal whose accessibility behaviour was accepted as-is, so it is recorded here rather than migrated. `RunHistory` and `SemanticRetrieval` keep the native selects they already had - neither is a product-facing field.

**Review set.** Rendered at 1440 (READY, BLOCKED, BIM empty, BIM selected, dialog, Inspector, menu, toast, Documents), 1100 (BIM + Inspector, Documents + Inspector) and 860 (coordination READY, coordination BLOCKED, BIM, Documents), plus 2x crops of the sidebar, the record, the analysis strip, the dialog and the BIM property pane in both states. No console errors on any capture.

## App shell

**Reference:** `satnaing/shadcn-admin/src/components/layout/app-sidebar.tsx`; `supabase/supabase/apps/studio/components/layouts/DefaultLayout.tsx`; `supabase/supabase/apps/studio/components/layouts/ProjectLayout/index.tsx`.

**Borrow:** stable work-package navigation beside a dominant task workspace; secondary panels only consume space when opened.

**Do not borrow:** admin information architecture, resizable-panel dependency, analytics surfaces, product navigation, or visual identity.

## Sidebar / work-package navigation

**Reference:** `shadcn-ui/ui/apps/v4/registry/new-york-v4/ui/sidebar.tsx` (`SidebarProvider`, `Sidebar`, `SidebarInset`, `SidebarMenuButton`); `shadcn-ui/ui/apps/v4/registry/new-york-v4/blocks/sidebar-03/components/app-sidebar.tsx`; `satnaing/shadcn-admin/src/components/ui/sidebar.tsx` and `src/context/layout-provider.tsx`.

**Borrow:** header/content/footer hierarchy, quiet selected rows, and separation of persistent layout state from product state.

**Do not borrow:** the full provider/sheet/cookie implementation or a new layout-state store. Concord has one desktop-first shell. The shell's own `更多` and `演示选项` disclosures were native `<details>` at the time of this pass; the frontend-system pass moved them onto the project-owned menu primitive, and the sidebar itself stayed native.

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

**Do not borrow:** a component palette. Concord takes a primitive only when it removes a real defect: the tooltip, menu, popover, and dialog wrappers exist because the native disclosures they replaced dismissed only on a second click of themselves, had no outside-click or Escape handling, and in the dialog's case no focus trap that belonged to a library rather than to this repository. The project-owned `Button` remains the only primitives-free control.

## App shell composition: one workspace, not two slabs

**Reference (source inspected):** `toeverything/AFFiNE` (`packages/frontend/core/src/modules/app-sidebar/views/index.css.ts`); `desktop/desktop` (`app/styles/ui/window/_title-bar.scss`, `ui/_dialog.scss`, `mixins/_textboxish.scss`, `_variables.scss`).

**Directional only, no source inspected:** Linear's 2026 UI refresh (a dimmer navigation plane beside a dominant working plane, calm and consistent); Obsidian's workspace (persistent sidebars, one work surface, a status strip); Notion's sidebar/editor relationship (the canvas needs no container of its own); AppFlowy's desktop pane motion (`easeOutQuad`, short and directional).

**Borrow:** AFFiNE answers the exact question this pass exists to fix. Its sidebar is square, separated by a hairline pane edge (`borderRight: 0.5px solid ...`), and the 6px radius appears only on `&[data-is-floating="true"]` - i.e. only when the navigation panel is genuinely floating above the workspace. *Square when docked, soft when floating* is the distinction Concord was missing. GitHub Desktop supplies the other half: the title bar is a full-width `flex-grow: 0` band closed by `border-bottom: 1px solid` with no radius anywhere in it, and one small `--border-radius: 6px` serves the dialog, the text boxes, and the buttons alike - which is the check that the control radius stays small.

**Do not borrow:** AFFiNE's floating-sidebar mode, noise overlay, or the Electron `data-*` attribute matrix; GitHub Desktop's product identity or its dark title bar; AppFlowy's widget stack; any resizable-panel machinery. Concord has one docked layout.

**Composition** (`frontend/src/styles/shell.css`): the application is one edge-to-edge surface - `display: flex`, no gap, no padding. `.sidebar` is the dimmer plane (`--surface-nav`) and owns the only structural divide in the shell, a `border-right: 1px solid var(--line)`. `.main-shell` is the frame for the chrome band and the work surface: no border, no radius, no shadow. The sidebar header and `.topbar` are both 46px tall and both closed by the same `1px var(--line)` rule, so the two chrome rows read as one window-wide title bar.

What this replaced is worth keeping in view: the shell was a 10px frame holding a 12px-rounded sidebar beside a 12px-rounded, bordered, shadowed main surface. That is two cards on a page, and it is why the workspace read as floating above itself. Nothing in the shell is inset now, and no region carries a shadow; `--shadow-float` and `--shadow-modal` are spent only on objects that genuinely leave the page - menus, popovers, the timeline detail, and the event dialog.

**Radius scale** (`frontend/src/styles/base.css`): `--radius-none: 0px` for pane joins and structural seams, `--radius-sm: 4px` for selected rows, menu items, and tags, `--radius-md: 6px` for controls and content objects inside a region, `--radius-lg: 8px` for floating surfaces, `--radius-xl: 10px` for a dialog alone. **Changed by the Quiet Instrument pass:** the values barely moved; the *objects they attach to* did. Softness now lives on things inside a region and on things that float above one, and never on the shell.

Structural things are square and stay square: pane joins, tab strips, tables, and every list row that carries the selected-object rule - the sidebar work packages, the document sources, the BIM elements. A row that draws a 2px left rule to say *this object is selected* has to be flat, or the rule and the rounded corner disagree about where the row ends. That is why the sidebar rows gave up `--radius-sm` in this pass and now match the other two lists exactly instead of being the app's third row grammar.

The scale is monotonic and capped, and `frontend/tests/design-tokens.test.mjs` asserts both, so no structural surface can quietly reach the dialog's radius and round the whole shell back into a template.

## Desktop weight: region surfaces, product-text floor, and shared view chrome

**Direction (directional reference only, no source inspected):** Notion's stable navigation plane beside a dominant working plane; Obsidian's clearly owned panes; Attio's master/detail object browsing with compact dense rows; Linear's tightly integrated content plus contextual pane. Concord borrows the calibration, never the identity: no dark theme, no brand colour used as hierarchy, no dashboard surfaces.

**Surface ladder** (`frontend/src/styles/base.css`): `--surface-nav` is the most receded plane, `--surface-chrome` carries the topbar, the workspace navigation strip, the timeline strip, and every view toolbar, `--surface-workspace` is the lightest plane and is always the work surface, and `--surface-detail` owns secondary panes (inspector, document source list, BIM element list). `--surface` stays plain white for controls, inputs, and floating objects, so those read as objects sitting on a region rather than as another region. Each step is one deliberate value: far enough apart that panes are owned and legible at desktop scale, close enough that the shell still reads flat rather than striped.

The ladder is graphite with a whisper of cool - not cream, and not a blue-grey. Cream turns the product into a theme; a desaturated blue-grey reads as an absence of colour at this density. This pass moved the first failure to the second and settled in between: blue and red sit within a few points of each other, which is what an *unpainted* surface looks like. `--bg-app` is now only the window backdrop behind the startup screen and the Impact Graph canvas; the shell itself is edge to edge and no longer sits on a frame. *(The exact values in this paragraph are superseded by the final-polish section.)*

The near-neutrality is enforced rather than described: `frontend/tests/design-tokens.test.mjs` asserts that every neutral token stays within a 12-point channel spread, and - since the final-polish pass - that its blue and red channels stay within `[-3, +7]` of each other. That band is what makes "clean graphite" assertable: an olive cast fails at the low end and a blue theme fails at the high end, so a future change that reintroduces either fails the contract instead of shipping as a mood. An earlier revision of the same assertion required a *warm* bias instead, which is the direction the palette review rejected.

**Product-text floor** (`frontend/src/styles/base.css`): nothing carrying product information renders below 12px, and the scale is `--fs-display` 22px, `--fs-title` 20px, `--fs-section` 15px, `--fs-body` 14px, `--fs-action` 13px, `--fs-meta` 12px, `--fs-label` 11px. Hierarchy is carried by weight, spacing, alignment, and controlled contrast rather than by shrinking text. *(The display and title steps were 20/19 when this paragraph was written; the final-polish pass raised them.)*

**Changed by the Quiet Instrument pass:** the floor was 12px, which put *every* role in a 12-14px band and left the scale with no step to give. There is now one deliberate 11px tier for labels that carry no product information of their own (a group title, an eyebrow, a hint column) and every text token still clears AA on every plane it can land on - which is asserted, including against the darker navigation plane this pass introduced.

The text ladder is spaced against the **darkest** surface a token can land on (`--surface-nav`), not against the work surface, and every text token clears 4.5:1 there. Spacing it against the work surface is how `--muted-2` previously sat at 2.96:1 while carrying 12px product text - a value that looked correct in isolation and failed at every place it was actually used. The ladder is `--ink`, `--ink-2`, `--muted`, `--muted-2` in roughly even per-step contrast ratios. `frontend/tests/design-tokens.test.mjs` asserts this, so a future palette edit fails loudly instead of quietly shipping unreadable metadata.

Nothing in this ladder is decorative-only. If a tier stops being readable it stops being usable, so `--muted-2` is a real text colour, not a way to make something quiet by making it faint.

**View toolbar** (`.view-toolbar`, `frontend/src/styles/components.css`): one shared chrome row owns a primary view's title, its inline controls, and its actions. Documents, BIM, and the site workspace all use it, so the working views read as one application instead of as separately embedded pages.

**Master/detail row grammar**: the sidebar work-package rows, the Documents source list, and the BIM element list share one treatment - an `--accent-muted` selected surface at `--radius-sm`, a 13px title that goes 400 → 600 when selected, and 11px secondary metadata, all on a square row. Selection is learned once and applies everywhere. *(This paragraph previously described a 2px left rule; that was replaced by the tinted surface, which carries area where a 2px marker in a 46px row does not.)* Source and element lists sit on `--surface-detail` behind a pane edge; the reading surface stays on `--surface-workspace`; evidence chunks and element properties are separated by rules rather than boxed into cards.

**Do not borrow:** the referenced products' visual identity, dark themes, brand colour as hierarchy, or any AI/dashboard surface. **Superseded:** "this pass introduces no dependency" was true of that pass; the frontend-system pass adopted a small set of libraries, listed at the top of this document with the reason for each.

## Accent: one slate-ink colour, one meaning

**Reference:** `satnaing/shadcn-admin` (`src/styles/theme.css`) and `desktop/desktop` (`_variables.scss`). The token structure is borrowed; the hue is not.

**Borrow:** the idea of one accent token carrying a single meaning, and the restraint of not letting it become a fill.

**Do not borrow:** shadcn-admin's particular blue, or the shadcn convention of an accent-coloured `--accent` surface used for hover backgrounds. Concord's accent carries position, not interactivity.

**Tokens** (`frontend/src/styles/base.css`): `--accent: #3d5a80` and `--focus: var(--accent)`.

**Changed by the Quiet Instrument pass:** the accent is no longer only an indicator. `--accent-muted` (10% of the accent then, 13% since the human-review micro-polish pass) is now spent as a real surface on every selected object - a work package, a document source, a BIM element, a blocker reason, the current menu item, the active Inspector detail - because an accent that only ever appears as 1-2px of line carries no area and therefore no memory: nothing on screen was ever *the product's* colour. The hue and its single meaning are unchanged, and it is still never a status.

The accent means one thing: *this is the current position*. It is used on the focus ring, on the selected-row surface in all three master/detail lists (the sidebar work packages, the document source list, and the BIM element list), on the `--accent-strong` mark inside a search result, and - since the final-polish pass - on the primary control, because a committed action is this product's own identity rather than a second colour's. Active *position* in chrome (the workspace view tabs, the Inspector detail switch) is stated as full-ink typography over a 2px accent rail, because a 10% tint on a 24-40px chrome band renders as a grey box rather than as a slate one. It is never a status, and it sits far enough from the amber warning family that position and exception never read as each other.

**Teal was retired in an earlier pass.** `--accent: #2f6f6b` was a green-cyan, and a green-cyan accent is read as *success* long before it is read as *position*: it sat between the amber warning family and the neutral ladder in a way that made "selected" and "approved" the same colour at a glance. Slate-ink is unambiguously neither, and it separates from amber by more of the wheel. The primary control originally stayed neutral graphite (`--primary: #232322`) so that position and commitment did not compete; the final-polish pass reversed that call and moved the primary control into the accent's own family (`--primary: #2f3d4f`), because with the tint moved off the chrome bands the button was briefly the only black object in a graphite product.

## Motion: 120-160ms, ease-out, and only where something changed

**Reference (source inspected):** `AppFlowy-IO/AppFlowy` (`frontend/appflowy_flutter/lib/workspace/presentation/home/desktop_home_screen.dart`) for the curve, `desktop/desktop` for the restraint. **Directional only:** `satnaing/shadcn-admin` (`src/components/ui/sidebar.tsx`), whose motion vocabulary is exactly three things - `duration-200`, `ease-linear`, and `transition-transform` - which is the budget this pass keeps.

**Borrow:** short durations, ease-out timing, transform-only transitions for indicators, and motion attached to discrete state changes rather than to surfaces.

**Do not borrow:** AppFlowy's widget architecture, the sidebar provider's collapse/expand choreography, or any transition that delays a control from responding to the pointer.

**Tokens** (`frontend/src/styles/base.css`): `--motion-fast: 120ms` for hover and press, `--motion: 160ms` for state changes, and `--ease: cubic-bezier(0.25, 0.46, 0.45, 0.94)` - easeOutQuad, quick to move and slow to settle, which is what a desktop pane feels like. There are no springs, no bounce, no scale beyond a pressed control, and no animated gradient.

Motion is applied only where understanding a state change depends on it: navigation-row hover, button hover and press, the workspace tab indicator, document and BIM row selection, menu and popover entry, the inspector opening, and detail content appearing when its subject changes. Layout is not animated.

Two techniques carry most of the motion, and both exist to avoid one thing - a mark blinking on:

- **Persistent indicators.** The selected work-package rule is always in the DOM at zero size and transitions on its own axis (`scaleY`). Selection therefore reads as the marker drawing to full height, not as a new element appearing.
- **Discrete entry.** Entry was declared with `@starting-style` plus a transition at the time of this pass: floating surfaces (menus, the timeline detail, the event dialog) and the inspector. **Superseded:** the frontend-system pass moved the React-owned cases (the inspector pane, keyed detail content, the active-view indicator) onto the shared motion module and the floating surfaces onto `data-state` keyframes, so exit is animated where a library can hold the element until it finishes. The reasoning did not change: entry is one-way for anything React unmounts directly, because animating exit there would mean delaying unmount and leaving a dismissed surface in the accessibility tree and in the tab order.

Surfaces themselves do not move, and list rows are excluded from press feedback on purpose: a full-bleed row carries its own bottom rule, and translating it drags that rule down with the pointer and reads as layout jitter rather than as a press.

`prefers-reduced-motion: reduce` collapses every duration and animation globally in `base.css` rather than per selector, so a rule added later cannot be forgotten. Durations collapse instead of the rules being removed, so no state change depends on a transition having run.

## Measure, headers, and where the empty space is allowed to stay

**Reference:** `satnaing/shadcn-admin` (`src/components/layout/`); `desktop/desktop` (`ui/_tab-bar.scss`).

**Borrow:** a primary view's header owning the full width of the region it heads, with its state or actions at the far edge.

**Do not borrow:** a max-width *container* around the whole page. Concord constrains the body's measure, never the header's.

**Measure.** The coordination body holds `max-width: 700px`. At 14px that is roughly 65-75 characters, which is the readable band; the width it leaves unused is a deliberate outcome, not a defect, and must **not** be reclaimed by widening the measure. Measured before this pass: the body sat in a 1160px region leaving 428px of unacknowledged width beside it, and the view read as a small paragraph adrift in a large pane.

**Header.** `.coordination-head` deliberately does not take that measure. It spans the region, the state is pushed to the far edge with `margin-left: auto`, and a `1px var(--line)` rule closes it. That is the same treatment `.document-content > h3` already gives the document reading surface, so a primary view's header reads the same way whichever view is open. After the change the header measures 94.5% of the region, the title and state baselines differ by 1px, and unacknowledged width drops from 428px to the region's own 32px padding.

**Where empty space stays.** The ready state renders one statement, one timestamp, and one action in a 761px-tall region, leaving 561px below. That is **not** solved here. The direction forbids solving whitespace by inventing content, and filling this space means deciding what a ready work package should additionally report - a product and information-architecture question, not a styling one. It is left visibly unresolved rather than papered over with a widget.

**Known redundancy, not actioned.** The topbar breadcrumb already carries `project / area / WP-id`, and `.coordination-head` repeats the id and area on its metadata line. Removing it is a content decision, so it is recorded here rather than deleted in a styling pass.

## Detail pass: pane entry, content identity, and rule-separated sections

**Reference:** `supabase/supabase` (`apps/studio/components/layouts/ProjectLayout/LayoutSidebar/LayoutSidebarProvider.tsx`); `triggerdotdev/trigger.dev` (`apps/webapp/app/routes/_app.orgs.$organizationSlug.projects.$projectParam.env.$envParam.runs.$runParam/route.tsx`; `apps/webapp/app/components/runs/v3/TaskRunStatus.tsx`).

**Borrow:** the shape, and only the shape - one supplementary pane beside a dominant work surface, opened deliberately rather than always present. Supabase's provider separates panel *registration* (a key, a render function, an enable flag) from panel *rendering*, and keeps a single active pane. Concord already has that shape more simply: one inspector with three internal views, so no registry is warranted.

**Do not borrow:** resizable-panel machinery *for the pad of reasons listed below* - the trigger.dev run route is built from 13 `ResizablePanel`s across 7 `ResizablePanelGroup`s, and Supabase's default layout splits content 70/30 through the same primitive. Also not borrowed: Supabase's URL-plus-localStorage pane registration, its `dynamic()` lazy panel loading, or any trace/observability architecture. **Superseded:** the frontend-system pass adopted the primitive behind one Concord-owned wrapper (`frontend/src/layout/PaneSplit.tsx`) for exactly three splits, so the count stayed at 3 groups and 6 panels rather than at the references' scale.

**Divergence worth naming:** both references persist *which* panel is open across reloads. Concord keeps `detailsOpen` in component state, so a reload closes the inspector. That is a behaviour change rather than a visual one, and is left alone here instead of being smuggled into a styling pass.

**Pane entry** (`.inspector`, `frontend/src/styles/features/inspector.css`): the pane fades and settles 14px from the right edge when it mounts. This part is **not** borrowed - neither reference animates its detail pane; both mount it into a layout slot with no transition at all. Entry is one-way: the pane is unmounted on close, so animating exit would mean holding a dismissed pane in the accessibility tree and in the tab order. The pane sits inside the workspace split, whose group clips its overflow, so the offset reads as an emergence from behind the surface's own edge rather than a slide across it. **Superseded:** the offset and opacity are now the shared `paneEnter` preset in `frontend/src/motion/index.ts`, and the pane's left edge is the split's divider rather than a border on the pane.

**Status stays still.** `TaskRunStatus` is a plain enum-to-icon-and-description map across 17 statuses with no transition, duration, or animation class anywhere in it. That is the calibration this pass keeps: status is a semantic reading, not an event, so no motion was added to `.status` or to the run strip.

**Content identity.** The inspector's three views are one keyed section, so switching view mounts new content rather than restyling the old one, and the shared detail swap spends itself on that mount. The same mechanism covers the document reading surface, which is keyed by its subject (a source, or a search query) rather than by each chunk.

BIM needs one React key for this, because its property values change in place. `.bim-property-summary` is keyed by element id and fades; the `全部属性` disclosure is deliberately **outside** that key. It holds open state, and resetting a disclosure in order to animate it would trade a real interaction for a decoration.

**Selected-object rule (superseded).** This paragraph described one implementation for all three master/detail lists: a 2px marker always present at zero size, scaling on the axis it does not own. The marker was later replaced everywhere by the `--accent-muted` selected surface described in the master/detail row grammar above - the marker asked the eye to notice a 2px change in a 46px row and forced every row to reserve that strip so its label would not reflow on selection, which a tinted surface with area does not.

**Rule-separated sections** (`frontend/src/styles/features/operations.css`): the audit list and the capability table rely on their own row and header rules instead of an outer border and a white fill, which only re-boxed the work surface they sit on. Removing those boxes exposed four selectors targeting classes that no longer exist anywhere in the source (`.table-view`, `.capability-view`, `.audit-item`, `.profile-info`) - left over from a structural rename that the stylesheet never followed. They were deleted rather than updated.

Bounded regions were left bounded. The job result (`frontend/src/styles/features/operations.css`) and the operation form are not evidence lists: one is a block of captured output and the other is a form disclosure, and both are legitimately separated from the surface rather than flowing with it.

## Empty states: an instruction where the content would be

**Reference:** `toeverything/AFFiNE` (its empty document list is a centred instruction, not a blank canvas). **Directional only:** Notion's empty pages, Obsidian's empty panes.

**Borrow:** an unselected or unpopulated region states what it is waiting for, using one small icon and one sentence of existing copy. A quiet empty state is a deliberate composition. *(Superseded on placement: the human-review micro-polish pass moved the instruction from the middle of the region to the origin the region's own content starts from, because centred it read as a component-library card floating in a workspace - see that section below.)* The rest of this paragraph is unchanged.

**Do not borrow:** illustration, marketing copy, onboarding checklists, or any invented content to fill the region. The direction is explicit that whitespace is not solved by adding material.

**Where it applies** (`.empty-pane`, `frontend/src/styles/components.css`): the BIM property pane, which has no selected element until the user picks one in the element list. It carries the existing instruction `选择左侧构件查看属性和关联关系` and one small Lucide icon (`MousePointerClick`, already in the dependency); the icon is a 15px `--muted-2` mark and the block is laid out at the property body's own inset. Nothing else was added and no BIM data was invented.

The coordination workspace's ready state is deliberately **not** given one. Its whitespace is a product question - what else a ready work package should report - and dressing it up as an empty state would hide that question rather than answer it.

## No dependency (historical)

That pass introduced no package: every pattern above was expressed in the existing plain-CSS token layer. This is kept because it is the calibration for the current set - the libraries adopted later replaced behaviour that was missing or wrong (dismissal, focus trapping, pane resizing), not behaviour that merely took more lines to write. `frontend/src/components/ui/button.tsx` is still the model for a primitive: CVA variants, no business behaviour, and no reason to exist unless it holds a policy.

## Licenses

The references were inspected as implementation patterns only. Concord contains no copied external source. shadcn/ui and xyflow are MIT; shadcn-admin is MIT; Supabase and Trigger.dev are Apache-2.0; GitHub Desktop, SpaceUI, and AFFiNE are MIT; Spacedrive is Functional Source License 1.1, inspected for layout composition only. AppFlowy is AGPL-3.0: it was used as a directional reference for ease-out desktop pane motion (`easeOutQuad`) and no AppFlowy source, widget, or asset was copied into this repository.

Linear, Obsidian, Notion, and Attio are proprietary products and were used as a directional visual reference only - no source was inspected, and no branding, colour, or identity was copied. Concord's palette, radius scale, and motion tokens were independently derived and are asserted by its own token contract. No attribution notice is required for the independently implemented adaptations in this repository.
