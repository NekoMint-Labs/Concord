import pytest
from app.domain.errors import Conflict, StaleSnapshotError
from app.domain.events import ProjectEvent


def proposal_for(services, principal, work_package_id="WP-200", revision="V17"):
    run = services.coordination.ingest(
        ProjectEvent(
            project_id="harbor-east",
            work_package_id=work_package_id,
            kind="design_revision",
            title=f"Reject {work_package_id}",
            change={"revision": revision},
        ),
        principal,
    )
    services.runtime.start(run.id)
    with services.factory.open() as repo:
        return repo.run(run.id), repo.proposals(run.id)[0]


def test_rejection_is_persisted_and_blocks_approval_and_execution(services, client, admin):
    run, proposal = proposal_for(services, admin)
    with services.factory.open() as repo:
        before = repo.state(run.project_id)

    response = client.post(
        f"/api/proposals/{proposal.id}/reject", json={"reason": "Needs field review"}
    )
    assert response.status_code == 200
    rejection = response.json()
    assert rejection["action"] == "ACTION_PROPOSAL_REJECTED"
    assert rejection["operation_id"] == proposal.operation_id
    assert rejection["detail"]["work_package_id"] == proposal.work_package_id

    assert client.post(f"/api/proposals/{proposal.id}/approve", json={}).status_code == 409
    assert client.post(f"/api/proposals/{proposal.id}/execute").status_code == 409
    with services.factory.open() as repo:
        assert repo.state(run.project_id) == before
        assert repo.execution(proposal.operation_id) is None
        assert (
            len(
                [
                    audit
                    for audit in repo.audits(run.project_id)
                    if audit.action == "ACTION_PROPOSAL_REJECTED"
                    and audit.operation_id == proposal.operation_id
                ]
            )
            == 1
        )


def test_rejection_retry_returns_original_audit_without_duplicates(services, client, admin):
    _, proposal = proposal_for(services, admin)
    first = client.post(f"/api/proposals/{proposal.id}/reject", json={"reason": "No"})
    second = client.post(f"/api/proposals/{proposal.id}/reject", json={"reason": "Changed"})

    assert first.status_code == second.status_code == 200
    assert second.json() == first.json()
    with services.factory.open() as repo:
        assert (
            len(
                [
                    audit
                    for audit in repo.audits(proposal.project_id)
                    if audit.action == "ACTION_PROPOSAL_REJECTED"
                    and audit.operation_id == proposal.operation_id
                ]
            )
            == 1
        )


def test_rejection_is_scoped_to_its_work_package(services, admin):
    _, rejected = proposal_for(services, admin, "WP-200", "V17")
    services.actions.reject(rejected.id, admin)
    _, unaffected = proposal_for(services, admin, "WP-300", "V17")

    services.actions.approve(unaffected.id, admin)
    receipt = services.actions.execute(unaffected.id, admin)

    assert receipt.proposal_id == unaffected.id
    with services.factory.open() as repo:
        assert repo.execution(rejected.operation_id) is None
        assert repo.execution(unaffected.operation_id) is not None


def test_stale_rejection_fails_without_persisting_rejection(services, admin):
    _, proposal = proposal_for(services, admin)
    proposal_for(services, admin, "WP-300", "V17")

    with pytest.raises(StaleSnapshotError):
        services.actions.reject(proposal.id, admin)
    with services.factory.open() as repo:
        assert not any(
            audit.action == "ACTION_PROPOSAL_REJECTED"
            and audit.operation_id == proposal.operation_id
            for audit in repo.audits(proposal.project_id)
        )


def test_superseded_generation_cannot_be_rejected(services, admin):
    run, proposal = proposal_for(services, admin)
    with services.factory.open(run.project_id, write=True) as repo:
        current = repo.run(run.id)
        repo.save_run(current.model_copy(update={"generation": current.generation + 1}))

    with pytest.raises(Conflict):
        services.actions.reject(proposal.id, admin)
    with services.factory.open() as repo:
        assert not any(
            audit.action == "ACTION_PROPOSAL_REJECTED"
            and audit.operation_id == proposal.operation_id
            for audit in repo.audits(proposal.project_id)
        )
