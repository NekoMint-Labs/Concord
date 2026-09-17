"""An explicitly supplied test provider exercises C's read contract, not an IFC diff."""

import pytest
from app.domain.agent import AgentRequest, AgentScope
from app.domain.agent_tools import BindingFact, ElementChange, ReadResult
from app.domain.errors import ProviderError
from app.domain.models import Evidence, ProjectSnapshot, utcnow
from app.domain.project_sources import CreateProjectSource
from test_agent_controls import project


def setup_source(svc, admin):
    identity, packages = project(svc, admin)
    source = svc.sources.create(identity, CreateProjectSource(name="Model", kind="BIM"), admin)
    revision = svc.sources.upload(identity, source.id, "model.ifc", b"stored-only", admin).revision
    with svc.factory.open(identity, write=True) as repo:
        state = repo.state(identity)
        snapshot = ProjectSnapshot(
            project_id=identity, version=state.version, sources=state.sources
        )
        repo.save_snapshot(snapshot)
        evidence = Evidence(
            snapshot_id=snapshot.id,
            provider="engineering-contract-fixture",
            source_id=source.id,
            source_revision=revision.sha256,
            observed_at=utcnow(),
            work_package_id=packages[0].id,
            element_ids=("element-1",),
            fact="Contract fixture: element-1 changed and is bound to the first WP.",
        )
        repo.save_evidence(evidence)
    return identity, packages, source, revision, evidence


def test_changed_elements_select_binding_tool_and_only_related_proposals(
    services, admin, monkeypatch
):
    identity, packages, source, revision, evidence = setup_source(services, admin)
    # Validation must fetch by identity, independently of the bounded history page.
    from app.adapters.persistence.repository import SQLCoordinationRepository

    monkeypatch.setattr(SQLCoordinationRepository, "evidence", lambda *_args, **_kwargs: [])
    calls = []

    class Engineering:
        def changes(self, snapshot, scope, query):
            calls.append("changes")
            assert query.to_revision_id == revision.id
            return ReadResult(
                changes=(ElementChange(global_id="element-1", kind="modified"),),
                evidence=(evidence,),
            )

        def bindings(self, snapshot, scope, query):
            calls.append("bindings")
            return ReadResult(
                bindings=(
                    BindingFact(
                        work_package_id=packages[0].id, source_id=source.id, global_id="element-1"
                    ),
                ),
                evidence=(evidence,),
            )

    services.investigations.engineering = Engineering()
    run = services.agent.enqueue(
        identity,
        AgentRequest(instruction="Investigate source", scope=AgentScope(source_id=source.id)),
        admin,
    )
    assert calls == ["changes", "bindings"]
    with services.factory.open() as repo:
        assert {p.work_package_id for p in repo.proposals(run.id)} == {packages[0].id}
        report = repo.investigation_report(run.id)
        assert "work_package_bindings" in [t.tool for t in report.tools]
        assert set(report.answer.evidence_ids) == {
            e.id for e in repo.evidence_by_ids(identity, report.answer.evidence_ids)
        }


@pytest.mark.parametrize("forgery", ["unknown-id", "wrong-revision"])
def test_engineering_evidence_must_be_persisted_and_bound_to_revision(services, admin, forgery):
    identity, _, source, _, evidence = setup_source(services, admin)
    field = {"id": "invented"} if forgery == "unknown-id" else {"source_revision": "other"}

    class Engineering:
        def changes(self, snapshot, scope, query):
            return ReadResult(
                changes=(ElementChange(global_id="element-1", kind="modified"),),
                evidence=(evidence.model_copy(update=field),),
            )

    services.investigations.engineering = Engineering()
    with pytest.raises(ProviderError):
        services.agent.enqueue(
            identity,
            AgentRequest(instruction="Investigate source", scope=AgentScope(source_id=source.id)),
            admin,
        )
    with services.factory.open() as repo:
        assert repo.proposals(repo.runs(identity)[0].id) == []
