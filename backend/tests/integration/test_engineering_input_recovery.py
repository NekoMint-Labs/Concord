"""Real DBOS restart preserves role-qualified pairs and pinned IDS originals."""

import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]


@pytest.mark.integration
@pytest.mark.parametrize("kind", ["paired", "ids"])
def test_grouped_inputs_recover_in_real_dbos_process(tmp_path, kind):
    pytest.importorskip("dbos")
    preamble = """
import sys, time
from pathlib import Path
sys.path.insert(0, str(Path.cwd() / 'backend'))
sys.path.insert(0, str(Path.cwd() / 'backend/tests'))
from app.bootstrap import build_services
from app.settings import Settings
from app.domain.actions import Principal
from test_engineering_multisource import paired_finding, PairedEngine
from test_engineering_ids import ids_finding, select
settings = Settings(data_dir=Path(sys.argv[1]), seed_demo=False, _env_file=None)
admin = Principal(id='dbos-test', role='admin')
engine = PairedEngine()
svc = build_services(settings, engineering_capabilities=(engine,))
"""
    prepare = (
        preamble
        + f"""
try:
    svc.rechecks.dispatch = lambda _: None
    if {kind!r} == 'paired':
        project, model, _, _, _, finding = paired_finding(svc, admin)
        svc.sources.upload(project.id, model.id, 'r2.ifc', b'r2', admin)
    else:
        project, model, rules, revision, finding = ids_finding(svc, admin)
        select(svc, admin, project, rules, revision)
    with svc.factory.open() as repo:
        check = repo.rechecks(project.id, finding.id)[0]
        assert len(check.inputs) == 2
        assert repo.run(check.id).status == 'QUEUED'
finally:
    svc.close()
"""
    )
    recover = (
        preamble
        + f"""
try:
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        with svc.factory.open() as repo:
            runs = [r for r in repo.runs() if r.category == 'engineering_recheck']
            run = runs[0]
            check = repo.recheck(run.project_id, run.id)
        if run.status == 'COMPLETED' and check.outcome is not None:
            break
        time.sleep(0.05)
    assert run.runtime == 'dbos' and check.outcome == 'RESOLVED', (run, check)
    assert len(check.inputs) == 2
    assert len(check.evidence_ids) == (2 if {kind!r} == 'paired' else 1)
    with svc.factory.open() as repo:
        persisted = repo.evidence_by_ids(run.project_id, check.evidence_ids)
    expected = {{(i.source_id, i.source_revision_id, i.sha256)
                for i in check.inputs if i.role != 'requirements'}}
    assert {{(e.source_id, e.source_revision_id, e.source_revision) for e in persisted}} == expected
    if {kind!r} == 'ids':
        assert svc.ids_requirements.get(run.project_id, admin) == check.ids_requirements
        assert engine.requests[0].input_bytes[-1] == b'<ids>v1</ids>'
finally:
    svc.close()
"""
    )
    env = {k: v for k, v in os.environ.items() if not k.startswith("CCA_")}
    for script in (prepare, recover):
        result = subprocess.run(
            [sys.executable, "-c", script, str(tmp_path)],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=60,
        )
        assert result.returncode == 0, result.stdout[-3000:] + result.stderr[-4000:]
