"""Real MinIO/PostgreSQL contracts against explicitly selected loopback test services.

Creates and deletes only uniquely named test resources. Never adopts application
CCA_* credentials or connects to a remote production service.
"""

import hashlib
import io
import os
from urllib.parse import urlsplit
from uuid import uuid4

import pytest

pytestmark = pytest.mark.integration


def test_real_minio_roundtrip_hash_bounds_and_delete():
    pytest.importorskip("minio")
    endpoint = os.environ.get("CCA_TEST_S3_ENDPOINT")
    if not endpoint:
        pytest.skip("Set CCA_TEST_S3_ENDPOINT for a dedicated local MinIO service")
    parsed = urlsplit("http://" + endpoint)
    assert parsed.hostname in {"127.0.0.1", "localhost", "::1"}, (
        "Only local test services are allowed"
    )
    assert not parsed.username and parsed.path in {"", "/"}
    from app.adapters.storage_s3 import S3CompatibleFileStore
    from app.domain.errors import DomainError, NotFound, ProviderError

    bucket = "cca-verification-" + uuid4().hex
    store = S3CompatibleFileStore(
        endpoint,
        bucket,
        os.environ.get("CCA_TEST_S3_ACCESS_KEY", "cca-local-test"),
        os.environ.get("CCA_TEST_S3_SECRET_KEY", "cca-local-test-secret"),
        secure=False,
        max_bytes=128,
    )
    store.client.make_bucket(bucket)
    try:
        assert store.health()[0]
        payload = b"Original V17 coordination evidence."
        assert store.put("documents/fixture/source", payload) == hashlib.sha256(payload).hexdigest()
        assert store.read("documents/fixture/source") == payload
        with pytest.raises(DomainError, match="size limit"):
            store.put("documents/fixture/too-big", b"x" * 129)
        corrupted = b"Changed content"
        store.client.put_object(
            bucket,
            "documents/fixture/corrupted",
            io.BytesIO(corrupted),
            len(corrupted),
            metadata={"sha256": hashlib.sha256(payload).hexdigest()},
        )
        with pytest.raises(ProviderError, match="hash"):
            store.read("documents/fixture/corrupted")
        store.client.put_object(bucket, "documents/fixture/large", io.BytesIO(b"x" * 129), 129)
        with pytest.raises(DomainError, match="size limit"):
            store.read("documents/fixture/large")
        store.delete("documents/fixture/source")
        with pytest.raises(NotFound):
            store.read("documents/fixture/source")
    finally:
        for item in store.client.list_objects(bucket, recursive=True):
            store.client.remove_object(bucket, item.object_name)
        store.client.remove_bucket(bucket)


@pytest.fixture
def postgres_services(tmp_path):
    psycopg = pytest.importorskip("psycopg")
    pytest.importorskip("pgvector")
    url = os.environ.get("CCA_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set CCA_TEST_DATABASE_URL to an administrative local test database")
    from app.adapters.retrieval_pgvector import migrate_vectors
    from app.bootstrap import build_services
    from app.settings import Settings
    from psycopg import sql
    from sqlalchemy.engine import make_url

    address = make_url(url).set(drivername="postgresql")
    assert address.host in {"127.0.0.1", "localhost", "::1"}, (
        "Only local test databases are allowed"
    )
    name = "cca_verification_" + uuid4().hex
    admin_url = address.render_as_string(hide_password=False)
    with psycopg.connect(admin_url, autocommit=True, connect_timeout=5) as connection:
        connection.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
    svc = None
    try:
        database_url = address.set(database=name).render_as_string(hide_password=False)
        svc = build_services(
            Settings(
                data_dir=tmp_path,
                database_url=database_url,
                diagnostic_runtime=True,
                vector_enabled=True,
                _env_file=None,
            )
        )
        migrate_vectors(svc.factory.engine)
        yield svc
    finally:
        if svc is not None:
            svc.close()
        with psycopg.connect(admin_url, autocommit=True, connect_timeout=5) as connection:
            connection.execute(
                sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name))
            )


