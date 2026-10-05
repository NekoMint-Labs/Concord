"""Real engineering-engine qualification and fail-closed adapter tests."""

import io
import zipfile
from datetime import UTC, datetime
from uuid import UUID

import pytest
from app.adapters.bcf import BCFAdapter
from app.adapters.engineering_results import BCFClippingPlane, BCFComment, BCFViewpoint
from app.adapters.ifc_clash import IfcClashAdapter
from app.adapters.ifc_fixture import generate_ifc_fixture
from app.adapters.ifc_tester import IfcTesterAdapter
from app.domain.errors import DomainError, ProviderError


def ids_require_wall_name(value: str) -> bytes:
    from ifctester import ids
    from ifctester.ids import Attribute, Entity, Specification

    specification = Specification(name="Wall naming", minOccurs=1, ifcVersion=["IFC4"])
    specification.applicability = [Entity(name="IfcWall")]
    specification.requirements = [Attribute(name="Name", value=value)]
    document = ids.Ids(title="Golden requirements")
    document.specifications.append(specification)
    return local_ids_xml(document)


def local_ids_xml(document) -> bytes:
    from pathlib import Path

    from ifctester import ids
    from xmlschema import XMLSchema, etree_tostring

    schema = XMLSchema(Path(ids.__file__).with_name("ids.xsd"), allow="local", defuse="always")
    return etree_tostring(
        schema.encode(document.asdict()), namespaces={"": "http://standards.buildingsmart.org/IDS"}
    ).encode()


def test_ifctester_normalizes_real_ids_violation(tmp_path):
    pytest.importorskip("ifctester")
    model_path = generate_ifc_fixture(tmp_path / "model.ifc", revision="V16")
    result = IfcTesterAdapter().validate(
        model_path.read_bytes(),
        ids_require_wall_name("Missing wall name"),
        source_id="structure.ifc",
        source_revision_id="R1",
    )
    assert result.engine == "ifctester"
    assert result.specifications == 1
    assert result.failed_specifications == 1
    assert result.violations
    assert result.violations[0].global_id
    assert "does not match" in result.violations[0].reason


def test_ifctester_rejects_empty_input():
    with pytest.raises(DomainError):
        IfcTesterAdapter().validate(b"", b"", source_id="x", source_revision_id="R1")


def test_ifcclash_runs_targeted_real_revisions_and_reports_timing(tmp_path):
    pytest.importorskip("ifcclash")
    first = generate_ifc_fixture(tmp_path / "first.ifc", revision="V16")
    second = generate_ifc_fixture(tmp_path / "second.ifc", revision="V17")
    result = IfcClashAdapter().run(
        first.read_bytes(),
        second.read_bytes(),
        source_id="structure.ifc",
        source_revision_id="R1",
        comparison_revision_id="R2",
        selector_first="IfcWall",
        selector_second="IfcWall",
        mode="intersection",
    )
    assert result.engine == "ifcclash"
    assert result.elapsed_seconds >= 0
    assert all(change.source_revision_id == "R1" for change in result.changes)
    assert all(e.against_source_revision_id == "R2" for e in result.evidence)


@pytest.mark.parametrize("camera_kind", ["perspective", "orthogonal"])
def test_bcf_round_trip_preserves_selected_guids_and_viewpoint(camera_kind):
    pytest.importorskip("bcf")
    viewpoint = BCFViewpoint(
        source_id="structure.ifc",
        source_revision_id="R2",
        title="Beam review",
        selected_global_ids=("0JYqfQ6zP6LQxgT6eT8v1A",),
        position=(1.0, 2.0, 3.0),
        direction=(0.0, 1.0, -1.0),
        up=(0.0, 1.0, 1.0),
        snapshot_png=b"\x89PNG\r\n\x1a\nfixture-snapshot",
        clipping_planes=(BCFClippingPlane(location=(1.0, -2.0, 3.5), direction=(0.0, 0.0, -1.0)),),
        camera_kind=camera_kind,
        field_of_view=45.0,
        view_to_world_scale=4.0,
        topic_guid=UUID("11111111-1111-4111-8111-111111111111"),
        viewpoint_guid=UUID("22222222-2222-4222-8222-222222222222"),
        description="Beam enlargement requires coordination",
        comments=(
            BCFComment(
                guid=UUID("33333333-3333-4333-8333-333333333333"),
                author="reviewer@example.test",
                date=datetime(2026, 10, 2, tzinfo=UTC),
                text="Review the revised beam and duct route.",
                viewpoint_guid=UUID("22222222-2222-4222-8222-222222222222"),
                modified_author="editor@example.test",
                modified_date=datetime(2026, 10, 2, 1, tzinfo=UTC),
            ),
        ),
    )
    content = BCFAdapter().export_viewpoint(viewpoint)
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        assert "bcf.version" in archive.namelist()
    restored = BCFAdapter().import_viewpoints(
        content, source_id="structure.ifc", source_revision_id="R2"
    )
    assert restored[0].title == viewpoint.title
    assert restored[0].selected_global_ids == viewpoint.selected_global_ids
    assert restored[0].position == viewpoint.position
    assert restored[0].direction == viewpoint.direction
    assert restored[0].up == viewpoint.up
    assert restored[0].clipping_planes == viewpoint.clipping_planes
    assert restored[0].snapshot_png == viewpoint.snapshot_png
    assert restored[0].comments == viewpoint.comments
    assert restored[0].topic_guid == viewpoint.topic_guid
    assert restored[0].viewpoint_guid == viewpoint.viewpoint_guid
    assert restored[0].description == viewpoint.description
    assert restored[0].camera_kind == camera_kind
    if camera_kind == "orthogonal":
        assert restored[0].view_to_world_scale == 4.0
    else:
        assert restored[0].field_of_view == 45.0


