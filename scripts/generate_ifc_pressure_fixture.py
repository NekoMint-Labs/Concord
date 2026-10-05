"""Generate reproducible synthetic IFC pressure sources, never detector outcomes."""

import argparse
import hashlib
import json
from math import ceil, sqrt
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from golden_ifc_fixture import create_model
from ifc_mixed_geometry_fixture import apply_mixed_geometry


def create_pressure_model(destination: Path, count: int, *, geometry_mode: str = "grid") -> dict:
    if not 1 <= count <= 100_000:
        raise ValueError("Pressure element count must be between 1 and 100000")

    if geometry_mode not in {"grid", "mixed"} or (geometry_mode == "mixed" and count < 4):
        raise ValueError("Mixed geometry requires at least four elements and a known mode")

    import ifcopenshell
    import ifcopenshell.guid
    from ifcopenshell.util.element import copy

    destination.parent.mkdir(parents=True, exist_ok=True)
    seed = destination.parent / "pressure-seed.ifc"
    create_model(seed, "structure", "R1")
    model = ifcopenshell.open(str(seed))
    template = model.by_type("IfcBeam")[0]
    container = model.by_type("IfcRelContainedInSpatialStructure")[0]
    width = ceil(sqrt(count))
    elements = []
    for index in range(count):
        element = template if index == 0 else copy(model, template)
        element.GlobalId = ifcopenshell.guid.compress(
            uuid5(NAMESPACE_URL, f"concord-pressure/beam/{index}").hex
        )
        element.Name = f"PRESSURE-BEAM-{index:06d}"
        point = model.create_entity(
            "IfcCartesianPoint", Coordinates=(6.0 * (index % width), 2.0 * (index // width), 2.0)
        )
        axis = model.create_entity("IfcAxis2Placement3D", Location=point)
        element.ObjectPlacement = model.create_entity("IfcLocalPlacement", RelativePlacement=axis)
        # Distinct solids and representations exercise geometry import, not only instancing.
        representation = copy(model, template.Representation)
        shape = copy(model, template.Representation.Representations[0])
        solid = copy(model, template.Representation.Representations[0].Items[0])
        solid.Depth = 0.3 + 0.001 * (index % 7)
        shape.Items = (solid,)
        representation.Representations = (shape,)
        element.Representation = representation
        elements.append(element)
    details = {}
    if geometry_mode == "mixed":
        details = apply_mixed_geometry(model, elements)
    container.RelatedElements = tuple(elements)
    model.header.file_name.name = "pressure.ifc"
    model.header.file_name.time_stamp = "2026-10-05T00:00:00"
    model.write(str(destination))
    content = destination.read_bytes()
    return {
        "synthetic": True,
        "elementCount": count,
        "geometry": "distinct extruded solids; shared rectangular profile; deterministic grid",
        "sourceBytes": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
        "targetGlobalIds": [elements[index].GlobalId for index in sorted({0, count - 1})],
        "ifcopenshellVersion": ifcopenshell.version,
        **details,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--elements", type=int, default=10_000)
    parser.add_argument("--geometry", choices=["grid", "mixed"], default="grid")
    args = parser.parse_args()
    manifest = create_pressure_model(args.output, args.elements, geometry_mode=args.geometry)
    args.output.with_suffix(".json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(manifest))


if __name__ == "__main__":
    main()
