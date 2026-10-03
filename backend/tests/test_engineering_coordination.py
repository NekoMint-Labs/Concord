"""Platform contract acceptance with deterministic engineering provider fixtures."""

import pytest
from app.bootstrap import build_services
from app.domain.actions import Principal
from app.domain.engineering import (
    CapabilityCheckResult,
    Change,
    EngineeringPublication,
    FindingDecision,
    FindingDraft,
)
from app.domain.engineering_refs import BimTarget, FindingDependency
from app.domain.errors import Conflict, PermissionDenied
from app.domain.models import Evidence, Impact, ProjectSnapshot, utcnow
from app.domain.project_lifecycle import CreateProject
from app.domain.project_sources import CreateProjectSource
from app.settings import Settings


def setup_finding(svc, admin, *, confirm=True):
    project = svc.projects.create(CreateProject(name="Coordination acceptance"), admin)
    source = svc.sources.create(project.id, CreateProjectSource(name="Model", kind="BIM"), admin)
    revision = svc.sources.upload(project.id, source.id, "r1.ifc", b"r1", admin).revision
    with svc.factory.open(project.id, write=True) as repo:
        state = repo.state(project.id)
        snapshot = ProjectSnapshot(
            project_id=project.id, version=state.version, sources=state.sources
        )
        repo.save_snapshot(snapshot)
    target = BimTarget(source_revision_id=revision.id, global_ids=("element-1",))
    evidence = Evidence(
        snapshot_id=snapshot.id,
        provider="fixture",
        source_id=source.id,
        source_revision=revision.sha256,
        source_revision_id=revision.id,
        observed_at=utcnow(),
        fact="Clearance insufficient",
        viewer_target=target,
    )
    change = Change(
        project_id=project.id,
        source_id=source.id,
        to_revision_id=revision.id,
        subject=target,
        kind="geometry",
        detector="fixture",
    )
    publication = EngineeringPublication(
        operation_id="initial", changes=(change,), evidence=(evidence,)
    )
    svc.engineering.publish(project.id, publication)
    draft = FindingDraft(
        title="Clearance",
        what_changed="Duct moved",
        why_it_matters="Clash",
        evidence_ids=(evidence.id,),
        change_ids=(change.id,),
        dependencies=(
            FindingDependency(
                source_id=source.id,
                source_revision_id=revision.id,
                capability="fixture-clearance",
                expected_condition="Clearance >= 100mm",
                target=target,
            ),
        ),
        impact=Impact(
            work_package_ids=(), area_ids=(), element_ids=("element-1",), disciplines=("MEP",)
        ),
    )
    finding = svc.findings.create(project.id, draft, admin)
    if confirm:
        finding = svc.findings.decide(
            project.id, finding.id, FindingDecision(decision="CONFIRMED"), admin
        )
    return project, source, revision, finding, publication, draft


class CheckEngine:
    name = "fixture-clearance"
    version = "1"

    def __init__(self, svc, outcome="RESOLVED"):
        self.svc, self.outcome, self.calls = svc, outcome, 0
        self.during = lambda request: None

    def check(self, request):
        self.calls += 1
        self.during(request)
        with self.svc.factory.open() as repo:
            revision = repo.source_revision(
                request.project_id, request.source_id, request.to_revision_id
            )
        return CapabilityCheckResult(
            outcome=self.outcome,
            explanation="Measured clearance 150mm",
            evidence=(
                Evidence(
                    snapshot_id="platform-assigns",
                    provider=self.name,
                    source_id=request.source_id,
                    source_revision_id=revision.id,
                    source_revision=revision.sha256,
                    observed_at=utcnow(),
                    fact="Clearance=150mm",
                ),
            ),
        )


@pytest.mark.parametrize("outcome", ["RESOLVED", "STILL_OPEN", "CHANGED", "NEEDS_REVIEW"])
def test_revision_recheck_outcomes_and_explicit_closure(services, admin, outcome):
    project, source, r1, finding, _, _ = setup_finding(services, admin)
    engine = CheckEngine(services, outcome)
    services.rechecks.capabilities[engine.name] = engine
    r2 = services.sources.upload(project.id, source.id, "r2.ifc", b"r2", admin).revision
    with services.factory.open() as repo:
        check = repo.rechecks(project.id, finding.id)[0]
        assert check.outcome == outcome
        assert repo.run(check.id).status == "COMPLETED"
        assert repo.finding(project.id, finding.id).state == "CONFIRMED"
        assert repo.source_revision(project.id, source.id, r1.id) == r1
        assert repo.latest_baseline(project.id) is None
        evidence = repo.evidence_by_ids(project.id, check.evidence_ids)
        assert evidence[0].source_revision_id == r2.id
    decision = FindingDecision(decision="CLOSED", recheck_id=check.id)
    if outcome == "RESOLVED":
        assert services.findings.decide(project.id, finding.id, decision, admin).state == "CLOSED"
    else:
        with pytest.raises(Conflict):
            services.findings.decide(project.id, finding.id, decision, admin)


