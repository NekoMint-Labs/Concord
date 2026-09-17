"""Pilot contract: a non-demo project and immutable originals survive app recreation."""

import hashlib

import pytest
from app.api.main import create_app
from app.settings import Settings
from fastapi.testclient import TestClient

AUTH = {"Authorization": "Bearer local-demo-admin"}


def created(client, path, data):
    response = client.post(path, json=data)
    assert response.status_code == 201, response.text
    return response.json()


def upload(client, root, content=b"original revision", filename="original.ifc", label="R1"):
    response = client.post(
        f"{root}/revisions",
        files={"file": (filename, content, "application/x-step")},
        data={"external_label": label},
    )
    assert response.status_code in {200, 201}, response.text
    return response


def test_real_project_source_and_baseline_survive_restart(tmp_path):
    settings = Settings(data_dir=tmp_path, diagnostic_runtime=True, seed_demo=False)
    with TestClient(create_app(settings), headers=AUTH) as client:
        assert client.get("/api/projects").json() == []
        project = created(
            client, "/api/projects", {"name": "Campus laboratory", "timezone": "Asia/Shanghai"}
        )
        root = f"/api/projects/{project['id']}"
        state = client.get(root).json()
        assert state["areas"] == state["work_packages"] == []
        area = created(client, f"{root}/areas", {"name": "East wing", "floor": "L02"})
        package = created(
            client,
            f"{root}/work-packages",
            {
                "name": "Ventilation",
                "area_id": area["id"],
                "discipline": "MEP",
            },
        )
        assert package["element_ids"] == package["predecessors"] == []
        assert package["design_revision"] == package["accepted_revision"] == ""
        assert package["required_workers"] == package["available_workers"] == 0
        source = created(client, f"{root}/sources", {"name": "MEP model", "kind": "BIM"})
        source_root = f"{root}/sources/{source['id']}"
        r1 = upload(client, source_root).json()["revision"]
        assert r1["sha256"] == hashlib.sha256(b"original revision").hexdigest()
        assert r1["media_type"] == "application/x-step"
        assert r1["import_status"] == "STORED"
        assert r1["external_label"] == "R1"
        assert r1["sequence"] == 1
        assert client.get(f"{root}/baselines").json() == []
        b1 = created(
            client,
            f"{root}/baselines",
            {
                "name": "B1",
                "entries": [
                    {"source_id": source["id"], "revision_id": r1["id"]},
                ],
            },
        )
        assert not client.get(source_root).json()["has_pending_revision"]

    with TestClient(create_app(settings), headers=AUTH) as client:
        assert client.get("/api/projects").json() == [project]
        state = client.get(root).json()
        assert state["areas"] == [area]
        assert state["work_packages"] == [package]
        assert client.get(f"{root}/baselines/{b1['id']}").json() == b1
        r2 = upload(client, source_root, b"changed revision", "renamed-R2.ifc", "R2").json()[
            "revision"
        ]
        assert r2["sequence"] == 2
        assert r2["id"] != r1["id"]
        assert r2["storage_key"] != r1["storage_key"]
        assert client.get(f"{source_root}/revisions").json() == [r1, r2]
        status = client.get(source_root).json()
        assert status["latest_revision_id"] == r2["id"]
        assert status["accepted_revision_id"] == r1["id"]
        assert status["has_pending_revision"]
        version = client.get(root).json()["version"]
        duplicate = upload(client, source_root, b"original revision", "same-content.ifc", "renamed")
        assert duplicate.status_code == 200
        assert duplicate.json() == {"revision": r1, "duplicate": True}
        assert client.get(root).json()["version"] == version
        assert client.get(source_root).json()["latest_revision_id"] == r2["id"]
        b2 = created(
            client,
            f"{root}/baselines",
            {
                "name": "B2",
                "entries": [
                    {"source_id": source["id"], "revision_id": r2["id"]},
                ],
            },
        )
        assert b2["sequence"] == 2
        assert client.get(f"{root}/baselines").json() == [b1, b2]
        assert not client.get(source_root).json()["has_pending_revision"]

    with TestClient(create_app(settings), headers=AUTH) as client:
        for revision, content in [(r1, b"original revision"), (r2, b"changed revision")]:
            revision_root = f"{source_root}/revisions/{revision['id']}"
            assert client.get(revision_root).json() == revision
            response = client.get(f"{revision_root}/content")
            assert response.content == content
            assert "attachment;" in response.headers["content-disposition"]
        assert client.get(f"{root}/baselines/{b1['id']}").json() == b1
        audit = client.get(f"{root}/workspace").json()["audit"]
        assert len([item for item in audit if item["action"] == "SOURCE_REVISION_STORED"]) == 2
        assert len([item for item in audit if item["action"] == "BASELINE_ACCEPTED"]) == 2


