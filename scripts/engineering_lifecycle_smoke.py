"""Real HTTP/DBOS engineering lifecycle, optionally using the packaged sidecar.

No detector is faked: the unregistered engineering capability must yield NEEDS_REVIEW.
Deterministic provider tests separately exercise all four engineering outcomes.
"""

import argparse
from pathlib import Path

from http_smoke import Server
from smoke_report import run_smoke


def exercise(folder: Path, executable: Path | None = None, *, token: str) -> dict:
    server = Server(
        folder, "dbos", token, executable=executable, profile="desktop", seed_demo=False
    )
    try:
        project = server.post("/api/projects", {"name": "Engineering coordination smoke"}, 201)
        root = f"/api/projects/{project['id']}"
        source = server.post(root + "/sources", {"name": "Clearance note", "kind": "DOCUMENT"}, 201)
        source_root = root + f"/sources/{source['id']}"

        def upload(content):
            response = server.client.post(
                source_root + "/revisions", files={"file": ("note.txt", content)}
            )
            assert response.status_code == 201, response.text
            return response.json()["revision"]

        r1 = upload(b"Clearance note R1: clearance is 50mm.")
        baseline = server.post(
            root + "/baselines",
            {"name": "B1", "entries": [{"source_id": source["id"], "revision_id": r1["id"]}]},
            201,
        )
        run = server.post(source_root + f"/revisions/{r1['id']}/import")
        server.wait(lambda: server.get(f"/api/runs/{run['id']}")["status"] == "COMPLETED")
        evidence = server.get(root + f"/evidence?source_id={source['id']}")
        assert evidence and all(item["source_revision_id"] == r1["id"] for item in evidence)
        finding = server.post(
            root + "/engineering/findings",
            {
                "title": "Verify clearance",
                "what_changed": "Clearance note imported",
                "why_it_matters": "Requires engineering verification",
                "evidence_ids": [evidence[0]["id"]],
                "dependencies": [
                    {
                        "source_id": source["id"],
                        "source_revision_id": r1["id"],
                        "capability": "document-clearance",
                        "expected_condition": "Clearance >= 100mm",
                        "target": {"kind": "document", "source_revision_id": r1["id"], "page": 1},
                    }
                ],
                "impact": {
                    "work_package_ids": [],
                    "area_ids": [],
                    "element_ids": [],
                    "disciplines": [],
                },
            },
            201,
        )
        finding_root = root + f"/engineering/findings/{finding['id']}"
        server.post(finding_root + "/decisions", {"decision": "CONFIRMED"}, 200)
        r2 = upload(b"Clearance note R2: clearance is 150mm.")
        checks = server.get(finding_root + "/rechecks")
        assert len(checks) == 1
        identity = checks[0]["id"]
        server.wait(lambda: server.get(f"/api/runs/{identity}")["status"] == "COMPLETED")
        server.close(crash=True)
        server = Server(
            folder, "dbos", token, executable=executable, profile="desktop", seed_demo=False
        )
        check = server.get(finding_root + "/rechecks")[0]
        assert check["outcome"] == "NEEDS_REVIEW" and check["source_revision_id"] == r2["id"]
        assert server.get(finding_root)["state"] == "CONFIRMED"
        assert server.get(root + f"/baselines/{baseline['id']}") == baseline
        assert (
            server.client.post(
                finding_root + "/decisions", json={"decision": "CLOSED", "recheck_id": identity}
            ).status_code
            == 409
        )
        assert server.get(source_root + f"/revisions/{r1['id']}") == r1
        return {
            "passed": True,
            "runtime": "dbos",
            "profile": "desktop",
            "packaged": executable is not None,
            "checks": [
                "revision-bound-import-evidence",
                "persisted-finding-dependencies",
                "automatic-recheck",
                "unavailable-engine-needs-review",
                "closure-fails-closed",
                "process-kill-restart",
                "baseline-remains-explicit",
            ],
            "limitations": ["Engineering detector not registered", "Tauri WebView not exercised"],
        }
    finally:
        server.close()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sidecar", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    return run_smoke(
        lambda folder, token: exercise(folder, args.sidecar, token=token),
        prefix="cca-engineering-smoke-",
        output=args.output,
    )


if __name__ == "__main__":
    raise SystemExit(main())
