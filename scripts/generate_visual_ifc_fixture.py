"""Generate a real IFC model for visual review of Concord's spatial workspace.

This is a synthetic MEP scene, not a screenshot or a backend demo contract.
Run: .venv/bin/python scripts/generate_visual_ifc_fixture.py
"""

from pathlib import Path

import ifcopenshell
import ifcopenshell.api
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
model = ifcopenshell.open(str(ROOT / "fixtures/harbor-east-v17.ifc"))
run = ifcopenshell.api.run
body = next(item for item in model.by_type("IfcGeometricRepresentationSubContext") if item.ContextIdentifier == "Body")
space = next(item for item in model.by_type("IfcSpace") if item.Name == "L02-E-ZONE")


def surface(name: str, rgb: tuple[float, float, float], transparency: float = 0):
    style = run("style.add_style", model, name=name)
    run("style.add_surface_style", model, style=style, attributes={
        "SurfaceColour": dict(zip(("Red", "Green", "Blue"), rgb)),
        "Transparency": transparency,
    })
    return style


styles = {
    "IfcSlab": surface("Concrete floor", (0.84, 0.87, 0.89), 0.64),
    "IfcWall": surface("Quiet partitions", (0.88, 0.90, 0.92), 0.48),
    "IfcBeam": surface("Steel beams", (0.68, 0.73, 0.76), 0.4),
    "IfcColumn": surface("Columns", (0.77, 0.81, 0.84), 0.38),
    "IfcUnitaryEquipment": surface("Mechanical equipment", (0.42, 0.56, 0.65)),
    "IfcDuctSegment": surface("Galvanized ducts", (0.57, 0.69, 0.75), 0.14),
    "IfcCableCarrierSegment": surface("Cable trays", (0.63, 0.64, 0.63)),
    "IfcPipeSegment": surface("Fire protection", (0.67, 0.34, 0.31)),
}


def block(kind: str, name: str, size: tuple[float, float, float], at: tuple[float, float, float], angle: float = 0):
    product = run("root.create_entity", model, ifc_class=kind, name=name)
    run("spatial.assign_container", model, products=[product], relating_structure=space)
    representation = run("geometry.add_wall_representation", model, context=body, length=size[0], thickness=size[1], height=size[2])
    run("geometry.assign_representation", model, product=product, representation=representation)
    run("style.assign_representation_styles", model, shape_representation=representation, styles=[styles[kind]])
    matrix = np.eye(4)
    if angle:
        matrix[:2, :2] = [[0, -1], [1, 0]]
    matrix[:3, 3] = at
    run("geometry.edit_object_placement", model, product=product, matrix=matrix, is_si=True)
    return product


# Building shell, visible partitions and columns frame the mechanical plant.
block("IfcSlab", "Level 2 slab", (28, 19, 0.18), (-4, -5, 3.4))
for x in (-3, 4, 13, 23):
    for y in (-4, 4, 13):
        block("IfcColumn", f"Column {x}:{y}", (0.28, 0.28, 4.0), (x, y, 3.6))
for x, y, length, angle in ((-4, -5, 28, 0), (-4, 14, 28, 0), (-4, -5, 19, 1), (24, -5, 19, 1), (4, -4, 17, 1), (13, -4, 17, 1), (-3, 4, 26, 0)):
    block("IfcWall", f"Partition {x}:{y}", (length, 0.13, 1.45), (x, y, 3.6), angle)
for y in (0, 7, 12):
    for x in (-3, 4, 13):
        block("IfcBeam", f"Overhead beam {x}:{y}", (9, 0.24, 0.26), (x, y, 7.3))

# Two rectangular air-handling units with a branching supply/return duct network.
block("IfcUnitaryEquipment", "AHU-01", (5.2, 2.4, 1.8), (7, 5, 4.8))
block("IfcUnitaryEquipment", "AHU-02", (3.6, 1.8, 1.4), (16, 5.5, 4.8))
for i, y in enumerate((1, 3, 9, 11)):
    block("IfcDuctSegment", f"Supply duct {i:02}", (24, 0.7, 0.55), (-3, y, 6.1))
    for j, x in enumerate((0, 5, 14, 20)):
        block("IfcDuctSegment", f"Duct branch {i:02}-{j:02}", (4.2, 0.4, 0.38), (x, y, 6.1), 1)
for x in (2, 10, 19):
    block("IfcCableCarrierSegment", f"Cable tray {x}", (17, 0.2, 0.14), (x, -3, 7.0), 1)
for i, y in enumerate((-1, 4, 12)):
    block("IfcPipeSegment", f"Fire protection pipe {i}", (26, 0.08, 0.08), (-3, y, 7.0))

output = ROOT / "fixtures/concord-review.ifc"
model.write(str(output))
print(f"{output}: {len(model.by_type('IfcProduct'))} IFC products")
