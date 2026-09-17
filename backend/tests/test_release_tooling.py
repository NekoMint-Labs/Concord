"""Offline contracts for source-preserving build tooling; not native build tests."""

import importlib.util
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    # Match a direct `python scripts/name.py` launch, including sibling imports.
    with pytest.MonkeyPatch.context() as patch:
        patch.syspath_prepend(str(ROOT / "scripts"))
        spec.loader.exec_module(module)
    return module


def test_lock_generation_requires_all_tools_before_writing(tmp_path, monkeypatch):
    module = load("lock_dependencies")
    monkeypatch.setattr(module.shutil, "which", lambda name: "/bin/uv" if name == "uv" else None)
    with pytest.raises(RuntimeError, match="pnpm, cargo"):
        module.resolve(tmp_path)
    assert list(tmp_path.iterdir()) == []


def test_failed_resolution_restores_previous_lockfile_set(tmp_path, monkeypatch):
    module = load("lock_dependencies")
    first, second, third = module.LOCKFILES
    (tmp_path / first).write_bytes(b"previous uv lock\n")
    monkeypatch.setattr(module, "tools", lambda: {name: name for name in ("uv", "pnpm", "cargo")})

    def run(command, **kwargs):
        if command[0] == "uv":
            (tmp_path / first).write_bytes(b"new uv lock\n")
        elif command[0] == "pnpm":
            (tmp_path / second).parent.mkdir(parents=True)
            (tmp_path / second).write_bytes(b"new pnpm lock\n")
        else:
            raise subprocess.CalledProcessError(1, command)

    monkeypatch.setattr(module.subprocess, "run", run)
    with pytest.raises(subprocess.CalledProcessError):
        module.resolve(tmp_path)
    assert (tmp_path / first).read_bytes() == b"previous uv lock\n"
    assert not (tmp_path / second).exists()
    assert not (tmp_path / third).exists()


def test_frozen_resolution_tolerates_and_restores_newline_normalization(tmp_path, monkeypatch):
    module = load("lock_dependencies")
    for path in module.LOCKFILES:
        (tmp_path / path).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / path).write_bytes(b"first\nsecond\n")
    monkeypatch.setattr(module, "tools", lambda: {name: name for name in ("uv", "pnpm", "cargo")})
    monkeypatch.setattr(
        module.subprocess,
        "run",
        lambda *args, **kwargs: (tmp_path / "uv.lock").write_bytes(b"first\r\nsecond\r\n"),
    )

    module.resolve(tmp_path, check=True)

    assert (tmp_path / "uv.lock").read_bytes() == b"first\nsecond\n"


def test_frozen_resolution_rejects_and_names_substantive_mutation(tmp_path, monkeypatch):
    module = load("lock_dependencies")
    for path in module.LOCKFILES:
        (tmp_path / path).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / path).write_bytes(b"existing\n")
    monkeypatch.setattr(module, "tools", lambda: {name: name for name in ("uv", "pnpm", "cargo")})
    monkeypatch.setattr(
        module.subprocess,
        "run",
        lambda *args, **kwargs: (tmp_path / "uv.lock").write_bytes(b"changed\n"),
    )
    with pytest.raises(RuntimeError, match=r"changed committed lockfile\(s\): uv\.lock"):
        module.resolve(tmp_path, check=True)
    assert all((tmp_path / path).read_bytes() == b"existing\n" for path in module.LOCKFILES)


def test_frozen_resolution_refuses_missing_locks(tmp_path):
    module = load("lock_dependencies")
    with pytest.raises(RuntimeError, match="generated and committed"):
        module.resolve(tmp_path, check=True)


@pytest.mark.parametrize("entry, valid", [("tauri.js", True), ("../../../outside.js", False)])
def test_desktop_resolves_only_installed_package_cli(tmp_path, monkeypatch, entry, valid):
    import json

    module = load("build_desktop")
    package = tmp_path / "frontend/node_modules/@tauri-apps/cli"
    package.mkdir(parents=True)
    (package / "package.json").write_text(json.dumps({"bin": {"tauri": entry}}))
    target = (package / entry).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("// installed CLI fixture\n")
    monkeypatch.setattr(module.shutil, "which", lambda name: "/node")
    if valid:
        assert module.cli_command(tmp_path) == ["/node", str(target)]
    else:
        with pytest.raises(RuntimeError, match="outside its package"):
            module.cli_command(tmp_path)


@pytest.mark.parametrize(
    "body, valid",
    [
        ('<testcase name="executed"/>', True),
        ('<testcase name="missing-sdk"><skipped/></testcase>', False),
        ('<testcase name="broken"><failure/></testcase>', False),
        ('<testcase name="broken"><error/></testcase>', False),
        ("", False),
    ],
)
def test_required_integrations_cannot_pass_by_skipping(tmp_path, body, valid):
    module = load("assert_junit")
    path = tmp_path / "report.xml"
    path.write_text(f"<testsuites><testsuite>{body}</testsuite></testsuites>")
    if valid:
        assert module.validate(path) == 1
    else:
        with pytest.raises(ValueError):
            module.validate(path)


