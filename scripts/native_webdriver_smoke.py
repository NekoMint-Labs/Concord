"""Drive the actual packaged Linux Tauri WebView through native WebDriver.

Requires an isolated Linux GUI session (for example xvfb-run + dbus-run-session),
WebKitWebDriver and tauri-driver. No browser/API mocks, paid credentials, testing
plugins, or source Python sidecars are substituted. Windows/macOS GUI sign-off is
separate; this harness does not claim to verify their platform WebViews.
"""

import argparse
import base64
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf"


class WebDriverError(RuntimeError):
    pass


class NativeSession:
    def __init__(self, client: httpx.Client):
        self.client = client
        self.session_id = None

    def request(self, method: str, path: str, payload=None):
        response = self.client.request(method, path, json=payload)
        try:
            body = response.json()
        except ValueError as exc:
            raise WebDriverError(
                f"Non-JSON WebDriver response: HTTP {response.status_code}"
            ) from exc
        value = body.get("value")
        if response.is_error or isinstance(value, dict) and value.get("error"):
            code = value.get("error", "unknown") if isinstance(value, dict) else "unknown"
            raise WebDriverError(f"WebDriver {code}: HTTP {response.status_code}")
        return value

    def start(self, application: Path):
        value = self.request(
            "POST",
            "/session",
            {
                "capabilities": {
                    "alwaysMatch": {"tauri:options": {"application": str(application.resolve())}}
                }
            },
        )
        if not isinstance(value, dict) or not isinstance(value.get("sessionId"), str):
            raise WebDriverError("Driver did not create a W3C session")
        self.session_id = value["sessionId"]
        self.request(
            "POST", self.path("timeouts"), {"script": 15000, "pageLoad": 30000, "implicit": 0}
        )

    def path(self, suffix: str) -> str:
        if self.session_id is None:
            raise WebDriverError("No native session is active")
        return f"/session/{self.session_id}/{suffix}"

    def script(self, code: str, *args):
        return self.request("POST", self.path("execute/sync"), {"script": code, "args": list(args)})

    def wait(self, code: str, *args, timeout: float = 45):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            value = self.script(code, *args)
            if value:
                return value
            time.sleep(0.2)
        raise WebDriverError("Native UI did not reach its asserted state before the deadline")

    def click(self, root: str, label: str, *, startswith: bool = False):
        element = self.wait(
            """
            const buttons = [...document.querySelectorAll(arguments[0] + ' button')];
            const button = buttons.find(value => arguments[2]
                ? value.textContent.trim().startsWith(arguments[1])
                : value.textContent.trim() === arguments[1]);
            return button && !button.disabled ? button : null;
        """,
            root,
            label,
            startswith,
        )
        identity = element.get(ELEMENT_KEY) if isinstance(element, dict) else None
        if not identity:
            raise WebDriverError("Driver did not return a native DOM element")
        # Real WebDriver click, not an API request or a DOM .click() bypass.
        self.request("POST", self.path(f"element/{identity}/click"), {})

    def close(self):
        if self.session_id is not None:
            try:
                self.request("DELETE", f"/session/{self.session_id}")
            finally:
                self.session_id = None


def prerequisites(application: Path):
    if not sys.platform.startswith("linux"):
        raise RuntimeError(
            "This isolated harness verifies Linux only; use target-OS GUI acceptance elsewhere"
        )
    if not application.is_file() or not os.access(application, os.X_OK):
        raise RuntimeError("Build the native release application before running WebDriver")
    missing = [name for name in ("tauri-driver", "WebKitWebDriver") if shutil.which(name) is None]
    if missing:
        raise RuntimeError("Missing native WebDriver prerequisite(s): " + ", ".join(missing))
    if not os.environ.get("DISPLAY"):
        raise RuntimeError("A Linux display is required; use xvfb-run -a dbus-run-session")


def free_ports() -> tuple[int, int]:
    with socket.socket() as first, socket.socket() as second:
        first.bind(("127.0.0.1", 0))
        second.bind(("127.0.0.1", 0))
        return first.getsockname()[1], second.getsockname()[1]