def test_lifecycle_rejects_cross_project_and_cross_source_references(client):
    p1 = created(client, "/api/projects", {"name": "One"})["id"]
    p2 = created(client, "/api/projects", {"name": "Two"})["id"]
    root1, root2 = f"/api/projects/{p1}", f"/api/projects/{p2}"
    area = created(client, f"{root1}/areas", {"name": "L02"})
    response = client.post(
        f"{root2}/work-packages",
        json={
            "name": "Wrong project",
            "area_id": area["id"],
            "discipline": "MEP",
        },
    )
    assert response.status_code == 404
    s1 = created(client, f"{root1}/sources", {"name": "One", "kind": "BIM"})
    s2 = created(client, f"{root1}/sources", {"name": "Two", "kind": "DOCUMENT"})
    source_root = f"{root1}/sources/{s1['id']}"
    r1 = upload(client, source_root).json()["revision"]
    for path in [
        f"/sources/{s1['id']}",
        f"/sources/{s1['id']}/revisions",
        f"/sources/{s1['id']}/revisions/{r1['id']}/content",
    ]:
        assert client.get(root2 + path).status_code == 404
    for root, source_id in [(root2, s1["id"]), (root1, s2["id"])]:
        response = client.post(
            f"{root}/baselines",
            json={
                "name": "Invalid",
                "entries": [
                    {"source_id": source_id, "revision_id": r1["id"]},
                ],
            },
        )
        assert response.status_code == 404
    b1 = created(
        client,
        f"{root1}/baselines",
        {
            "name": "B1",
            "entries": [
                {"source_id": s1["id"], "revision_id": r1["id"]},
            ],
        },
    )
    assert client.get(f"{root2}/baselines/{b1['id']}").status_code == 404
    assert client.get(f"{root2}/baselines").json() == []


def test_permissions_and_explicit_baseline_acceptance(client):
    project = created(client, "/api/projects", {"name": "Permissions"})
    root = f"/api/projects/{project['id']}"
    source = created(client, f"{root}/sources", {"name": "Drawing", "kind": "DRAWING"})
    source_root = f"{root}/sources/{source['id']}"
    r1 = upload(client, source_root).json()["revision"]
    baseline = {"name": "B1", "entries": [{"source_id": source["id"], "revision_id": r1["id"]}]}
    client.headers["Authorization"] = "Bearer local-demo-viewer"
    assert client.get(root).status_code == 200
    for path, data in [
        ("/api/projects", {"name": "No"}),
        (f"{root}/areas", {"name": "No"}),
        (f"{root}/sources", {"name": "No", "kind": "BIM"}),
        (f"{root}/baselines", baseline),
    ]:
        assert client.post(path, json=data).status_code == 403
    assert (
        client.post(f"{source_root}/revisions", files={"file": ("a.ifc", b"no")}).status_code == 403
    )
    client.headers["Authorization"] = "Bearer local-demo-coordinator"
    assert client.post(f"{root}/baselines", json=baseline).status_code == 403
    client.headers["Authorization"] = "Bearer local-demo-approver"
    assert client.post(f"{root}/baselines", json=baseline).status_code == 201


@pytest.mark.parametrize("payload", [{"name": "  "}, {"name": "x", "timezone": "not/a-zone"}])
def test_invalid_project_input(client, payload):
    assert client.post("/api/projects", json=payload).status_code == 422


def test_upload_validation_and_no_implicit_baseline(client, services):
    project = created(client, "/api/projects", {"name": "Validation"})
    root = f"/api/projects/{project['id']}"
    source = created(client, f"{root}/sources", {"name": "Schedule", "kind": "SCHEDULE"})
    source_root = f"{root}/sources/{source['id']}"
    for filename, content in [("x.txt", b""), ("../escape.ifc", b"abc"), ("x.txt", b"x" * 9)]:
        services.settings.max_upload_bytes = 8
        response = client.post(f"{source_root}/revisions", files={"file": (filename, content)})
        assert response.status_code == 400
    assert client.get(f"{source_root}/revisions").json() == []
    assert client.get(f"{root}/baselines").json() == []
    assert (
        client.post(f"{root}/baselines", json={"name": "Empty", "entries": []}).status_code == 422
    )
