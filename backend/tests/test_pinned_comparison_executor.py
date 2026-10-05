"""C adapter guards/process protocol; real engine acceptance is in integration/."""

import hashlib
import json
from dataclasses import replace
from pathlib import Path

import pytest
from app.adapters import trusted_comparisons as adapter
from app.adapters.trusted_comparisons import PinnedComparisonExecutor
from app.domain.comparisons import BoundComparison
from app.domain.errors import CapabilityUnavailable, Conflict, DomainError, ProviderError
from app.domain.models import ProjectSnapshot
from app.domain.project_sources import ProjectSourceRevision
from app.ports.comparisons import ComparisonExecution


def context(executor):
    data = (b"first original", b"second original")
    extension = ".pdf" if executor.kind == "pdf_comparison" else ".dxf"
    revisions = tuple(
        ProjectSourceRevision(
            id=f"r{index}",
            project_id="p",
            source_id="s",
            sequence=index,
            original_filename=f"r{index}{extension}",
            sha256=hashlib.sha256(value).hexdigest(),
            size_bytes=len(value),
            storage_key=f"originals/{index}",
        )
        for index, value in enumerate(data, 1)
    )
    bound = BoundComparison(
        kind=executor.kind,
        operation_id="operation",
        source_id="s",
        from_revision_id="r1",
        to_revision_id="r2",
        engine=executor.name,
        engine_version=executor.version,
        revisions=revisions,
    )
    snapshot = ProjectSnapshot(project_id="p", version=1, sources=())
    return ComparisonExecution("p", "run", 0, bound, snapshot, data)


@pytest.mark.parametrize("kind", ["pdf_comparison", "cad_comparison"])
def test_construction_is_lazy_and_missing_pack_is_explicit(tmp_path, kind):
    executor = PinnedComparisonExecutor(kind, tmp_path)
    with pytest.raises(CapabilityUnavailable, match="unavailable"):
        executor.execute(context(executor))


@pytest.mark.parametrize(
    "mode",
    [
        "bytes",
        "size",
        "project",
        "source",
        "order",
        "sequence",
        "extension",
        "snapshot",
        "engine",
        "version",
        "kind",
    ],
)
def test_binding_and_both_originals_are_checked_before_process(tmp_path, mode, monkeypatch):
    executor = PinnedComparisonExecutor("pdf_comparison", tmp_path)
    value = context(executor)
    monkeypatch.setattr(executor, "_runtime", lambda: pytest.fail("Runtime must not start"))
    bound = value.request
    if mode == "bytes":
        value = replace(value, originals=(value.originals[0], b"corrupt"))
    elif mode == "snapshot":
        value = replace(value, snapshot=value.snapshot.model_copy(update={"project_id": "foreign"}))
    elif mode in {"engine", "version", "kind", "order"}:
        patch = (
            {"engine": "other"}
            if mode == "engine"
            else {"engine_version": "other"}
            if mode == "version"
            else {"kind": "cad_comparison"}
            if mode == "kind"
            else {"from_revision_id": "r2"}
        )
        value = replace(value, request=bound.model_copy(update=patch))
    else:
        patch = (
            {"size_bytes": 1}
            if mode == "size"
            else {"project_id": "foreign"}
            if mode == "project"
            else {"source_id": "foreign"}
            if mode == "source"
            else {"sequence": 1}
            if mode == "sequence"
            else {"original_filename": "r2.dwg"}
        )
        value = replace(
            value,
            request=bound.model_copy(
                update={
                    "revisions": (bound.revisions[0], bound.revisions[1].model_copy(update=patch))
                }
            ),
        )
    with pytest.raises(Conflict):
        executor.execute(value)


@pytest.mark.parametrize("kind", ["pdf_comparison", "cad_comparison"])
def test_requests_cannot_select_program_url_or_unknown_setting(tmp_path, kind, monkeypatch):
    executor = PinnedComparisonExecutor(kind, tmp_path)
    value = context(executor)
    monkeypatch.setattr(executor, "_runtime", lambda: pytest.fail("Runtime must not start"))
    for option in ["script", "url", "node", "worker", "result"]:
        changed = replace(
            value, request=value.request.model_copy(update={"options": {option: "untrusted"}})
        )
        with pytest.raises(DomainError, match="Unknown"):
            executor.execute(changed)


