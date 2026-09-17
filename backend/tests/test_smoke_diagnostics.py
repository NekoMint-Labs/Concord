"""Real child-process failures must survive temporary smoke-directory cleanup."""

import json
import subprocess
import sys
import time

import pytest
from test_release_tooling import ROOT, load


@pytest.mark.parametrize("script", ["http_smoke", "agent_lifecycle_smoke"])
def test_cli_retains_launch_failure_report(tmp_path, script):
    output = tmp_path / "failure.json"
    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts" / f"{script}.py"),
            "--sidecar",
            str(tmp_path / "missing-sidecar.exe"),
            "--output",
            str(output),
        ],
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert result.returncode == 1
    report = json.loads(output.read_text(encoding="utf-8"))
    assert report["status"] == "FAIL" and report["passed"] is False
    assert "FileNotFoundError" in report["error"]
    assert report["diagnostics"]["startup"][0]["stage"] == "launch"
    assert json.loads(result.stdout) == report


@pytest.mark.parametrize(
    "behavior, stage, error",
    [
        ("raise SystemExit(7)", "endpoint", "stdout closed"),
        (
            "print('invalid ' + os.environ['CCA_API_TOKEN'], flush=True); time.sleep(60)",
            "endpoint",
            "Unexpected sidecar endpoint",
        ),
        ("time.sleep(60)", "endpoint", "did not announce"),
        (
            "print('CCA_ENDPOINT=http://127.0.0.1:0', flush=True); time.sleep(60)",
            "health",
            "Timed out waiting",
        ),
    ],
)
def test_real_child_failure_is_redacted_preserved_and_stopped(
    tmp_path, monkeypatch, capsys, behavior, stage, error
):
    server_module = load("http_smoke")
    report_module = load("smoke_report")
    token = "synthetic-private-smoke-token"
    monkeypatch.setattr(report_module.secrets, "token_urlsafe", lambda _: token)
    # The production budget remains 30 seconds; shorten only this failure fixture.
    monkeypatch.setattr(server_module, "STARTUP_TIMEOUT_SECONDS", 1)
    original_popen = subprocess.Popen
    children, workdirs = [], []

    def launch(command, **kwargs):
        code = (
            "import os, sys, time\n"
            "print('fixture stderr ' + os.environ['CCA_API_TOKEN'], file=sys.stderr, flush=True)\n"
            + behavior
        )
        process = original_popen([sys.executable, "-c", code], **kwargs)
        children.append(process)
        workdirs.append(kwargs["cwd"])
        return process

    # Only replace the sidecar launch, not taskkill used to close its Windows tree.
    def popen(command, **kwargs):
        if "serve" in command:
            return launch(command, **kwargs)
        return original_popen(command, **kwargs)

    monkeypatch.setattr(server_module.subprocess, "Popen", popen)
    output = tmp_path / "failure.json"

    def exercise(folder, secret):
        server_module.Server(folder, "dbos", secret)
        pytest.fail("The deliberately broken sidecar must not start")

    started = time.monotonic()
    try:
        assert report_module.run_smoke(exercise, prefix="cca-failure-test-", output=output) == 1
        assert time.monotonic() - started < 20
        text = output.read_text(encoding="utf-8")
        report = json.loads(text)
        assert report["status"] == "FAIL" and error in report["error"]
        assert token not in text + capsys.readouterr().out
        assert "fixture stderr [REDACTED]" in report["diagnostics"]["stderr_tail"]
        startup = report["diagnostics"]["startup"][0]
        assert startup["stage"] == stage
        assert startup["final_exit_code"] is not None
        if stage == "health":
            assert startup["endpoint_seconds"] < startup["elapsed_seconds"]
        assert all(process.poll() is not None for process in children)
        assert all(not folder.exists() for folder in workdirs)
    finally:
        for process in children:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)


def test_failure_log_tail_is_bounded_without_partial_token_leaks(tmp_path):
    module = load("smoke_report")
    token = "synthetic-secret-longer-than-tail-boundary"
    path = tmp_path / "server.log"
    # Force the retained byte range to start within a token on the previous line.
    final_line = b"x" * (module.LOG_LIMIT - 15) + b"\n"
    path.write_bytes(token.encode() + b"\n" + final_line)
    tail = module.log_tail(path, token)
    assert "boundary" not in tail
    assert "earlier output truncated" in tail
    path.write_bytes(b"old\n" * module.LOG_LIMIT + (token + "\n").encode())
    tail = module.log_tail(path, token)
    assert token not in tail and "[REDACTED]" in tail
    assert len(tail) <= module.LOG_LIMIT + 30


def test_success_keeps_existing_checks_and_startup_timings(tmp_path, capsys):
    module = load("smoke_report")
    workdirs = []

    def exercise(folder, token):
        workdirs.append(folder)
        (folder / "startup.jsonl").write_text(
            json.dumps({"stage": "ready", "endpoint_seconds": 0.1}) + "\n"
        )
        return {"passed": True, "checks": ["existing-check"], "limitations": ["simulated"]}

    output = tmp_path / "pass.json"
    assert module.run_smoke(exercise, prefix="cca-report-test-", output=output) == 0
    result = json.loads(output.read_text(encoding="utf-8"))
    assert result["status"] == "PASS" and result["passed"] is True
    assert result["checks"] == ["existing-check"] and result["limitations"] == ["simulated"]
    assert result["diagnostics"]["startup"][0]["endpoint_seconds"] == 0.1
    assert "stderr_tail" not in result["diagnostics"]
    assert not workdirs[0].exists()
    assert json.loads(capsys.readouterr().out) == result
