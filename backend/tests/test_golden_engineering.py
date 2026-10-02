"""Permanent Golden sources exercised through real engineering providers."""

import hashlib
import json
import time
from pathlib import Path

import pytest
from app.adapters.bim_ifc import LocalIFCImporter
from app.adapters.documents_docling import DoclingDocumentParser
from app.adapters.ifc_clash import IfcClashAdapter
from app.adapters.ifc_diff import OfficialIfcDiffEngine
from app.adapters.ifc_tester import IfcTesterAdapter

FIXTURE = Path(__file__).resolve().parents[2] / "fixtures" / "coordination-project"
BEAM = "3M0KwyPFrBT9KwklhqZa8W"
DUCT = "0wJm_7P3jD4uBWYGw9xyVx"


def test_golden_sources_match_committed_manifest():
    manifest = json.loads((FIXTURE / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["synthetic"] is True
    assert manifest["global_ids"] == {"beam": BEAM, "duct": DUCT}
    assert len(manifest["sha256"]) == 17
    for filename, digest in manifest["sha256"].items():
        assert hashlib.sha256((FIXTURE / filename).read_bytes()).hexdigest() == digest


@pytest.mark.integration
def test_golden_ifc_sources_import_diff_and_clear_targeted_clash(tmp_path):
    pytest.importorskip("ifcclash")
    pytest.importorskip("ifcdiff")
    from ifcopenshell import file, validate

    sources = {
        name: (FIXTURE / name).read_bytes()
        for name in ("R1/structure.ifc", "R2/structure.ifc", "R1/mep.ifc", "R3/mep.ifc")
    }
    metrics = {"engine": "ifcclash", "engine_version": "0.8.5", "sources": {}, "clash": {}}
    for filename, content in sources.items():
        logger = validate.json_logger()
        validate.validate(file.from_string(content.decode()), logger)
        assert not logger.statements, logger.statements
        started = time.perf_counter()
        elements = LocalIFCImporter().parse(content)
        metrics["sources"][filename] = {
            "element_count": len(elements),
            "parse_seconds": time.perf_counter() - started,
        }
        assert len(elements) == 1
        assert elements[0].id == (BEAM if "structure" in filename else DUCT)
    for first, second, expected in (
        ("R1/structure.ifc", "R2/structure.ifc", BEAM),
        ("R1/mep.ifc", "R3/mep.ifc", DUCT),
    ):
        diff = OfficialIfcDiffEngine().compare(sources[first], sources[second])
        assert "geometry" in diff.changed[expected]
        assert not diff.added and not diff.deleted
        metrics["sources"][second]["diff_seconds"] = diff.compare_seconds
    for structure, mep, label, count in (
        ("R1/structure.ifc", "R1/mep.ifc", "baseline", 0),
        ("R2/structure.ifc", "R1/mep.ifc", "enlarged_beam", 1),
        ("R2/structure.ifc", "R3/mep.ifc", "rerouted_duct", 0),
    ):
        result = IfcClashAdapter().run(
            sources[structure],
            sources[mep],
            source_id="structure",
            comparison_source_id="mep",
            source_revision_id=structure,
            comparison_revision_id=mep,
            selector_first="IfcBeam",
            selector_second="IfcDuctSegment",
        )
        assert len(result.changes) == count
        if count:
            assert set(result.evidence[0].element_ids) == {BEAM, DUCT}
            assert len(result.evidence[0].location) == 3
            assert result.evidence[0].source_revision_id == structure
            assert result.evidence[0].against_source_id == "mep"
            assert result.evidence[0].against_source_revision_id == mep
            assert result.evidence[0].engine_version == "0.8.5"
        metrics["clash"][label] = {"count": count, "seconds": result.elapsed_seconds}
    metrics["cache"] = "NOT_QUALIFIED: requires A-owned derived artifact integration"
    (tmp_path / "golden-ifc-metrics.json").write_text(
        json.dumps(metrics, indent=2), encoding="utf-8"
    )


@pytest.mark.integration
@pytest.mark.parametrize(
    "source", ["R1/structure.ifc", "R2/structure.ifc", "R1/mep.ifc", "R3/mep.ifc"]
)
def test_golden_ids_applies_naming_requirements_to_each_discipline(source):
    pytest.importorskip("ifctester")
    result = IfcTesterAdapter().validate(
        (FIXTURE / source).read_bytes(),
        (FIXTURE / "R1/requirements.ids").read_bytes(),
        source_id=source,
        source_revision_id=source.split("/")[0],
    )
    assert result.specifications == result.passed_specifications == 2
    assert result.failed_specifications == result.skipped_specifications == 0
    assert not result.violations


@pytest.mark.integration
def test_golden_docling_workbook_retains_sheets_cells_and_source_hash():
    pytest.importorskip("docling")
    content = (FIXTURE / "R1/coordination-log.xlsx").read_bytes()
    chunks = DoclingDocumentParser().parse(content, "coordination-log.xlsx")
    assert len(chunks) == 22
    assert all(chunk.source_hash == hashlib.sha256(content).hexdigest() for chunk in chunks)
    target = next(chunk for chunk in chunks if chunk.text == "Route moved; verify clearance")
    assert "Coordination/row:4/cell:C4" in target.location
    assert any("Requirements/row:3/cell:B3" in chunk.location for chunk in chunks)


@pytest.mark.integration
def test_golden_docling_change_document_preserves_table_cells_and_instruction():
    pytest.importorskip("docling")
    chunks = DoclingDocumentParser().parse(
        (FIXTURE / "R2/design-change-023.docx").read_bytes(), "design-change-023.docx"
    )
    assert any("Increase BEAM-01 depth from 300 mm to 900 mm" in chunk.text for chunk in chunks)
    assert any(
        chunk.text == "Reroute then verify" and "cell:C3" in chunk.location for chunk in chunks
    )
