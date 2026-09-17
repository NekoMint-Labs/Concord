"""Real subprocess/HTTP/persistence smoke test. No paid services are called.

Run the default deployment path with --runtime dbos, or explicitly select
--runtime diagnostic on restricted hosts. Diagnostic success is NOT evidence
of DBOS checkpoint/recovery or a frontend build.
"""

import argparse
import json
import os
import queue
import secrets
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from uuid import uuid4

import httpx

ROOT = Path(__file__).resolve().parents[1]


def terminate_process_tree(process: subprocess.Popen[str], *, crash: bool) -> None:
    """Stop only the launched sidecar and its descendants on Windows."""
    if sys.platform == "win32":
        command = ["taskkill", "/PID", str(process.pid), "/T"]
        if crash:
            command.append("/F")
        subprocess.run(
            command,
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    elif process.poll() is None:
        process.kill() if crash else process.terminate()


def assert_sqlite_files_released(folder: Path) -> None:
    """Windows refuses this rename while a surviving process owns a SQLite file."""
    deadline = time.monotonic() + 5
    while True:
        try:
            for database in folder.glob("*.db*"):
                if database.is_file():
                    probe = database.with_name(database.name + ".close-check")
                    database.replace(probe)
                    probe.replace(database)
            return
        except PermissionError:
            # Launcher exit can precede descendant/OS handle release on Windows.
            # A bounded wait still fails if the database remains owned by a process.
            if sys.platform != "win32" or time.monotonic() >= deadline:
                raise
            time.sleep(0.05)


class Server:
    def __init__(
        self,
        folder: Path,
        runtime: str,
        token: str,
        *,
        executable: Path | None = None,
        profile: str = "local",
        temporal_address: str | None = None,
        seed_demo: bool = True,
    ):
        env = {key: value for key, value in os.environ.items() if not key.startswith("CCA_")}
        env.update(
            PYTHONPATH=str(ROOT / "backend"),
            PYTHONUNBUFFERED="1",
            CCA_DATA_DIR=str(folder),
            CCA_API_TOKEN=token,
            CCA_PORT="0",
            CCA_PROFILE=profile,
            CCA_RUNTIME="temporal" if runtime == "temporal" else "dbos",
            CCA_SEED_DEMO="true" if seed_demo else "false",
        )
        if seed_demo:
            env["CCA_BIM"] = "structured"
        if temporal_address:
            env["CCA_TEMPORAL_ADDRESS"] = temporal_address
        command = (
            [str(executable.resolve())] if executable else [sys.executable, "-m", "app.cli"]
        ) + ["serve", "--port", "0"]
        if runtime == "diagnostic":
            command.append("--diagnostic-runtime")
        self.folder = folder
        self.log = (folder / "server.log").open("a")
        # Match the desktop host's total startup budget. A cold Windows bundle
        # with IFC can take over 12 seconds just to announce its endpoint.
        startup_deadline = time.monotonic() + 30
        self.process = subprocess.Popen(
            command, cwd=folder, env=env, stdout=subprocess.PIPE, stderr=self.log, text=True
        )
        stdout = self.process.stdout
        assert stdout is not None
        lines = queue.Queue()

        def collect():
            for line in stdout:
                lines.put(line.strip())

        self.reader = threading.Thread(target=collect, daemon=True)
        self.reader.start()
        try:
            try:
                line = lines.get(timeout=max(0, startup_deadline - time.monotonic()))
            except queue.Empty as exc:
                raise RuntimeError(
                    "Sidecar did not announce its endpoint within 30 seconds; inspect server.log"
                ) from exc
            if not line.startswith("CCA_ENDPOINT=http://127.0.0.1:"):
                raise RuntimeError(f"Unexpected sidecar endpoint announcement: {line}")
            self.url = line.split("=", 1)[1]
            self.client = httpx.Client(
                base_url=self.url,
                headers={"Authorization": f"Bearer {token}"},
                timeout=10,
                trust_env=False,
            )
            self.wait(
                lambda: self.client.get("/health").status_code == 200,
                timeout=max(0, startup_deadline - time.monotonic()),
            )
        except BaseException:
            self.close()
            raise

    def wait(self, predicate, timeout=20):
        until = time.monotonic() + timeout
        while time.monotonic() < until:
            if self.process.poll() is not None:
                raise RuntimeError(
                    "Backend exited. Inspect server.log in the smoke work directory."
                )
            try:
                if predicate():
                    return
            except httpx.ConnectError:
                pass
            time.sleep(0.1)
        raise AssertionError("Timed out waiting for the real HTTP service state")

    def get(self, path):
        response = self.client.get(path)
        response.raise_for_status()
        return response.json()

    def post(self, path, body=None, expected=202):
        response = self.client.post(path, json=body)
        assert response.status_code == expected, (path, response.status_code, response.text[:400])
        return response.json()

    def workspace(self):
        return self.get("/api/projects/harbor-east/workspace")

    def close(self, *, crash=False):
        client = getattr(self, "client", None)
        if client is not None:
            client.close()
        if self.process.poll() is None:
            terminate_process_tree(self.process, crash=crash)
            try:
                self.process.wait(timeout=12)
            except subprocess.TimeoutExpired:
                terminate_process_tree(self.process, crash=True)
                self.process.wait(timeout=3)
        self.reader.join(timeout=1)
        self.log.close()
        assert_sqlite_files_released(self.folder)


def exercise(
    runtime: str,
    folder: Path,
    *,
    crash_restart: bool = False,
    executable: Path | None = None,
    profile: str = "local",
    temporal_address: str | None = None,
) -> dict:
    token = secrets.token_urlsafe(40)
    server = Server(
        folder,
        runtime,
        token,
        executable=executable,
        profile=profile,
        temporal_address=temporal_address,
    )
    checks = []
    try:
        assert httpx.get(server.url + "/api/projects", trust_env=False).status_code == 401
        server.wait(lambda: server.workspace()["analysis"] is not None)
        assert all(row["status"] == "READY" for row in server.workspace()["analysis"]["readiness"])
        event = {
            "id": str(uuid4()),
            "project_id": "harbor-east",
            "work_package_id": "WP-200",
            "kind": "design_revision",
            "title": "HTTP smoke V17",
            "change": {"revision": "V17"},
        }
        run = server.post("/api/projects/harbor-east/events", event)
        server.wait(lambda: server.get(f"/api/runs/{run['id']}")["status"] == "WAITING_APPROVAL")
        before = server.workspace()
        proposal = before["proposals"][0]
        assert before["analysis"]["constraints"] and before["analysis"]["evidence"]
        assert server.post("/api/projects/harbor-east/events", event)["id"] == run["id"]
        assert server.workspace()["state"]["version"] == before["state"]["version"]
        server.post(f"/api/proposals/{proposal['id']}/execute", expected=403)
        checks.extend(
            [
                "authentication",
                "initial-ready",
                "design-blocker-evidence",
                "event-retry",
                "approval-required",
            ]
        )
        # Restart the actual API process while the persisted run waits for approval.
        server.close(crash=crash_restart)
        server = Server(
            folder,
            runtime,
            token,
            executable=executable,
            profile=profile,
            temporal_address=temporal_address,
        )
        assert server.workspace()["state"]["version"] == before["state"]["version"]
        assert server.get(f"/api/runs/{run['id']}")["status"] == "WAITING_APPROVAL"
        server.post(f"/api/proposals/{proposal['id']}/approve", {}, 200)
        server.post(f"/api/proposals/{proposal['id']}/execute")
        server.wait(lambda: server.get(f"/api/runs/{run['id']}")["status"] == "COMPLETED")
        receipt = server.get(f"/api/operations/{proposal['operation_id']}")
        server.post(f"/api/proposals/{proposal['id']}/execute")
        assert server.get(f"/api/operations/{proposal['operation_id']}") == receipt
        fresh = server.workspace()
        assert fresh["state"]["version"] == receipt["after_version"]
        assert all(row["status"] == "READY" for row in fresh["analysis"]["readiness"])
        assert fresh["analysis"]["snapshot"]["id"] != proposal["snapshot_id"]
        checks.extend(
            [
                "hard-kill-restart-persistence" if crash_restart else "process-restart-persistence",
                "approved-execution",
                "receipt-retry",
                "fresh-recheck-ready",
            ]
        )
        stream = server.client.get(f"/api/runs/{run['id']}/events")
        assert stream.status_code == 200 and '"RUN_FINISHED"' in stream.text
        assert "id:" in stream.text and '"STATE_SNAPSHOT"' in stream.text
        checks.append("ag-ui-sse-over-http")
        event = {
            "project_id": "harbor-east",
            "work_package_id": "WP-300",
            "kind": "workforce",
            "title": "HTTP smoke workforce",
            "change": {"available_workers": 1},
        }
        next_run = server.post("/api/projects/harbor-east/events", event)
        server.wait(
            lambda: server.get(f"/api/runs/{next_run['id']}")["status"] == "WAITING_APPROVAL"
        )
        stopped = server.post(f"/api/runs/{next_run['id']}/cancel", expected=200)
        assert stopped["status"] == "CANCELLED"
        before_resume = server.get(f"/api/runs/{next_run['id']}")
        old_execution = before_resume.get("runtime_execution_id") or next_run["id"]
        resumed = server.post(f"/api/runs/{next_run['id']}/resume")
        assert resumed["generation"] == before_resume["generation"] + 1
        server.wait(
            lambda: server.get(f"/api/runs/{next_run['id']}")["status"] == "WAITING_APPROVAL"
        )
        if runtime != "diagnostic":
            active = server.get(f"/api/runs/{next_run['id']}")
            assert active["runtime_execution_id"] != old_execution
            assert active["runtime_generation"] == active["generation"]
        checks.append("cancel-resume-generation-and-reapproval")
        next_proposal = server.workspace()["proposals"][0]
        assert next_proposal["resolution"]["effects"][0]["kind"] == "assign_crew"
        server.post(f"/api/proposals/{next_proposal['id']}/approve", {}, 200)
        server.post(f"/api/proposals/{next_proposal['id']}/execute")
        server.wait(lambda: server.get(f"/api/runs/{next_run['id']}")["status"] == "COMPLETED")
        checks.append("secondary-workforce-flow")
        response = server.client.post(
            "/api/projects/harbor-east/documents",
            files={"file": ("smoke.md", b"# Evidence\nSmoke alpha unique phrase.")},
        )
        assert response.status_code == 202, response.text
        document_run = response.json()
        server.wait(lambda: server.get(f"/api/runs/{document_run['id']}")["status"] == "COMPLETED")
        assert server.get("/api/projects/harbor-east/search?q=alpha")
        checks.append("document-job-and-fts")
        profile_info = server.get("/api/profile")
        assert profile_info["profile"] == profile
        assert profile_info["runtime"] == (
            "diagnostic-NON-DURABLE" if runtime == "diagnostic" else runtime
        )
        assert token not in (folder / "server.log").read_text()
        return {
            "status": "PASS",
            "runtime": profile_info["runtime"],
            "checks": checks,
            "warning": "Diagnostic mode does not prove durable-engine recovery"
            if runtime == "diagnostic"
            else None,
        }
    finally:
        server.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime", choices=["dbos", "diagnostic", "temporal"], default="dbos")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--temporal-address", help="Explicit loopback Temporal test server")
    parser.add_argument(
        "--crash-restart",
        action="store_true",
        help="Kill rather than gracefully stop the waiting backend process",
    )
    parser.add_argument(
        "--sidecar",
        type=Path,
        help="Exercise a real packaged executable instead of the source Python CLI",
    )
    parser.add_argument("--profile", choices=["local", "desktop"], default="local")
    args = parser.parse_args()
    if args.profile == "desktop" and args.runtime != "dbos":
        parser.error("Desktop must use DBOS, never diagnostic mode")
    if args.runtime == "temporal":
        from urllib.parse import urlsplit

        if not args.temporal_address or urlsplit(
            "http://" + args.temporal_address
        ).hostname not in {"localhost", "127.0.0.1", "::1"}:
            parser.error("Temporal smoke requires an explicit loopback --temporal-address")
    with tempfile.TemporaryDirectory(prefix="cca-http-smoke-") as temporary:
        result = exercise(
            args.runtime,
            Path(temporary),
            crash_restart=args.crash_restart,
            executable=args.sidecar,
            profile=args.profile,
            temporal_address=args.temporal_address,
        )
    text = json.dumps(result, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text + "\n")
    print(text)


if __name__ == "__main__":
    main()
