"""Real C engines through A's persisted grouped/IDS ReCheck runtime."""

from pathlib import Path

import pytest
from app.adapters.clash_result_mapping import clash_publication
from app.adapters.engineering_capabilities import IfcClashCapability, IfcTesterCapability
from app.adapters.ifc_clash import IfcClashAdapter
from app.adapters.ifc_tester import IfcTesterAdapter
from app.bootstrap import build_services
from app.domain.engineering import (
    EngineeringPublication,
    FindingDecision,
    FindingDraft,
    IDSRequirementsRequest,
)
from app.domain.engineering_refs import BimTarget, FindingDependency
from app.domain.errors import Conflict
from app.domain.models import Evidence, Impact, ProjectSnapshot, utcnow
from app.domain.project_lifecycle import CreateProject
from app.domain.project_sources import CreateProjectSource
from app.settings import Settings
from test_engineering_capabilities import input_for, request_for
from test_golden_engineering import BEAM, DUCT, FIXTURE

pytestmark = pytest.mark.integration


class CountingClash(IfcClashAdapter):
    def __init__(self):
        super().__init__()
        self.calls = []

    def run(self, first, second, **kwargs):
        self.calls.append((first, second, kwargs))
        return super().run(first, second, **kwargs)


class CountingTester(IfcTesterAdapter):
    def __init__(self):
        super().__init__()
        self.calls = []

    def validate(self, model, rules, **kwargs):
        self.calls.append((model, rules, kwargs))
        return super().validate(model, rules, **kwargs)


def snapshot(svc, project):
    with svc.factory.open(project.id, write=True) as repo:
        state = repo.state(project.id)
        value = ProjectSnapshot(project_id=project.id, version=state.version, sources=state.sources)
        repo.save_snapshot(value)
    return value


def add_model(svc, admin, project, name, filename):
    source = svc.sources.create(project.id, CreateProjectSource(name=name, kind="BIM"), admin)
    revision = svc.sources.upload(
        project.id,
        source.id,
        Path(filename).name,
        (FIXTURE / filename).read_bytes(),
        admin,
    ).revision
    return source, revision


def create_clash_finding(svc, admin):
    project = svc.projects.create(CreateProject(name="Real provider coordination"), admin)
    structure, r2 = add_model(svc, admin, project, "Structure", "R2/structure.ifc")
    mep, r1 = add_model(svc, admin, project, "MEP", "R1/mep.ifc")
    original = IfcClashAdapter().run(
        (FIXTURE / "R2/structure.ifc").read_bytes(),
        (FIXTURE / "R1/mep.ifc").read_bytes(),
        source_id=structure.id,
        source_revision_id=r2.id,
        comparison_source_id=mep.id,
        comparison_revision_id=r1.id,
        selector_first=BEAM,
        selector_second=DUCT,
    )
    publication = clash_publication(
        original, snapshot_id=snapshot(svc, project).id, operation_id="initial-clash"
    )
    svc.engineering.publish(project.id, publication)
    dependencies = tuple(
        FindingDependency(
            source_id=source.id,
            source_revision_id=revision.id,
            capability="ifc-clash",
            expected_condition="No clashes",
            group_id="beam-duct",
            input_role=role,
            target=BimTarget(source_revision_id=revision.id, global_ids=(guid,)),
        )
        for source, revision, role, guid in (
            (structure, r2, "structure", BEAM),
            (mep, r1, "mep", DUCT),
        )
    )
    finding = svc.findings.create(
        project.id,
        FindingDraft(
            title="Beam and duct intersection",
            what_changed="Beam geometry changed",
            why_it_matters="The duct intersects the new beam",
            evidence_ids=tuple(item.id for item in publication.evidence),
            dependencies=dependencies,
            impact=Impact(
                work_package_ids=(), area_ids=(), element_ids=(BEAM, DUCT), disciplines=("MEP",)
            ),
        ),
        admin,
    )
    svc.findings.decide(project.id, finding.id, FindingDecision(decision="CONFIRMED"), admin)
    return project, structure, mep, finding


def persisted_check(svc, project, finding, check_id):
    with svc.factory.open() as repo:
        check = repo.recheck(project.id, check_id)
        assert check.finding_id == finding.id
        evidence = repo.evidence_by_ids(project.id, check.evidence_ids)
        run = repo.run(check.id)
    assert run.status == "COMPLETED"
    return check, evidence


