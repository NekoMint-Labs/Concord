"""Retain bounded, token-redacted subprocess diagnostics before smoke cleanup."""

import json
import secrets
import tempfile
import time
import traceback
from collections.abc import Callable
from pathlib import Path

LOG_LIMIT = 64 * 1024


def log_tail(path: Path, token: str) -> str:
    if not path.is_file():
        return ""
    with path.open("rb") as stream:
        size = stream.seek(0, 2)
        start = max(0, size - LOG_LIMIT)
        stream.seek(start)
        data = stream.read(LOG_LIMIT)
    if start:
        # Drop the partial first line, which could start halfway through a token.
        data = data.partition(b"\n")[2]
    text = data.decode("utf-8", errors="replace").replace(token, "[REDACTED]")
    return ("[earlier output truncated]\n" if start else "") + text


def run_smoke(exercise: Callable[[Path, str], dict], *, prefix: str, output: Path | None) -> int:
    token = secrets.token_urlsafe(40)
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix=prefix) as temporary:
        folder = Path(temporary)
        try:
            result = exercise(folder, token)
        except Exception as error:
            result = {
                "status": "FAIL",
                "passed": False,
                "error": f"{type(error).__name__}: {error}".replace(token, "[REDACTED]")[:4000],
                "traceback": traceback.format_exc().replace(token, "[REDACTED]")[-12000:],
            }
        result.setdefault("status", "FAIL" if result.get("passed") is False else "PASS")
        startup_log = folder / "startup.jsonl"
        diagnostics = {
            "elapsed_seconds": round(time.monotonic() - started, 3),
            "startup": [json.loads(line) for line in startup_log.read_text().splitlines()]
            if startup_log.is_file()
            else [],
        }
        if result["status"] != "PASS":
            diagnostics["stderr_tail"] = log_tail(folder / "server.log", token)
            diagnostics["stdout_tail"] = log_tail(folder / "server.stdout.log", token)
        result["diagnostics"] = diagnostics
        rendered = json.dumps(result, indent=2).replace(token, "[REDACTED]") + "\n"
        if output:
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(rendered, encoding="utf-8")
        print(rendered, end="")
    return 0 if result["status"] == "PASS" else 1
