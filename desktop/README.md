# Tauri 2 desktop host

The desktop shell reuses `../frontend` and bundles the Python API with DBOS, SQLite,
and local files. Rust supervises the sidecar, manages the per-launch connection, and
exposes an explicit native file dialog. JavaScript has no arbitrary shell or filesystem
command access. Backend startup failure is displayed, not hidden.

## Source and development build

Install the platform prerequisites from the official Tauri 2 guide: Rust and native OS
WebView development libraries; Windows also needs MSVC Build Tools and WebView2. Build
on the target operating system.

The committed locks are the normal path (not a first-checkout generation step):

```sh
# Requires uv, pnpm 10.17.1, cargo, and rustc on PATH.
python scripts/lock_dependencies.py --check
uv sync --frozen --group dev --extra desktop
pnpm --dir frontend install --frozen-lockfile
uv run --frozen --no-sync python scripts/build_desktop.py --dev

# Release-style source build:
uv run --frozen --no-sync python scripts/build_desktop.py
```

The build entry point checks all three locks, builds the Python sidecar, and uses the
frontend-owned Tauri CLI with Cargo locked. No separate installation in `desktop/` is
needed. When dependencies intentionally change, regenerate and review the affected
locks with `python scripts/lock_dependencies.py`; include manifest and lock changes
together.

On Windows, the sidecar is named `cca-sidecar-x86_64-pc-windows-msvc.exe`. The build
script derives the host triple from rustc; it does not assume Windows on Linux. Tauri
outputs platform bundles under `desktop/src-tauri/target/release/bundle`. A packaged end
user does not install Python, Node, Docker, PostgreSQL, or model keys.

The desktop extra and sidecar build include IfcOpenShell by default. Optional
OR-Tools/Docling must first be installed through uv extras, then included with
`--feature ortools` or `--feature docling`. Docling model weights must be staged
separately for offline PDF parsing. Desktop startup does not seed a demo;
`CCA_SEED_DEMO=true` is an explicit regression/demo opt-in.

## Runtime boundary

The sidecar binds its own socket to `127.0.0.1:0`, prints only the allocated endpoint,
and authenticates with a fresh per-launch token passed privately by Rust. The main
webview receives that token only through a narrowly scoped native command. Native import
accepts only an explicitly selected regular file, checks extension and size before and
after reading, and sends it to the authenticated API. On exit, Rust requests a graceful
backend shutdown before killing any remaining child. Local database state lives in the
operating-system application-data directory.

A trusted launcher may set `CCA_DESKTOP_DATA_DIR` to an absolute directory for
isolated qualification. Relative/empty values fail closed. This is deliberately
separate from the Python development setting `CCA_DATA_DIR` and is not a renderer
command or file permission. Windows WebView test storage is isolated separately
using `WEBVIEW2_USER_DATA_FOLDER`; Linux uses the XDG environment variables.
The Windows WebDriver session also receives that exact folder through Microsoft's
[`webviewOptions.userDataFolder`](https://learn.microsoft.com/en-us/microsoft-edge/webdriver/capabilities-edge-options#webviewoptions-object)
capability so the driver and WebView agree on their automation profile.
Windows CI invokes `scripts/windows_native_user.py` to restrict only the harness
and its descendants to normal-user rights. WebView2 150+ intentionally ignores
environment overrides from elevated hosts ([Microsoft explanation](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5640#issuecomment-4923662109)).
The launcher uses Windows SAFER and Medium integrity under the same account;
it changes no registry policy, filesystem ACL or product binary. Failures to
create the restricted process fail qualification rather than skipping the test.

## Native WebView regression

Build through `scripts/build_desktop.py` / the Tauri CLI, which embeds the frontend.
A plain Cargo build can retain the development URL and is not a packaged UI test.
Install `tauri-driver` and the native driver following the
[official Tauri instructions](https://v2.tauri.app/develop/tests/webdriver/manual-setup/).
Windows needs `msedgedriver` matching its WebView2 version; Linux needs
`WebKitWebDriver` and a display (for example xvfb).

```powershell
python scripts/native_webdriver_smoke.py --application desktop/src-tauri/target/release/construction-coordination-agent.exe --output artifacts/native-webview.json

# Real packaged WebGL/worker/WASM and explicit IFC import, with no CCA_BIM override:
python scripts/generate_ifc_fixture.py
python scripts/native_webdriver_smoke.py --application desktop/src-tauri/target/release/construction-coordination-agent.exe --ifc-fixture fixtures/harbor-east.ifc --output artifacts/native-ifc.json
```

This launches the real packaged WebView and sidecar with isolated synthetic data,
submits a change through the current UI, verifies approval is required, executes
the simulated action, and checks a fresh READY snapshot through the authenticated
sidecar API. JSON, driver logs and a screenshot are written under `artifacts`;
isolated application data stays in `.verification-work/native-webview-*` for
inspection. The manual native CI workflow runs this on Windows and Linux. This
regression does not claim new-project UI/IFC-diff joint acceptance or installation
and signing qualification.

The IFC scenario selects the generated real IFC through the WebView's native file
input, renders its geometry, confirms opening a local file does not publish it,
explicitly imports it, checks three parsed elements and the downloaded original's
SHA-256, and reopens the persisted model. It uses the default desktop IfcOpenShell
provider; only demo-project creation is opted in for this regression. WebDriver file
selection does not qualify the OS file picker. This scenario also runs in the
Windows/Linux native workflow, with separate JSON and screenshots.

The packaged HTTP and Agent smoke commands also write their `--output` JSON on
failure, before removing temporary fixture data. Reports retain startup stages
(`launch`, `endpoint`, `health`, `ready`), endpoint/startup timings and child exit
codes. Failure reports include bounded stdout/stderr tails with the per-run API
token redacted. The existing CI artifact upload retains these JSON files even
when a check fails. The sidecar's total startup budget remains 30 seconds; these
diagnostics do not add retries or convert a failure into a pass.

## Qualification and release

Full source/integration CI and Windows native qualification, including manual Windows
installer acceptance, are established for the current team-development baseline. Build
and verify native changes on the target operating system. Linux and macOS native
qualification, code signing/notarization, and final production-release qualification
remain separate future release work. A source or target build alone does not establish a
signed, notarized, or distributable release.

See [STATUS.md](../STATUS.md) and [VERIFICATION.md](../VERIFICATION.md) for the current
verification boundary.
