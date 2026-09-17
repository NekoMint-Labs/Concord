"""Consumer contracts and bounded database work for lifecycle collection reads."""

import hashlib
from contextlib import contextmanager

import pytest
from app.domain.baselines import Baseline, BaselineEntry
from app.domain.project_lifecycle import CreateProject
from app.domain.project_sources import ProjectSource, ProjectSourceRevision
from sqlalchemy import event


@contextmanager
def counted_selects(engine):
    statements = []

    def record(_connection, _cursor, statement, _parameters, _context, _executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    try:
        yield statements
    finally:
        event.remove(engine, "before_cursor_execute", record)


def seed_history(services, admin, source_count, baseline_count):
    project = services.projects.create(CreateProject(name="Query scale fixture"), admin)
    expected = {}
    entries = []
    with services.factory.open(project.id, write=True) as repo:
        for index in range(source_count):
            source = ProjectSource(project_id=project.id, name=f"Source {index}", kind="BIM")
            repo.add_project_source(source)
            revisions = []
            for sequence in (1, 2):
                revision = ProjectSourceRevision(
                    project_id=project.id,
                    source_id=source.id,
                    sequence=sequence,
                    original_filename=f"r{sequence}.ifc",
                    sha256=hashlib.sha256(str(sequence).encode()).hexdigest(),
                    size_bytes=1,
                    storage_key=f"fixture/{source.id}/{sequence}",
                )
                repo.add_source_revision(revision)
                revisions.append(revision)
            entries.append(BaselineEntry(source_id=source.id, revision_id=revisions[0].id))
            expected[source.id] = (revisions[-1].id, revisions[0].id)
        # Include a logical source with no upload; batch reads must retain it.
        empty = ProjectSource(project_id=project.id, name="Not imported", kind="DOCUMENT")
        repo.add_project_source(empty)
        expected[empty.id] = (None, None)
        baselines = []
        for sequence in range(1, baseline_count + 1):
            # A newer baseline may intentionally omit a previously accepted source.
            included = entries if sequence == 1 else entries[1:] or entries
            baseline = Baseline(
                project_id=project.id,
                name=f"B{sequence}",
                sequence=sequence,
                entries=tuple(sorted(included, key=lambda item: item.source_id)),
                accepted_by=admin.id,
            )
            repo.add_baseline(baseline)
            baselines.append(baseline)
        if baseline_count > 1 and source_count > 1:
            omitted = entries[0].source_id
            expected[omitted] = (expected[omitted][0], None)
    return project.id, expected, baselines


@pytest.mark.parametrize("source_count", [1, 1000])
def test_source_list_queries_are_bounded_and_project_scoped(client, services, admin, source_count):
    project_id, expected, baselines = seed_history(services, admin, source_count, 2)
    seed_history(services, admin, 2, 3)  # A foreign project's later baseline must not leak in.
    with counted_selects(services.factory.engine) as selects:
        response = client.get(f"/api/projects/{project_id}/sources")
    assert response.status_code == 200
    statuses = {item["source"]["id"]: item for item in response.json()}
    assert statuses.keys() == expected.keys()
    for source_id, (latest_id, accepted_id) in expected.items():
        item = statuses[source_id]
        assert item["latest_revision_id"] == latest_id
        assert item["accepted_revision_id"] == accepted_id
        assert item["baseline_id"] == baselines[-1].id
        assert item["has_pending_revision"] == (latest_id is not None and latest_id != accepted_id)
    # State, sources, latest revisions, latest baseline and its entries: a fixed budget.
    assert len(selects) <= 5, f"Source list made {len(selects)} SELECTs for {source_count} sources"


@pytest.mark.parametrize("baseline_count", [1, 1000])
def test_baseline_history_queries_are_bounded_and_project_scoped(
    client, services, admin, baseline_count
):
    project_id, _, expected = seed_history(services, admin, 3, baseline_count)
    seed_history(services, admin, 2, 2)
    with counted_selects(services.factory.engine) as selects:
        response = client.get(f"/api/projects/{project_id}/baselines")
    assert response.status_code == 200
    assert response.json() == [baseline.model_dump(mode="json") for baseline in expected]
    assert len(selects) <= 3, f"Baseline history made {len(selects)} SELECTs"


def test_empty_collection_reads_and_source_without_baseline(client, services, admin):
    project = services.projects.create(CreateProject(name="Empty project"), admin)
    root = f"/api/projects/{project.id}"
    assert client.get(f"{root}/sources").json() == []
    assert client.get(f"{root}/baselines").json() == []
    source = client.post(f"{root}/sources", json={"name": "First", "kind": "BIM"}).json()
    result = client.post(
        f"{root}/sources/{source['id']}/revisions", files={"file": ("x.ifc", b"x")}
    )
    assert result.status_code == 201
    item = client.get(f"{root}/sources").json()[0]
    assert item["baseline_id"] is item["accepted_revision_id"] is None
    assert item["has_pending_revision"]


def test_revision_download_matches_binary_openapi_contract(client):
    content_path = "/api/projects/{project_id}/sources/{source_id}/revisions/{revision_id}/content"
    schema = client.get("/openapi.json").json()
    declared = schema["paths"][content_path]["get"]["responses"]["200"]["content"]
    assert declared == {
        "application/octet-stream": {"schema": {"type": "string", "format": "binary"}}
    }
    project = client.post("/api/projects", json={"name": "Binary download"}).json()
    root = f"/api/projects/{project['id']}/sources"
    source = client.post(root, json={"name": "Original", "kind": "BIM"}).json()
    content = b"\x00\xff\x80original\r\n\x00"
    upload = client.post(
        f"{root}/{source['id']}/revisions", files={"file": ("original.ifc", content)}
    )
    assert upload.status_code == 201
    revision = upload.json()["revision"]
    response = client.get(f"{root}/{source['id']}/revisions/{revision['id']}/content")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/octet-stream"
    assert response.headers["content-disposition"].startswith("attachment;")
    assert response.content == content