def test_bcf_requires_a_title():
    with pytest.raises(DomainError):
        BCFAdapter().export_viewpoint(
            BCFViewpoint(source_id="x", source_revision_id="R1", title=" ")
        )


@pytest.mark.parametrize("mode", ["unknown", "", "full-model"])
def test_ifcclash_rejects_invalid_modes_before_loading_sdk(mode):
    with pytest.raises(DomainError, match="mode"):
        IfcClashAdapter().run(
            b"a",
            b"b",
            source_id="model",
            source_revision_id="R1",
            comparison_revision_id="R2",
            mode=mode,
        )


@pytest.mark.parametrize("option", [{"tolerance": -1}, {"clearance": float("nan")}])
def test_ifcclash_rejects_unsafe_numeric_options(option):
    with pytest.raises(DomainError, match="finite and nonnegative"):
        IfcClashAdapter().run(
            b"a",
            b"b",
            source_id="model",
            source_revision_id="R1",
            comparison_revision_id="R2",
            **option,
        )


def test_ifctester_reports_required_missing_entities_and_schema_skips(tmp_path):
    pytest.importorskip("ifctester")
    from ifctester import ids
    from ifctester.ids import Attribute, Entity, Specification

    requirement = ids.Ids(title="Applicability checks")
    missing = Specification(name="Required pipe", minOccurs=1, ifcVersion=["IFC4"])
    missing.applicability = [Entity(name="IFCPIPESEGMENT")]
    missing.requirements = [Attribute(name="Name", value="Expected pipe")]
    skipped = Specification(name="Other schema", minOccurs=1, ifcVersion=["IFC2X3"])
    skipped.applicability = [Entity(name="IFCWALL")]
    skipped.requirements = [Attribute(name="Name", value="Expected wall")]
    requirement.specifications = [missing, skipped]
    model = generate_ifc_fixture(tmp_path / "model.ifc", revision="V16")
    result = IfcTesterAdapter().validate(
        model.read_bytes(), requirement.to_string(), source_id="model", source_revision_id="R1"
    )
    assert result.failed_specifications == 1
    assert result.skipped_specifications == 1
    assert result.passed_specifications == 0
    assert result.violations[0].global_id is None
    assert "cardinality" in result.violations[0].reason


@pytest.mark.parametrize("payload", [b"not a zip", b"", b"x" * 33])
def test_bcf_rejects_invalid_or_oversized_archives(payload):
    with pytest.raises((DomainError, ProviderError)):
        BCFAdapter(max_bytes=32).import_viewpoints(
            payload, source_id="model", source_revision_id="R1"
        )


@pytest.mark.parametrize(
    "vectors", [{"direction": (0, 0, 0)}, {"up": (0, 0, -1)}, {"position": (float("inf"), 0, 0)}]
)
def test_bcf_rejects_invalid_camera_vectors(vectors):
    pytest.importorskip("bcf")
    values = {
        "source_id": "model",
        "source_revision_id": "R1",
        "title": "Review",
        "position": (0, 0, 1),
    }
    values.update(vectors)
    with pytest.raises(DomainError):
        BCFAdapter().export_viewpoint(BCFViewpoint(**values))


