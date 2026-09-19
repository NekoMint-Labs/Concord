"""Issue #11: revision history, human bindings, impact and Evidence remain durable."""

import hashlib

import pytest
from app.domain.agent import AgentRequest, AgentScope
from app.domain.bim_revisions import CompareBimRevisions
from app.domain.errors import NotFound, StaleSnapshotError
from app.domain.models import ProjectSnapshot
from app.policies.actions import check_fresh
from app.ports.bim_revisions import NormalizedIfcDiff
from app.ports.providers import BIMElement


def create_project_source(client):
    project = client.post("/api/projects", json={"name": "Unfamiliar clinic project"}).json()
    root = f"/api/projects/{project['id']}"
    area = client.post(f"{root}/areas", json={"name": "North plantroom"}).json()
    package = client.post(
        f"{root}/work-packages",
        json={"name": "Ventilation installation", "area_id": area["id"], "discipline": "MEP"},
    ).json()
    source = client.post(f"{root}/sources", json={"name": "Federated MEP", "kind": "BIM"}).json()
    return project, package, source


def upload_revision(client, project_id, source_id, name, content):
    response = client.post(
        f"/api/projects/{project_id}/sources/{source_id}/revisions",
        files={"file": (name, content, "application/x-step")},
    )
    assert response.status_code == 201, response.text
    return response.json()["revision"]


def parse_fixture(content):
    digest = hashlib.sha256(content).hexdigest()
    identity = "stable-wall" if content == b"R1" else "replacement-duct"
    return [
        BIMElement(
            id=identity,
            name="Plantroom element",
            type="IfcWall" if content == b"R1" else "IfcDuctSegment",
            storey="L02",
            space="North plantroom",
            properties={"Pset_Test": {"Revision": content.decode()}},
            revision=digest,
        )
    ]


