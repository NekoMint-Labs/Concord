"""Real optional SDK tests. Missing packages produce explicit skips, not fake passes."""

import hashlib
import time
from pathlib import Path

import pytest
from app.adapters.bim_ifc import IfcOpenShellBIMProvider, LocalIFCImporter
from app.adapters.clash_result_mapping import clash_publication
from app.adapters.demo import StructuredBIMProvider
from app.adapters.demo_ids import DUCT_GUID, TRAY_GUID, WALL_GUID
from app.adapters.documents_docling import DoclingDocumentParser
from app.adapters.engineering_cache import ids_cache_key
from app.adapters.ifc_clash import IfcClashAdapter
from app.adapters.ifc_diff import OfficialIfcDiffEngine
from app.adapters.ifc_fixture import generate_ifc_fixture
from app.adapters.ifc_tester import IfcTesterAdapter
from app.adapters.resolver_ortools import ORToolsResolver
from app.adapters.scheduling_fixture import coordination_fixture
from app.domain.errors import CapabilityUnavailable, ProviderError
from app.domain.scheduling import validate_solution

pytestmark = pytest.mark.integration


def _write_comparison_fixture(path: Path, schema: str, *, revised: bool) -> int:
    ifcopenshell = pytest.importorskip("ifcopenshell")
    model = ifcopenshell.file(schema=schema)
    stable_id = "0JYqfQ6zP6LQxgT6eT8v1A"
    removed_id = "1JYqfQ6zP6LQxgT6eT8v1B"
    added_id = "2JYqfQ6zP6LQxgT6eT8v1C"
    model.create_entity(
        "IfcProject", GlobalId="3JYqfQ6zP6LQxgT6eT8v1D", Name="Unfamiliar clinic project"
    )
    model.create_entity(
        "IfcWall",
        GlobalId=stable_id,
        Name="Clinic partition revised" if revised else "Clinic partition",
    )
    model.create_entity(
        "IfcWall",
        GlobalId=added_id if revised else removed_id,
        Name="New service wall" if revised else "Temporary wall",
    )
    model.write(str(path))
    return len(model.by_type("IfcElement"))


def test_real_ortools_capacity_precedence_and_qualification():
    pytest.importorskip("ortools")
    problem = coordination_fixture()
    result = ORToolsResolver().solve(problem)
    assert result.status == "OPTIMAL"
    assert result.makespan == 9  # Seven exclusive lift hours, then two inspection hours.
    validate_solution(problem, result)
    assert result.proposal_only


def test_real_ortools_explicit_infeasible_window():
    pytest.importorskip("ortools")
    problem = coordination_fixture()
    tasks = tuple(task.model_copy(update={"latest_end": 6}) for task in problem.tasks)
    constrained = problem.model_copy(update={"tasks": tasks})
    result = ORToolsResolver().solve(constrained)
    assert result.status == "INFEASIBLE"
    assert not result.assignments


def test_real_ifc_fixture_queries_and_geometry(tmp_path):
    ifcopenshell = pytest.importorskip("ifcopenshell")
    import ifcopenshell.geom as ifc_geom
    import ifcopenshell.validate as ifc_validate

    v16_path = generate_ifc_fixture(tmp_path / "fixture-v16.ifc", revision="V16")
    v17_path = generate_ifc_fixture(tmp_path / "fixture-v17.ifc", revision="V17")
    provider = IfcOpenShellBIMProvider(v16_path)
    elements = provider.elements()
    assert {e.id for e in elements} == {WALL_GUID, DUCT_GUID, TRAY_GUID}
    assert {e.id for e in provider.elements(location="L02-E")} == {WALL_GUID, DUCT_GUID}
    assert provider.elements(element_id=DUCT_GUID)[0].type == "IfcDuctSegment"
    assert len(provider.by_property("CCA_Coordination", "DrawingRevision", "V16")) == 3
    assert {e.id for e in provider.elements(location="L02-E-ZONE")} == {WALL_GUID, DUCT_GUID}
    assert all(e.revision == hashlib.sha256(v16_path.read_bytes()).hexdigest() for e in elements)
    assert {e.id for e in LocalIFCImporter().parse(v16_path.read_bytes())} == {
        e.id for e in elements
    }
    # Shared contract: stable IDs, types and spatial locations, not identical property
    # serialization.
    structured = {e.id: e for e in StructuredBIMProvider().elements()}
    for element in elements:
        assert (element.type, element.storey) == (
            structured[element.id].type,
            structured[element.id].storey,
        )
    models = [ifcopenshell.open(str(path)) for path in (v16_path, v17_path)]
    for model in models:
        logger = ifcopenshell.validate.json_logger()
        ifc_validate.validate(model, logger)
        assert not logger.statements, logger.statements
        shape = ifc_geom.create_shape(ifc_geom.settings(), model.by_guid(WALL_GUID))
        assert len(shape.geometry.verts) > 0
    v17_provider = IfcOpenShellBIMProvider(v17_path)
    changed_wall = v17_provider.elements(element_id=WALL_GUID)[0]
    assert changed_wall.space == "L02-E-ZONE"
    assert changed_wall.properties["CCA_Coordination"]["DrawingRevision"] == "V17"
    assert changed_wall.properties["CCA_Coordination"]["ChangeStatus"] == "changed"
    changed_duct = v17_provider.elements(element_id=DUCT_GUID)[0]
    assert changed_duct.properties["CCA_Coordination"]["ChangeStatus"] == "affected"
    assert changed_wall.properties["CCA_Coordination"]["WorkPackageIds"] == "WP-100,WP-200"
    assert changed_duct.properties["CCA_Coordination"]["WorkPackageIds"] == "WP-200"
    assert (
        models[1].by_guid(WALL_GUID).ObjectPlacement.RelativePlacement.Location.Coordinates[0]
        == 0.6
    )