def test_real_pgvector_source_version_project_and_model_isolation(postgres_services):
    from app.adapters.embeddings import DeterministicTestEmbeddings
    from app.adapters.persistence.tables import DocumentRow
    from app.adapters.retrieval_pgvector import PgVectorSearch, embedding_table
    from app.domain.retrieval import SemanticQuery
    from sqlalchemy import select, update

    svc = postgres_services
    original = b"Coordination inspection V17 duct evidence."
    document = svc.documents.import_file("harbor-east", "vector-fixture.md", original)
    search = PgVectorSearch(svc.factory.engine, DeterministicTestEmbeddings())
    assert search.health()[0]
    indexed = search.index_document("harbor-east", document["id"])
    assert indexed["source_hash"] == hashlib.sha256(original).hexdigest()
    query = SemanticQuery(query=original.decode(), document_id=document["id"])
    results = search.search("harbor-east", query)
    assert len(results) == indexed["indexed_chunks"] == 1
    assert results[0].score == pytest.approx(1, abs=1e-5)
    assert results[0].source_hash == document["content_hash"] and results[0].test_only
    assert not search.search("a-different-project", query)
    assert not search.search("harbor-east", query.model_copy(update={"source_hash": "0" * 64}))
    newer = PgVectorSearch(svc.factory.engine, DeterministicTestEmbeddings(version="fixture-v2"))
    assert not newer.search("harbor-east", query)
    newer.index_document("harbor-east", document["id"])
    newer.index_document("harbor-east", document["id"])
    assert not search.search("harbor-east", query)
    assert newer.search("harbor-east", query)[0].model_version == "fixture-v2"
    table = embedding_table()
    with svc.factory.engine.connect() as connection:
        rows = list(connection.execute(select(table).where(table.c.document_id == document["id"])))
        assert len(rows) == 1, "Idempotent rebuild must not duplicate derived rows"
    with svc.factory.engine.begin() as connection:
        connection.execute(
            update(DocumentRow)
            .where(DocumentRow.id == document["id"])
            .values(content_hash="1" * 64)
        )
    assert not newer.search("harbor-east", query), (
        "Outdated derived vectors must never retrieve changed source"
    )


def test_real_postgres_scoped_document_search_before_limit(postgres_services):
    from app.domain.actions import Principal
    from app.domain.agent import AgentScope
    from app.domain.agent_tools import SearchQuery
    from test_agent_read_boundaries import document_candidates, project, read_tools

    svc = postgres_services
    principal = Principal(id="postgres-search-admin", role="admin")
    identity, source, revision = document_candidates(svc, principal)
    result = read_tools(svc, identity, AgentScope(source_id=source.id)).relevant_documents(
        SearchQuery(query="needle")
    )
    assert result.evidence
    assert {e.source_revision for e in result.evidence} == {revision.sha256}
    assert svc.documents.search(identity, "needle", source_hashes=()) == []
    assert svc.documents.search(identity, "needle", source_hashes=("0" * 64,)) == []
    other, _ = project(svc, principal)
    assert svc.documents.search(other, "needle", source_hashes=(revision.sha256,)) == []


def test_real_postgres_concurrent_approval_and_receipt(postgres_services):
    from concurrent.futures import ThreadPoolExecutor

    from app.api.main import create_app
    from app.domain.actions import Principal
    from fastapi.testclient import TestClient

    svc = postgres_services
    principal = Principal(id="postgres-test-admin", role="admin")
    with TestClient(create_app(svc.settings, svc)) as client:
        client.headers["Authorization"] = "Bearer local-demo-admin"
        response = client.post(
            "/api/projects/harbor-east/events",
            json={
                "project_id": "harbor-east",
                "work_package_id": "WP-200",
                "kind": "design_revision",
                "title": "PostgreSQL concurrency fixture",
                "change": {"revision": "V17"},
            },
        )
        assert response.status_code == 202, response.text
        workspace = client.get("/api/projects/harbor-east/workspace").json()
        proposal = next(
            item for item in workspace["proposals"] if item["work_package_id"] == "WP-200"
        )
        with ThreadPoolExecutor(max_workers=8) as workers:
            approvals = list(
                workers.map(lambda _: svc.actions.approve(proposal["id"], principal), range(8))
            )
        assert len({approval.id for approval in approvals}) == 1
        with ThreadPoolExecutor(max_workers=8) as workers:
            receipts = list(
                workers.map(lambda _: svc.actions.execute(proposal["id"], principal), range(8))
            )
        assert len({receipt.operation_id for receipt in receipts}) == 1
        assert len({receipt.after_version for receipt in receipts}) == 1


