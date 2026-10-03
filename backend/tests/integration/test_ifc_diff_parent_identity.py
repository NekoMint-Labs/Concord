"""Real SDK regression: parent identity is a GlobalId, not an entity's owning file."""

import runpy
from pathlib import Path

import pytest
from app.adapters.ifc_diff import OfficialIfcDiffEngine

pytestmark = pytest.mark.integration


@pytest.fixture
def generated(tmp_path):
    pytest.importorskip("ifcdiff")
    pytest.importorskip("ifcopenshell")
    generator = Path(__file__).resolve().parents[3] / "scripts/generate_real_project_fixture.py"
    manifest = runpy.run_path(str(generator))["generate"](tmp_path)
    return manifest, Path(manifest["r1"]).read_bytes(), Path(manifest["r2"]).read_bytes()


def test_independent_generated_fixture_self_comparison(generated):
    import ifcdiff
    import ifcopenshell
    import ifcopenshell.util.element

    manifest, content, _ = generated
    old = ifcopenshell.file.from_string(content.decode())
    new = ifcopenshell.file.from_string(content.decode())
    guid = manifest["elements"]["unchanged"]["global_id"]
    old_parent = ifcopenshell.util.element.get_container(old.by_guid(guid))
    new_parent = ifcopenshell.util.element.get_container(new.by_guid(guid))
    assert old_parent != new_parent  # Reproduce SDK cross-file entity identity.
    assert old_parent.GlobalId == new_parent.GlobalId
    official_method = ifcdiff.IfcDiff.diff_element_relationships

    result = OfficialIfcDiffEngine().compare(content, content)

    assert not result.added and not result.deleted and not result.changed
    assert result.raw == {"added": [], "deleted": [], "changed": {}}
    assert result.engine == "ifcdiff" and result.engine_version == ifcdiff.__version__
    assert result.compare_seconds > 0
    assert ifcdiff.IfcDiff.diff_element_relationships is official_method


def test_independent_r1_r2_has_only_three_intended_guids(generated):
    manifest, old, new = generated
    result = OfficialIfcDiffEngine().compare(old, new)
    added = manifest["added"]["global_id"]
    deleted = manifest["elements"]["deleted"]["global_id"]
    changed = manifest["elements"]["changed"]["global_id"]
    assert result.added == frozenset({added})
    assert result.deleted == frozenset({deleted})
    assert result.changed == {changed: ("attributes", "geometry")}
    assert set(result.raw["changed"]) == {changed}
    assert set(result.raw["added"]) == {added}
    assert set(result.raw["deleted"]) == {deleted}


@pytest.mark.parametrize("relationship", ["container", "aggregate"])
@pytest.mark.parametrize("transition", ["move", "remove", "add"])
def test_real_parent_moves_and_missing_parents_remain_changed(generated, relationship, transition):
    import ifcopenshell
    import ifcopenshell.api

    manifest, content, _ = generated
    model = ifcopenshell.file.from_string(content.decode())
    if relationship == "container":
        product = model.by_guid(manifest["elements"]["unchanged"]["global_id"])
        other_parent = model.by_type("IfcSpace")[1]
        assign, unassign, parent_arg = (
            "spatial.assign_container",
            "spatial.unassign_container",
            "relating_structure",
        )
    else:
        product = model.by_type("IfcSpace")[0]
        other_parent = model.by_type("IfcBuildingStorey")[1]
        assign, unassign, parent_arg = (
            "aggregate.assign_object",
            "aggregate.unassign_object",
            "relating_object",
        )
    guid = product.GlobalId
    if transition == "move":
        ifcopenshell.api.run(assign, model, products=[product], **{parent_arg: other_parent})
    else:
        ifcopenshell.api.run(unassign, model, products=[product])
    revised = model.to_string().encode()
    old, new = (revised, content) if transition == "add" else (content, revised)

    result = OfficialIfcDiffEngine().compare(old, new)

    assert not result.added and not result.deleted
    assert result.changed == {guid: (relationship,)}
    assert result.raw["changed"] == {guid: {f"{relationship}_changed": True}}


def test_aggregate_move_under_same_indirect_container_is_not_masked(generated):
    import ifcopenshell
    import ifcopenshell.api
    import ifcopenshell.util.element

    manifest, content, _ = generated
    model = ifcopenshell.file.from_string(content.decode())
    product = model.by_guid(manifest["elements"]["unchanged"]["global_id"])
    guid = product.GlobalId
    container = ifcopenshell.util.element.get_container(product)
    assemblies = [
        ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcElementAssembly")
        for _ in range(2)
    ]
    ifcopenshell.api.run(
        "spatial.assign_container", model, products=assemblies, relating_structure=container
    )
    ifcopenshell.api.run(
        "aggregate.assign_object", model, products=[product], relating_object=assemblies[0]
    )
    old = model.to_string().encode()
    assert ifcopenshell.util.element.get_container(product).GlobalId == container.GlobalId
    assert OfficialIfcDiffEngine().compare(old, old).changed == {}
    ifcopenshell.api.run(
        "aggregate.assign_object", model, products=[product], relating_object=assemblies[1]
    )
    assert ifcopenshell.util.element.get_container(product).GlobalId == container.GlobalId

    result = OfficialIfcDiffEngine().compare(old, model.to_string().encode())

    assert not result.added and not result.deleted
    assert result.changed == {guid: ("aggregate",)}
    assert result.raw["changed"] == {guid: {"aggregate_changed": True}}


@pytest.mark.parametrize("relationship", ["property", "type"])
def test_official_property_and_type_comparison_is_preserved(generated, relationship):
    import ifcopenshell
    import ifcopenshell.api

    manifest, content, _ = generated
    model = ifcopenshell.file.from_string(content.decode())
    product = model.by_guid(manifest["elements"]["unchanged"]["global_id"])
    guid = product.GlobalId
    if relationship == "property":
        pset = ifcopenshell.api.run("pset.add_pset", model, product=product, name="Pset_Review")
        ifcopenshell.api.run("pset.edit_pset", model, pset=pset, properties={"Status": "Initial"})
        old = model.to_string().encode()
        ifcopenshell.api.run("pset.edit_pset", model, pset=pset, properties={"Status": "Revised"})
        aspect = "properties"
    else:
        types = [
            ifcopenshell.api.run("root.create_entity", model, ifc_class="IfcWallType", name=name)
            for name in ("Initial type", "Revised type")
        ]
        ifcopenshell.api.run(
            "type.assign_type", model, related_objects=[product], relating_type=types[0]
        )
        old = model.to_string().encode()
        ifcopenshell.api.run(
            "type.assign_type", model, related_objects=[product], relating_type=types[1]
        )
        aspect = "type"

    result = OfficialIfcDiffEngine().compare(old, model.to_string().encode())

    assert not result.added and not result.deleted
    assert result.changed == {guid: (aspect,)}
    assert set(result.raw["changed"][guid]) == {f"{aspect}_changed"}