def test_real_pair_publication_cache_parameter_restart_and_r3(tmp_path, admin):
    pytest.importorskip("ifcclash")
    settings = Settings(data_dir=tmp_path, diagnostic_runtime=True)
    first_adapter = CountingClash()
    svc = build_services(
        settings, engineering_capabilities=(IfcClashCapability(adapter=first_adapter),)
    )
    try:
        project, structure, mep, finding = create_clash_finding(svc, admin)
        requested = svc.rechecks.request(project.id, finding.id, admin, operation_id="check-r2")[0]
        check, evidence = persisted_check(svc, project, finding, requested.id)
        assert check.outcome == "STILL_OPEN" and len(evidence) == 2
        assert {e.source_id for e in evidence} == {structure.id, mep.id}
        assert {e.element_ids for e in evidence} == {(BEAM,), (DUCT,)}
        assert {e.source_revision_id for e in evidence} == {
            i.source_revision_id for i in check.inputs
        }
        assert all(e.snapshot_id != "provider" for e in evidence)
        cached = next(
            c
            for c in svc.rechecks.request(project.id, finding.id, admin, operation_id="warm-r2")
            if c.request_id.startswith("manual:warm-r2:")
        )
        cached, reused = persisted_check(svc, project, finding, cached.id)
        assert cached.outcome == "STILL_OPEN" and len(first_adapter.calls) == 1
        assert {e.id for e in reused}.isdisjoint({e.id for e in evidence})
        assert list((tmp_path / "files/derived").glob("*"))
    finally:
        svc.close()
    # Exercise actual bootstrap registration after restart with changed detection settings.
    second_adapter = CountingClash()
    svc = build_services(
        settings,
        engineering_capabilities=(
            IfcClashCapability(
                adapter=second_adapter,
                tolerance=0.01,
            ),
        ),
    )
    try:
        fresh = next(
            c
            for c in svc.rechecks.request(
                project.id, finding.id, admin, operation_id="new-settings"
            )
            if c.request_id.startswith("manual:new-settings:")
        )
        fresh, _ = persisted_check(svc, project, finding, fresh.id)
        assert fresh.outcome == "STILL_OPEN" and len(second_adapter.calls) == 1
        assert second_adapter.calls[0][2]["tolerance"] == 0.01
        svc.sources.upload(
            project.id, mep.id, "mep.ifc", (FIXTURE / "R3/mep.ifc").read_bytes(), admin
        )
        with svc.factory.open() as repo:
            checks = repo.rechecks(project.id, finding.id)
        r3 = next(
            c
            for c in checks
            if any(
                i.source_id == mep.id and i.source_revision_id != fresh.inputs[1].source_revision_id
                for i in c.inputs
            )
        )
        r3, evidence = persisted_check(svc, project, finding, r3.id)
        assert len(second_adapter.calls) == 2
        assert r3.outcome == "RESOLVED" and len(evidence) == 2
        assert {e.source_id for e in evidence} == {structure.id, mep.id}
        assert {e.element_ids for e in evidence} == {(BEAM,), (DUCT,)}
        assert all("No clashes" in e.fact and '"clash_count": 0' in e.fact for e in evidence)
        with svc.factory.open() as repo:
            assert repo.finding(project.id, finding.id).state == "CONFIRMED"
        warm_r3 = next(
            c
            for c in svc.rechecks.request(project.id, finding.id, admin, operation_id="warm-r3")
            if c.request_id.startswith("manual:warm-r3:")
        )
        warm_r3, warm_evidence = persisted_check(svc, project, finding, warm_r3.id)
        assert warm_r3.outcome == "RESOLVED" and len(warm_evidence) == 2
        assert len(second_adapter.calls) == 2
        assert second_adapter.calls[-1][0] == (FIXTURE / "R2/structure.ifc").read_bytes()
        assert second_adapter.calls[-1][1] == (FIXTURE / "R3/mep.ifc").read_bytes()
        assert second_adapter.calls[-1][2]["selector_first"] == BEAM
        assert second_adapter.calls[-1][2]["selector_second"] == DUCT
        svc.findings.decide(
            project.id, finding.id, FindingDecision(decision="CLOSED", recheck_id=r3.id), admin
        )
        with svc.factory.open() as repo:
            assert repo.finding(project.id, finding.id).state == "CLOSED"
    finally:
        svc.close()


