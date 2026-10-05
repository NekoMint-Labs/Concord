"""Original small IFC coordination story authored through IfcOpenShell's API."""

from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

BEAM_GUID = "3M0KwyPFrBT9KwklhqZa8W"
DUCT_GUID = "0wJm_7P3jD4uBWYGw9xyVx"


def create_model(destination: Path, discipline: str, revision: str) -> Path:
    import ifcopenshell.api
    import ifcopenshell.guid
    import numpy as np

    run = ifcopenshell.api.run
    model = run("project.create_file", version="IFC4")
    project = run("root.create_entity", model, ifc_class="IfcProject", name="Golden Coordination")
    units = [
        run("unit.add_si_unit", model, unit_type=kind)
        for kind in ("LENGTHUNIT", "AREAUNIT", "VOLUMEUNIT")
    ]
    assignment = run("unit.assign_unit", model, units=units)
    # IFC SET order is semantically irrelevant, but fixture bytes must be stable.
    assignment.Units = tuple(units)
    context = run("context.add_context", model, context_type="Model")
    body = run(
        "context.add_context",
        model,
        context_type="Model",
        context_identifier="Body",
        target_view="MODEL_VIEW",
        parent=context,
    )
    site = run("root.create_entity", model, ifc_class="IfcSite", name="Synthetic Site")
    building = run("root.create_entity", model, ifc_class="IfcBuilding", name="Building A")
    floor = run("root.create_entity", model, ifc_class="IfcBuildingStorey", name="Level 01")
    for parent, child in ((project, site), (site, building), (building, floor)):
        run("aggregate.assign_object", model, products=[child], relating_object=parent)
    structural = discipline == "structure"
    if structural:
        dimensions = (4.0, 0.6, 0.3 if revision == "R1" else 0.9)
        position = (0.0, 0.0, 2.0 if revision == "R1" else 1.4)
        kind, name, guid = "IfcBeam", "BEAM-01", BEAM_GUID
    else:
        dimensions = (2.0, 0.4, 0.4)
        position = (1.0, 1.5 if revision == "R3" else 0.1, 1.4)
        kind, name, guid = "IfcDuctSegment", "DUCT-01", DUCT_GUID
    element = run("root.create_entity", model, ifc_class=kind, name=name)
    run("spatial.assign_container", model, products=[element], relating_structure=floor)
    geometry = run(
        "geometry.add_wall_representation",
        model,
        context=body,
        length=dimensions[0],
        thickness=dimensions[1],
        height=dimensions[2],
    )
    run("geometry.assign_representation", model, product=element, representation=geometry)
    placement = np.eye(4)
    placement[:3, 3] = position
    run("geometry.edit_object_placement", model, product=element, matrix=placement, is_si=True)
    pset = run("pset.add_pset", model, product=element, name="Concord_Coordination")
    run(
        "pset.edit_pset",
        model,
        pset=pset,
        properties={"Discipline": discipline, "Synthetic": True, "DesignChange": "023"},
    )
    # Stable fixture identities include the relationships, not just visible products.
    for index, entity in enumerate(model.by_type("IfcRoot")):
        entity.GlobalId = ifcopenshell.guid.compress(
            uuid5(NAMESPACE_URL, f"concord-golden/{discipline}/{index}/{entity.is_a()}").hex
        )
    element.GlobalId = guid
    model.header.file_name.time_stamp = "2026-10-02T00:00:00"
    model.header.file_name.name = f"{discipline}.ifc"
    destination.parent.mkdir(parents=True, exist_ok=True)
    model.write(str(destination))
    return destination