def test_real_pgvector_job_cancellation_and_completion_rollback(postgres_services, monkeypatch):
    from app.adapters.persistence.repository import SQLCoordinationRepository
    from app.adapters.retrieval_pgvector import embedding_table
    from app.domain.actions import Principal
    from app.domain.errors import ProviderError
    from app.domain.jobs import EmbeddingIndexRequest
    from sqlalchemy import func, select

    svc = postgres_services
    principal = Principal(id="vector-transaction-test", role="admin")
    document = svc.documents.import_file("harbor-east", "atomic-vector.md", b"Atomic vector source")
    request = EmbeddingIndexRequest(document_id=document["id"])
    table = embedding_table()

    def count():
        with svc.factory.engine.connect() as connection:
            return connection.execute(
                select(func.count()).select_from(table).where(table.c.document_id == document["id"])
            ).scalar()

    run = svc.jobs.enqueue("harbor-east", request, principal)
    embed = svc.jobs.semantic.embeddings.embed

    def cancel_during_embedding(*args, **kwargs):
        svc.coordination.cancel(run.id, principal)
        return embed(*args, **kwargs)

    monkeypatch.setattr(svc.jobs.semantic.embeddings, "embed", cancel_during_embedding)
    assert svc.workflow.begin(run.id) == "CANCELLED"
    assert count() == 0
    monkeypatch.setattr(svc.jobs.semantic.embeddings, "embed", embed)
    run = svc.jobs.enqueue("harbor-east", request, principal)
    save_job = SQLCoordinationRepository.save_job

    def fail_completion(repo, job):
        if job.id == run.id and job.result is not None:
            raise ProviderError("Injected vector completion failure")
        return save_job(repo, job)

    monkeypatch.setattr(SQLCoordinationRepository, "save_job", fail_completion)
    with pytest.raises(ProviderError):
        svc.workflow.begin(run.id)
    assert count() == 0, "Job rollback must include actual vector INSERTs"
    monkeypatch.setattr(SQLCoordinationRepository, "save_job", save_job)
    assert svc.workflow.begin(run.id) == "COMPLETED"
    assert count() == 1
    assert svc.workflow.begin(run.id) == "COMPLETED"
    assert count() == 1


def test_real_pgvector_rejects_chunk_changed_during_model_call(postgres_services, monkeypatch):
    from app.adapters.persistence.tables import ChunkRow
    from app.adapters.retrieval_pgvector import embedding_table
    from app.domain.errors import ProviderError
    from sqlalchemy import select, update

    svc = postgres_services
    document = svc.documents.import_file(
        "harbor-east", "changed-vector.md", b"Original selected chunk"
    )
    adapter = svc.jobs.semantic
    embed = adapter.embeddings.embed

    def change_chunk(*args, **kwargs):
        with svc.factory.engine.begin() as connection:
            connection.execute(
                update(ChunkRow)
                .where(ChunkRow.document_id == document["id"])
                .values(text="Changed after selection")
            )
        return embed(*args, **kwargs)

    monkeypatch.setattr(adapter.embeddings, "embed", change_chunk)
    with pytest.raises(ProviderError, match="chunk content changed"):
        adapter.index_document("harbor-east", document["id"])
    table = embedding_table()
    with svc.factory.engine.connect() as connection:
        assert not list(
            connection.execute(select(table).where(table.c.document_id == document["id"]))
        )


def test_real_postgres_serializes_first_project_creation(postgres_services):
    from concurrent.futures import ThreadPoolExecutor

    from app.adapters.demo import demo_state
    from app.domain.actions import Principal

    svc = postgres_services
    state = demo_state()
    state = state.model_copy(
        update={"project": state.project.model_copy(update={"id": "new-concurrent-project"})}
    )
    principal = Principal(id="creation-test", role="admin")
    with ThreadPoolExecutor(max_workers=6) as workers:
        runs = list(workers.map(lambda _: svc.coordination.seed(state, principal), range(6)))
    assert len({run.id for run in runs}) == 1
    with svc.factory.open() as repo:
        assert len(repo.runs(state.project.id)) == 1
