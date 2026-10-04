"""Complete paired provenance, cache, fencing and atomic publication regressions."""

import pytest
from app.domain.engineering import CapabilityCheckResult, EngineeringPublication, FindingDecision
from app.domain.engineering_refs import BimTarget, FindingDependency
from app.domain.errors import Conflict
from app.domain.models import Evidence, utcnow
from app.domain.project_sources import CreateProjectSource
from test_engineering_coordination import setup_finding


def paired_finding(svc, admin, *, requirements_kind=None):
    project, first, r1, _, publication, draft = setup_finding(svc, admin, confirm=False)
    second = svc.sources.create(project.id, CreateProjectSource(name="MEP", kind="BIM"), admin)
    s1 = svc.sources.upload(project.id, second.id, "mep.ifc", b"mep-r1", admin).revision
    target = BimTarget(source_revision_id=s1.id, global_ids=("duct",))
    evidence = publication.evidence[0].model_copy(
        update={
            "id": "second-evidence",
            "source_id": second.id,
            "source_revision_id": s1.id,
            "source_revision": s1.sha256,
            "viewer_target": target,
        }
    )
    svc.engineering.publish(
        project.id, EngineeringPublication(operation_id="paired", evidence=(evidence,))
    )
    dependencies = (
        draft.dependencies[0].model_copy(
            update={
                "group_id": "clash-1",
                "input_role": "structure",
                "requirements_kind": requirements_kind,
            }
        ),
        FindingDependency(
            source_id=second.id,
            source_revision_id=s1.id,
            capability="fixture-clearance",
            expected_condition="Clearance >= 100mm",
            target=target,
            group_id="clash-1",
            input_role="mep",
            requirements_kind=requirements_kind,
        ),
    )
    finding = svc.findings.create(
        project.id,
        draft.model_copy(
            update={
                "evidence_ids": (*draft.evidence_ids, evidence.id),
                "dependencies": dependencies,
            }
        ),
        admin,
    )
    finding = svc.findings.decide(
        project.id, finding.id, FindingDecision(decision="CONFIRMED"), admin
    )
    return project, first, second, r1, s1, finding


class PairedEngine:
    name = "fixture-clearance"
    version = "1"

    def __init__(self):
        self.requests = []
        self.during = lambda _: None
        self.transform = lambda result: result

    def check(self, request):
        self.requests.append(request)
        self.during(request)
        evidence = tuple(
            Evidence(
                snapshot_id="assigned-by-platform",
                provider=self.name,
                source_id=i.source_id,
                source_revision_id=i.source_revision_id,
                source_revision=i.sha256,
                viewer_target=i.target,
                observed_at=utcnow(),
                fact="Expected condition evaluated",
            )
            for i in request.inputs
            if i.role != "requirements"
        )
        return self.transform(
            CapabilityCheckResult(
                outcome="RESOLVED",
                explanation="Targeted condition holds",
                evidence=evidence,
                expected_condition_satisfied=True,
            )
        )


def checks(svc, project, finding):
    with svc.factory.open() as repo:
        return repo.rechecks(project.id, finding.id)


def test_manual_pair_enqueues_one_run_before_any_cache_exists(services, admin, monkeypatch):
    project, first, second, _, _, finding = paired_finding(services, admin)
    engine = PairedEngine()
    services.rechecks.register(engine)
    monkeypatch.setattr(services.rechecks, "dispatch", lambda _: None)

    result = services.rechecks.request(project.id, finding.id, admin, operation_id="one-pair")

    assert len(result) == 1
    assert {i.source_id for i in result[0].inputs} == {first.id, second.id}
    with services.factory.open() as repo:
        pending = [r for r in repo.pending_runs(project.id) if r.category == "engineering_recheck"]
        assert [r.id for r in pending] == [result[0].id]
        assert pending[0].status == "QUEUED"
    assert not engine.requests
    services.runtime.start(result[0].id)
    assert len(engine.requests) == 1
    assert checks(services, project, finding)[0].outcome == "RESOLVED"


def test_manual_pair_operation_is_idempotent_before_and_after_completion(
    services, admin, monkeypatch
):
    project, _, _, _, _, finding = paired_finding(services, admin)
    engine = PairedEngine()
    services.rechecks.register(engine)
    monkeypatch.setattr(services.rechecks, "dispatch", lambda _: None)

    first = services.rechecks.request(project.id, finding.id, admin, operation_id="retry-pair")
    retry = services.rechecks.request(project.id, finding.id, admin, operation_id="retry-pair")
    assert len(first) == 1 and retry == first
    services.runtime.start(first[0].id)
    completed = checks(services, project, finding)
    assert (
        services.rechecks.request(project.id, finding.id, admin, operation_id="retry-pair")
        == completed
    )
    assert len(completed) == 1 and completed[0].outcome == "RESOLVED"
    assert len(engine.requests) == 1
    with services.factory.open() as repo:
        assert len([a for a in repo.audits(project.id) if a.action == "RECHECK_REQUESTED"]) == 1


@pytest.mark.parametrize("side", ["first", "second"])
def test_either_model_binds_unchanged_peer_and_closes(services, admin, side):
    project, first, second, r1, s1, finding = paired_finding(services, admin)
    engine = PairedEngine()
    services.rechecks.register(engine)
    changed = first if side == "first" else second
    services.sources.upload(project.id, changed.id, "r2.ifc", b"updated", admin)
    check = checks(services, project, finding)[0]
    assert len(engine.requests) == 1 and check.outcome == "RESOLVED"
    request = engine.requests[0]
    assert {i.role for i in request.inputs} == {"structure", "mep"}
    assert len(request.input_bytes) == 2 and b"updated" in request.input_bytes
    assert b"mep-r1" in request.input_bytes if side == "first" else b"r1" in request.input_bytes
    with services.factory.open() as repo:
        evidence = repo.evidence_by_ids(project.id, check.evidence_ids)
    assert {e.source_id for e in evidence} == {first.id, second.id}
    assert (
        services.findings.decide(
            project.id, finding.id, FindingDecision(decision="CLOSED", recheck_id=check.id), admin
        ).state
        == "CLOSED"
    )