def test_revision_snapshots_bindings_comparison_and_evidence_survive_restart(
    client, services, monkeypatch, admin
):
    project, package, source = create_project_source(client)
    r1 = upload_revision(client, project["id"], source["id"], "clinic-r1.ifc", b"R1")
    r2 = upload_revision(client, project["id"], source["id"], "clinic-r2.ifc", b"R2")
    snapshot_url = (
        f"/api/projects/{project['id']}/sources/{source['id']}/revisions/{r1['id']}/bim-snapshot"
    )
    assert client.get(snapshot_url).status_code == 404
    assert (
        client.post(
            f"/api/projects/{project['id']}/sources/{source['id']}/bim-comparisons",
            json={"from_revision_id": r1["id"], "to_revision_id": r1["id"]},
        ).status_code
        == 400
    )
    monkeypatch.setattr(services.jobs.ifc, "parse", parse_fixture)

    for revision in (r1, r2):
        response = client.post(
            f"/api/projects/{project['id']}/sources/{source['id']}"
            f"/revisions/{revision['id']}/import"
        )
        assert response.status_code == 202, response.text
        assert response.json()["status"] == "COMPLETED"

    r1_snapshot = client.get(
        f"/api/projects/{project['id']}/sources/{source['id']}/revisions/{r1['id']}/bim-snapshot"
    ).json()
    assert r1_snapshot["elements"][0]["global_id"] == "stable-wall"
    assert r1_snapshot["elements"][0]["storey"] == "L02"
    assert (
        client.get(
            f"/api/projects/{project['id']}/sources/{source['id']}"
            f"/revisions/{r2['id']}/bim-snapshot"
        ).status_code
        == 200
    )

    with services.factory.open() as repo:
        state_before_binding = repo.state(project["id"])
    snapshot_before_binding = ProjectSnapshot(
        project_id=project["id"],
        version=state_before_binding.version,
        sources=state_before_binding.sources,
    )
    confirmed = client.post(
        f"/api/projects/{project['id']}/sources/{source['id']}/bim-bindings",
        json={
            "revision_id": r1["id"],
            "bindings": [{"work_package_id": package["id"], "global_ids": ["stable-wall"]}],
        },
    )
    assert confirmed.status_code == 201, confirmed.text
    assert confirmed.json()[0]["origin"] == "human_confirmed"
    assert confirmed.json()[0]["confirmation_revision_id"] == r1["id"]
    with services.factory.open() as repo:
        with pytest.raises(StaleSnapshotError):
            check_fresh(snapshot_before_binding, repo.state(project["id"]))
        binding_evidence = repo.evidence_by_ids(
            project["id"], (confirmed.json()[0]["evidence_id"],)
        )[0]
        assert binding_evidence.source_revision == r1["sha256"]
        version_after_binding = repo.state(project["id"]).version
    assert (
        client.post(
            f"/api/projects/{project['id']}/sources/{source['id']}/bim-bindings",
            json={
                "revision_id": r1["id"],
                "bindings": [{"work_package_id": package["id"], "global_ids": ["stable-wall"]}],
            },
        ).json()[0]["id"]
        == confirmed.json()[0]["id"]
    )
    with services.factory.open() as repo:
        assert repo.state(project["id"]).version == version_after_binding
    statuses = client.get(
        f"/api/projects/{project['id']}/sources/{source['id']}/bim-bindings",
        params={"revision_id": r2["id"]},
    ).json()
    assert statuses[0]["state"] == "missing" and statuses[0]["element"] is None
    latest_statuses = client.get(
        f"/api/projects/{project['id']}/sources/{source['id']}/bim-bindings"
    ).json()
    assert latest_statuses[0]["revision_id"] == r2["id"]

    class FakeIfcDiff:
        def compare(self, old_content, new_content):
            assert old_content == b"R1" and new_content == b"R2"
            return NormalizedIfcDiff(
                engine="ifcdiff",
                engine_version="0.8.5",
                added=frozenset({"replacement-duct"}),
                deleted=frozenset({"stable-wall"}),
                changed={},
                raw={
                    "added": ["replacement-duct"],
                    "deleted": ["stable-wall"],
                    "changed": {},
                },
                compare_seconds=0.25,
            )

    services.bim_revisions.comparison = FakeIfcDiff()
    with services.factory.open() as repo:
        state_before_comparison = repo.state(project["id"])
    snapshot_before_comparison = ProjectSnapshot(
        project_id=project["id"],
        version=state_before_comparison.version,
        sources=state_before_comparison.sources,
    )
    comparison = client.post(
        f"/api/projects/{project['id']}/sources/{source['id']}/bim-comparisons",
        json=CompareBimRevisions(from_revision_id=r1["id"], to_revision_id=r2["id"]).model_dump(),
    )
    assert comparison.status_code == 201, comparison.text
    detail = comparison.json()
    assert detail["comparison"]["summary"] == {
        "added": 1,
        "deleted": 1,
        "changed": 0,
        "from_elements": 1,
        "to_elements": 1,
        "common_global_ids": 0,
        "global_id_continuity": 0.0,
        "warnings": [
            "Low GlobalId continuity; exporter behavior may appear as mass additions/deletions."
        ],
        "compare_seconds": 0.25,
    }
    assert detail["affected_work_packages"][0]["work_package_id"] == package["id"]
    assert detail["affected_work_packages"][0]["changes"][0]["global_id"] == "stable-wall"
    with services.factory.open() as repo:
        with pytest.raises(StaleSnapshotError):
            check_fresh(snapshot_before_comparison, repo.state(project["id"]))
        comparison_evidence = repo.evidence_by_ids(
            project["id"], tuple(detail["comparison"]["evidence_ids"])
        )
        assert comparison_evidence
        assert {item.source_revision for item in comparison_evidence} == {r2["sha256"]}

    run = services.agent.enqueue(
        project["id"],
        AgentRequest(
            instruction="Investigate the imported BIM revision changes.",
            scope=AgentScope(
                source_id=source["id"],
                from_revision_id=r1["id"],
                to_revision_id=r2["id"],
            ),
        ),
        admin,
    )
    with services.factory.open() as repo:
        analysis = repo.analysis(run.analysis_id)
        assert analysis.impact.work_package_ids == (package["id"],)
        assert analysis.impact.element_ids == ("stable-wall",)
        assert any("deleted" in finding.conclusion for finding in analysis.findings)
    comparison_id = detail["comparison"]["id"]
    listed = client.get(
        f"/api/projects/{project['id']}/sources/{source['id']}/bim-comparisons"
    ).json()
    assert [item["id"] for item in listed] == [comparison_id]
    restored_detail = client.get(
        f"/api/projects/{project['id']}/sources/{source['id']}/bim-comparisons/{comparison_id}"
    ).json()
    assert restored_detail["changes"] == detail["changes"]
    evidence_ids = set(detail["comparison"]["evidence_ids"])
    assert evidence_ids
    assert evidence_ids <= {
        item["id"] for item in client.get(f"/api/projects/{project['id']}/evidence").json()
    }
    assert (
        client.post(
            f"/api/projects/{project['id']}/sources/{source['id']}/bim-comparisons",
            json=CompareBimRevisions(
                from_revision_id=r1["id"], to_revision_id=r2["id"]
            ).model_dump(),
        ).status_code
        == 409
    )
    other_source = client.post(
        f"/api/projects/{project['id']}/sources",
        json={"name": "Other BIM", "kind": "BIM"},
    ).json()
    assert (
        client.get(
            f"/api/projects/{project['id']}/sources/{other_source['id']}"
            f"/bim-comparisons/{comparison_id}"
        ).status_code
        == 404
    )
    with services.factory.open() as repo:
        assert repo.bim_bindings(project["id"], source["id"], set()) == []
        with pytest.raises(NotFound):
            repo.bim_revision_snapshot(project["id"], other_source["id"], r1["id"])

    from app.bootstrap import build_services

    restarted = build_services(services.settings)
    try:
        with restarted.factory.open() as repo:
            assert repo.bim_revision_snapshot(project["id"], source["id"], r1["id"])
            assert repo.bim_revision_snapshot(project["id"], source["id"], r2["id"])
        restored = restarted.bim_revisions.detail(project["id"], source["id"], comparison_id)
        assert restored.comparison.id == comparison_id
        assert restored.affected_work_packages[0].work_package_id == package["id"]
    finally:
        restarted.close()