def test_native_webdriver_contract_drives_real_element_protocol(tmp_path):
    """Protocol-only verification, explicitly not a native GUI execution."""
    import json

    import httpx

    module = load("native_webdriver_client")
    calls = []

    def respond(request):
        payload = json.loads(request.content) if request.content else None
        calls.append((request.method, request.url.path, payload))
        if request.url.path == "/session":
            value = {"sessionId": "native-fixture", "capabilities": {}}
        elif request.url.path.endswith("/execute/sync"):
            value = {module.ELEMENT_KEY: "approve-element"}
        else:
            value = None
        return httpx.Response(200, json={"value": value})

    with httpx.Client(
        base_url="http://127.0.0.1:12345", transport=httpx.MockTransport(respond)
    ) as client:
        session = module.NativeSession(client)
        session.start(tmp_path / "application")
        session.click(".inspector", "Approve R", startswith=True)
        session.close()
    assert calls[0][2]["capabilities"]["alwaysMatch"]["tauri:options"]["application"] == str(
        tmp_path / "application"
    )
    assert ("POST", "/session/native-fixture/element/approve-element/click", {}) in calls
    assert calls[-1][:2] == ("DELETE", "/session/native-fixture")


def test_native_webdriver_never_reports_protocol_errors_as_success():
    import httpx

    module = load("native_webdriver_client")
    with httpx.Client(
        base_url="http://127.0.0.1:12345",
        transport=httpx.MockTransport(
            lambda request: httpx.Response(200, json={"value": {"error": "session not created"}})
        ),
    ) as client:
        with pytest.raises(module.WebDriverError):
            module.NativeSession(client).request("POST", "/session", {})


def test_native_preflight_requires_a_real_executable(tmp_path, monkeypatch):
    module = load("native_webdriver_smoke")
    monkeypatch.setattr(module.sys, "platform", "linux")
    with pytest.raises(RuntimeError, match="Build the native"):
        module.prerequisites(tmp_path / "nonexistent-app")


@pytest.mark.parametrize("script", ["export_openapi", "generate_test_fixtures"])
def test_schema_and_fixture_tools_ignore_private_environment_and_dotenv(tmp_path, script):
    import json
    import os
    import sys

    poison = "private-fixture-sentinel-do-not-leak"
    (tmp_path / ".env").write_text("CCA_PROFILE=full\nCCA_DATABASE_URL=not-a-database\n")
    environment = {
        **os.environ,
        "CCA_PROFILE": "server",
        "CCA_DATABASE_URL": "not-a-database",
        "CCA_MODEL_API_KEY": poison,
        "CCA_REASONING": "pydantic-ai",
        "CCA_STORAGE": "s3",
        "CCA_VECTOR_ENABLED": "true",
    }
    target = tmp_path / "result.json"
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / f"{script}.py"), "--output", str(target)],
        cwd=tmp_path,
        env=environment,
        capture_output=True,
        text=True,
        timeout=25,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert poison not in result.stdout + result.stderr + target.read_text()
    output = json.loads(target.read_text())
    if script == "export_openapi":
        assert output["info"]["title"] == "Construction Coordination Agent"
    else:
        assert output["waiting"]["run"]["runtime"] == "diagnostic-NON-DURABLE"
        assert output["waiting"]["analysis"]["reasoning_mode"] == "offline"
    assert not (tmp_path / ".data").exists()


def test_verification_configuration_is_restored_even_after_failure(tmp_path, monkeypatch):
    import os

    module = load("verification_context")
    monkeypatch.setenv("CCA_API_TOKEN", "previous-token")
    before = Path.cwd()
    with pytest.raises(RuntimeError, match="deliberate"):
        with module.isolated_configuration(tmp_path):
            assert Path.cwd() == tmp_path
            assert "CCA_API_TOKEN" not in os.environ
            os.environ["CCA_NEW_SETTING"] = "temporary"
            raise RuntimeError("deliberate")
    assert Path.cwd() == before
    assert os.environ["CCA_API_TOKEN"] == "previous-token"
    assert "CCA_NEW_SETTING" not in os.environ


@pytest.mark.parametrize(
    ("crash", "expected"),
    [
        (False, ["taskkill", "/PID", "4242", "/T"]),
        (True, ["taskkill", "/PID", "4242", "/T", "/F"]),
    ],
)
def test_windows_sidecar_close_terminates_its_tree_and_releases_sqlite(
    tmp_path, monkeypatch, crash, expected
):
    module = load("http_smoke")
    commands = []

    class Process:
        pid = 4242

        def poll(self):
            return None

        def wait(self, timeout):
            assert timeout == 12

    class Resource:
        def close(self):
            pass

        def join(self, timeout):
            assert timeout == 1

    server = module.Server.__new__(module.Server)
    server.process, server.client, server.reader, server.log, server.folder = (
        Process(),
        Resource(),
        Resource(),
        Resource(),
        tmp_path,
    )
    database = tmp_path / "app.db"
    database.write_bytes(b"sqlite")
    monkeypatch.setattr(module.sys, "platform", "win32")
    monkeypatch.setattr(
        module.subprocess, "run", lambda command, **kwargs: commands.append((command, kwargs))
    )

    server.close(crash=crash)

    assert commands[0][0] == expected
    assert database.read_bytes() == b"sqlite"
    assert not (tmp_path / "app.db.close-check").exists()


def test_posix_sidecar_shutdown_retains_direct_signal_behavior(monkeypatch):
    module = load("http_smoke")

    class Process:
        def __init__(self):
            self.terminated = self.killed = 0

        def poll(self):
            return None

        def terminate(self):
            self.terminated += 1

        def kill(self):
            self.killed += 1

    process = Process()
    monkeypatch.setattr(module.sys, "platform", "linux")

    module.terminate_process_tree(process, crash=False)
    module.terminate_process_tree(process, crash=True)

    assert process.terminated == process.killed == 1