def test_pair_cache_and_either_side_invalidation(services, admin):
    project, first, second, _, _, finding = paired_finding(services, admin)
    engine = PairedEngine()
    services.rechecks.register(engine)
    services.sources.upload(project.id, first.id, "r2.ifc", b"structure-r2", admin)
    old = checks(services, project, finding)[0]
    services.rechecks.request(project.id, finding.id, admin, operation_id="repeat")
    assert len(engine.requests) == 1
    services.sources.upload(project.id, second.id, "r2.ifc", b"mep-r2", admin)
    assert len(engine.requests) == 2
    with pytest.raises(Conflict, match="superseded"):
        services.findings.decide(
            project.id, finding.id, FindingDecision(decision="CLOSED", recheck_id=old.id), admin
        )


def test_peer_update_during_engine_never_publishes_or_caches(services, admin, monkeypatch):
    project, first, second, _, _, finding = paired_finding(services, admin)
    engine = PairedEngine()
    services.rechecks.register(engine)
    monkeypatch.setattr(services.rechecks, "dispatch", lambda _: None)
    services.sources.upload(project.id, first.id, "r2.ifc", b"structure-r2", admin)
    check = checks(services, project, finding)[0]
    engine.during = lambda _: services.sources.upload(
        project.id, second.id, "r2.ifc", b"mep-r2", admin
    )
    services.runtime.start(check.id)
    stale = next(c for c in checks(services, project, finding) if c.id == check.id)
    assert stale.outcome == "NEEDS_REVIEW" and not stale.evidence_ids
    assert not list((services.settings.data_dir / "files/derived").glob("*"))


@pytest.mark.parametrize("invalid", ["partial", "empty", "condition", "wrong-hash", "extracted"])
def test_incomplete_or_unverified_pair_cannot_resolve(services, admin, invalid):
    project, first, _, _, _, finding = paired_finding(services, admin)
    engine = PairedEngine()
    services.rechecks.register(engine)

    def transform(result):
        if invalid == "partial":
            return result.model_copy(update={"evidence": result.evidence[:1]})
        if invalid == "empty":
            return result.model_copy(update={"evidence": ()})
        if invalid == "condition":
            return result.model_copy(update={"expected_condition_satisfied": None})
        if invalid == "extracted":
            return result.model_copy(
                update={
                    "evidence": (result.evidence[0].model_copy(update={"quality": "extracted"}),)
                }
            )
        return result.model_copy(
            update={
                "evidence": (
                    result.evidence[0],
                    result.evidence[1].model_copy(update={"source_revision": "0" * 64}),
                )
            }
        )

    engine.transform = transform
    if invalid == "wrong-hash":
        with pytest.raises(Conflict):
            services.sources.upload(project.id, first.id, "r2.ifc", b"r2", admin)
    else:
        services.sources.upload(project.id, first.id, "r2.ifc", b"r2", admin)
    check = checks(services, project, finding)[0]
    assert not check.evidence_ids and check.outcome != "RESOLVED"
    assert not list((services.settings.data_dir / "files/derived").glob("*"))


def test_cancel_and_resume_preserve_complete_group(services, admin, client):
    project, first, _, _, _, finding = paired_finding(services, admin)
    engine = PairedEngine()
    services.rechecks.register(engine)

    def cancel(_):
        check = checks(services, project, finding)[0]
        services.coordination.cancel(check.id, admin)

    engine.during = cancel
    services.sources.upload(project.id, first.id, "r2.ifc", b"r2", admin)
    check = checks(services, project, finding)[0]
    assert not check.evidence_ids
    engine.during = lambda _: None
    response = client.post(f"/api/runs/{check.id}/resume")
    assert response.status_code == 202
    resumed = checks(services, project, finding)[0]
    assert resumed.inputs == check.inputs and resumed.outcome == "RESOLVED"
    services.rechecks.process(check.id, generation=0)
    assert len(engine.requests) == 2


def test_superseded_queued_pair_does_not_call_provider(services, admin, monkeypatch):
    project, first, second, _, _, finding = paired_finding(services, admin)
    engine = PairedEngine()
    services.rechecks.register(engine)
    monkeypatch.setattr(services.rechecks, "dispatch", lambda _: None)
    services.sources.upload(project.id, first.id, "r2.ifc", b"r2", admin)
    check = checks(services, project, finding)[0]
    services.sources.upload(project.id, second.id, "r2.ifc", b"mep-r2", admin)
    services.runtime.start(check.id)
    assert not engine.requests
    assert (
        next(c for c in checks(services, project, finding) if c.id == check.id).outcome
        == "NEEDS_REVIEW"
    )


def test_invalid_group_rejected_and_registration_is_unique(services, admin):
    project, _, _, _, _, finding = paired_finding(services, admin)
    from app.application.engineering_inputs import validate_groups

    with pytest.raises(Conflict):
        validate_groups(finding.dependencies[:1])
    with pytest.raises(Conflict):
        validate_groups(
            (
                finding.dependencies[0],
                finding.dependencies[1].model_copy(update={"input_role": "structure"}),
            )
        )
    services.rechecks.register(PairedEngine())
    with pytest.raises(Conflict):
        services.rechecks.register(PairedEngine())