def test_unrelated_revision_and_duplicate_do_not_repeat_work(services, admin):
    project, source, _, finding, _, _ = setup_finding(services, admin)
    engine = CheckEngine(services)
    services.rechecks.capabilities[engine.name] = engine
    other = services.sources.create(
        project.id, CreateProjectSource(name="Other", kind="BIM"), admin
    )
    services.sources.upload(project.id, other.id, "other.ifc", b"other", admin)
    assert engine.calls == 0
    services.sources.upload(project.id, source.id, "r2.ifc", b"r2", admin)
    services.sources.upload(project.id, source.id, "renamed.ifc", b"r2", admin)
    services.rechecks.request(project.id, finding.id, admin)
    assert engine.calls == 1


def test_evidence_and_publication_integrity(services, admin):
    project, _, _, finding, publication, draft = setup_finding(services, admin)
    services.engineering.publish(project.id, publication)
    with services.factory.open() as repo:
        assert len(repo.changes(project.id)) == 1
    with pytest.raises(Conflict):
        services.engineering.publish(project.id, publication.model_copy(update={"changes": ()}))
    with pytest.raises(Conflict):
        services.findings.create(
            project.id, draft.model_copy(update={"evidence_ids": ("invented",)}), admin
        )
    with pytest.raises(PermissionDenied):
        services.findings.decide(
            project.id,
            finding.id,
            FindingDecision(decision="CONFIRMED"),
            Principal(id="agent", role="coordinator"),
        )


def test_cancelled_work_never_publishes(services, admin):
    project, source, _, finding, _, _ = setup_finding(services, admin)
    engine = CheckEngine(services)

    def cancel(request):
        with services.factory.open() as repo:
            check = repo.rechecks(project.id, finding.id)[0]
        services.coordination.cancel(check.id, admin)

    engine.during = cancel
    services.rechecks.capabilities[engine.name] = engine
    services.sources.upload(project.id, source.id, "r2.ifc", b"r2", admin)
    with services.factory.open() as repo:
        check = repo.rechecks(project.id, finding.id)[0]
        assert check.outcome is None and not check.evidence_ids
        assert repo.run(check.id).status == "CANCELLED"


def test_edit_during_work_fences_publication(services, admin):
    project, source, _, finding, _, _ = setup_finding(services, admin)
    engine = CheckEngine(services)
    engine.during = lambda _: services.findings.decide(
        project.id, finding.id, FindingDecision(decision="EDITED", title="Updated"), admin
    )
    services.rechecks.capabilities[engine.name] = engine
    services.sources.upload(project.id, source.id, "r2.ifc", b"r2", admin)
    with services.factory.open() as repo:
        check = repo.rechecks(project.id, finding.id)[0]
        assert check.outcome == "NEEDS_REVIEW" and not check.evidence_ids


def test_outbox_and_state_survive_restart(tmp_path, admin, monkeypatch):
    settings = Settings(data_dir=tmp_path, diagnostic_runtime=True, seed_demo=False)
    svc = build_services(settings)
    project, source, r1, finding, _, _ = setup_finding(svc, admin)
    with monkeypatch.context() as patch:
        patch.setattr(
            svc.runtime, "start", lambda _: (_ for _ in ()).throw(RuntimeError("interrupted"))
        )
        with pytest.raises(RuntimeError, match="interrupted"):
            svc.sources.upload(project.id, source.id, "r2.ifc", b"r2", admin)
    svc.close()
    reopened = build_services(settings)
    try:
        with reopened.factory.open() as repo:
            assert repo.source_revision(project.id, source.id, r1.id) == r1
            assert repo.finding(project.id, finding.id).state == "CONFIRMED"
            check = repo.rechecks(project.id, finding.id)[0]
            assert repo.run(check.id).status == "COMPLETED"
            assert check.outcome == "NEEDS_REVIEW"  # No engineering adapter configured.
    finally:
        reopened.close()


def test_api_scope_and_permissions(client, services, admin):
    project, _, _, finding, _, _ = setup_finding(services, admin)
    root = f"/api/projects/{project.id}/engineering"
    assert client.get(root + "/findings").json()[0]["id"] == finding.id
    assert client.get(root + "/changes").status_code == 200
    assert client.get(f"/api/projects/other/engineering/findings/{finding.id}").status_code == 404
    client.headers["Authorization"] = "Bearer local-demo-viewer"
    assert (
        client.post(
            root + f"/findings/{finding.id}/decisions", json={"decision": "DISMISSED"}
        ).status_code
        == 403
    )
