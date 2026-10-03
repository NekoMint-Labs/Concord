"""Every human decision may reference only a ReCheck owned by its project/Finding."""

import pytest
from app.domain.engineering import FindingDecision
from test_engineering_coordination import CheckEngine, setup_finding


@pytest.fixture
def decision_context(services, admin, decision):
    project, source, _, finding, _, draft = setup_finding(services, admin)
    other = services.findings.create(project.id, draft, admin)
    services.findings.decide(project.id, other.id, FindingDecision(decision="CONFIRMED"), admin)
    engine = CheckEngine(services)
    services.rechecks.capabilities[engine.name] = engine
    services.sources.upload(project.id, source.id, "r2.ifc", b"r2", admin)
    with services.factory.open() as repo:
        own_check = repo.rechecks(project.id, finding.id)[0]
        other_check = repo.rechecks(project.id, other.id)[0]
    if decision in {"CONFIRMED", "REOPENED"}:
        services.findings.decide(
            project.id, finding.id, FindingDecision(decision="DISMISSED"), admin
        )
    if decision == "CONFIRMED":
        services.findings.decide(
            project.id, finding.id, FindingDecision(decision="REOPENED"), admin
        )
    return project, finding, own_check, other_check


def decision_state(services, project_id, finding_id):
    with services.factory.open() as repo:
        return (
            repo.finding(project_id, finding_id),
            repo.coordination_records(project_id, finding_id),
            repo.rechecks(project_id, finding_id),
            repo.state(project_id),
            repo.audits(project_id),
            repo.events(project_id),
        )


@pytest.mark.parametrize("decision", ["CONFIRMED", "DISMISSED", "EDITED", "CLOSED", "REOPENED"])
@pytest.mark.parametrize(
    "reference,status",
    [("missing", 404), ("empty", 404), ("other-finding", 409), ("other-project", 404)],
)
def test_invalid_recheck_reference_has_no_side_effects(
    client, services, admin, decision_context, decision, reference, status
):
    project, finding, _, other_check = decision_context
    recheck_id = {"missing": "nonexistent", "empty": "", "other-finding": other_check.id}.get(
        reference
    )
    if reference == "other-project":
        foreign_project, foreign_source, _, foreign_finding, _, _ = setup_finding(services, admin)
        services.sources.upload(foreign_project.id, foreign_source.id, "r2.ifc", b"r2", admin)
        with services.factory.open() as repo:
            recheck_id = repo.rechecks(foreign_project.id, foreign_finding.id)[0].id
    before = decision_state(services, project.id, finding.id)
    response = client.post(
        f"/api/projects/{project.id}/engineering/findings/{finding.id}/decisions",
        json={"decision": decision, "recheck_id": recheck_id, "title": "Must not persist"},
    )
    assert response.status_code == status, response.text
    assert decision_state(services, project.id, finding.id) == before


@pytest.mark.parametrize(
    "decision,with_reference",
    [
        (d, supplied)
        for d in ("CONFIRMED", "DISMISSED", "EDITED", "REOPENED")
        for supplied in (True, False)
    ]
    + [("CLOSED", True)],
)
def test_valid_or_omitted_recheck_reference_preserves_decision_behavior(
    client, services, decision_context, decision, with_reference
):
    project, finding, own_check, _ = decision_context
    body = {"decision": decision}
    if with_reference:
        body["recheck_id"] = own_check.id
    response = client.post(
        f"/api/projects/{project.id}/engineering/findings/{finding.id}/decisions", json=body
    )
    assert response.status_code == 200, response.text
    expected_state = {"EDITED": "CONFIRMED", "REOPENED": "PROPOSED"}.get(decision, decision)
    assert response.json()["state"] == expected_state
    with services.factory.open() as repo:
        history = repo.coordination_records(project.id, finding.id)
        assert history[-1].decision == decision
        assert history[-1].recheck_id == (own_check.id if with_reference else None)
        assert repo.recheck(project.id, own_check.id) == own_check
