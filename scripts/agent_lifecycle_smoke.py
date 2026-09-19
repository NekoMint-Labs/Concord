"""Real HTTP/DBOS restart check for an empty project, IFC revisions and scoped Agent work.

Pass --sidecar to exercise the actual packaged executable. This checks backend
delivery, not Tauri WebView interaction or C's still-separate IFC diff engine.
"""

import argparse
from pathlib import Path

from http_smoke import Server
from smoke_report import run_smoke

IFC = b"""ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Concord synthetic smoke fixture'),'2;1');
FILE_NAME('model.ifc','2026-09-17T00:00:00',(),(),'Concord','','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('0YvctVUKr0kugbFTf53O9L',$,'Campus',$,$,$,$,$,$);
#2=IFCWALL('1YvctVUKr0kugbFTf53O9L',$,'Wall R1',$,$,$,$,$,$);
ENDSEC;
END-ISO-10303-21;
"""


def exercise(folder: Path, executable: Path | None = None, *, token: str) -> dict:
    server = Server(
        folder, "dbos", token, executable=executable, profile="desktop", seed_demo=False
    )
    try:
        assert server.get("/api/projects") == []
        project = server.post("/api/projects", {"name": "Campus", "timezone": "Asia/Shanghai"}, 201)
        root = f"/api/projects/{project['id']}"
        area = server.post(root + "/areas", {"name": "East", "floor": "L02"}, 201)
        package = server.post(
            root + "/work-packages",
            {"name": "Ventilation", "area_id": area["id"], "discipline": "MEP"},
            201,
        )
        source = server.post(root + "/sources", {"name": "Model", "kind": "BIM"}, 201)
        source_root = root + f"/sources/{source['id']}"

        def upload(data):
            response = server.client.post(
                source_root + "/revisions", files={"file": ("model.ifc", data)}
            )
            assert response.status_code == 201, response.text
            return response.json()["revision"]

        r1 = upload(IFC)
        baseline = server.post(
            root + "/baselines",
            {"name": "B1", "entries": [{"source_id": source["id"], "revision_id": r1["id"]}]},
            201,
        )
        run = server.post(source_root + f"/revisions/{r1['id']}/import")
        server.wait(lambda: server.get(f"/api/runs/{run['id']}")["status"] == "COMPLETED")
        r2 = upload(IFC.replace(b"Wall R1", b"Wall R2"))
        run = server.post(source_root + f"/revisions/{r2['id']}/import")
        server.wait(lambda: server.get(f"/api/runs/{run['id']}")["status"] == "COMPLETED")
        assert server.get(root + "/bim/elements")[0]["name"] == "Wall R2"
        assert server.get(root + f"/baselines/{baseline['id']}") == baseline
        assert len(server.get(root + "/agent/notices")) == 2
        answer = server.post(
            root + "/agent/ask",
            {
                "instruction": "Explain",
                "scope": {
                    "source_id": source["id"],
                    "from_revision_id": r1["id"],
                    "to_revision_id": r2["id"],
                },
            },
            200,
        )
        assert answer["persisted"] is False
        assert any(
            "have not been compared" in text for text in answer["answer"]["limitations"]
        )
        event = server.post(
            root + "/events",
            {
                "project_id": project["id"],
                "work_package_id": package["id"],
                "kind": "design_revision",
                "title": "Recorded design change",
                "change": {"revision": "R2"},
            },
        )
        server.wait(lambda: server.get(f"/api/runs/{event['id']}")["status"] == "WAITING_APPROVAL")
        investigation = server.post(
            root + "/agent/investigate",
            {"instruction": "Investigate only L02", "scope": {"work_package_ids": [package["id"]]}},
        )
        run_id = investigation["id"]
        server.wait(lambda: server.get(f"/api/runs/{run_id}")["status"] == "WAITING_APPROVAL")
        proposal = server.get(root + "/workspace")["proposals"][0]
        assert proposal["run_id"] == run_id
        assert server.client.post(f"/api/proposals/{proposal['id']}/execute").status_code == 403
        server.close(crash=True)
        server = Server(
            folder, "dbos", token, executable=executable, profile="desktop", seed_demo=False
        )
        report = server.get(root + f"/agent/investigations/{run_id}")
        assert report["persisted"] and report["scope"]["work_package_ids"] == [package["id"]]
        server.post(f"/api/proposals/{proposal['id']}/approve", {}, 200)
        receipt = server.post(f"/api/proposals/{proposal['id']}/execute")
        server.wait(lambda: server.get(f"/api/runs/{run_id}")["status"] == "COMPLETED")
        assert server.get(f"/api/operations/{receipt['operation_id']}")["mode"] == "simulated"
        result = server.get(root + f"/agent/investigations/{run_id}")
        assert result["analysis_id"] != report["analysis_id"]
        return {
            "passed": True,
            "runtime": "dbos",
            "profile": "desktop",
            "packaged": executable is not None,
            "checks": [
                "empty-project",
                "ifc-revision-identity",
                "baseline-preserved",
                "suggest-notices",
                "read-only-ask",
                "scope",
                "human-approval",
                "process-kill-restart",
                "persisted-evidence",
                "fresh-action-recheck",
            ],
            "limitations": [
                "Action executor is simulated",
                "The selected BIM revisions have not been compared",
                "Tauri WebView not exercised",
            ],
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
        prefix="cca-agent-smoke-",
        output=args.output,
    )


if __name__ == "__main__":
    raise SystemExit(main())
