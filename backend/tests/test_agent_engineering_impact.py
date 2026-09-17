"""Source-level contract observations in a real project with no seeded blockers.

This provider fixture deliberately does not implement or claim an IFC diff.
"""

import pytest
from app.domain.agent import AgentAnswer, AgentRequest, AgentScope
from app.domain.agent_tools import (
    BindingFact,
    ElementChange,
    ReadResult,
    RevisionQuery,
    WorkPackageQuery,
)
from app.domain.errors import ProviderError
from app.domain.models import Evidence, ProjectSnapshot, utcnow
from app.domain.project_lifecycle import CreateArea, CreateProject, CreateWorkPackage
from app.domain.project_sources import CreateProjectSource
from test_agent_controls import counts


@pytest.fixture
def engineering(services, admin):
    project = services.projects.create(CreateProject(name="Native engineering contract"), admin)
    area = services.projects.add_area(project.id, CreateArea(name="L02"), admin)
    packages = [
        services.projects.add_work_package(
            project.id, CreateWorkPackage(name=name, area_id=area.id, discipline="MEP"), admin
        )
        for name in ("Affected", "Unrelated")
    ]
    source = services.sources.create(project.id, CreateProjectSource(name="MEP", kind="BIM"), admin)
    revision = services.sources.upload(
        project.id, source.id, "contract.ifc", b"contract-only", admin
    ).revision
    with services.factory.open(project.id, write=True) as repo:
        state = repo.state(project.id)
        assert all(not p.element_ids and not p.required_workers for p in state.work_packages)
        snapshot = ProjectSnapshot(
            project_id=project.id, version=state.version, sources=state.sources
        )
        repo.save_snapshot(snapshot)
        evidence = Evidence(
            snapshot_id=snapshot.id,
            provider="engineering-contract-fixture",
            source_id=source.id,
            source_revision=revision.sha256,
            observed_at=utcnow(),
            work_package_id=packages[0].id,
            element_ids=("removed-element",),
            fact="Persisted contract change and binding.",
        )
        repo.save_evidence(evidence)

    class Engineering:
        changes_result = ReadResult(
            changes=(
                ElementChange(global_id="removed-element", kind="removed", aspects=("existence",)),
            ),
            evidence=(evidence,),
        )
        bindings_result = ReadResult(
            bindings=(
                BindingFact(
                    work_package_id=packages[0].id,
                    source_id=source.id,
                    global_id="removed-element",
                ),
            ),
            evidence=(evidence,),
        )

        def changes(self, snapshot, scope, query):
            return self.changes_result

        def bindings(self, snapshot, scope, query):
            return self.bindings_result

    adapter = Engineering()
    services.investigations.engineering = adapter
    return project, packages, source, adapter


@pytest.mark.parametrize("narrow", ["source", "element", "work-package"])
def test_persisted_binding_drives_impact_without_legacy_membership_or_seeded_blocker(
    services, admin, engineering, narrow
):
    project, packages, source, _ = engineering
    scope = AgentScope(
        source_id=source.id,
        element_ids=("removed-element",) if narrow != "source" else (),
        work_package_ids=(packages[0].id,) if narrow == "work-package" else (),
    )
    request = AgentRequest(instruction="Investigate changes", scope=scope)
    before = counts(services)
    answer = services.investigations.ask(project.id, request)
    assert counts(services) == before and not answer.persisted
    run = services.agent.enqueue(project.id, request, admin)
    with services.factory.open() as repo:
        analysis = repo.analysis(run.analysis_id)
        report = repo.investigation_report(run.id)
        assert analysis.impact.work_package_ids == (packages[0].id,)
        assert analysis.impact.element_ids == ("removed-element",)
        assert len(analysis.findings) == 1 and "removed" in analysis.findings[0].conclusion
        assert analysis.findings[0].snapshot_id == analysis.snapshot.id
        assert set(analysis.findings[0].evidence_ids) <= {e.id for e in analysis.evidence}
        assert all(e.snapshot_id == analysis.snapshot.id for e in analysis.evidence)
        assert "absence does not mean READY" in " ".join(report.answer.limitations)
        assert not analysis.constraints and not repo.proposals(run.id)
        assert not analysis.readiness  # Impact alone is neither a safety blocker nor READY.
        assert not repo.latest_baseline(project.id)


