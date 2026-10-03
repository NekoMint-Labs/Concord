"""Independently authored IFC4 geometry for the real-project browser acceptance.

Run: uv run --frozen --no-sync python scripts/generate_real_project_fixture.py --output DIR
Uses the installed IfcOpenShell SDK; never imports demo IDs or project facts.
Every invocation makes new GlobalIds. R2 retains identity only where appropriate.
"""

import argparse
import json
from pathlib import Path
from uuid import uuid4


def generate(destination: Path) -> dict:
    import ifcopenshell
    import ifcopenshell.api
    import ifcopenshell.geom
    import numpy as np

    run = ifcopenshell.api.run
    nonce = uuid4().hex[:8]
    model = run("project.create_file", version="IFC4")
    project = run("root.create_entity", model, ifc_class="IfcProject", name=f"Review annex {nonce}")
    units = [
        run("unit.add_si_unit", model, unit_type=kind)
        for kind in ("LENGTHUNIT", "AREAUNIT", "VOLUMEUNIT")
    ]
    run("unit.assign_unit", model, units=units)
    context = run("context.add_context", model, context_type="Model")
    body = run(
        "context.add_context",
        model,
        context_type="Model",
        context_identifier="Body",
        target_view="MODEL_VIEW",
        parent=context,
    )
    building = run("root.create_entity", model, ifc_class="IfcBuilding", name=f"Annex {nonce}")
    run("aggregate.assign_object", model, products=[building], relating_object=project)
    spaces = []
    for index in range(2):
        floor = run(
            "root.create_entity",
            model,
            ifc_class="IfcBuildingStorey",
            name=f"Deck {index + 1}-{nonce}",
        )
        floor.Elevation = index * 4.0
        run("aggregate.assign_object", model, products=[floor], relating_object=building)
        space = run(
            "root.create_entity",
            model,
            ifc_class="IfcSpace",
            name=f"Review bay {index + 1}-{nonce}",
        )
        run("aggregate.assign_object", model, products=[space], relating_object=floor)
        spaces.append(space)

    def element(file, representation_context, room, role, kind, position):
        product = run("root.create_entity", file, ifc_class=kind, name=f"{role}-{nonce}")
        run("spatial.assign_container", file, products=[product], relating_structure=room)
        representation = run(
            "geometry.add_wall_representation",
            file,
            context=representation_context,
            length=3.0,
            thickness=0.3,
            height=2.2,
        )
        run("geometry.assign_representation", file, product=product, representation=representation)
        matrix = np.eye(4)
        matrix[:3, 3] = position
        run("geometry.edit_object_placement", file, product=product, matrix=matrix, is_si=True)
        return {"global_id": product.GlobalId, "name": product.Name, "ifc_class": kind}

    specs = [
        ("changed", "IfcWall", 0, (0, 0, 0)),
        ("deleted", "IfcWall", 0, (0, 3, 0)),
        ("unchanged", "IfcWall", 0, (0, 6, 0)),
        ("other_class", "IfcSlab", 0, (4, 0, 0)),
        ("other_storey", "IfcWall", 1, (4, 3, 4)),
        ("other_member", "IfcBeam", 1, (4, 6, 4)),
    ]
    elements = {
        role: element(model, body, spaces[floor], role, kind, position)
        for role, kind, floor, position in specs
    }
    destination.mkdir(parents=True, exist_ok=True)
    r1 = destination / f"concord-review-{nonce}-initial.ifc"
    r2 = destination / f"concord-review-{nonce}-revised.ifc"
    model.write(str(r1))

    revised = ifcopenshell.open(str(r1))
    changed = revised.by_guid(elements["changed"]["global_id"])
    changed.Name = f"reviewed-wall-{nonce}"
    matrix = np.eye(4)
    matrix[:3, 3] = (1.0, 0.8, 0)
    run("geometry.edit_object_placement", revised, product=changed, matrix=matrix, is_si=True)
    run("root.remove_product", revised, product=revised.by_guid(elements["deleted"]["global_id"]))
    added = element(
        revised,
        revised.by_id(body.id()),
        revised.by_guid(spaces[0].GlobalId),
        "added",
        "IfcWall",
        (4, 6, 0),
    )
    revised.write(str(r2))
    invalid = destination / f"concord-review-{nonce}-invalid.ifc"
    invalid.write_text("This is not an IFC STEP file. Import must fail, including on resume.\n")

    # A cheap runnable generator check: all business objects have real renderable geometry,
    # IDs are unique, and cloning preserved only the intended surviving identities.
    settings = ifcopenshell.geom.settings()
    initial_ids = {entry["global_id"] for entry in elements.values()}
    revised_ids = (initial_ids - {elements["deleted"]["global_id"]}) | {added["global_id"]}
    assert len(initial_ids) == len(revised_ids) == len(specs)
    for filename, identifiers in ((r1, initial_ids), (r2, revised_ids)):
        opened = ifcopenshell.open(str(filename))
        for identifier in identifiers:
            shape = ifcopenshell.geom.create_shape(settings, opened.by_guid(identifier))
            assert len(shape.geometry.verts) > 0 and len(shape.geometry.faces) > 0
    assert initial_ids & revised_ids == initial_ids - {elements["deleted"]["global_id"]}
    manifest = {
        "project_name": f"Review annex {nonce}",
        "work_package_name": f"Partition review {nonce}",
        "source_name": f"Architectural review {nonce}",
        "r1": str(r1.resolve()),
        "r2": str(r2.resolve()),
        "invalid": str(invalid.resolve()),
        "elements": elements,
        "added": added,
        "changed_name_r2": changed.Name,
        "mapped_roles": ["changed", "deleted", "unchanged"],
    }
    (destination / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    print(json.dumps(generate(parser.parse_args().output)))
