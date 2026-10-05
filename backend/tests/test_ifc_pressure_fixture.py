"""Real IFC pressure source invariants; no browser/detector result is fabricated."""

import hashlib
import importlib.util
import sys
from pathlib import Path

import pytest

pytestmark = pytest.mark.integration


@pytest.fixture
def generator():
    pytest.importorskip("ifcopenshell")
    scripts = Path(__file__).resolve().parents[2] / "scripts"
    spec = importlib.util.spec_from_file_location(
        "pressure_fixture", scripts / "generate_ifc_pressure_fixture.py"
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(scripts))
    try:
        spec.loader.exec_module(module)
    finally:
        sys.path.remove(str(scripts))
    return module


def test_pressure_source_is_reproducible_and_has_distinct_geometry(generator, tmp_path):
    import ifcopenshell
    import ifcopenshell.geom
    import ifcopenshell.util.placement

    first = tmp_path / "a" / "pressure.ifc"
    second = tmp_path / "b" / "pressure.ifc"
    manifest = generator.create_pressure_model(first, 12)
    assert generator.create_pressure_model(second, 12) == manifest
    assert first.read_bytes() == second.read_bytes()
    assert manifest["sha256"] == hashlib.sha256(first.read_bytes()).hexdigest()
    assert manifest["sourceBytes"] == first.stat().st_size
    model = ifcopenshell.open(str(first))
    beams = model.by_type("IfcBeam")
    assert len(beams) == 12
    assert len({beam.GlobalId for beam in beams}) == 12
    assert len({beam.Representation.id() for beam in beams}) == 12
    assert len({beam.Representation.Representations[0].Items[0].id() for beam in beams}) == 12
    assert set(manifest["targetGlobalIds"]) == {beams[0].GlobalId, beams[-1].GlobalId}
    assert set(model.by_type("IfcRelContainedInSpatialStructure")[0].RelatedElements) == set(beams)
    placements = [
        ifcopenshell.util.placement.get_local_placement(beam.ObjectPlacement) for beam in beams
    ]
    assert len({tuple(matrix[:3, 3]) for matrix in placements}) == 12
    settings = ifcopenshell.geom.settings()
    for beam in (beams[0], beams[-1]):
        assert len(ifcopenshell.geom.create_shape(settings, beam).geometry.verts) > 0


@pytest.mark.parametrize("count", [0, -1, 100_001])
def test_pressure_size_rejects_before_writing(generator, tmp_path, count):
    with pytest.raises(ValueError, match="element count"):
        generator.create_pressure_model(tmp_path / "pressure.ifc", count)
    assert list(tmp_path.iterdir()) == []


def test_mixed_geometry_is_reproducible_and_real(generator, tmp_path):
    import ifcopenshell
    import ifcopenshell.geom
    import ifcopenshell.util.placement
    from ifcopenshell.util.shape import get_volume

    first = tmp_path / "a" / "pressure.ifc"
    second = tmp_path / "b" / "pressure.ifc"
    manifest = generator.create_pressure_model(first, 132, geometry_mode="mixed")
    assert generator.create_pressure_model(second, 132, geometry_mode="mixed") == manifest
    assert first.read_bytes() == second.read_bytes()
    assert manifest["nestedPlacementGroups"] == 2
    model = ifcopenshell.open(str(first))
    beams = model.by_type("IfcBeam")
    assert len(beams) == 132
    assert len({beam.GlobalId for beam in beams}) == 132
    expected = beams[:4] + beams[-4:]
    assert manifest["targetGlobalIds"] == [beam.GlobalId for beam in expected]
    assert (
        beams[1]
        .Representation.Representations[0]
        .Items[0]
        .SweptArea.is_a("IfcCircleHollowProfileDef")
    )
    assert beams[2].Representation.Representations[0].Items[0].is_a("IfcBooleanResult")
    assert beams[3].Representation.Representations[0].Items[0].is_a("IfcMappedItem")
    settings = ifcopenshell.geom.settings()
    volumes = []
    for beam in expected:
        shape = ifcopenshell.geom.create_shape(settings, beam)
        geometry = shape.geometry
        assert len(geometry.verts) > 0 and len(geometry.faces) > 0
        volumes.append(get_volume(geometry))
    assert all(volume > 0 for volume in volumes)
    # The opening subtracts material from the real box, while mapping scales it up.
    box2 = beams[2].Representation.Representations[0].Items[0].FirstOperand
    assert volumes[2] < 4.0 * 0.6 * box2.Depth
    assert volumes[3] > volumes[0]
    placement = ifcopenshell.util.placement.get_local_placement(beams[-1].ObjectPlacement)
    assert beams[-1].ObjectPlacement.PlacementRelTo is not None
    assert placement[2, 3] == 5.0
    assert abs(placement[0, 1]) > 0.1


@pytest.mark.parametrize("count, mode", [(3, "mixed"), (12, "unknown")])
def test_invalid_geometry_mode_rejects_before_writing(generator, tmp_path, count, mode):
    with pytest.raises(ValueError, match="Mixed geometry"):
        generator.create_pressure_model(tmp_path / "pressure.ifc", count, geometry_mode=mode)
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("mode", ["grid", "mixed"])
def test_pressure_cli_writes_requested_geometry_and_manifest(
    generator, tmp_path, monkeypatch, mode
):
    import json

    destination = tmp_path / "cli" / "pressure.ifc"
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "generate_ifc_pressure_fixture.py",
            "--output",
            str(destination),
            "--elements",
            "12",
            "--geometry",
            mode,
        ],
    )
    generator.main()
    manifest = json.loads(destination.with_suffix(".json").read_text())
    assert manifest["elementCount"] == 12
    assert manifest["sha256"] == hashlib.sha256(destination.read_bytes()).hexdigest()
    assert manifest["sourceBytes"] == destination.stat().st_size
    assert manifest["geometry"].startswith("extrusions" if mode == "mixed" else "distinct")
