"""Real SDK and DBOS recovery through the normal configuration-driven app path."""

import os
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]


@pytest.mark.integration
@pytest.mark.parametrize("kind", ["clash", "ids"])
def test_real_ifc_configured_startup_recovery(tmp_path, kind):
    pytest.importorskip("ifcclash" if kind == "clash" else "ifctester")
    preamble = """
import sys, time
from pathlib import Path

sys.path.insert(0, str(Path.cwd() / "backend"))
sys.path.insert(0, str(Path.cwd() / "backend/tests"))
sys.path.insert(0, str(Path.cwd() / "backend/tests/integration"))
from app.api.main import create_app
from app.settings import Settings
from app.domain.actions import Principal
from app.domain.engineering import (
    EngineeringPublication,
    FindingDecision,
    FindingDraft,
    IDSRequirementsRequest,
)
from app.domain.engineering_refs import BimTarget, FindingDependency
from app.domain.models import Evidence, Impact, utcnow
from app.domain.project_lifecycle import CreateProject
from app.domain.project_sources import CreateProjectSource
from fastapi.testclient import TestClient
from test_engineering_provider_runtime import create_clash_finding, snapshot, add_model
from test_golden_engineering import BEAM, DUCT, FIXTURE

settings = Settings(data_dir=Path(sys.argv[1]), seed_demo=False, _env_file=None)
assert settings.ifc_clash_enabled and settings.ids_validation_enabled
admin = Principal(id="startup-test", role="admin")
"""
    prepare = (
        preamble
        + """
with TestClient(create_app(settings)) as client:
    svc = client.app.state.services
    assert set(svc.rechecks.capabilities) == {"ifc-clash", "ifc-ids"}
    assert not any(
        name in sys.modules for name in ("ifcopenshell", "ifcclash", "ifctester", "xmlschema")
    )
    svc.rechecks.dispatch = lambda _: None
    if sys.argv[2] == "clash":
        project, structure, mep, finding = create_clash_finding(svc, admin)
        svc.sources.upload(
            project.id, mep.id, "mep.ifc", (FIXTURE / "R3/mep.ifc").read_bytes(), admin
        )
    else:
        project = svc.projects.create(CreateProject(name="Configured IDS"), admin)
        model, revision = add_model(svc, admin, project, "Structure", "R1/structure.ifc")
        target = BimTarget(source_revision_id=revision.id, global_ids=(BEAM,))
        evidence = Evidence(
            snapshot_id=snapshot(svc, project).id,
            provider="fixture",
            source_id=model.id,
            source_revision_id=revision.id,
            source_revision=revision.sha256,
            observed_at=utcnow(),
            fact="Check beam naming",
            viewer_target=target,
        )
        svc.engineering.publish(
            project.id, EngineeringPublication(operation_id="initial", evidence=(evidence,))
        )
        finding = svc.findings.create(
            project.id,
            FindingDraft(
                title="IDS naming",
                what_changed="Requirements selected",
                why_it_matters="Naming validation",
                evidence_ids=(evidence.id,),
                dependencies=(
                    FindingDependency(
                        source_id=model.id,
                        source_revision_id=revision.id,
                        capability="ifc-ids",
                        expected_condition="All IDS requirements pass",
                        target=target,
                        requirements_kind="ids",
                    ),
                ),
                impact=Impact(
                    work_package_ids=(),
                    area_ids=(),
                    element_ids=(BEAM,),
                    disciplines=("Structure",),
                ),
            ),
            admin,
        )
        svc.findings.decide(project.id, finding.id, FindingDecision(decision="CONFIRMED"), admin)
        rules = svc.sources.create(
            project.id, CreateProjectSource(name="IDS", kind="DOCUMENT"), admin
        )
        selected = svc.sources.upload(
            project.id,
            rules.id,
            "requirements.ids",
            (FIXTURE / "R1/requirements.ids").read_bytes(),
            admin,
        ).revision
        svc.ids_requirements.select(
            project.id, IDSRequirementsRequest(source_id=rules.id, revision_id=selected.id), admin
        )
    with svc.factory.open() as repo:
        check = repo.rechecks(project.id, finding.id)[0]
        assert len(check.inputs) == 2 and repo.run(check.id).status == "QUEUED"
"""
    )
    recover = (
        preamble
        + """
with TestClient(create_app(settings)) as client:
    svc = client.app.state.services
    deadline = time.monotonic() + 25
    while time.monotonic() < deadline:
        with svc.factory.open() as repo:
            run = next(r for r in repo.runs() if r.category == "engineering_recheck")
            check = repo.recheck(run.project_id, run.id)
        if run.status in {"COMPLETED", "FAILED"} and check.outcome is not None:
            break
        time.sleep(0.05)
    assert run.status == "COMPLETED" and check.outcome == "RESOLVED", (run, check)
    assert len(check.evidence_ids) == (2 if sys.argv[2] == "clash" else 1)
    with svc.factory.open() as repo:
        evidence = repo.evidence_by_ids(run.project_id, check.evidence_ids)
        assert repo.finding(run.project_id, check.finding_id).state == "CONFIRMED"
    expected = {
        (i.source_id, i.source_revision_id, i.sha256)
        for i in check.inputs
        if i.role != "requirements"
    }
    assert {(e.source_id, e.source_revision_id, e.source_revision) for e in evidence} == expected
    if sys.argv[2] == "ids":
        assert check.ids_requirements.id in evidence[0].fact
        assert svc.ids_requirements.get(run.project_id, admin) == check.ids_requirements
    rows = client.get(
        "/api/capabilities", headers={"Authorization": "Bearer " + settings.api_token}
    ).json()["capabilities"]
    rows = {row["name"]: row for row in rows}
    for name in ("IFC clash", "IDS validation"):
        assert rows[name]["enabled"] and rows[name]["status"] == "enabled"
        assert rows[name]["service_reachable"] is None
        assert "not a live SDK probe" in rows[name]["reason"]
"""
    )
    env = {key: value for key, value in os.environ.items() if not key.startswith("CCA_")}
    env.update(CCA_IFC_CLASH_ENABLED="true", CCA_IDS_VALIDATION_ENABLED="true")
    for script in (prepare, recover):
        result = subprocess.run(
            [sys.executable, "-c", script, str(tmp_path), kind],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=65,
        )
        assert result.returncode == 0, result.stdout[-3000:] + result.stderr[-4000:]
