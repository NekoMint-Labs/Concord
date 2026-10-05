"""Real pinned PDF/CAD workers consume a committed outbox in fresh DBOS processes."""

import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        os.environ.get("CCA_TEST_PINNED_COMPARISONS") != "1",
        reason="Opt-in real Node/Chromium/DBOS pack",
    ),
]


def test_pinned_workers_recover_and_reuse_authorized_cache_in_real_dbos(tmp_path):
    preamble = """
import sys, time
from pathlib import Path
sys.path.insert(0, str(Path.cwd() / 'backend'))
from app.bootstrap import build_services
from app.settings import Settings
from app.adapters.trusted_comparisons import PinnedComparisonExecutor
from app.domain.actions import Principal
from app.domain.comparisons import ComparisonRequest
from app.domain.project_lifecycle import CreateProject
from app.domain.project_sources import CreateProjectSource
admin = Principal(id='real-engine-recovery', role='admin')
executors = tuple(PinnedComparisonExecutor(kind, Path.cwd() / 'frontend')
    for kind in ['pdf_comparison', 'cad_comparison'])
calls = []
for executor in executors:
    original = executor.execute
    def measured(context, run=original):
        calls.append(context.request.kind)
        return run(context)
    executor.execute = measured
svc = build_services(Settings(data_dir=Path(sys.argv[1]), seed_demo=False, _env_file=None),
    comparison_executors=executors)
"""
    prepare = (
        preamble
        + """
try:
    for executor in executors:
        project = svc.projects.create(CreateProject(name=executor.kind), admin)
        source = svc.sources.create(project.id,
            CreateProjectSource(name='Structural', kind='DRAWING'), admin)
        extension = 'pdf' if executor.kind == 'pdf_comparison' else 'dxf'
        fixture = Path.cwd() / 'fixtures/coordination-project'
        revisions = [svc.sources.upload(project.id, source.id, f'r{index}.{extension}',
            (fixture / f'R{index}' / f'structural-drawing.{extension}').read_bytes(),
            admin).revision for index in [1, 2]]
        request = ComparisonRequest(kind=executor.kind,
            operation_id='recover-real', source_id=source.id,
            from_revision_id=revisions[0].id, to_revision_id=revisions[1].id)
        run = svc.comparisons.enqueue(project.id, request, admin)
        with svc.factory.open() as repo: assert repo.run(run.id).status == 'QUEUED'
    assert calls == []
finally: svc.close()
"""
    )
    recover = (
        preamble
        + """
try:
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        with svc.factory.open() as repo:
            runs = [r for r in repo.runs() if r.category in {'pdf_comparison', 'cad_comparison'}]
        if len(runs) == 2 and all(r.status in {'COMPLETED', 'FAILED'} for r in runs): break
        time.sleep(0.05)
    assert len(runs) == 2
    assert all(r.runtime == 'dbos' and r.status == 'COMPLETED' for r in runs), runs
    assert sorted(calls) == ['cad_comparison', 'pdf_comparison'], calls
    with svc.factory.open() as repo:
        for run in runs:
            job = repo.job(run.id)
            changes = repo.changes(run.project_id)
            evidence = repo.evidence(run.project_id)
            assert len(changes) == len(evidence) == 1
            assert changes[0].raw_artifact_key == job.result['artifact_key']
            assert evidence[0].snapshot_id == job.snapshot_id
            assert svc.artifacts.read(job.result['artifact_key']) is not None
finally: svc.close()
"""
    )
    replay = (
        preamble
        + """
try:
    with svc.factory.open() as repo:
        originals = [(r, repo.job(r.id)) for r in repo.runs()
            if r.category in {'pdf_comparison', 'cad_comparison'}]
    warm_ids = []
    for run, job in originals:
        bound = job.request
        request = ComparisonRequest(kind=bound.kind, operation_id='warm-new-process',
            source_id=bound.source_id,
            from_revision_id=bound.from_revision_id,
            to_revision_id=bound.to_revision_id, options=bound.options)
        warm_ids.append(svc.comparisons.submit(run.project_id, request, admin).id)
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        with svc.factory.open() as repo: runs = [repo.run(identity) for identity in warm_ids]
        if all(r.status in {'COMPLETED', 'FAILED'} for r in runs): break
        time.sleep(0.05)
    assert all(r.status == 'COMPLETED' for r in runs), runs
    assert calls == [], calls
    with svc.factory.open() as repo:
        assert all(repo.job(r.id).result['cache_hit'] for r in runs)
finally: svc.close()
"""
    )
    env = {key: value for key, value in os.environ.items() if not key.startswith("CCA_")}
    for script in (prepare, recover, replay):
        result = subprocess.run(
            [sys.executable, "-c", script, str(tmp_path)],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=180,
        )
        assert result.returncode == 0, result.stdout[-2000:] + result.stderr[-5000:]
