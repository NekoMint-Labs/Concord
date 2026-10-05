"""Configured standard API startup restores a committed outbox in real DBOS."""

import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]


@pytest.mark.integration
@pytest.mark.parametrize("kind", ["pdf_comparison", "cad_comparison"])
def test_configured_comparison_recovers_on_standard_startup(tmp_path, kind):
    pytest.importorskip("dbos")
    preamble = """
import sys, time
from pathlib import Path
from types import ModuleType
sys.path.insert(0, str(Path.cwd() / 'backend'))
sys.path.insert(0, str(Path.cwd() / 'backend/tests'))
from test_trusted_comparisons import FixtureExecutor
from app.api.main import create_app
from app.settings import Settings
from app.domain.actions import Principal
from app.domain.comparisons import ComparisonRequest
from app.domain.project_lifecycle import CreateProject
from app.domain.project_sources import CreateProjectSource
from fastapi.testclient import TestClient
module = ModuleType('app.adapters.trusted_comparisons')
created = []
def fixed(kind, root, *, node=None):
    executor = FixtureExecutor(kind)
    created.append(executor)
    return executor
module.PinnedComparisonExecutor = fixed
sys.modules[module.__name__] = module
kind = sys.argv[2]
settings = Settings(data_dir=Path(sys.argv[1]) / 'data', seed_demo=False,
    comparison_frontend_root=Path(sys.argv[1]) / 'operator/frontend',
    pdf_comparison_enabled=kind == 'pdf_comparison',
    cad_comparison_enabled=kind == 'cad_comparison', _env_file=None)
admin = Principal(id='recovery-test', role='admin')
"""
    prepare = (
        preamble
        + """
with TestClient(create_app(settings)) as client:
    svc = client.app.state.services
    assert set(svc.comparisons.executors) == {kind}
    assert created[0].calls == 0
    project = svc.projects.create(CreateProject(name='Configured recovery'), admin)
    source = svc.sources.create(
        project.id, CreateProjectSource(name='Drawing', kind='DRAWING'), admin)
    extension = 'pdf' if kind == 'pdf_comparison' else 'dxf'
    first = svc.sources.upload(
        project.id, source.id, 'r1.' + extension, b'original-r1', admin).revision
    second = svc.sources.upload(
        project.id, source.id, 'r2.' + extension, b'original-r2', admin).revision
    request = ComparisonRequest(kind=kind, operation_id='recovery-operation', source_id=source.id,
        from_revision_id=first.id, to_revision_id=second.id, options={'fixture': True})
    run = svc.comparisons.enqueue(project.id, request, admin)
    with svc.factory.open() as repo:
        assert repo.run(run.id).status == 'QUEUED'
        assert len(repo.job(run.id).request.revisions) == 2
"""
    )
    recover = (
        preamble
        + """
with TestClient(create_app(settings)) as client:
    svc = client.app.state.services
    assert set(svc.comparisons.executors) == {kind}
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        with svc.factory.open() as repo:
            run = next(r for r in repo.runs() if r.category == kind)
            job = repo.job(run.id)
        if run.status == 'COMPLETED':
            break
        time.sleep(0.05)
    assert run.runtime == 'dbos' and run.status == 'COMPLETED', (run, job)
    assert created[0].calls == 1
    with svc.factory.open() as repo:
        changes = repo.changes(run.project_id)
        assert len(changes) == 1
        assert changes[0].raw_artifact_key == job.result['artifact_key']
        assert changes[0].from_revision_id == job.request.revisions[0].id
        assert changes[0].to_revision_id == job.request.revisions[1].id
    assert svc.artifacts.read(job.result['artifact_key']) is not None
"""
    )
    env = {key: value for key, value in os.environ.items() if not key.startswith("CCA_")}
    for script in (prepare, recover):
        result = subprocess.run(
            [sys.executable, "-c", script, str(tmp_path), kind],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=60,
        )
        assert result.returncode == 0, result.stdout[-2000:] + result.stderr[-4000:]
