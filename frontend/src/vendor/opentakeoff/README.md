# OpenTakeoff workspace donor (vendored)

Product UI baseline for Concord. These files are OpenTakeoff's own workspace
frontend, adopted as the Concord product shell instead of being re-designed.

- Project: OpenTakeoff, Copyright 2026 Kentucky AI and the OpenTakeoff contributors
- Source: https://github.com/Kentucky-ai/opentakeoff
- Revision: `788e39bfe9c42b3260ea75e84a655e4574f9bc8c`
- License: Apache-2.0. Distributed copy:
  `frontend/public/licenses/OpenTakeoff-APACHE-2.0.txt`; upstream NOTICE:
  `frontend/public/licenses/OpenTakeoff-NOTICE.txt`.

## Copied verbatim (byte-identical, unmodified)

| File | sha256 (first 16) | bytes | Upstream path |
| --- | --- | --- | --- |
| `styles/tokens.css` | `9521e2ea2e9edfb8` | 11926 | `web/src/styles/tokens.css` |
| `styles/app.css` | `d4fd2427fdc8bc98` | 7089 | `web/src/styles/app.css` |
| `styles/premiumWorkspace.css` | `be88cc285f1f96d5` | 5337 | `web/src/styles/premiumWorkspace.css` |
| `components/workspaceChrome.css` | `c7869495b383a291` | 13351 | `web/src/components/workspaceChrome.css` |
| `components/workspacePanel.css` | `2ad05c6597325e7f` | 5449 | `web/src/components/workspacePanel.css` |

These five stylesheets own the workspace look: surface, chrome, density,
spacing, typography hierarchy and the docked panel geometry. Concord does not
re-style them and does not maintain a second control family beside them.

## Ported with type annotations only

| Concord file | Upstream | Change |
| --- | --- | --- |
| `brand/icons.tsx` | `web/src/brand/icons.jsx` | JSX → TSX, prop types added |
| `lib/ui.ts` | `web/src/lib/ui.js` | parameter types added |
| `lib/keys.ts` | `web/src/lib/keys.ts` | none (already TypeScript) |

## Ported with product edits

`web/src/lib/workspaceLayout.js`, `web/src/lib/focusMode.js`,
`web/src/components/WorkspaceLayout.jsx`, `web/src/components/WorkspaceChrome.jsx`
and `web/src/components/WorkspacePanel.jsx` live at their Concord paths
(`frontend/src/layout/`, `frontend/src/app/`, `frontend/src/features/WorkPanel.tsx`)
because they are edited for the Concord product: TS, Chinese copy, Finding /
Evidence / work data binding, and the Concord dock set. Their donor structure,
class names, keyboard behavior and CSS contracts are unchanged; the only
structural difference is which docks exist (Concord has Work and the source
navigator; the donor's measuring-tools, Sheets and Takeoffs docks have no
Concord counterpart).

## Not adopted

Flooring, measurements, takeoff quantities, bidding, estimating, OCR,
geometry/takeoff engines, condition business, report business and agent takeoff
logic are not copied. `TakeoffCanvas.jsx` and `premiumWorkspace`'s
takeoff-specific rules are not part of this vendoring beyond the shared chrome
stylesheet above.
