# Issue #16 substrate-replacement qualification

## Status: in progress, not qualified for delivery

Fresh evidence is under `.verification-work/issue-16-substrate-replacement/`.
Earlier evidence under `.verification-work/issue-16-donor-conformance/` is
historical reference only; its passing results and screenshots do **not**
qualify the current tree. No commit, push or PR has been made.

Ownership and donor revisions are recorded in
[the migration map](UI_DONOR_MIGRATION_MAP.md). Distribution notices are in
`THIRD_PARTY_NOTICES.md`.

## Current gates

Run frontend commands with `corepack pnpm` from `frontend/`
(pinned pnpm 10.17.1). Results below distinguish completed checks from runs
still being reconciled.

| Gate                                        | Current evidence                                                                                                                                                                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused controlled input / tabs / Inspector | **23 passed in 2 files**; `qualification-controlled-input.log`                                                                                                                                                                          |
| Transport/token/style                       | **39 passed** after shared CSS-owner cleanup, including the new native/donor boundary regression; `final-transport.log`                                                                                                                 |
| Formatting lint                             | Passed after shared CSS-owner and Project row-density fixes; `final-lint.log`                                                                                                                                                           |
| TypeScript / production build               | Passed after shared CSS-owner and Project row-density fixes; `final-typecheck.log`, `final-build.log`                                                                                                                                   |
| Full unit suite                             | **416 passed across 64 files** after all current production/style edits; `final-unit.log`                                                                                                                                               |
| Full Chromium                               | Full final-build lane running (`final-chromium.log`). Prior focused lane passed all three Findings error/retry cases; exposed obsolete Project selector and 33px donor rows, now fixed without relaxing the 56–62px invariant           |
| Persisted engineering Finding/ReCheck       | Final-build persisted lane pending/running; `final-engineering.log`. Earlier **1 passed** is not final-build evidence                                                                                                                   |
| Real IFC/WebGL                              | Focused current-owner lane: **2 passed**, including wrapping/clipboard/import/download. Full final-build rerun running; `final-ifc.log`                                                                                                 |
| Unseeded real-project persistence           | Final-build isolated persistence lane running; `final-real-project.log`. Earlier **3 passed** is not final-build evidence                                                                                                               |
| Whitespace / protected paths / fixtures     | Current whitespace and protected-path audit passed (`current-protected-paths.log`): no changed/untracked backend, database, fixture or viewer paths. Preserve pre-existing changes; final audit after ownership cleanup remains pending |

Historical full-unit passes cannot substitute for current integrated adapter
qualification. Incomplete AFT diagnostics are reported as incomplete, never as
a clean compile gate; CLI typecheck/build are authoritative.

## Adapter regressions addressed

- Dropdown values are assigned after asynchronous donor options reflect their
  values, preserving React's controlled selection.
- Disabled dropdown interaction is blocked and shadow-trigger tab order is
  restored when enabled. The real shadow combobox owns the accessible name;
  the host does not impersonate another combobox.
- Donor popup Escape handling takes precedence over the containing Radix
  dialog's dismissal.
- Complex React button content stays in light DOM and is projected through a
  named slot inside the donor label, preserving domain CSS and the donor hit surface.
  Constructor
  identity, native validation/submission, disabled behavior, consumer keyboard
  cancellation, double-click and accessible-name behavior have focused tests.
- Text inputs expose the actual shadow textbox without duplicate host naming.
  React's controlled value is applied to the live input after Lit commits:
  resetting typed R4 consent before a Lit render completes must clear it.
  Cancelled effects cannot apply stale state after a rerender.
- Tabs retain actual donor instances, React portal callbacks and selected-tab
  state across updated labels; keyboard selection is exercised.
- Unit queries traverse actual donor shadow roots and light-DOM React slots
  where needed. Domain assertions
  about approvals, project fences, semantic retrieval and evidence remain;
  moving text into shadow DOM is not grounds for weakening those assertions.

## Surface and CSS ownership

ThatOpen owns adopted controls, panels, tables and toolbars. React retains
queries, routing, lifecycle, evidence targets, selection and domain callbacks.
Radix retains application menu and modal focus semantics where the donor API
is not equivalent. Native form-associated, file/date/password/checkbox/radio
controls remain intentional platform-semantic exceptions.

Work uses the adapted OpenTakeoff WorkspacePanel structure with a shared
query/filter/list, bounded paging and selected receipt/review. The independent
WorkPeek and useWorkSelection owners are removed. PaneSplit remains the sole
resizing engine; viewer geometry and docking must be verified after CSS edits.

`measure.mjs` measures physical lines against the **initial current-worktree
baseline**, not HEAD. It separates production TSX, CSS, tests/support, fixtures,
documentation and licenses. Production TSX is limited to
`src/{app,components,features,layout}` and includes domain orchestration;
it is not a pure presentation-only count. Totals do not prove deletion of
imitation CSS. Latest `final-metrics.json` measures **11,958 CSS lines (-1,260)**
and **14,359 production TSX lines (+241)**. TSX reduction is therefore **not**
established. Tests/support: **18,358 lines**; fixture TSX: **146 lines**;
fixture asset bytes are reported separately (**95,418 bytes**, including PDFs).
Documentation and licenses have separate totals. The read-only selector audit
identified shared button/trigger paint, the outer menu surface, repeated toolbar
owners and obsolete select skins. Those five owners were corrected: native
`button.button-*` rules retain form/viewer presentation; donor properties/tokens
own ordinary actions; Radix retains menu mechanics; `bim-panel` owns its surface;
`local-actions` has one toolbar bridge; the old select skin is removed. Native
active-descendant command options and viewer/form exceptions remain intentionally.
Final browser/visual qualification remains pending.

## Screenshots and browser limits

The browser lane refreshed 24 surface and 6 focus captures against the 15:46
build, with asset hashes and timestamps in `browser-qualification-artifacts.json`.
Its three remaining ownership failures and test reconciliation are recorded in
`browser-qualification.md`. Subsequent named-slot, retry, title-token and identifier
wrapping edits invalidate treating these captures as final acceptance evidence.
Current-build captures must be refreshed and visually reviewed.

Real backend lanes require independent ports/data/processes. Deterministic
engineering test providers qualify persistence and human decision/ReCheck
behavior, not production detection algorithms. SQLite test databases are not
PostgreSQL production certification.

Packaged Tauri, Windows WebView2 and macOS WKWebView were **not run** in this
Linux environment. Those platform smoke checks remain external. Chromium
keyboard/name/focus checks are not exhaustive WCAG or screen-reader
certification.
