# Issue #17 final acceptance ledger

This ledger separates C-owned engineering qualification from native host delivery,
A-owned packaging and B-owned product acceptance. PR #22 remains Draft. Checked
boxes record only the named evidence; none substitutes for final peer approval.

## Reviewed inputs

- Browser qualification used main `fb4f5be`, which includes #25, #26 and #27.
- Before publication, the branch also consumed #28 from main `3871ddc`.
- C source head `0ffe506` contains the engineering adapters and trusted executors.
- This continuation adds only opt-in mixed-geometry fixtures/tests and this ledger.
- B/#24 at `b0287dc` supplies the Evidence host in a separate branch.
- Merged A/#28 supplies the optional Python executor packaging fix. Its executable
  qualification is A's evidence, separate from C's local browser checks.

## C qualification on October 5, 2026

| Check                                             | Result                | Scope and limit                                                                                |
| ------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------- |
| Connector staging and engineering resource bounds | 41 cases passed       | Export-byte staging, metadata/size checks, native-format rejection; no Autodesk host execution |
| Original pressure fixture generation              | Four cases passed     | Real IFC geometry and byte reproducibility                                                     |
| Extended generator tests                          | Seven cases passed    | Includes mixed geometry, nested placements, real mesh/volume checks and invalid-mode rejection |
| 10,000-beam IFC                                   | Three sessions passed | Distinct extrusions; exact revision/hash, navigation, BCF, cache and cleanup                   |
| 50,000-beam IFC                                   | Three sessions passed | Same assertions; source size 20,276,631 bytes                                                  |
| 1,000-element mixed IFC                           | Three sessions passed | Hollow circular profiles, Boolean cuts, mapped geometry and eight nested placement groups      |

The mixed fixture contains genuine IFC geometry. Its eight navigation targets
cover all four representation families at both ends of the model, including
rotated parent placements. Python checks real triangulation and positive volume;
the opening removes material and mapped geometry scales it. The existing browser
lane requires native selection/fitting acknowledgements and BCF scope for every
target. No expected engine outcome is written into the fixture. Nine generator/CLI tests
passed; the two fixture modules measured 98% combined branch/statement coverage
(the new mixed-geometry helper is 100%). This is scoped coverage, not a repository
coverage claim. The dedicated browser harness TypeScript check, changed-script
Pyright, project Pyright, Ruff and changed-file formatting passed.

All browser runs use the pinned Chromium/IFC donor with a cold session and two
closed/reopened sessions. They require exact revision and SHA-256, warm fragment
and index hits, no extra validator workers, no external HTTP requests and zero
observed viewer workers/iframes/canvases after exit. CDP main-target heap samples
exclude worker heaps, GPU allocations and process RSS.

| Source               |      Bytes | Cold model notification | Warm model notifications |             Exit cleanup |
| -------------------- | ---------: | ----------------------: | -----------------------: | -----------------------: |
| 10,000 grid beams    |  3,933,016 |              1,702.0 ms |         498.5 / 530.3 ms |       756 / 758 / 763 ms |
| 50,000 grid beams    | 20,276,631 |              4,920.1 ms |     1,105.1 / 1,206.3 ms | 1,956 / 1,887 / 1,919 ms |
| 1,000 mixed elements |    466,640 |              1,219.4 ms |         437.8 / 384.8 ms |       173 / 192 / 199 ms |

Notification precedes asynchronous spatial indexing. These are local headless
browser timings, not full import timings, native WebView results or a production
project throughput guarantee. Synthetic complexity does not establish acceptance
of arbitrary exporter versions, linked real projects or custom CAD font libraries.

### Setup findings

The first Python run could not create fixtures in the shared Windows temporary
directory. A new short `--basetemp` passed without code changes. The first browser
attempt failed after Vite reported an unresolved optional Host dependency in the
shared local dependency tree. Restoring the combined tree's frozen installation
resolved that setup, and all three model runs passed without weakened assertions.
The pnpm 11 installer reported ignored esbuild lifecycle scripts after linking
packages; Vite subsequently executed successfully. No manifest/lock/workflow was
changed. The initial new mesh test discarded a borrowed IfcOpenShell shape owner;
retaining the shape object fixed that test's lifetime, without changing geometry.

Reports, meshes, traces and screenshots remain ignored local outputs. Independent
native GUI, Autodesk host and installed-runtime results must be recorded separately.

## Acceptance gates

- [x] Current main integrated with both IFC/IDS and PDF/CAD settings preserved.
- [x] Trusted PDF/CAD Python/Node execution and normalized publication implemented.
- [x] Dual-source clash and versioned IDS consume the merged shared contract.
- [x] Real 10,000/50,000-element viewer cache and lifecycle regression rerun.
- [x] Additional mixed-geometry viewer navigation/BCF/cache/lifecycle qualification.
- [x] Native-format rejection and exported-byte staging regressions rerun.
- [ ] C: Revit and AutoCAD documented host adapters with deterministic contract
      tests, then host-export to persisted `ProjectSourceRevision` qualification.
- [ ] C: identify and qualify a real Navisworks connector/converter interface;
      the pinned Speckle reference has no Navisworks implementation. Its current
      unavailable state is not a completed native connector.
- [ ] A: accept #28 and qualify the merged/current packaged Python executor and
      operator-provisioned Node/Chromium/assets. A's reported executable evidence is
      not C's independent rerun and does not cover the Tauri installer/WebView.
- [ ] A + C: qualify IFC/IDS dependencies and viewer resources in the actual
      packaged runtime. Check startup, recovery, corruption/error state and disposal.
- [ ] B: rebase/integrate #24 against the reviewed final C head and current main;
      retain both owners' dependencies, notices and complete source-register tests.
- [ ] B + A + C: final persisted R1/R2/R3 product story with real source revisions,
      immutable artifacts, canonical Changes/Evidence, current-input ReCheck fences,
      human closure and exact-target open/reopen. Prior Host tests replace transport
      with Golden files; they cannot satisfy this gate.
- [ ] Required reviews/approvals, all current-head CI and resolved discussions.

C owns native connector implementation. A owns transport/authentication,
installation and runtime lifecycle; B owns invocation and product composition.
The local checkout has no current built Tauri application, and Autodesk hosts/SDKs
were not found in their standard installation directories. Target host versions
and an available licensed test machine need coordination. Staging tests are not
claimed as host authentication, export or persistence enforcement.

## Reproduction

Use the existing locked BIM Python environment and pinned local viewer assets.
Missing dependencies fail the opted-in qualification instead of fabricating a
pass. Run from the repository root:

```text
uv run --frozen --no-sync pytest -q backend/tests/test_aec_connectors.py backend/tests/test_engineering_limits.py backend/tests/test_ifc_pressure_fixture.py --basetemp <new-short-directory>
pnpm --dir frontend exec playwright test --config playwright.ifc-pressure.config.ts
```

For the larger grid set `CCA_IFC_PRESSURE_ELEMENTS=50000`. For mixed geometry set
`CCA_IFC_PRESSURE_ELEMENTS=1000` and `CCA_IFC_PRESSURE_GEOMETRY=mixed`. Default grid
fixture bytes and identities are unchanged. Mixed reports use a separate
`.verification-work/ifc-pressure/<count>-mixed/` directory. See
[IFC pressure qualification](IFC_PRESSURE_QUALIFICATION.md) for the existing lane,
[comparison deployment](COMPARISON_DEPLOYMENT.md) for A's provisioning boundary,
and [Evidence host qualification](EVIDENCE_HOST_QUALIFICATION.md) for B's earlier
pinned rehearsal. Run the new head's standard checks before requesting review.
