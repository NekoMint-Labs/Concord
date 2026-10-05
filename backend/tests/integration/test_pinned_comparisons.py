"""Real pinned workers, originals, retained artifacts and SQLite publication.

Opt in after building the local pack: CCA_TEST_PINNED_COMPARISONS=1.
An opted-in missing/broken engine fails; it is never relabelled as a skip.
"""

import json
import os
from pathlib import Path
from time import perf_counter

import pytest
from app.adapters.trusted_comparisons import PinnedComparisonExecutor
from app.domain.comparisons import ComparisonRequest
from app.domain.errors import Conflict, ProviderError
from app.domain.project_lifecycle import CreateProject
from app.domain.project_sources import CreateProjectSource

ROOT = Path(__file__).resolve().parents[3]
pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        os.environ.get("CCA_TEST_PINNED_COMPARISONS") != "1",
        reason="Opt-in real Node/Chromium pack",
    ),
]


@pytest.fixture(params=["pdf_comparison", "cad_comparison"])
def pair(request, services, admin):
    kind = request.param
    executor = PinnedComparisonExecutor(kind, ROOT / "frontend")
    executor._runtime()
    services.comparisons.register(executor)
    project = services.projects.create(CreateProject(name="Pinned engineering acceptance"), admin)
    source = services.sources.create(
        project.id, CreateProjectSource(name="Structural", kind="DRAWING"), admin
    )
    extension = "pdf" if kind == "pdf_comparison" else "dxf"
    revisions = [
        services.sources.upload(
            project.id,
            source.id,
            f"r{index}.{extension}",
            (
                ROOT
                / "fixtures/coordination-project"
                / f"R{index}"
                / f"structural-drawing.{extension}"
            ).read_bytes(),
            admin,
        ).revision
        for index in [1, 2]
    ]
    bound = ComparisonRequest(
        kind=kind,
        operation_id="real-golden",
        source_id=source.id,
        from_revision_id=revisions[0].id,
        to_revision_id=revisions[1].id,
    )
    return project, bound, executor, revisions


def test_real_golden_publication_warm_cache_and_idempotency(services, admin, pair, tmp_path):
    project, request, executor, revisions = pair
    calls = []
    execute = executor.execute

    def measured(context):
        started = perf_counter()
        result = execute(context)
        calls.append({"execute_ms": (perf_counter() - started) * 1000, "raw_bytes": len(result)})
        return result

    executor.execute = measured
    run = services.comparisons.submit(project.id, request, admin)
    assert run.status == "COMPLETED", run
    with services.factory.open() as repo:
        job = repo.job(run.id)
        changes = repo.changes(project.id)
        assert changes and len(changes) == 1
        assert all(
            change.detector == executor.name
            and change.detector_version == executor.version
            and change.from_revision_id == revisions[0].id
            and change.to_revision_id == revisions[1].id
            and change.subject.source_revision_id == revisions[1].id
            and change.raw_artifact_key == job.result["artifact_key"]
            and change.created_at == repo.snapshot(job.snapshot_id).captured_at
            for change in changes
        )
        assert repo.findings(project.id) == []
        assert repo.latest_baseline(project.id) is None
        assert len(repo.evidence(project.id)) == len(changes)
        assert all(
            item.snapshot_id == job.snapshot_id
            and item.source_revision_id == revisions[1].id
            and item.viewer_target == changes[index].subject
            for index, item in enumerate(repo.evidence(project.id))
        )
        raw = services.artifacts.read(job.result["artifact_key"])
        payload = json.loads(raw)
        result = payload["result"]
        hashes = (
            result["artifact"]["sourceHashes"]
            if executor.kind == "pdf_comparison"
            else result["sourceHashes"]
        )
        assert hashes == [r.sha256 for r in revisions]
    retry = services.comparisons.submit(project.id, request, admin)
    assert retry.id == run.id and len(calls) == 1
    started = perf_counter()
    warm = services.comparisons.submit(
        project.id, request.model_copy(update={"operation_id": "warm"}), admin
    )
    assert warm.status == "COMPLETED" and len(calls) == 1
    with services.factory.open() as repo:
        warm_job = repo.job(warm.id)
        assert warm_job.result["cache_hit"]
        assert warm_job.result["artifact_key"] == job.result["artifact_key"]
        assert warm_job.snapshot_id != job.snapshot_id
    (tmp_path / "timings.json").write_text(
        json.dumps(
            {
                "kind": executor.kind,
                "cold": calls,
                "warm_publication_ms": (perf_counter() - started) * 1000,
            }
        )
    )


