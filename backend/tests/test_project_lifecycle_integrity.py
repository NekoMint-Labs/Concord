"""Concurrency, rollback, relational integrity and freshness for shared lifecycle records."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from app.adapters.persistence.database import SQLRepositoryFactory, make_engine, migrate
from app.adapters.persistence.repository import SQLCoordinationRepository
from app.domain.baselines import BaselineEntry, CreateBaseline
from app.domain.errors import DomainError, StaleSnapshotError
from app.domain.models import ProjectSnapshot
from app.domain.project_lifecycle import CreateProject
from app.domain.project_sources import CreateProjectSource
from app.policies.actions import check_fresh
from sqlalchemy.exc import IntegrityError


def make_source(services, admin):
    project = services.projects.create(CreateProject(name="Independent project"), admin)
    source = services.sources.create(
        project.id, CreateProjectSource(name="Engineering source", kind="BIM"), admin
    )
    return project.id, source.id


@pytest.mark.parametrize("identical", [True, False], ids=["same-content", "different-content"])
def test_concurrent_uploads_keep_contiguous_immutable_history(
    services, admin, monkeypatch, identical
):
    project_id, source_id = make_source(services, admin)
    barrier = Barrier(2)
    original_put = services.storage.put

    def together(key, content):
        result = original_put(key, content)
        barrier.wait(timeout=10)
        return result

    monkeypatch.setattr(services.storage, "put", together)

    def upload(index):
        content = b"same" if identical else f"revision {index}".encode()
        return services.sources.upload(project_id, source_id, f"{index}.ifc", content, admin)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(upload, [1, 2]))
    with services.factory.open() as repo:
        revisions = repo.source_revisions(project_id, source_id)
    assert [r.sequence for r in revisions] == ([1] if identical else [1, 2])
    assert sum(result.duplicate for result in results) == (1 if identical else 0)
    paths = [
        path
        for path in (services.settings.data_dir / "files/project-sources").rglob("*")
        if path.is_file()
    ]
    assert len(paths) == len(revisions)
    for revision in revisions:
        assert services.sources.content(project_id, source_id, revision.id, admin)[1]


def test_failed_publication_rolls_back_metadata_state_and_staged_file(services, admin, monkeypatch):
    project_id, source_id = make_source(services, admin)
    with services.factory.open() as repo:
        original_state = repo.state(project_id)
        original_audits = repo.audits(project_id)

    def fail_audit(self, record):
        raise RuntimeError("audit unavailable")

    monkeypatch.setattr(SQLCoordinationRepository, "audit", fail_audit)
    with pytest.raises(RuntimeError, match="audit unavailable"):
        services.sources.upload(project_id, source_id, "r1.ifc", b"content", admin)
    with services.factory.open() as repo:
        assert repo.source_revisions(project_id, source_id) == []
        assert repo.state(project_id) == original_state
        assert repo.audits(project_id) == original_audits
    assert not [
        p for p in (services.settings.data_dir / "files/project-sources").rglob("*") if p.is_file()
    ]


def test_upload_and_baseline_fence_existing_snapshots(services, admin):
    project_id, source_id = make_source(services, admin)
    with services.factory.open() as repo:
        state = repo.state(project_id)
    snapshot = ProjectSnapshot(project_id=project_id, version=state.version, sources=state.sources)
    revision = services.sources.upload(project_id, source_id, "r1.ifc", b"content", admin).revision
    with services.factory.open() as repo:
        state = repo.state(project_id)
    with pytest.raises(StaleSnapshotError):
        check_fresh(snapshot, state)
    assert state.sources == snapshot.sources  # Artifact revision is not a SourceRevision token.
    snapshot = ProjectSnapshot(project_id=project_id, version=state.version, sources=state.sources)
    services.baselines.create(
        project_id,
        CreateBaseline(
            name="B1",
            entries=(BaselineEntry(source_id=source_id, revision_id=revision.id),),
        ),
        admin,
    )
    with services.factory.open() as repo:
        with pytest.raises(StaleSnapshotError):
            check_fresh(snapshot, repo.state(project_id))


def test_append_only_records_and_database_reference_checks(services, admin):
    project_id, source_id = make_source(services, admin)
    other_project, _ = make_source(services, admin)
    revision = services.sources.upload(project_id, source_id, "r1.ifc", b"content", admin).revision
    baseline = services.baselines.create(
        project_id,
        CreateBaseline(
            name="B1",
            entries=(BaselineEntry(source_id=source_id, revision_id=revision.id),),
        ),
        admin,
    )
    with pytest.raises(IntegrityError), services.factory.open(project_id, write=True) as repo:
        repo.add_source_revision(revision.model_copy(update={"original_filename": "overwrite.ifc"}))
    with pytest.raises(IntegrityError), services.factory.open(project_id, write=True) as repo:
        repo.add_baseline(baseline.model_copy(update={"name": "overwrite"}))
    with pytest.raises(IntegrityError), services.factory.open(other_project, write=True) as repo:
        repo.add_baseline(
            baseline.model_copy(update={"id": "invalid", "project_id": other_project})
        )
    with services.factory.open() as repo:
        assert repo.source_revision(project_id, source_id, revision.id) == revision
        assert repo.baseline(project_id, baseline.id) == baseline
        assert repo.baselines(other_project) == []


def test_download_rejects_corrupted_original(services, admin):
    project_id, source_id = make_source(services, admin)
    revision = services.sources.upload(project_id, source_id, "r1.ifc", b"content", admin).revision
    services.storage.put(revision.storage_key, b"corrupt")
    with pytest.raises(DomainError, match="integrity check"):
        services.sources.content(project_id, source_id, revision.id, admin)


def test_baseline_is_explicit_set_and_hash_identity_is_source_scoped(services, admin):
    from app.application.project_sources import source_status
    from pydantic import ValidationError

    project_id, source_id = make_source(services, admin)
    source2 = services.sources.create(
        project_id, CreateProjectSource(name="Other source", kind="DOCUMENT"), admin
    )
    revisions = [
        services.sources.upload(project_id, sid, "same.txt", b"same", admin)
        for sid in (source_id, source2.id)
    ]
    assert all(not result.duplicate and result.revision.sequence == 1 for result in revisions)
    entries = tuple(
        BaselineEntry(source_id=r.revision.source_id, revision_id=r.revision.id) for r in revisions
    )
    with pytest.raises(ValidationError, match="one revision"):
        CreateBaseline(name="duplicate source", entries=(entries[0], entries[0]))
    b1 = services.baselines.create(project_id, CreateBaseline(name="Both", entries=entries), admin)
    b2 = services.baselines.create(
        project_id, CreateBaseline(name="One", entries=(entries[0],)), admin
    )
    with services.factory.open() as repo:
        assert repo.baseline(project_id, b1.id) == b1
        assert repo.baseline(project_id, b2.id) == b2
        status = source_status(repo, source2)
        assert status.baseline_id == b2.id
        assert status.accepted_revision_id is None
        assert status.has_pending_revision


def test_upgrade_existing_database_preserves_project_and_snapshot(tmp_path):
    from pathlib import Path

    from alembic import command
    from alembic.config import Config
    from app.adapters.demo import demo_state
    from sqlalchemy import inspect, text

    engine = make_engine(f"sqlite:///{tmp_path / 'upgrade.db'}")
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).parents[1] / "migrations"))
    try:
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "0003")
        factory = SQLRepositoryFactory(engine)
        state = demo_state()
        snapshot = ProjectSnapshot(
            project_id=state.project.id, version=state.version, sources=state.sources
        )
        with factory.open(state.project.id, write=True) as repo:
            repo.save_state(state)
            repo.save_snapshot(snapshot)
        migrate(engine)
        migrate(engine)
        with factory.open() as repo:
            assert repo.state(state.project.id) == state
            assert repo.snapshot(snapshot.id) == snapshot
        assert {
            "project_sources",
            "project_source_revisions",
            "baselines",
            "baseline_entries",
            "project_agent_settings",
            "investigations",
            "agent_notices",
            "source_imports",
            "bim_revisions",
            "bim_element_snapshots",
            "work_package_bim_bindings",
            "revision_comparisons",
            "bim_element_changes",
        }.issubset(inspect(engine).get_table_names())
        with engine.connect() as connection:
            assert (
                connection.execute(text("select version_num from alembic_version")).scalar_one()
                == "0007"
            )
            assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.downgrade(config, "0004")
        assert "bim_revisions" not in inspect(engine).get_table_names()
        with factory.open() as repo:
            assert repo.state(state.project.id) == state
        migrate(engine)
        with engine.connect() as connection:
            assert (
                connection.execute(text("select version_num from alembic_version")).scalar_one()
                == "0007"
            )
            assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
    finally:
        engine.dispose()
