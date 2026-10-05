# Combined Evidence host qualification — October 5, 2026

Issue #17 / Draft #22 supplies the C viewers. Draft #24 supplies B's actual
`frontend/src/app/EvidenceWorkspaceHost.tsx`. This qualification is deliberately
separate from standalone C qualification and refuses to run without that host.

## Pinned inputs and boundary

The scratch tree combines main `583d47660ef3ab6c15cc126f77d46226a1c791e1`,
C `7c179a8` (local-font fix atop `db8198d`) plus the
qualification files in this continuation, and B
`5fca9ebbedaf4578766a9fc69266ef9677e73757`. No scratch checkout is pushed.
Dependency conflict resolution keeps B's UI packages and C's pinned PDF package.
Document and Blob-test conflict choices remain provisional for the later B rebase.

The browser harness imports B's real host. It replaces HTTP transport with exact
Golden originals and a real Docling extraction generated before the suite. Host
hashing, exact revision selection, lazy surfaces, PDF parsing, native CAD and IFC
renderers, navigation, failure delivery and disposal remain real. This is not an
end-to-end backend publication/approval test, a packaged WebView run, or the final
R1/R2/R3 product walkthrough.

## Result

All ten real browser cases pass:

- Drawing, CAD, BIM and Document open and reopen at the explicitly selected
  revision, even when a newer unselected revision exists.
- Native CAD entity and IFC selection/fitting require successful adapter replies;
  Drawing checks its rendered sheet/region and Document its selected actual cell.
- Closing removes viewer iframes/canvases and releases observed workers.
- Each surface reports a failed navigation on the selected Evidence.
- Corrupted source bytes fail before renderer mounting.
- A non-null reserved BIM viewpoint fails visibly.
- All four successful open/reopen paths make no external HTTP requests.

The existing two Host unit suites pass 46 tests. Standalone C qualification passes
540 frontend tests, typecheck/build and 45 independent CAD tests. The four real
CAD browser scenarios pass, including 1,028 native snapshot entities, eight
preparation yields, native targeting, warm comparison reuse and cleanup. The
comparison reported zero additional source parses. These small/pressure samples
do not establish large IFC throughput.

The initial combined CAD run exposed intermittent CDN font catalog requests from
the donor text worker before asynchronous font URL configuration. The build now
changes only the pinned worker default to a URL relative to the local worker;
changed/ambiguous upstream defaults fail the build. Asset copying creates an empty
local `fonts/fonts.json` when absent and preserves a supplied licensed catalog.
Missing-font quality remains explicit. The complete Host suite and three further
CAD open/reopen repetitions passed after the fix; no network assertion was removed.

The combined tree also passes all 690 frontend tests, typecheck/build and 44
transport/style checks. The 46 Host unit cases are included in that 690 count.
The build reports a CSS import-order warning for B's imported OpenTakeoff token
stylesheet, which contains a Google Fonts import. It was discarded by the CSS
processor in this run and did not generate an external request. B should remove
that remote import before relying on a different stylesheet order or native
profile. Existing bundle-size warnings remain; no limit was increased.

## Reproduction

Use an isolated agreed main + C + B rehearsal with the frozen dependency sets.
Build the existing local Drawing/PDF, CAD and IFC assets using their documented
independent build paths before browser qualification. Real Docling and the Golden
fixture tree must be installed; missing dependencies are not replaced with fakes.

From `frontend/` in that combined tree:

```text
pnpm exec tsc --noEmit
pnpm build
pnpm exec vitest run src/app/EvidenceWorkspaceHost.test.tsx src/app/EvidenceWorkspaceHost.integration.test.tsx
pnpm exec playwright test --config playwright.evidence-host.config.ts
```

`CCA_QUALIFICATION_PYTHON` may point to the existing frozen Python environment;
otherwise the suite uses the checkout's `.venv`. Docling extracts the real Golden
XLSX to `.verification-work/document-viewer` before browser assertions. The harness
is test-only and is absent from the product build. Browser screenshots/traces and
extraction files are local verification output and are not committed.

## Remaining acceptance

B must repeat combined product/Host/Golden qualification after the actual #24
rebase and review conflict choices. A review of startup registration and positive
ReCheck/current-input behavior remains required. Trusted PDF/CAD invocation and
publication, documented native host connectors, large-model/native qualification
and final integrated Golden acceptance are still outstanding. #22 stays Draft;
green checks do not authorize merge or close the business acceptance.
