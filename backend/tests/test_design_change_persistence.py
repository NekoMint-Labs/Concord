import pytest
from app.domain.events import ProjectEvent


def start_design_change(services, admin, project_id, work_package_id):
    event = ProjectEvent(
        project_id=project_id,
        work_package_id=work_package_id,
        kind="design_revision",
        title="Drawing V17 requires acknowledgement",
        change={"revision": "V17"},
    )
    run = services.coordination.ingest(event, admin)
    services.runtime.start(run.id)
    return event, run


@pytest.mark.parametrize("other_work_package", [None, "WP-300"], ids=["isolated", "other-blocker"])
def test_design_change_evidence_is_persisted_and_retained_after_resolution(
    services, admin, other_work_package
):
    project_id, work_package_id = "harbor-east", "WP-200"
    if other_work_package:
        start_design_change(services, admin, project_id, other_work_package)
    with services.factory.open() as repo:
        initial = repo.latest_analysis(project_id)
    assert (
        next(r for r in initial.readiness if r.work_package_id == work_package_id).status == "READY"
    )

    event, run = start_design_change(services, admin, project_id, work_package_id)
    with services.factory.open() as repo:
        run = repo.run(run.id)
        analysis = repo.analysis(run.analysis_id)
        state = repo.state(project_id)
        proposal = next(p for p in repo.proposals(run.id) if p.work_package_id == work_package_id)

    assert run.status == "WAITING_APPROVAL"
    assert run.event_id == event.id
    assert analysis.snapshot.id != initial.snapshot.id
    assert analysis.snapshot.version == state.version == initial.snapshot.version + 1
    assert state.package(work_package_id).design_revision == event.change.revision == "V17"
    assert proposal.snapshot_id == analysis.snapshot.id
    findings = [f for f in analysis.findings if f.work_package_id == work_package_id]
    constraints = [c for c in analysis.constraints if c.work_package_id == work_package_id]
    expected = {e.id: e for e in analysis.evidence if e.work_package_id == work_package_id}
    assert findings and constraints and expected
    readiness = next(r for r in analysis.readiness if r.work_package_id == work_package_id)
    assert readiness.status == "BLOCKED"
    assert readiness.snapshot_id == analysis.snapshot.id
    assert set(readiness.constraint_ids) == {c.id for c in constraints if c.blocking}
    assert set(proposal.resolution.constraint_ids) == {c.id for c in constraints}

    # Read committed rows through a new session, not just the Evidence embedded in Analysis.
    with services.factory.open() as repo:
        assert repo.event(event.id) == event
        assert repo.snapshot(analysis.snapshot.id) == analysis.snapshot
        persisted = {item.id: item for item in repo.evidence(project_id)}

    for record in (*findings, *constraints):
        assert record.snapshot_id == analysis.snapshot.id
        assert record.evidence_ids
        for evidence_id in record.evidence_ids:
            assert evidence_id in persisted, f"Evidence {evidence_id} was not persisted"
            item = persisted[evidence_id]
            assert item == expected[evidence_id]
            assert item.snapshot_id == analysis.snapshot.id
            assert item.work_package_id == work_package_id
            assert item.source_id == f"drawing/{work_package_id}"
            # Source revision tokens and the work package's drawing label are distinct.
            source = next(s for s in analysis.snapshot.sources if s.source == "drawing")
            assert item.source_revision == source.revision == state.source("drawing").revision
            assert item.observed_at == state.source("drawing").observed_at
    assert set(proposal.evidence_ids) == set(expected)

    services.actions.approve(proposal.id, admin)
    services.actions.execute(proposal.id, admin)
    with services.factory.open() as repo:
        state = repo.state(project_id)
        fresh = repo.latest_analysis(project_id)
        assert state.package(work_package_id).accepted_revision == "V17"
        assert fresh.snapshot.id != analysis.snapshot.id
        assert fresh.snapshot.version == state.version
        assert (
            next(r for r in fresh.readiness if r.work_package_id == work_package_id).status
            == "READY"
        )
        if other_work_package:
            assert (
                next(r for r in fresh.readiness if r.work_package_id == other_work_package).status
                == "BLOCKED"
            )
            assert state.package(other_work_package).accepted_revision == "V16"
        # Resolving a blocker must retain the historical analysis and its persisted evidence.
        assert repo.analysis(analysis.id) == analysis
        retained = {item.id: item for item in repo.evidence(project_id)}
        assert all(retained[evidence_id] == item for evidence_id, item in expected.items())