@pytest.mark.parametrize(
    "manifest", [{}, [], {"schema": 1, "versions": {}}, {"schema": 1, "versions": []}]
)
def test_asset_pack_mismatch_fails_explicitly(tmp_path, manifest):
    executor = PinnedComparisonExecutor("pdf_comparison", tmp_path, node=Path(__file__))
    pack = tmp_path / "viewer-integrations/trusted"
    (pack / "dist").mkdir(parents=True)
    (pack / "runner.mjs").write_text("fixed runner")
    (pack / "dist/manifest.json").write_text(json.dumps(manifest))
    with pytest.raises(CapabilityUnavailable, match="pinned"):
        executor._runtime()


def test_originals_go_only_through_fixed_stdin_protocol(tmp_path, monkeypatch):
    executor = PinnedComparisonExecutor("cad_comparison", tmp_path)
    value = context(executor)
    monkeypatch.setattr(executor, "_runtime", lambda: (Path("node"), Path("runner")))
    captured = []
    monkeypatch.setattr(
        adapter, "invoke", lambda node, runner, payload, timeout: captured.append(payload) or b"raw"
    )
    assert executor.execute(value) == b"raw"
    assert captured[0]["mode"] == "execute"
    assert [item["revisionId"] for item in captured[0]["sources"]] == ["r1", "r2"]
    assert "raw" not in captured[0]


@pytest.mark.parametrize(
    "raw,key",
    [(b"", "key"), (b"{}", ""), (b"x" * (8 * 1024 * 1024 + 1), "key")],
    ids=["empty", "missing-key", "oversized"],
)
def test_normalization_requires_bounded_retained_artifact(tmp_path, raw, key):
    executor = PinnedComparisonExecutor("pdf_comparison", tmp_path)
    with pytest.raises(DomainError, match="artifact"):
        executor.normalize(context(executor), raw, key)


def test_malformed_json_and_invalid_canonical_output_are_explicit(tmp_path, monkeypatch):
    executor = PinnedComparisonExecutor("pdf_comparison", tmp_path)
    value = context(executor)
    with pytest.raises(ProviderError, match="JSON"):
        executor.normalize(value, b"broken", "key")
    monkeypatch.setattr(executor, "_runtime", lambda: (Path("node"), Path("runner")))
    monkeypatch.setattr(adapter, "invoke", lambda *args: b"{}")
    with pytest.raises(ProviderError, match="canonical"):
        executor.normalize(value, b"{}", "key")


def test_normalization_reuses_snapshot_time_and_retained_key(tmp_path, monkeypatch):
    executor = PinnedComparisonExecutor("cad_comparison", tmp_path)
    value = context(executor)
    monkeypatch.setattr(executor, "_runtime", lambda: (Path("node"), Path("runner")))
    seen = []
    monkeypatch.setattr(
        adapter,
        "invoke",
        lambda node, runner, payload, timeout: seen.append(payload) or b'{"operation_id":"run"}',
    )
    assert executor.normalize(value, b"{}", "immutable-key").operation_id == "run"
    assert seen[0]["context"]["rawArtifactKey"] == "immutable-key"
    assert seen[0]["context"]["observedAt"].endswith("Z")
    assert seen[0]["context"]["operationId"] == value.run_id


@pytest.mark.parametrize("timeout", [0, -1, 301])
def test_runtime_timeout_is_bounded(tmp_path, timeout):
    with pytest.raises(ValueError):
        PinnedComparisonExecutor("pdf_comparison", tmp_path, timeout=timeout)


def test_invalid_kind_and_original_count_fail_before_runtime(tmp_path):
    with pytest.raises(ValueError, match="kind"):
        PinnedComparisonExecutor("other", tmp_path)
    executor = PinnedComparisonExecutor("pdf_comparison", tmp_path)
    with pytest.raises(Conflict, match="Two ordered"):
        executor.execute(replace(context(executor), originals=(b"single",)))


def test_missing_manifest_is_explicit(tmp_path):
    executor = PinnedComparisonExecutor("pdf_comparison", tmp_path, node=Path(__file__))
    pack = tmp_path / "viewer-integrations/trusted"
    pack.mkdir(parents=True)
    (pack / "runner.mjs").write_text("fixed runner")
    with pytest.raises(CapabilityUnavailable, match="asset pack"):
        executor._runtime()
