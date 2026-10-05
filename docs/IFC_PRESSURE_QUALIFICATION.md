# IFC pressure and resource qualification (#17)

This continuation qualifies the real pinned IFC Viewer Online integration on
C's `743c4db` plus the pressure-test sources. It changes no production viewer,
product host, shared contract, dependency, lockfile or workflow. PR #22 remains
Draft and Issue #17 acceptance remains incomplete.

## Reproducible sources and gates

`scripts/generate_ifc_pressure_fixture.py` authors synthetic IFC4 models using
locked IfcOpenShell 0.8.5. Every beam has a deterministic GlobalId, independent
placement, shape representation and extruded solid. The rectangular profile is
shared; extrusion depths vary over seven values on a regular grid. These sources
exercise element/metadata count and geometry import, not arbitrary real-project
shape complexity. Inputs, generated manifests and measurements stay in ignored
`.verification-work/ifc-pressure/<count>/` directories.

The generator regression validates exact byte reproducibility, the complete
spatial containment set, distinct geometry and placements, source hashes and
real geometry creation at both selected endpoints. It rejects counts outside
1–100,000 before creating files. The browser lane accepts 1,000–100,000 elements
and retains the production 128 MiB session bound.

The dedicated opt-in `playwright.ifc-pressure.config.ts` runs the real C surface,
SDK, fragment workers, WebGL/WASM and OPFS. It does not mock or stub the engine.
Missing Python BIM packages or local viewer assets fail this lane. Each source
runs one cold session followed by two closed/reopened sessions in the same
browser context. Assertions require:

- exact source revision and full SHA-256 in every model summary;
- at least the authored physical-element count in the loaded donor model;
- one cold index build/write, then warm fragment/index hits with no rebuild;
- successful distant-endpoint navigation acknowledged by the native viewer;
- real BCF selection and scope retaining both GlobalIds and revision/hash;
- an active canvas/worker, followed by zero iframes/canvases/live workers on exit;
- zero additional validator workers and zero external HTTP requests.

The reported element count includes donor metadata entities: 10,012 and 50,012
for sources containing respectively 10,000 and 50,000 geometric beams.

## October 5, 2026 results

Windows, Intel Core Ultra 7 255H (16 logical processors), Chromium 153.0.8010.12,
IfcOpenShell 0.8.5 and the existing pinned donor/lock. These are local headless
browser observations, not WebView, GPU-driver or packaged Desktop qualification.
No resource limit, existing timeout or existing acceptance assertion was changed.

| Source       |      Bytes | Cold model notification | Warm model notifications | Result                |
| ------------ | ---------: | ----------------------: | -----------------------: | --------------------- |
| 10,000 beams |  3,933,016 |              2,042.7 ms |         513.7 / 471.9 ms | Three sessions passed |
| 50,000 beams | 20,276,631 |              5,137.6 ms |     1,118.9 / 1,166.4 ms | Three sessions passed |

The SDK notifies model commitment before asynchronous spatial indexing. Those
notification timings therefore exclude complete tree readiness and are not
end-to-end import timings. The 50,000-element test took about 3.6 minutes including
fixture generation, background indexing, three sessions, navigation, BCF,
screenshots and teardown. Navigation took approximately 5.0–5.4 seconds and BCF
capture 2.0 seconds in that run. Confirmed worker/DOM exit took 1.86–1.89 seconds.

The first 50,000-element attempt used the new lane's inherited 60-second polling
window and stopped before the background index completed. Diagnostics showed a
build in progress and no engine/index failure. The lane now uses the same explicit
120-second index wait as the existing Golden browser case and the donor's minimum
index budget. The isolated rerun passed without production changes; the cold
write, warm hit, provenance, navigation and cleanup requirements were retained.
The result does not establish performance under concurrent qualification load.

The final pressure test records main-target CDP heap/counter samples while active,
after exit, and after removing the disposed test-harness reference and explicit
GC. Complete samples are retained for the final 10,000- and 50,000-element runs. Main-target heap samples do not account
for all worker heaps, GPU memory or process RSS and do not prove absence of leaks.
Cleanup assertions run before forced GC. No fixed heap threshold is claimed.

Four real Python generator tests and all seven existing real IFC/BCF browser
cases passed without skips. The existing frontend
suite passed all 565 tests; typecheck and production build passed. Ruff, generator
Pyright with the qualified Python interpreter, changed-file formatting and
whitespace verification passed before submission. The dedicated pressure
harness/config also passed a separate strict TypeScript check; normal product
typecheck intentionally excludes browser test sources. The existing
bundle-size and SDK warnings are not new runtime failures.

## Reproduction

Use the locked Python BIM environment and the independent pinned IFC build from
`frontend/viewer-integrations/ifc/README.md`. The browser lane is deliberately
separate from normal Web/unit CI. Run from the repository root:

```text
.venv/Scripts/python.exe -m pytest backend/tests/test_ifc_pressure_fixture.py -q
pnpm --dir frontend exec playwright test --config playwright.ifc-pressure.config.ts
```

Use `.venv/bin/python` on POSIX. `CCA_QUALIFICATION_PYTHON` can select an existing
qualified frozen Python environment. If the shared Windows temporary directory
is inaccessible, supply a fresh ignored directory with pytest `--basetemp`.

To reproduce the larger sample, set `CCA_IFC_PRESSURE_ELEMENTS=50000` before
running the same browser command; default is 10,000. Source generation is part of
the browser test, not a manual fabricated result. JSON measurements, screenshots
and Playwright attachments remain local and must not be committed.

## Remaining acceptance

These synthetic pressure samples extend browser/cache/lifecycle evidence only.
They do not complete representative complex-project or native GPU/WebView
qualification, documented native Revit/AutoCAD/Navisworks connector delivery,
packaged engineering runtime acceptance, B's actual post-rebase
product integration or the persisted R1/R2/R3 Golden workflow. Peer approvals and
resolved review conversations remain required; passing this lane does not
permit Ready, merge or business closure.

## Current-main rerun and mixed geometry

The October 5 continuation on C `0ffe506` / main `fb4f5be` reran the grid
scenarios and adds opt-in mixed geometry. Set `CCA_IFC_PRESSURE_GEOMETRY=mixed`
and `CCA_IFC_PRESSURE_ELEMENTS=1000` for genuine hollow circular extrusions,
Boolean subtraction, mapped geometry and nested rotated placements. The default
grid source remains byte-identical. Mixed outputs are separate, and the same
real browser assertions remain in force. Nine source-generator/CLI cases and three
three-session browser scenarios passed. Measurements, setup failures and exact
remaining gates are recorded in [the final acceptance ledger](ISSUE17_FINAL_ACCEPTANCE.md).
These synthetic cases broaden geometry coverage without claiming production
project or packaged Autodesk/WebView acceptance.
