"""Real-project controls, read-only Ask, scope fences and approval-backed Act."""

import pytest
from app.domain.agent import AgentRequest, AgentScope, AgentSettings
from app.domain.errors import ApprovalRequired, DomainError, StaleSnapshotError
from app.domain.project_lifecycle import CreateArea, CreateProject, CreateWorkPackage
from app.domain.project_sources import CreateProjectSource
from sqlalchemy import inspect, text


def project(svc, admin):
    identity = svc.projects.create(CreateProject(name="Campus"), admin).id
    packages = []
    for floor in ("L02", "L03"):
        area = svc.projects.add_area(identity, CreateArea(name=floor, floor=floor), admin)
        packages.append(
            svc.projects.add_work_package(
                identity,
                CreateWorkPackage(name=f"MEP {floor}", area_id=area.id, discipline="MEP"),
                admin,
            )
        )
    with svc.factory.open(identity, write=True) as repo:
        state = repo.state(identity)
        repo.save_state(
            state.model_copy(
                update={
                    "version": state.version + 1,
                    "work_packages": tuple(
                        p.model_copy(update={"required_workers": 2}) for p in packages
                    ),
                }
            )
        )
    return identity, packages


def counts(svc):
    with svc.factory.engine.connect() as connection:
        return {
            name: connection.execute(text(f'SELECT count(*) FROM "{name}"')).scalar()
            for name in inspect(connection).get_table_names()
        }


def test_ask_has_no_database_side_effects_and_instruction_narrows_scope(services, admin):
    identity, packages = project(services, admin)
    before = counts(services)
    response = services.investigations.ask(
        identity, AgentRequest(instruction=f"Investigate only L02 and {packages[0].id}")
    )
    assert counts(services) == before
    assert not response.persisted
    assert response.scope.work_package_ids == (packages[0].id,)
    assert all(e.work_package_id in {None, packages[0].id} for e in response.evidence)
    assert set(response.answer.evidence_ids) <= {e.id for e in response.evidence}


def test_conflicting_and_cross_project_scopes_are_rejected(services, admin):
    identity, packages = project(services, admin)
    for request in (
        AgentRequest(
            instruction=f"only {packages[1].id}",
            scope=AgentScope(work_package_ids=(packages[0].id,)),
        ),
        AgentRequest(
            instruction="Explain", scope=AgentScope(work_package_ids=("another-project-wp",))
        ),
        AgentRequest(instruction="only the nonexistent roof"),
    ):
        with pytest.raises(DomainError):
            services.investigations.ask(identity, request)


def test_investigation_actions_require_approval_and_recheck_same_scope(services, admin):
    identity, packages = project(services, admin)
    request = AgentRequest(
        instruction="Check staffing", scope=AgentScope(work_package_ids=(packages[0].id,))
    )
    run = services.agent.enqueue(identity, request, admin)
    assert run.status == "WAITING_APPROVAL"
    with services.factory.open() as repo:
        proposals = repo.proposals(run.id)
        report = repo.investigation_report(run.id)
        assert report and report.persisted
        assert all(
            "Synthetic" not in " ".join(f.limitations)
            for f in repo.analysis(run.analysis_id).findings
        )
        assert set(report.answer.evidence_ids) <= {e.id for e in repo.evidence(identity)}
    assert len(proposals) == 1 and proposals[0].work_package_id == packages[0].id
    with pytest.raises(ApprovalRequired):
        services.actions.execute(proposals[0].id, admin)
    services.actions.approve(proposals[0].id, admin)
    services.actions.execute(proposals[0].id, admin)
    with services.factory.open() as repo:
        updated = repo.run(run.id)
        assert updated.status == "COMPLETED"
        assert {r.work_package_id for r in repo.analysis(updated.analysis_id).readiness} == {
            packages[0].id
        }
        assert repo.state(identity).package(packages[1].id).available_workers == 0
        assert repo.investigation_report(run.id).analysis_id == updated.analysis_id


def test_stale_investigation_proposals_are_rejected(services, admin):
    identity, packages = project(services, admin)
    run = services.agent.enqueue(
        identity,
        AgentRequest(instruction="Check", scope=AgentScope(work_package_ids=(packages[0].id,))),
        admin,
    )
    with services.factory.open() as repo:
        proposal = repo.proposals(run.id)[0]
    services.actions.approve(proposal.id, admin)
    services.projects.add_area(identity, CreateArea(name="New floor"), admin)
    with pytest.raises(StaleSnapshotError):
        services.actions.execute(proposal.id, admin)
    with services.factory.open() as repo:
        assert repo.execution(proposal.operation_id) is None
        assert repo.investigation_report(run.id).scope.work_package_ids == (packages[0].id,)


@pytest.mark.parametrize(
    "mode,automatic", [("manual", False), ("suggest", False), ("auto-investigate", True)]
)
def test_revision_notices_are_durable_deduplicated_and_policy_controlled(
    services, admin, mode, automatic
):
    identity, _ = project(services, admin)
    services.agent.configure(identity, AgentSettings(initiative=mode), admin)
    source = services.sources.create(identity, CreateProjectSource(name="Model", kind="BIM"), admin)
    original = services.sources.upload(identity, source.id, "test.ifc", b"stored-only", admin)
    duplicate = services.sources.upload(identity, source.id, "test.ifc", b"stored-only", admin)
    assert duplicate.duplicate
    with services.factory.open() as repo:
        notices = repo.agent_notices(identity)
        runs = repo.runs(identity)
    assert len(notices) == 1 and notices[0].revision_id == original.revision.id
    assert bool(runs) is automatic
    if automatic:
        with services.factory.open() as repo:
            report = repo.investigation_report(runs[0].id)
            assert any("two imported BIM revisions" in text for text in report.answer.limitations)
            assert repo.proposals(runs[0].id) == []


def test_viewer_can_ask_but_cannot_launch_or_change_initiative(client):
    client.headers["Authorization"] = "Bearer local-demo-viewer"
    root = "/api/projects/harbor-east/agent"
    assert client.post(root + "/ask", json={"instruction": "Explain"}).status_code == 200
    assert client.post(root + "/investigate", json={"instruction": "Explain"}).status_code == 403
    assert (
        client.post(root + "/settings", json={"initiative": "auto-investigate"}).status_code == 403
    )
    assert client.get(root + "/settings").json() == {"initiative": "suggest"}