@pytest.mark.parametrize("invalid", ["change", "binding", "unavailable"])
def test_engineering_facts_need_matching_per_element_and_binding_evidence(
    services, admin, engineering, invalid
):
    project, packages, source, adapter = engineering
    if invalid == "change":
        adapter.changes_result = adapter.changes_result.model_copy(
            update={
                "changes": (ElementChange(global_id="unsupported", kind="modified"),),
            }
        )
    elif invalid == "binding":
        adapter.bindings_result = adapter.bindings_result.model_copy(
            update={
                "bindings": (
                    BindingFact(
                        work_package_id=packages[1].id,
                        source_id=source.id,
                        global_id="removed-element",
                    ),
                )
            }
        )
    else:
        adapter.changes_result = adapter.changes_result.model_copy(update={"available": False})
    with pytest.raises(ProviderError):
        services.agent.enqueue(
            project.id,
            AgentRequest(
                instruction="Investigate changes",
                scope=AgentScope(source_id=source.id),
            ),
            admin,
        )
    with services.factory.open() as repo:
        run = repo.runs(project.id)[0]
        assert not run.analysis_id and not repo.proposals(run.id)


def test_source_element_selection_cannot_widen_explicit_work_package_scope(
    services, admin, engineering
):
    project, packages, source, _ = engineering
    with pytest.raises(ProviderError, match="outside scope"):
        services.agent.enqueue(
            project.id,
            AgentRequest(
                instruction="Investigate changes",
                scope=AgentScope(
                    source_id=source.id,
                    element_ids=("removed-element",),
                    work_package_ids=(packages[1].id,),
                ),
            ),
            admin,
        )


def test_identical_global_id_in_another_source_does_not_create_impact(services, admin, engineering):
    project, packages, source, adapter = engineering
    other = services.sources.create(
        project.id, CreateProjectSource(name="Other", kind="BIM"), admin
    )
    revision = services.sources.upload(project.id, other.id, "other.ifc", b"other", admin).revision
    original = adapter.bindings_result.evidence[0]
    evidence = original.model_copy(
        update={"id": "other-binding", "source_id": other.id, "source_revision": revision.sha256}
    )
    with services.factory.open(project.id, write=True) as repo:
        repo.save_evidence(evidence)
    adapter.bindings_result = ReadResult(
        evidence=(evidence,),
        bindings=(
            BindingFact(
                work_package_id=packages[0].id,
                source_id=other.id,
                global_id="removed-element",
            ),
        ),
    )
    with services.factory.open() as repo:
        target = repo.latest_source_revision(project.id, source.id)

    class SelectedComparison:
        mode = "contract-test"

        def investigate(self, instruction, scope, tools):
            overview = tools.project_state()
            tools.bim_changes(RevisionQuery(source_id=source.id, to_revision_id=target.id))
            tools.work_package_bindings(WorkPackageQuery())
            return AgentAnswer(
                summary="Contract observations", evidence_ids=(overview.evidence[0].id,)
            )

    # Select a concrete comparison; repository source ordering is not part of
    # the offline engine's contract and must not make this isolation test flaky.
    services.investigations.engine = SelectedComparison()
    run = services.agent.enqueue(project.id, AgentRequest(instruction="Investigate changes"), admin)
    with services.factory.open() as repo:
        analysis = repo.analysis(run.analysis_id)
        assert not analysis.impact.work_package_ids and not analysis.findings
        assert not repo.proposals(run.id)


def test_source_binding_evidence_survives_later_revision_comparisons(services, admin, engineering):
    project, packages, source, adapter = engineering
    binding = adapter.bindings_result.evidence[0]
    r2 = services.sources.upload(project.id, source.id, "r2.ifc", b"revision-two", admin).revision
    r3 = services.sources.upload(project.id, source.id, "r3.ifc", b"revision-three", admin).revision
    change = binding.model_copy(
        update={
            "id": "r3-comparison-evidence",
            "source_revision": r3.sha256,
            "fact": "R2 to R3 contract comparison: element removed.",
        }
    )
    with services.factory.open(project.id, write=True) as repo:
        repo.save_evidence(change)
    adapter.changes_result = adapter.changes_result.model_copy(update={"evidence": (change,)})
    run = services.agent.enqueue(
        project.id,
        AgentRequest(
            instruction="Investigate changes",
            scope=AgentScope(source_id=source.id, from_revision_id=r2.id, to_revision_id=r3.id),
        ),
        admin,
    )
    with services.factory.open() as repo:
        analysis = repo.analysis(run.analysis_id)
        assert analysis.impact.work_package_ids == (packages[0].id,)
        supporting = {e.id: e for e in analysis.evidence}
        assert any(
            supporting[i].source_revision == binding.source_revision
            for i in analysis.findings[0].evidence_ids
        )
        assert any(
            supporting[i].source_revision == r3.sha256 for i in analysis.findings[0].evidence_ids
        )
        assert not repo.proposals(run.id)
