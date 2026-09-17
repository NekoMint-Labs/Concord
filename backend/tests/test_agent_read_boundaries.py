"""Agent tools preserve intersecting scope before applying bounded result pages."""

from app.application.agent_reads import ReadTools
from app.application.agent_scope import bind_scope
from app.domain.agent import AgentRequest, AgentScope
from app.domain.agent_tools import SearchQuery
from app.domain.models import ProjectSnapshot
from app.domain.project_sources import CreateProjectSource, ProjectSource
from test_agent_controls import project


def read_tools(services, identity, scope):
    with services.factory.open() as repo:
        request = bind_scope(repo, identity, AgentRequest(instruction="Explain", scope=scope))
        state = repo.state(identity)
    snapshot = ProjectSnapshot(project_id=identity, version=state.version, sources=state.sources)
    return ReadTools(services.factory, state, snapshot, request.scope, services.documents)


def test_source_and_package_scope_does_not_expose_unrelated_project_facts(services, admin):
    identity, packages = project(services, admin)
    source = services.sources.create(identity, CreateProjectSource(name="Model", kind="BIM"), admin)
    services.sources.upload(identity, source.id, "r1.ifc", b"stored-only", admin)
    tools = read_tools(
        services, identity, AgentScope(source_id=source.id, work_package_ids=(packages[0].id,))
    )
    result = tools.project_state()
    assert result.work_packages[0].id == packages[0].id
    # The WP's staffing blocker is real, but it is outside this engineering source.
    assert not any(e.provider == "structured-workforce" for e in result.evidence)
    assert result.work_packages[0].blocker_count == 0
    assert len(result.evidence) == 1  # Only the scoped catalog overview.


def test_project_catalog_is_bounded_and_reports_truncation(services, admin):
    identity, packages = project(services, admin)
    with services.factory.open(identity, write=True) as repo:
        state = repo.state(identity)
        repo.save_state(
            state.model_copy(
                update={
                    "version": state.version + 1,
                    "work_packages": tuple(
                        packages[0].model_copy(update={"id": f"wp-{i:03}"}) for i in range(61)
                    ),
                }
            )
        )
        for i in range(61):
            repo.add_project_source(
                ProjectSource(
                    id=f"source-{i:03}", project_id=identity, name=f"Source {i}", kind="DOCUMENT"
                )
            )
    result = read_tools(services, identity, AgentScope()).project_state()
    assert len(result.sources) == len(result.work_packages) == 50
    assert len(result.evidence) <= 31
    assert any("truncated" in text.lower() for text in result.limitations)


def test_explicit_source_is_not_lost_beyond_catalog_page(services, admin, monkeypatch):
    from app.adapters.persistence.repository import SQLCoordinationRepository

    identity, _ = project(services, admin)
    with services.factory.open(identity, write=True) as repo:
        for i in range(61):
            repo.add_project_source(
                ProjectSource(
                    id=f"source-{i:03}", project_id=identity, name=f"Source {i}", kind="DOCUMENT"
                )
            )
    services.sources.upload(identity, "source-060", "r1.txt", b"selected", admin)

    def reject_full_catalog(*args, **kwargs):
        raise AssertionError("An explicit source should be fetched by identity")

    monkeypatch.setattr(SQLCoordinationRepository, "project_sources", reject_full_catalog)
    result = read_tools(services, identity, AgentScope(source_id="source-060")).project_state()
    assert [s.source.id for s in result.sources] == ["source-060"]


def document_candidates(services, admin):
    identity, _ = project(services, admin)
    for i in range(12):
        services.documents.import_file(
            identity, f"unrelated-{i}.txt", b"needle " * 20 + str(i).encode()
        )
    content = b"needle " + b"padding " * 200
    source = services.sources.create(
        identity, CreateProjectSource(name="Selected document", kind="DOCUMENT"), admin
    )
    revision = services.sources.upload(identity, source.id, "selected.txt", content, admin).revision
    services.documents.import_file(identity, "selected.txt", content)
    return identity, source, revision


def test_revision_search_filters_before_ranking_limit(services, admin):
    identity, source, revision = document_candidates(services, admin)
    assert revision.sha256 not in {
        item.source_hash for item in services.documents.search(identity, "needle", 10)
    }, "The fixture must put more than ten unrelated hits ahead of the selected document"
    result = read_tools(services, identity, AgentScope(source_id=source.id)).relevant_documents(
        SearchQuery(query="needle")
    )
    assert result.available and result.evidence
    assert {e.source_revision for e in result.evidence} == {revision.sha256}
    assert {e.source_id for e in result.evidence} == {source.id}
    assert services.documents.search(identity, "needle", source_hashes=()) == []
    assert services.documents.search(identity, "needle", source_hashes=("0" * 64,)) == []
    other, _ = project(services, admin)
    assert services.documents.search(other, "needle", source_hashes=(revision.sha256,)) == []
