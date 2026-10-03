"""Real DBOS dispatch after process restart with persisted engineering outbox state."""

import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]


@pytest.mark.integration
@pytest.mark.parametrize("enqueue", ["revision", "confirmation"])
def test_engineering_outbox_recovers_in_new_dbos_process(tmp_path, enqueue):
    pytest.importorskip("dbos")
    preamble = """
import sys, time
from pathlib import Path
sys.path.insert(0, str(Path.cwd() / 'backend'))
sys.path.insert(0, str(Path.cwd() / 'backend/tests'))
from app.bootstrap import build_services
from app.settings import Settings
from app.domain.actions import Principal
from app.domain.engineering import FindingDecision
from test_engineering_coordination import setup_finding
settings = Settings(data_dir=Path(sys.argv[1]), seed_demo=False, _env_file=None)
admin = Principal(id='dbos-test', role='admin')
svc = build_services(settings)
"""
    confirm = enqueue == "revision"
    prepare = (
        preamble
        + f"""
try:
    project, source, _, finding, _, _ = setup_finding(svc, admin, confirm={confirm})
    svc.rechecks.dispatch = lambda _: None
    svc.sources.upload(project.id, source.id, 'r2.ifc', b'r2', admin)
    if not {confirm}:
        svc.findings.decide(project.id, finding.id, FindingDecision(decision='CONFIRMED'), admin)
    with svc.factory.open() as repo:
        check = repo.rechecks(project.id, finding.id)[0]
        assert repo.run(check.id).status == 'QUEUED'
finally:
    svc.close()
"""
    )
    recover = (
        preamble
        + """
try:
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        with svc.factory.open() as repo:
            project = repo.projects()[0].project
            finding = repo.findings(project.id)[0]
            check = repo.rechecks(project.id, finding.id)[0]
            run = repo.run(check.id)
        # SQLite may observe the worker commit between these separate reads.
        # Wait for both records before asserting the published outcome.
        if run.status == 'COMPLETED' and check.outcome is not None:
            break
        time.sleep(0.05)
    assert run.runtime == 'dbos' and run.status == 'COMPLETED', run
    assert check.outcome == 'NEEDS_REVIEW'
    assert finding.state == 'CONFIRMED'
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
        assert result.returncode == 0, result.stdout[-3000:] + result.stderr[-3000:]
