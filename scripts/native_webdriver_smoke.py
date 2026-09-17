"""Exercise the packaged Windows/Linux Tauri WebView with native WebDriver.

Requires tauri-driver plus matching msedgedriver (Windows) or WebKitWebDriver
and DISPLAY (Linux). Uses isolated desktop storage and explicit synthetic data.
This regression does not qualify IFC diff, native file dialogs, or B/C integration.
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
from native_webdriver_client import NativeSession, WebDriverError

ROOT = Path(__file__).resolve().parents[1]


def prerequisites(application: Path):
    if sys.platform not in {"linux", "win32"}:
        raise RuntimeError("Native WebDriver qualification supports Windows and Linux only")
    if not application.is_file() or not os.access(application, os.X_OK):
        raise RuntimeError("Build the native release application before running WebDriver")
    native = "msedgedriver" if sys.platform == "win32" else "WebKitWebDriver"
    missing = [name for name in ("tauri-driver", native) if shutil.which(name) is None]
    if missing:
        raise RuntimeError("Missing native WebDriver prerequisite(s): " + ", ".join(missing))
    if sys.platform == "linux" and not os.environ.get("DISPLAY"):
        raise RuntimeError("A Linux display is required; use xvfb-run -a dbus-run-session")


def free_ports() -> tuple[int, int]:
    with socket.socket() as first, socket.socket() as second:
        first.bind(("127.0.0.1", 0))
        second.bind(("127.0.0.1", 0))
        return first.getsockname()[1], second.getsockname()[1]


def isolated_environment(folder: Path) -> dict[str, str]:
    env = {key: value for key, value in os.environ.items() if not key.startswith("CCA_")}
    env.update(
        CCA_DESKTOP_DATA_DIR=str(folder / "data"),
        WEBVIEW2_USER_DATA_FOLDER=str(folder / "webview"),
        XDG_DATA_HOME=str(folder / "xdg-data"),
        XDG_CACHE_HOME=str(folder / "cache"),
        XDG_CONFIG_HOME=str(folder / "config"),
        CCA_SEED_DEMO="true",
        CCA_BIM="structured",
    )
    return env


def stop_driver(driver: subprocess.Popen):
    if sys.platform == "win32":
        # Only this launched driver's descendants, never a process-name kill.
        if driver.poll() is None:
            subprocess.run(
                ["taskkill", "/PID", str(driver.pid), "/T", "/F"],
                capture_output=True,
                timeout=15,
                check=False,
            )
    else:
        try:
            os.killpg(driver.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            driver.wait(timeout=10)
        except subprocess.TimeoutExpired:
            pass
        try:
            os.killpg(driver.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    driver.wait(timeout=10)


def coordination(session: NativeSession, artifacts: Path) -> dict:
    session.wait("return !!document.querySelector('.application-shell')")
    session.wait("return document.body.textContent.includes('当前没有阻塞施工的条件')")
    profile = session.api("/api/profile")
    assert profile["profile"] == "desktop" and profile["runtime"] == "dbos", profile
    session.open_menu()
    session.choose_menu("能力诊断")
    session.wait("return document.querySelector('.profile-tag')?.textContent.includes('desktop')")
    session.click("nav[aria-label='工作区视图']", "协调")
    session.click(".header-tools", "记录变更")
    session.click(".event-dialog", "提交并分析")
    session.wait(
        "return document.querySelector('.coordination-state-tag')?.textContent.includes('已阻塞')"
    )
    route = "/api/projects/harbor-east/workspace"
    before = session.api(route)
    assert before["analysis"]["constraints"] and not before["stale"]
    session.click("body", "批准并继续")
    inspector = "[aria-label='判断依据与处理详情']"
    assert session.wait(
        """
        return [...document.querySelectorAll(arguments[0] + ' button')]
            .find(b => b.textContent.trim() === '执行并重新检查')?.disabled === true;
    """,
        inspector,
    ), "Unapproved native execution was not disabled"
    session.click(inspector, "批准 R", startswith=True)
    session.wait(
        "return document.querySelector(arguments[0])?.textContent.includes('已批准')", inspector
    )
    session.click(inspector, "执行并重新检查")
    session.wait("return document.body.textContent.includes('当前没有阻塞施工的条件')")
    after = session.api(route)
    assert not after["stale"] and not after["analysis"]["constraints"]
    assert after["analysis"]["snapshot"]["id"] != before["analysis"]["snapshot"]["id"]
    assert after["analysis"]["snapshot"]["version"] == after["state"]["version"]
    assert after["analysis_run"]["status"] == "COMPLETED"
    assert not session.script("return !!document.querySelector('.alert[role=alert]')")
    screenshot(session, artifacts / "native-webview-pass.png")
    return {
        "status": "PASS",
        "platform": sys.platform,
        "runtime": "dbos",
        "checks": [
            "native-tauri-webview",
            "packaged-sidecar-authentication",
            "desktop-profile",
            "real-dbos-runtime",
            "ui-change-submission",
            "design-blocker",
            "approval-required",
            "native-approval-and-execution",
            "fresh-ready-recheck",
        ],
        "limitations": [
            "Synthetic project regression; action executor is simulated.",
            "Native file-dialog import and B/C project/IFC integration are separate.",
        ],
    }


def screenshot(session: NativeSession, destination: Path):
    encoded = session.request("GET", session.path("screenshot"))
    destination.write_bytes(base64.b64decode(encoded, validate=True))


def exercise(application: Path, artifacts: Path) -> dict:
    prerequisites(application)
    artifacts.mkdir(parents=True, exist_ok=True)
    work = ROOT / ".verification-work"
    work.mkdir(exist_ok=True)
    port, native_port = free_ports()
    # Retain isolated files for investigation; the OS may still hold WebView files.
    folder = Path(tempfile.mkdtemp(dir=work, prefix="native-webview-")).resolve()
    with (artifacts / "native-webdriver.log").open("w", encoding="utf-8") as log:
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
            env=isolated_environment(folder),
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=sys.platform != "win32",
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
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
                        raise WebDriverError("tauri-driver stopped; inspect native-webdriver.log")
                    try:
                        if client.get("/status", timeout=2).is_success:
                            break
                    except httpx.TransportError:
                        pass
                    if time.monotonic() >= deadline:
                        raise WebDriverError("Native driver failed to start")
                    time.sleep(0.2)
                session = NativeSession(client)
                try:
                    session.start(application)
                    result = coordination(session, artifacts)
                    assert tuple((folder / "data").glob("*.db")), (
                        "Desktop did not use isolated storage"
                    )
                    return {**result, "application": application.name}
                except BaseException:
                    if session.session_id:
                        try:
                            screenshot(session, artifacts / "native-webview-failure.png")
                        except Exception:
                            pass  # Preserve the test failure if capture also fails.
                    raise
                finally:
                    try:
                        session.close()
                    except (WebDriverError, httpx.TransportError):
                        pass
        finally:
            stop_driver(driver)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--application", required=True, type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/native-webview.json")
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    try:
        result = exercise(args.application.resolve(), args.output.parent)
    except Exception as exc:
        result = {"status": "FAIL", "platform": sys.platform, "error": str(exc)}
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0 if result["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
