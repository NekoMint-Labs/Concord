"""Persisted BIM comparisons join safely to current many-to-many WP bindings."""

import hashlib

import pytest
from app.domain.agent import AgentAnswer, AgentRequest, AgentScope
from app.domain.agent_tools import RevisionQuery, WorkPackageQuery
from app.ports.bim_revisions import NormalizedIfcDiff
from app.ports.providers import BIMElement


def _parse(content: bytes) -> list[BIMElement]:
    identity = "stable-wall" if content == b"R1" else "replacement-duct"
    return [
        BIMElement(
            id=identity,
            name="Plantroom element",
            type="IfcWall" if content == b"R1" else "IfcDuctSegment",
            storey="L02",
            space="Plantroom",
            properties={"revision": content.decode()},
            revision=hashlib.sha256(content).hexdigest(),
        )
    ]


class _RemovedWallDiff:
    def compare(self, old_content: bytes, new_content: bytes) -> NormalizedIfcDiff:
        assert (old_content, new_content) == (b"R1", b"R2")
        return NormalizedIfcDiff(
            engine="ifcdiff",
            engine_version="0.8.5",
            added=frozenset({"replacement-duct"}),
            deleted=frozenset({"stable-wall"}),
            changed={},
            raw={"added": ["replacement-duct"], "deleted": ["stable-wall"]},
            compare_seconds=0.1,
        )


def _setup(client, services, monkeypatch):
    project = client.post("/api/projects", json={"name": "Scoped BIM project"}).json()
    root = f"/api/projects/{project['id']}"
    area = client.post(f"{root}/areas", json={"name": "Plantroom"}).json()
    packages = [
        client.post(
            f"{root}/work-packages",
            json={"name": name, "area_id": area["id"], "discipline": "MEP"},
        ).json()
        for name in ("WP A", "WP B")
    ]
    source = client.post(f"{root}/sources", json={"name": "MEP", "kind": "BIM"}).json()
    revisions = []
    monkeypatch.setattr(services.jobs.ifc, "parse", _parse)
    for name, content in (("r1.ifc", b"R1"), ("r2.ifc", b"R2")):
        response = client.post(
            f"{root}/sources/{source['id']}/revisions",
            files={"file": (name, content, "application/x-step")},
        )
        assert response.status_code == 201, response.text
        revision = response.json()["revision"]
        revisions.append(revision)
        imported = client.post(
            f"{root}/sources/{source['id']}/revisions/{revision['id']}/import"
        )
        assert imported.status_code == 202, imported.text
    services.bim_revisions.comparison = _RemovedWallDiff()
    return project, packages, source, revisions


def _bind(client, project, source, revision, packages):
    response = client.post(
        f"/api/projects/{project['id']}/sources/{source['id']}/bim-bindings",
        json={
            "revision_id": revision["id"],
            "bindings": [
                {"work_package_id": package["id"], "global_ids": ["stable-wall"]}
                for package in packages
            ],
        },
    )
    assert response.status_code == 201, response.text


@pytest.mark.parametrize("binding_timing", ["after-comparison", "two-before-comparison"])
def test_wp_scoped_investigation_joins_current_bindings_without_cross_wp_evidence(
    client, services, monkeypatch, admin, binding_timing
):
    project, packages, source, (r1, r2) = _setup(client, services, monkeypatch)
    if binding_timing == "two-before-comparison":
        _bind(client, project, source, r1, packages)

    comparison = client.post(
        f"/api/projects/{project['id']}/sources/{source['id']}/bim-comparisons",
        json={"from_revision_id": r1["id"], "to_revision_id": r2["id"]},
    )
    assert comparison.status_code == 201, comparison.text
    if binding_timing == "after-comparison":
        assert comparison.json()["affected_work_packages"] == []
        _bind(client, project, source, r1, packages[:1])
    else:
        assert {
            item["work_package_id"]
            for item in comparison.json()["affected_work_packages"]
        } == {package["id"] for package in packages}

    observed = {}

    class CapturingInvestigator:
        mode = "scoped-bim-binding-test"

        def investigate(self, instruction, scope, tools):
            overview = tools.project_state()
            observed["changes"] = tools.bim_changes(
                RevisionQuery(
                    source_id=source["id"],
                    from_revision_id=r1["id"],
                    to_revision_id=r2["id"],
                )
            )
            observed["bindings"] = tools.work_package_bindings(
                WorkPackageQuery(work_package_ids=(packages[0]["id"],))
            )
            return AgentAnswer(summary="Scoped BIM impact", evidence_ids=(overview.evidence[0].id,))

    services.investigations.engine = CapturingInvestigator()
    run = services.agent.enqueue(
        project["id"],
        AgentRequest(
            instruction="Investigate the selected Work Package.",
            scope=AgentScope(
                source_id=source["id"],
                from_revision_id=r1["id"],
                to_revision_id=r2["id"],
                work_package_ids=(packages[0]["id"],),
            ),
        ),
        admin,
    )

    changes = observed["changes"]
    bindings = observed["bindings"]
    assert [item.global_id for item in changes.changes] == ["stable-wall"]
    expected_evidence_packages = (
        {None}
        if binding_timing == "after-comparison"
        else {None, packages[0]["id"]}
    )
    assert {item.work_package_id for item in changes.evidence} == expected_evidence_packages
    assert {(item.work_package_id, item.global_id) for item in bindings.bindings} == {
        (packages[0]["id"], "stable-wall")
    }
    with services.factory.open() as repo:
        analysis = repo.analysis(run.analysis_id)
        assert analysis.impact.work_package_ids == (packages[0]["id"],)
        assert analysis.impact.element_ids == ("stable-wall",)
        assert all(item.work_package_id != packages[1]["id"] for item in analysis.evidence)
