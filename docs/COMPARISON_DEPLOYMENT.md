# Operator deployment of the optional PDF/CAD comparison pack

Refs #17 and C's #22. A owns configuration, startup, recovery and distribution.
C owns the fixed executor, engine/mapper identities and viewer assets. This entry
does not provision software on startup or alter authoritative publication rules.

## Enable through ordinary startup

All profiles keep both comparisons disabled by default. Deploy C's
`app.adapters.trusted_comparisons.PinnedComparisonExecutor` and its frozen frontend
pack first. In the environment of `cca serve` (or `app.api.main:create_app`), set:

```text
CCA_PDF_COMPARISON_ENABLED=true
CCA_CAD_COMPARISON_ENABLED=true
CCA_COMPARISON_FRONTEND_ROOT=/absolute/operator-owned/Concord/frontend
CCA_COMPARISON_NODE=/absolute/operator-owned/node
```

Each switch selects only that executor. The root is the frontend directory,
containing `viewer-integrations/trusted/runner.mjs`, the built `dist` pack and its
locked Node dependencies. Windows accepts absolute paths such as
`E:/Concord/frontend` and `C:/Program Files/nodejs/node.exe`. Node is optional:
omitting its setting retains C's fixed runner with the operator's `PATH` Node.
Configure the process before launching it; changing environment requires restart.
No project upload, HTTP request or agent tool can change these paths or switches.

Executable assets and Node must reside outside `CCA_DATA_DIR` (including uploads).
Paths are resolved before this check, including directory links. Operators must
protect the checkout, Node, dependencies, browser cache and built assets from
project users. An absolute path does not itself prove filesystem access control.

The standard API lifespan builds these lightweight executors before calling
`build_services`. The existing function keeps `comparison_executors=()` and
explicit injection behavior; C's `engineering_capabilities=None` semantics remain
unchanged when combining with #22. Both registries are populated before runtime
creation and queued-run recovery. A supplied API `service_override` remains
authoritative and bypasses configured construction.

Absent C adapter code is an explicit startup configuration error only when a
comparison is selected. Missing pack/Node/Chromium fails as unavailable on use;
there are no fallback engines or automatic downloads. Registration identifies the
selected executor, not a successful browser-health probe. Disabling an executor
does not discard saved jobs: restore the same pack/name/version before retrying
pending work. Upgrade identities explicitly; never silently substitute a browser.

## Provision outside startup

Use an operator-controlled checkout combining the A deployment change and the
exact reviewed C delivery. With C's existing frozen locks, run its build sequence:

```text
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend exec playwright install chromium
pnpm --dir frontend viewer-assets
pnpm --dir frontend/viewer-integrations/cad install --frozen-lockfile
pnpm --dir frontend/viewer-integrations/cad build
node frontend/viewer-integrations/trusted/build.mjs
```

Retain the resolved dependencies needed by the fixed Node runner, both build
outputs, manifest, local PDF/CAD assets, pinned Playwright Chromium installation,
and all dependency/browser notices. The build output alone is not a self-contained
runtime bundle. Build and execute as the intended service account, or explicitly
provision its browser cache using Playwright's supported deployment configuration.
C `584d6c4` pins Playwright 1.63.0 and Chromium 153.0.8010.12; its runner verifies
both. Node 24.15.0 is C's qualified local environment, not a new core requirement.
Read C's `docs/PINNED_COMPARISON_EXECUTORS.md` for limits and reproducible real-engine
tests; that document is delivered with #22, not copied into this platform PR.

Run the opt-in real PDF/DXF and fresh-process recovery/cache tests as the deployed
account before accepting a runtime. Missing engines must fail this qualification,
not skip. Keep application data backed up and intact when replacing assets. Roll
back to the exact previous pack identity if resuming its saved jobs.

## Ownership and acceptance

A owns registration, runtime provisioning, restart/recovery configuration, notices
and any future Desktop bundle. C supplies engine bytes and qualification; B owns
the product host and persisted Golden walkthrough. This configuration change is
not an Autodesk connector, packaged Tauri/browser distribution or final #17
acceptance. No C implementation, dependency lock, CI workflow, generated contract
or B product source is included in this PR. Merge/integration and peer review
remain necessary before claiming a release is deployed.
