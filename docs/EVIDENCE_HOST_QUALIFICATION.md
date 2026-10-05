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

## Second-round product workspace rehearsal — October 5, 2026

The requested pinned combination of main `583d476`, C `1c08e62`, and B
`9336971` passes 717 frontend tests, 49 transport/style tests, typecheck,
production build, and all ten real Host/browser cases. Adding C's Drawing
preparation reset fix `6b2ebb3` passes 726 frontend tests, typecheck/build,
and all ten real Host/browser cases. Both runs use the actual B host and C
surfaces, with real Golden originals and Docling extraction. All successful
open/reopen paths retain the external-request assertions and worker cleanup.

Two rehearsal failures were reproduced and resolved without changing product
behavior or dropping assertions:

- B's `useViewerChromeLocalization` changes the visible `Sheet` label to
  `图纸`. The Drawing input inherits that accessible name from its label.
  The C-owned Host test now scopes to the real Drawing region and accepts
  exactly either label on its spinbutton, still requiring page 1, a rendered
  canvas and the requested source region. Revision/hash, reopen, failure,
  native navigation and cleanup checks remain unchanged.
- The provisional merge had retained C's older `ProjectSourceRegister` test,
  which searched for the former native source-row button. B's frozen test
  already exercises the real donor table. The scratch tree now uses B's
  complete `9336971` test file, including both Response and DOM Blob download
  cases and its long-name wrapping case. This is a conflict resolution for
  the rehearsal, not a modification pushed to either product branch.

There are five conflict areas to review during the actual integration:
`THIRD_PARTY_NOTICES.md`, `docs/EVIDENCE_VIEWER_ADAPTERS.md`,
`frontend/package.json`, `frontend/pnpm-lock.yaml`, and
`frontend/src/features/ProjectSourceRegister.test.tsx`. The rehearsal keeps
both parties' dependencies/notices and the pinned C PDF dependency; its frozen
combined lock matches the earlier qualification environment. No dependency or
lock change is included in this test continuation.

B's tracked token stylesheet still contains the Google Fonts remote import,
and both the browser server and production build report its import-order
warning. B must remove it rather than depend on the tested CSS processor
ignoring it. Passing browser network assertions does not establish that this
stylesheet is safe under every ordering or native profile.

These results update the source/browser rehearsal only. They do not complete
trusted PDF/CAD publication, native connector delivery, large-model/native
qualification, or persisted R1/R2/R3 product acceptance. Both PRs remain Draft.

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
