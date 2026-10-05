# B donor-pass evidence — historical, not integrated acceptance

The earlier B-only OpenTakeoff shell pass recorded evidence under
`.verification-work/issue-16-product-workspace/`. Those local artifacts and counts
are retained below as **prior-pass reports**, not newly executed checks or results
for the current dirty B/C composition. The prior unqualified phrase “Verified on
this tree” is retired. [VERIFICATION](../VERIFICATION.md) owns the current boundary:
no final integrated tests have passed; PR22 C is pending locally and IFC source
archive preparation fails its hash check. Current non-visual integration results and unexecuted gates are recorded in
`../VERIFICATION.md`; prior visual evidence is historical, not current acceptance.

## Prior B-only record

| Gate | Previously recorded evidence / limit |
| --- | --- |
| Donor copies | Five CSS files compared to B OpenTakeoff `788e39b…`; vendor digests and `audit-vendor.md` |
| TypeScript / production build / formatting | Reported clean in the earlier B pass; not a current-tree pass |
| Unit suite | 64 files / 416 tests reported, not current totals |
| Transport/style | 42 tests reported, including vendored import/font-entry contract |
| Chromium | 34 passes reported in `chromium-final.log`; shell scope only |
| Real IFC/WebGL | 1 pass / 1 failure in `ifc.log`; prior existing-viewer pane persistence issue, not PR22 qualification |
| Real-project persistence | `real-project.log`; no new result asserted here |
| Persisted Finding/ReCheck | 1 pass reported in `engineering.log`; deterministic provider, not a qualified detector |
| Whitespace/protected paths | Prior pass reported checks with viewer/backend paths untouched; does not describe current host edits |

Useful observations: native command/layout dialogs, Work close/focus return,
filter/selection, layout lock/arrangements and navigator search were exercised in
that pass. Focus mode hiding the navigator and left-docked Work ordering followed
donor behavior. Its shell scope-class mismatch and key warning were corrected;
those past corrections are not evidence that all present viewer paths work.

The prior no-egress lane observed the build dropping the vendored Google Fonts
import; the entry intentionally does not re-declare it. Keep that requirement and
verify the actual build/browser output after integration. No font binaries were
adopted, and self-hosting requires rights/asset review. Prior measurements, screenshots
and size accounting are not current layout acceptance or a reason to resume visuals.

## Scope limits

The earlier Linux/Chromium pass did not run packaged Tauri, Windows WebView2 or
macOS WKWebView and was not exhaustive WCAG/screen-reader certification. Historical
main native evidence and isolated PR22 Golden viewer evidence remain separate.
See [PRODUCT_WORKFLOW](PRODUCT_WORKFLOW.md), [donor provenance](UI_DONOR_MIGRATION_MAP.md)
and [viewer seam](EVIDENCE_VIEWER_ADAPTERS.md) for the actual current composition.