def test_real_worker_cannot_publish_after_new_revision(services, admin, pair):
    project, request, executor, revisions = pair
    original = executor.execute

    def obsolete(context):
        raw = original(context)
        services.sources.upload(
            project.id,
            request.source_id,
            revisions[1].original_filename,
            context.originals[1] + b"\n",
            admin,
        )
        return raw

    executor.execute = obsolete
    run = services.comparisons.enqueue(project.id, request, admin)
    with pytest.raises(Conflict):
        services.comparisons.process(run.id, generation=0)
    with services.factory.open() as repo:
        assert repo.changes(project.id) == []
        assert repo.evidence(project.id) == []


def test_real_worker_unchanged_pair_has_no_fabricated_changes(services, admin, pair):
    project, request, executor, revisions = pair
    bytes_ = services.storage.read(revisions[1].storage_key)
    revision = services.sources.upload(
        project.id, request.source_id, revisions[1].original_filename, bytes_ + b"\n", admin
    ).revision
    unchanged = request.model_copy(
        update={
            "operation_id": "unchanged",
            "from_revision_id": revisions[1].id,
            "to_revision_id": revision.id,
        }
    )
    run = services.comparisons.submit(project.id, unchanged, admin)
    assert run.status == "COMPLETED", run
    with services.factory.open() as repo:
        assert repo.changes(project.id) == []
        assert repo.job(run.id).result["artifact_key"]


def test_retained_result_recipe_and_provenance_are_validated(services, admin, pair):
    project, request, executor, _ = pair
    captured = []
    original = executor.execute

    def remember(context):
        captured.append(context)
        return original(context)

    executor.execute = remember
    run = services.comparisons.submit(project.id, request, admin)
    assert run.status == "COMPLETED", run
    with services.factory.open() as repo:
        job = repo.job(run.id)
        raw = services.artifacts.read(job.result["artifact_key"])
    value = json.loads(raw)
    value["options"] = {"unknown": True}
    with pytest.raises(ProviderError, match="recipe mismatch"):
        executor.normalize(captured[0], json.dumps(value).encode(), job.result["artifact_key"])
    value = json.loads(raw)
    if executor.kind == "pdf_comparison":
        value["result"]["artifact"]["sourceHashes"][1] = "0" * 64
    else:
        value["result"]["sourceHashes"][1] = "0" * 64
    with pytest.raises(ProviderError, match="revision/hash"):
        executor.normalize(captured[0], json.dumps(value).encode(), job.result["artifact_key"])


def test_missing_authorized_artifact_recomputes_identical_output(services, admin, pair):
    project, request, executor, _ = pair
    first = services.comparisons.submit(project.id, request, admin)
    assert first.status == "COMPLETED", first
    with services.factory.open() as repo:
        job = repo.job(first.id)
    key, digest = job.result["artifact_key"], job.result["artifact_sha256"]
    services.storage.delete(key)
    second = services.comparisons.submit(
        project.id, request.model_copy(update={"operation_id": "cache-miss"}), admin
    )
    assert second.status == "COMPLETED", second
    with services.factory.open() as repo:
        result = repo.job(second.id).result
        assert not result["cache_hit"]
        assert result["artifact_key"] == key and result["artifact_sha256"] == digest


def test_real_execution_applies_effective_options(services, admin, pair):
    project, request, executor, _ = pair
    options = (
        {"scale": 1, "maxShift": 0}
        if executor.kind == "pdf_comparison"
        else {"compareProps": 8, "compareText": 0}
    )
    run = services.comparisons.submit(
        project.id, request.model_copy(update={"options": options}), admin
    )
    assert run.status == "COMPLETED", run
    with services.factory.open() as repo:
        job = repo.job(run.id)
    raw = json.loads(services.artifacts.read(job.result["artifact_key"]))
    assert raw["options"] == options
    if executor.kind == "pdf_comparison":
        assert raw["result"]["artifact"]["options"]["scale"] == 1
        assert raw["result"]["artifact"]["options"]["maxShift"] == 0
    assert job.result["change_ids"]


def test_malformed_original_reports_failed_engine_without_publication(services, admin, pair):
    project, request, executor, revisions = pair
    filename = "bad.pdf" if executor.kind == "pdf_comparison" else "bad.dxf"
    latest = services.sources.upload(
        project.id, request.source_id, filename, b"not an engineering file", admin
    ).revision
    invalid = request.model_copy(
        update={"from_revision_id": revisions[1].id, "to_revision_id": latest.id}
    )
    # The diagnostic runtime forwards provider exceptions; DBOS owns durable failure handling.
    with pytest.raises(ProviderError, match="Trusted comparison failed"):
        services.comparisons.submit(project.id, invalid, admin)
    with services.factory.open() as repo:
        assert repo.changes(project.id) == []
        assert repo.evidence(project.id) == []
        failed = next(item for item in repo.runs() if item.category == executor.kind)
        assert failed.status == "FAILED" and failed.error
