"""Bounded operator-selected Node process; requests never select execution paths."""

import json
import os
import signal
import subprocess
from pathlib import Path
from tempfile import TemporaryFile

from app.domain.errors import CapabilityUnavailable, ProviderError

MAX_OUTPUT = 8 * 1024 * 1024


def invoke(node: Path, runner: Path, payload: dict, timeout: float) -> bytes:
    encoded = json.dumps(payload, allow_nan=False, separators=(",", ":")).encode()
    with TemporaryFile() as output, TemporaryFile() as errors:
        try:
            process = subprocess.Popen(
                [str(node), str(runner)],
                stdin=subprocess.PIPE,
                stdout=output,
                stderr=errors,
                cwd=runner.parent,
                start_new_session=os.name != "nt",
            )
        except OSError as exc:
            raise CapabilityUnavailable("Trusted comparison Node runtime cannot start") from exc
        try:
            process.communicate(encoded, timeout=timeout)
        except subprocess.TimeoutExpired as exc:
            # Terminate this owned process tree, including Chromium and its workers.
            if os.name == "nt":
                subprocess.run(
                    ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    check=False,
                )
            else:
                # Let the fixed runner close Chromium (which may own a separate process group).
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
            if process.poll() is None:
                process.kill()
            process.wait()
            raise ProviderError("Trusted comparison execution timed out") from exc
        if process.returncode:
            errors.seek(0)
            message = errors.read(2000).decode("utf-8", errors="replace")
            # These are fixed runner errors; donor failures remain explicit provider failures.
            if "Cannot find" in message or "Executable doesn't exist" in message:
                raise CapabilityUnavailable("Trusted comparison pack or Chromium is unavailable")
            raise ProviderError("Trusted comparison failed: " + message)
        if output.tell() == 0 or output.tell() > MAX_OUTPUT:
            raise ProviderError("Trusted comparison output must be nonempty and within 8 MiB")
        output.seek(0)
        return output.read()