def test_binding_requires_human_permission_and_an_imported_confirmed_global_id(
    client, services, monkeypatch
):
    project, package, source = create_project_source(client)
    revision = upload_revision(client, project["id"], source["id"], "r1.ifc", b"R1")
    endpoint = f"/api/projects/{project['id']}/sources/{source['id']}/bim-bindings"
    payload = {
        "revision_id": revision["id"],
        "bindings": [{"work_package_id": package["id"], "global_ids": ["stable-wall"]}],
    }
    assert client.post(endpoint, json=payload).status_code == 409
    monkeypatch.setattr(services.jobs.ifc, "parse", parse_fixture)
    client.post(
        f"/api/projects/{project['id']}/sources/{source['id']}/revisions/{revision['id']}/import"
    )
    assert (
        client.post(
            endpoint,
            headers={"Authorization": "Bearer local-demo-viewer"},
            json=payload,
        ).status_code
        == 403
    )
    bad = payload | {
        "bindings": [{"work_package_id": package["id"], "global_ids": ["invented-id"]}]
    }
    assert client.post(endpoint, json=bad).status_code == 400
    document_source = client.post(
        f"/api/projects/{project['id']}/sources",
        json={"name": "Specification", "kind": "DOCUMENT"},
    ).json()
    assert (
        client.post(
            f"/api/projects/{project['id']}/sources/{document_source['id']}/bim-bindings",
            json=payload,
        ).status_code
        == 409
    )
