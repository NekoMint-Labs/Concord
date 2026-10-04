"""Late publication failure rolls back both Evidence records and durable result."""

import pytest
from app.adapters.persistence.repository import SQLCoordinationRepository
from app.domain.errors import Conflict
from test_engineering_multisource import PairedEngine, checks, paired_finding


def test_second_evidence_storage_failure_rolls_back_pair(services, admin, monkeypatch):
    project, first, second, _, _, finding = paired_finding(services, admin)
    engine = PairedEngine()
    services.rechecks.register(engine)
    original = SQLCoordinationRepository.save_evidence
    with services.factory.open() as repo:
        previous = {e.id for e in repo.evidence(project.id)}

    def fail_second(repo, evidence):
        if evidence.source_id == second.id and evidence.fact == "Expected condition evaluated":
            raise Conflict("second Evidence storage failed")
        original(repo, evidence)

    monkeypatch.setattr(SQLCoordinationRepository, "save_evidence", fail_second)
    with pytest.raises(Conflict, match="second Evidence"):
        services.sources.upload(project.id, first.id, "r2.ifc", b"r2", admin)
    with services.factory.open() as repo:
        assert {e.id for e in repo.evidence(project.id)} == previous
        check = repo.rechecks(project.id, finding.id)[0]
        assert repo.run(check.id).status == "FAILED"
    assert not check.evidence_ids
    assert not list((services.settings.data_dir / "files/derived").glob("*"))
    monkeypatch.setattr(SQLCoordinationRepository, "save_evidence", original)
    with services.factory.open(project.id, write=True) as repo:
        run = repo.run(check.id)
        repo.save_run(run.model_copy(update={"status": "QUEUED", "generation": run.generation + 1}))
    services.rechecks.dispatch(project.id)
    completed = checks(services, project, finding)[0]
    assert completed.outcome == "RESOLVED" and len(completed.evidence_ids) == 2
    assert completed.inputs == check.inputs