def test_real_ifc_rejects_malformed_input(tmp_path):
    pytest.importorskip("ifcopenshell")
    path = tmp_path / "bad.ifc"
    path.write_text("not an IFC file")
    with pytest.raises(ProviderError):
        IfcOpenShellBIMProvider(path).elements()


@pytest.mark.parametrize("schema", ["IFC4", "IFC2X3"])
def test_official_ifcdiff_normalizes_revision_changes(tmp_path, schema, record_property):
    pytest.importorskip("ifcdiff")
    old_path = tmp_path / f"clinic-{schema}-r1.ifc"
    new_path = tmp_path / f"clinic-{schema}-r2.ifc"
    old_count = _write_comparison_fixture(old_path, schema, revised=False)
    new_count = _write_comparison_fixture(new_path, schema, revised=True)

    started = time.perf_counter()
    old_elements = LocalIFCImporter().parse(old_path.read_bytes())
    old_import_seconds = time.perf_counter() - started
    started = time.perf_counter()
    new_elements = LocalIFCImporter().parse(new_path.read_bytes())
    new_import_seconds = time.perf_counter() - started
    result = OfficialIfcDiffEngine().compare(old_path.read_bytes(), new_path.read_bytes())

    assert len(old_elements) == old_count == 2
    assert len(new_elements) == new_count == 2
    assert result.engine == "ifcdiff"
    assert result.engine_version != "unknown"
    assert result.added == frozenset({"2JYqfQ6zP6LQxgT6eT8v1C"})
    assert result.deleted == frozenset({"1JYqfQ6zP6LQxgT6eT8v1B"})
    assert "attributes" in result.changed["0JYqfQ6zP6LQxgT6eT8v1A"]
    assert result.compare_seconds > 0
    record_property("ifc_schema", schema)
    record_property("from_element_count", old_count)
    record_property("to_element_count", new_count)
    record_property("from_import_seconds", old_import_seconds)
    record_property("to_import_seconds", new_import_seconds)
    record_property("compare_seconds", result.compare_seconds)


def test_official_ifcdiff_reports_missing_sdk(monkeypatch):
    def missing(_name):
        raise ImportError

    monkeypatch.setattr("app.adapters.ifc_diff.import_module", missing)
    with pytest.raises(CapabilityUnavailable):
        OfficialIfcDiffEngine().compare(b"old", b"new")


def test_official_ifcdiff_rejects_malformed_revisions():
    pytest.importorskip("ifcdiff")
    with pytest.raises(ProviderError):
        OfficialIfcDiffEngine().compare(b"not an IFC", b"also not an IFC")


def test_real_docling_preserves_source_and_item_location():
    pytest.importorskip("docling")
    path = Path(__file__).resolve().parents[3] / "fixtures" / "coordination-notice.html"
    chunks = DoclingDocumentParser().parse(path.read_bytes(), path.name)
    assert any("V17" in c.text for c in chunks)
    assert all(c.source_hash == hashlib.sha256(path.read_bytes()).hexdigest() for c in chunks)
    assert all(c.location and c.parser == "docling-local-no-ocr" for c in chunks)
    assert all(c.page is None for c in chunks)  # HTML has no real physical pages.


