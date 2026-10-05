"""Mixed IFC geometry for opt-in viewer qualification, not a project benchmark."""

from math import cos, pi, sin


def apply_mixed_geometry(model, elements) -> dict:
    """Keep real IFC geometry and add four representations plus nested placements."""
    from ifcopenshell.util.element import copy

    origin = model.create_entity("IfcCartesianPoint", Coordinates=(0.0, 0.0, 0.0))
    axis = model.create_entity("IfcAxis2Placement3D", Location=origin)
    circle = model.create_entity(
        "IfcCircleHollowProfileDef", ProfileType="AREA", Radius=0.4, WallThickness=0.08
    )
    cutter_profile = model.create_entity("IfcCircleProfileDef", ProfileType="AREA", Radius=0.15)
    cutter_axis = model.create_entity(
        "IfcAxis2Placement3D",
        Location=model.create_entity("IfcCartesianPoint", Coordinates=(2.0, 0.3, -0.01)),
    )
    parents = {}
    for index, element in enumerate(elements):
        representation = element.Representation.Representations[0]
        solid = representation.Items[0]
        group = index // 128
        if group not in parents:
            angle = (group % 8) * pi / 8
            parent_axis = model.create_entity(
                "IfcAxis2Placement3D",
                Location=model.create_entity(
                    "IfcCartesianPoint", Coordinates=(0.0, 0.0, 3.0 * group)
                ),
                RefDirection=model.create_entity(
                    "IfcDirection", DirectionRatios=(cos(angle), sin(angle), 0.0)
                ),
            )
            parents[group] = model.create_entity("IfcLocalPlacement", RelativePlacement=parent_axis)
        element.ObjectPlacement.PlacementRelTo = parents[group]
        variant = index % 4
        if variant == 1:
            solid.SweptArea = circle
            solid.Depth = 1.0 + 0.1 * (index % 7)
        elif variant == 2:
            cutter = model.create_entity(
                "IfcExtrudedAreaSolid",
                SweptArea=cutter_profile,
                Position=cutter_axis,
                ExtrudedDirection=solid.ExtrudedDirection,
                Depth=solid.Depth + 0.02,
            )
            representation.Items = (
                model.create_entity(
                    "IfcBooleanResult",
                    Operator="DIFFERENCE",
                    FirstOperand=solid,
                    SecondOperand=cutter,
                ),
            )
            representation.RepresentationType = "CSG"
        elif variant == 3:
            mapped_shape = copy(model, representation)
            mapping = model.create_entity(
                "IfcRepresentationMap", MappingOrigin=axis, MappedRepresentation=mapped_shape
            )
            transform = model.create_entity(
                "IfcCartesianTransformationOperator3D",
                LocalOrigin=origin,
                Scale=1.0 + 0.05 * (index % 5),
            )
            representation.Items = (
                model.create_entity(
                    "IfcMappedItem", MappingSource=mapping, MappingTarget=transform
                ),
            )
            representation.RepresentationType = "MappedRepresentation"
    return {
        "geometry": "extrusions, hollow circular profiles, boolean cuts, mapped geometry",
        "nestedPlacementGroups": len(parents),
        "targetGlobalIds": [
            elements[index].GlobalId
            for index in sorted(set(range(4)) | set(range(len(elements) - 4, len(elements))))
        ],
    }