def exercise(application: Path, artifacts: Path) -> dict:
    prerequisites(application)
    artifacts.mkdir(parents=True, exist_ok=True)
    work = ROOT / ".verification-work"
    work.mkdir(exist_ok=True)
    port, native_port = free_ports()
    with tempfile.TemporaryDirectory(dir=work, prefix="native-webview-") as temporary:
        folder = Path(temporary)
        env = {key: value for key, value in os.environ.items() if not key.startswith("CCA_")}
        # Tauri's Linux app_data_dir resolves through XDG; never use real user data.
        env.update(
            XDG_DATA_HOME=str(folder / "data"),
            CCA_SEED_DEMO="true",
            CCA_BIM="structured",
            XDG_CACHE_HOME=str(folder / "cache"),
            XDG_CONFIG_HOME=str(folder / "config"),
        )
        with (artifacts / "native-webdriver.log").open("w") as log:
            driver = subprocess.Popen(
                [
                    shutil.which("tauri-driver"),
                    "--port",
                    str(port),
                    "--native-port",
                    str(native_port),
                    "--native-host",
                    "127.0.0.1",
                ],
                cwd=folder,
                env=env,
                stdout=log,
                stderr=subprocess.STDOUT,
                start_new_session=True,
            )
            try:
                with httpx.Client(
                    base_url=f"http://127.0.0.1:{port}",
                    timeout=45,
                    trust_env=False,
                    follow_redirects=False,
                ) as client:
                    deadline = time.monotonic() + 20
                    while True:
                        if driver.poll() is not None:
                            raise WebDriverError(
                                "tauri-driver stopped; inspect native-webdriver.log"
                            )
                        try:
                            response = client.get("/status", timeout=2)
                            if response.is_success:
                                break
                        except httpx.TransportError:
                            pass
                        if time.monotonic() >= deadline:
                            raise WebDriverError("Native driver failed to start")
                        time.sleep(0.2)
                    session = NativeSession(client)
                    try:
                        session.start(application)
                        session.wait("return !!document.querySelector('.application-shell')")
                        session.wait(
                            "return "
                            "document.querySelector('.timeline-runtime')?.textContent === "
                            "'dbos'"
                        )
                        session.wait(
                            "return "
                            "document.querySelector('.profile-tag')?.textContent.startsWi"
                            "th('desktop /')"
                        )
                        inspector = ".inspector"
                        session.wait(
                            (
                                "return "
                                "document.querySelector(arguments[0])?.textContent.includes('"
                                "READY')"
                            ),
                            inspector,
                        )
                        session.click(".demo-strip", "Drawing V16", startswith=True)
                        session.wait(
                            (
                                "return "
                                "document.querySelector(arguments[0])?.textContent.includes('"
                                "BLOCKED')"
                            ),
                            inspector,
                        )
                        assert session.script("""
                            const button = [...document.querySelectorAll('.inspector button')]
                                .find(value => value.textContent.trim() === 'Execute & re-check');
                            return button?.disabled === true;
                        """), "Unapproved native execution was not disabled"
                        session.click(inspector, "Approve R", startswith=True)
                        session.wait(
                            "return [...document.querySelectorAll('.inspector "
                            "button')].some(b => b.textContent === 'Approved')"
                        )
                        session.click(inspector, "Execute & re-check")
                        session.wait(
                            "return "
                            "document.querySelector('.inspector')?.textContent.includes('"
                            "READY')"
                        )
                        session.wait(
                            "return "
                            "document.querySelector('.timeline-heading')?.textContent.inc"
                            "ludes('COMPLETED')"
                        )
                        assert not session.script(
                            "return !!document.querySelector('.alert[role=alert]')"
                        )
                        return {
                            "status": "PASS",
                            "platform": "linux",
                            "runtime": "dbos",
                            "application": application.name,
                            "checks": [
                                "native-tauri-webview",
                                "packaged-sidecar-authentication",
                                "desktop-profile",
                                "real-dbos-runtime",
                                "design-blocker",
                                "approval-required",
                                "native-approval-and-execution",
                                "fresh-ready-recheck",
                            ],
                        }
                    except BaseException:
                        if session.session_id:
                            try:
                                image = session.request("GET", session.path("screenshot"))
                                (artifacts / "native-webview-failure.png").write_bytes(
                                    base64.b64decode(image, validate=True)
                                )
                            except Exception:
                                # Preserve the actual test failure when screenshot capture fails.
                                pass
                        raise
                    finally:
                        try:
                            session.close()
                        except (WebDriverError, httpx.TransportError):
                            pass
            finally:
                # Includes WebKitWebDriver, the GUI and its sidecar if session teardown failed.
                try:
                    os.killpg(driver.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                try:
                    driver.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    pass
                # The driver can exit before a stuck child. Always terminate the
                # remaining group, not only when its original leader timed out.
                try:
                    os.killpg(driver.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                if driver.poll() is None:
                    driver.wait(timeout=5)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--application", required=True, type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/native-webview.json")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    try:
        result = exercise(args.application.resolve(), args.output.parent)
    except Exception as exc:
        result = {"status": "FAIL", "platform": "linux", "error": str(exc)}
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