def test_real_docling_pdf_preserves_physical_pages_and_rejects_truncation():
    pytest.importorskip("docling")
    path = Path(__file__).resolve().parents[3] / "fixtures/coordination-notice.pdf"
    content = path.read_bytes()
    chunks = DoclingDocumentParser().parse(content, path.name)
    assert any("PDF-PAGE-ONE-V17" in chunk.text and chunk.page == 1 for chunk in chunks)
    assert any("PDF-PAGE-TWO-QC" in chunk.text and chunk.page == 2 for chunk in chunks)
    assert all(chunk.source_hash == hashlib.sha256(content).hexdigest() for chunk in chunks)
    assert all(chunk.location and chunk.parser == "docling-local-no-ocr" for chunk in chunks)
    with pytest.raises(ProviderError):
        DoclingDocumentParser(max_pages=1).parse(content, path.name)


def test_ifctester_result_exposes_requirements_aware_cache_identity():
    pytest.importorskip("ifcopenshell")
    pytest.importorskip("ifctester")
    fixture = Path(__file__).resolve().parents[3] / "fixtures" / "coordination-project"
    ifc = (fixture / "R1" / "structure.ifc").read_bytes()
    ids = (fixture / "R1" / "requirements.ids").read_bytes()
    result = IfcTesterAdapter().validate(ifc, ids, source_id="structure", source_revision_id="R1")
    assert result.cache_key == ids_cache_key(
        source_hash=result.source_hash,
        requirements_hash=result.requirements_hash,
        engine=result.engine,
        engine_version=result.engine_version,
    )


@pytest.mark.parametrize("mode", ["intersection", "collision", "clearance"])
def test_real_ifc_clash_source_orientation_and_paired_publication(mode):
    pytest.importorskip("ifcclash")
    fixture = Path(__file__).resolve().parents[3] / "fixtures" / "coordination-project"
    first = (fixture / "R2/structure.ifc").read_bytes()
    second = (fixture / "R1/mep.ifc").read_bytes()
    if mode == "collision":
        # The baseline duct is fully contained in the beam. Collision checks
        # surface crossings; use the existing qualified partially crossing placement.
        import ifcopenshell
        import ifcopenshell.api
        import numpy as np

        model = ifcopenshell.file.from_string(second.decode())
        placement = np.eye(4)
        placement[:3, 3] = (3.0, 0.1, 1.5)
        ifcopenshell.api.run(
            "geometry.edit_object_placement",
            model,
            product=model.by_type("IfcDuctSegment")[0],
            matrix=placement,
            is_si=True,
        )
        second = model.to_string().encode()
    result = IfcClashAdapter().run(
        first,
        second,
        source_id="structure",
        source_revision_id="structure-r2",
        comparison_source_id="mep",
        comparison_revision_id="mep-r1",
        selector_first="IfcBeam",
        selector_second="IfcDuctSegment",
        mode=mode,
        clearance=0.1,
    )
    assert result.source_hash == hashlib.sha256(first).hexdigest()
    assert result.comparison_source_hash == hashlib.sha256(second).hexdigest()
    assert result.parameters.selector_second == "IfcDuctSegment"
    assert len(result.evidence) == 1
    output = clash_publication(result, snapshot_id="snapshot", operation_id="ifc-clash")
    first_evidence, second_evidence = output.evidence
    assert first_evidence.source_id == "structure"
    assert first_evidence.viewer_target.global_ids == ("3M0KwyPFrBT9KwklhqZa8W",)
    assert second_evidence.source_id == "mep"
    assert second_evidence.viewer_target.global_ids == ("0wJm_7P3jD4uBWYGw9xyVx",)
    assert first_evidence.source_revision == result.source_hash
    assert second_evidence.source_revision == result.comparison_source_hash
    assert clash_publication(result, snapshot_id="snapshot", operation_id="ifc-clash") == output


@pytest.mark.parametrize("capability", ["clash", "ids"])
def test_real_ifc_provider_recheck_acceptance(tmp_path, admin, capability):
    """Make persisted C-provider acceptance mandatory in the existing IFC SDK lane."""
    from test_engineering_provider_runtime import (
        test_real_ids_selected_originals_positive_evidence_and_failure,
        test_real_pair_publication_cache_parameter_restart_and_r3,
    )

    if capability == "clash":
        test_real_pair_publication_cache_parameter_restart_and_r3(tmp_path, admin)
    else:
        test_real_ids_selected_originals_positive_evidence_and_failure(tmp_path, admin)
