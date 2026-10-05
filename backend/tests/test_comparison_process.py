"""Bounded subprocess output and timeout regression, without engine claims."""

import shutil
from pathlib import Path

import pytest
from app.adapters.comparison_process import invoke
from app.domain.errors import CapabilityUnavailable, ProviderError


@pytest.fixture
def node():
    executable = shutil.which("node")
    if not executable:
        pytest.skip("Node unavailable for process qualification")
    return Path(executable)


def test_fixed_process_receives_stdin_without_shell_interpolation(tmp_path, node):
    script = tmp_path / "runner.mjs"
    script.write_text(
        'let input=""; for await(const chunk of process.stdin) input+=chunk;'
        "process.stdout.write(input);"
    )
    assert b"$(`" in invoke(node, script, {"text": "$(` sensitive literal"}, 10)


@pytest.mark.parametrize(
    "script,reason",
    [
        ('process.stderr.write("engine failed");process.exit(1);', "engine failed"),
        ('process.stdout.write("x".repeat(8*1024*1024+1));', "8 MiB"),
        ("process.exit(0);", "nonempty"),
    ],
)
def test_failed_empty_and_oversized_output_is_rejected(tmp_path, node, script, reason):
    path = tmp_path / "runner.mjs"
    path.write_text(script)
    with pytest.raises(ProviderError, match=reason):
        invoke(node, path, {}, 10)


def test_missing_executable_is_explicit(tmp_path):
    with pytest.raises(CapabilityUnavailable):
        invoke(tmp_path / "missing-node", tmp_path / "runner", {}, 10)


def test_timeout_exits_promptly(tmp_path, node):
    script = tmp_path / "runner.mjs"
    script.write_text("setInterval(()=>{},1000);")
    with pytest.raises(ProviderError, match="timed out"):
        invoke(node, script, {}, 0.2)


def test_missing_fixed_script_is_reported_unavailable(tmp_path, node):
    with pytest.raises(CapabilityUnavailable, match="pack"):
        invoke(node, tmp_path / "missing-runner.mjs", {}, 10)


@pytest.mark.parametrize("unresponsive", [False, True])
def test_posix_timeout_allows_browser_cleanup_before_force_kill(
    tmp_path, monkeypatch, unresponsive
):
    import signal
    import subprocess
    from types import SimpleNamespace

    from app.adapters import comparison_process

    monkeypatch.setattr(
        comparison_process, "signal", SimpleNamespace(SIGTERM=signal.SIGTERM, SIGKILL=9)
    )
    signals = []
    calls = []

    class OwnedProcess:
        pid = 123456

        def communicate(self, *args, **kwargs):
            raise subprocess.TimeoutExpired("fixed-runner", 1)

        def wait(self, timeout=None):
            calls.append(timeout)
            if unresponsive and timeout is not None:
                raise subprocess.TimeoutExpired("fixed-runner", timeout)

        def poll(self):
            return None

        def kill(self):
            calls.append("kill")

    monkeypatch.setattr(
        comparison_process,
        "os",
        SimpleNamespace(name="posix", killpg=lambda pid, value: signals.append((pid, value))),
    )
    monkeypatch.setattr(
        comparison_process.subprocess, "Popen", lambda *args, **kwargs: OwnedProcess()
    )
    with pytest.raises(ProviderError, match="timed out"):
        invoke(tmp_path / "fixed-node", tmp_path / "fixed-runner", {}, 1)
    assert signals[0] == (123456, signal.SIGTERM)
    assert calls[0] == 5
    assert len(signals) == (2 if unresponsive else 1)
    if unresponsive:
        assert signals[1] == (123456, 9)
    assert "kill" in calls