def test_real_ids_selected_originals_positive_evidence_and_failure(tmp_path, admin):
    pytest.importorskip("ifctester")
    adapter = CountingTester()
    svc = build_services(
        Settings(data_dir=tmp_path, diagnostic_runtime=True),
        engineering_capabilities=(IfcTesterCapability(adapter=adapter),),
    )
    try:
        project = svc.projects.create(CreateProject(name="Real IDS selection"), admin)
        model, revision = add_model(svc, admin, project, "Structure", "R1/structure.ifc")
        target = BimTarget(source_revision_id=revision.id, global_ids=(BEAM,))
        evidence = Evidence(
            snapshot_id=snapshot(svc, project).id,
            provider="fixture",
            source_id=model.id,
            source_revision_id=revision.id,
            source_revision=revision.sha256,
            observed_at=utcnow(),
            fact="Beam naming must be checked against selected IDS",
            viewer_target=target,
        )
        svc.engineering.publish(
            project.id, EngineeringPublication(operation_id="initial-ids", evidence=(evidence,))
        )
        finding = svc.findings.create(
            project.id,
            FindingDraft(
                title="IDS naming check",
                what_changed="Naming requirements selected",
                why_it_matters="Validate the beam naming",
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
        original = (FIXTURE / "R1/requirements.ids").read_bytes()
        selected_revision = svc.sources.upload(
            project.id, rules.id, "requirements.ids", original, admin
        ).revision
        selection = svc.ids_requirements.select(
            project.id,
            IDSRequirementsRequest(
                source_id=rules.id,
                revision_id=selected_revision.id,
            ),
            admin,
        )
        assert len(adapter.calls) == 1 and adapter.calls[0][1] == original
        with svc.factory.open() as repo:
            check = repo.rechecks(project.id, finding.id)[0]
        assert check.ids_requirements == selection
        assert check.outcome == "RESOLVED" and len(check.evidence_ids) == 1
        check, positive = persisted_check(svc, project, finding, check.id)
        assert positive[0].viewer_target == target
        assert selected_revision.id in positive[0].fact and selection.id in positive[0].fact
        with svc.factory.open() as repo:
            assert repo.finding(project.id, finding.id).state == "CONFIRMED"
        # A real SDK failure is mapped, then persisted with the unchanged selected IDS provenance.
        import ifcopenshell

        changed = ifcopenshell.file.from_string((FIXTURE / "R1/structure.ifc").read_text())
        changed.by_guid(BEAM).Name = "INVALID"
        svc.sources.upload(
            project.id, model.id, "structure.ifc", changed.to_string().encode(), admin
        )
        with svc.factory.open() as repo:
            failures = [
                c for c in repo.rechecks(project.id, finding.id) if c.outcome == "STILL_OPEN"
            ]
        assert len(failures) == 1 and len(adapter.calls) == 2
        failed, evidence = persisted_check(svc, project, finding, failures[0].id)
        assert len(evidence) == 1 and evidence[0].element_ids == (BEAM,)
        assert evidence[0].source_revision_id == failed.inputs[0].source_revision_id
        assert selection.sha256 in evidence[0].fact
        with pytest.raises(Conflict, match="superseded"):
            svc.findings.decide(
                project.id,
                finding.id,
                FindingDecision(decision="CLOSED", recheck_id=check.id),
                admin,
            )
        newer = svc.sources.upload(
            project.id, rules.id, "requirements.ids", original + b"\n", admin
        ).revision
        assert len(adapter.calls) == 2 and svc.ids_requirements.get(project.id, admin) == selection
        svc.ids_requirements.select(
            project.id, IDSRequirementsRequest(source_id=rules.id, revision_id=newer.id), admin
        )
        assert len(adapter.calls) == 3 and adapter.calls[-1][1] == original + b"\n"
        restored = svc.sources.upload(
            project.id,
            model.id,
            "structure.ifc",
            (FIXTURE / "R1/structure.ifc").read_bytes() + b"\n",
            admin,
        ).revision
        with svc.factory.open() as repo:
            fresh = next(
                c
                for c in repo.rechecks(project.id, finding.id)
                if c.outcome == "RESOLVED" and c.inputs[0].source_revision_id == restored.id
            )
            assert repo.finding(project.id, finding.id).state == "CONFIRMED"
        assert len(adapter.calls) == 4
        svc.findings.decide(
            project.id, finding.id, FindingDecision(decision="CLOSED", recheck_id=fresh.id), admin
        )
        with svc.factory.open() as repo:
            assert repo.finding(project.id, finding.id).state == "CLOSED"
    finally:
        svc.close()


@pytest.mark.parametrize("missing", ["first", "second"])
def test_real_clash_missing_target_never_resolves(missing):
    pytest.importorskip("ifcclash")
    data = ((FIXTURE / "R2/structure.ifc").read_bytes(), (FIXTURE / "R1/mep.ifc").read_bytes())
    absent = "0000000000000000000000"
    inputs = (
        input_for(
            "structure", "R2", "structure", data[0], guids=(absent if missing == "first" else BEAM,)
        ),
        input_for("mep", "R1", "mep", data[1], guids=(absent if missing == "second" else DUCT,)),
    )
    result = IfcClashCapability().check(request_for(inputs, data))
    assert result.outcome == "NEEDS_REVIEW" and not result.evidence
    assert result.expected_condition_satisfied is not True