@pytest.mark.parametrize("mode", ["collision", "clearance"])
def test_ifcclash_golden_modes_and_filtered_sources(mode):
    pytest.importorskip("ifcclash")
    from pathlib import Path

    root = Path(__file__).resolve().parents[2] / "fixtures/coordination-project"
    mep_content = (root / "R1/mep.ifc").read_bytes()
    if mode == "collision":
        # Collision tests intersecting surfaces, not complete solid containment.
        import ifcopenshell
        import ifcopenshell.api
        import numpy as np

        model = ifcopenshell.file.from_string(mep_content.decode())
        placement = np.eye(4)
        placement[:3, 3] = (3.0, 0.1, 1.5)
        ifcopenshell.api.run(
            "geometry.edit_object_placement",
            model,
            product=model.by_type("IfcDuctSegment")[0],
            matrix=placement,
            is_si=True,
        )
        mep_content = model.to_string().encode()
    result = IfcClashAdapter().run(
        (root / "R2/structure.ifc").read_bytes(),
        mep_content,
        source_id="structure",
        source_revision_id="R2",
        comparison_source_id="mep",
        comparison_revision_id="R1",
        selector_first="IfcBeam",
        selector_second="IfcDuctSegment",
        mode=mode,
        clearance=0.1,
    )
    assert len(result.evidence) == 1
    assert result.evidence[0].source_revision_id == "R2"
    assert result.evidence[0].against_source_id == "mep"
    assert result.evidence[0].against_source_revision_id == "R1"


def test_ifcclash_rejects_oversized_sources_before_loading_sdk():
    with pytest.raises(DomainError, match="byte limit"):
        IfcClashAdapter(max_bytes=2).run(
            b"large",
            b"small",
            source_id="model",
            source_revision_id="R1",
            comparison_revision_id="R2",
        )


def test_engineering_modules_do_not_load_optional_engines_on_import():
    import os
    import subprocess
    import sys
    from pathlib import Path

    root = Path(__file__).resolve().parents[2]
    environment = {**os.environ, "PYTHONPATH": str(root / "backend")}
    subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys; from app.adapters import bcf, ifc_clash, ifc_tester, documents_docling, "
            "engineering_verification, clash_geometry_scope, engineering_capabilities; "
            "assert not {'bcf', 'ifcclash', 'ifctester', 'ifcopenshell', "
            "'docling', 'rapidocr', 'onnxruntime'} "
            ".intersection(sys.modules)",
        ],
        cwd=root,
        env=environment,
        check=True,
        capture_output=True,
    )


def test_ifctester_does_not_fetch_uploaded_schema_hints_or_w3c_imports(monkeypatch):
    pytest.importorskip("ifctester")
    import urllib.request
    from pathlib import Path

    original_open = urllib.request.OpenerDirector.open

    def refuse_network(opener, url, *args, **kwargs):
        address = url.full_url if isinstance(url, urllib.request.Request) else str(url)
        if not address.startswith("file:"):
            raise AssertionError(f"IDS validation attempted network access: {address}")
        return original_open(opener, url, *args, **kwargs)

    monkeypatch.setattr(urllib.request.OpenerDirector, "open", refuse_network)
    root = Path(__file__).resolve().parents[2] / "fixtures/coordination-project"
    xml = (
        (root / "R1/requirements.ids")
        .read_bytes()
        .replace(
            b"http://standards.buildingsmart.org/IDS/1.0/ids.xsd",
            b"https://example.test/untrusted.xsd",
        )
    )
    result = IfcTesterAdapter().validate(
        (root / "R1/structure.ifc").read_bytes(),
        xml,
        source_id="structure",
        source_revision_id="R1",
    )
    assert result.passed_specifications == 2


@pytest.mark.parametrize(
    "ids_content",
    [b"invalid XML", b'<!DOCTYPE ids [<!ENTITY x SYSTEM "file:///private">]><ids>&x;</ids>'],
)
def test_ifctester_rejects_invalid_xml_and_external_entities(ids_content):
    pytest.importorskip("ifctester")
    from pathlib import Path

    root = Path(__file__).resolve().parents[2] / "fixtures/coordination-project"
    with pytest.raises(ProviderError):
        IfcTesterAdapter().validate(
            (root / "R1/structure.ifc").read_bytes(),
            ids_content,
            source_id="structure",
            source_revision_id="R1",
        )


@pytest.mark.parametrize(
    "planes",
    [
        (BCFClippingPlane(location=(0, 0, 0), direction=(0, 0, 0)),),
        (BCFClippingPlane(location=(float("inf"), 0, 0), direction=(1, 0, 0)),),
        (BCFClippingPlane(location=(0, 0, 0), direction=(1, 0, 0)),) * 33,
    ],
)
def test_bcf_clipping_failure_precedes_export(planes):
    with pytest.raises(DomainError):
        BCFAdapter().export_viewpoint(
            BCFViewpoint(
                source_id="model",
                source_revision_id="R1",
                title="Review",
                position=(0, 0, 3),
                direction=(0, 0, -1),
                up=(0, 1, 0),
                clipping_planes=planes,
            )
        )
