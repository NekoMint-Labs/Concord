"""Real SDK coverage of incomplete geometry and vacuous IDS success."""

import pytest
from app.adapters.engineering_capabilities import IfcClashCapability, IfcTesterCapability
from test_engineering_capabilities import input_for, request_for
from test_golden_engineering import BEAM, DUCT, FIXTURE

pytestmark = pytest.mark.integration


@pytest.mark.parametrize("defect", ["missing", "non-geometric"])
def test_real_partial_geometry_never_authorizes_closure(defect):
    pytest.importorskip("ifcclash")
    import ifcopenshell
    from ifcopenshell.util.element import copy_deep

    model = ifcopenshell.file.from_string((FIXTURE / "R2/structure.ifc").read_text())
    absent = "0000000000000000000000"
    if defect == "non-geometric":
        extra = copy_deep(model, model.by_guid(BEAM))
        extra.GlobalId = absent
        extra.Representation = None
    data = (model.to_string().encode(), (FIXTURE / "R3/mep.ifc").read_bytes())
    inputs = (
        input_for("structure", "R2", "structure", data[0], guids=(BEAM, absent)),
        input_for("mep", "R3", "mep", data[1], guids=(DUCT,)),
    )
    result = IfcClashCapability().check(request_for(inputs, data))
    assert result.outcome == "NEEDS_REVIEW" and not result.evidence
    assert result.expected_condition_satisfied is not True


def test_real_ids_optional_no_applicability_stays_reviewable():
    pytest.importorskip("ifctester")
    from app.domain.engineering import IDSRequirementsSelection
    from ifctester import ids
    from ifctester.ids import Attribute, Entity, Specification
    from test_engineering_adapters import local_ids_xml

    specification = Specification(name="Optional pipes", minOccurs=0, ifcVersion=["IFC4"])
    specification.applicability = [Entity(name="IFCPIPESEGMENT")]
    specification.requirements = [Attribute(name="Name", value="Expected pipe")]
    document = ids.Ids(title="No applicable pipes")
    document.specifications = [specification]
    data = ((FIXTURE / "R1/structure.ifc").read_bytes(), local_ids_xml(document))
    inputs = (
        input_for("model", "R1", "model", data[0], guids=(BEAM,)),
        input_for("rules", "IDS1", "requirements", data[1]),
    )
    selection = IDSRequirementsSelection(
        project_id="project", source_id="rules", revision_id="IDS1", sha256=inputs[1].sha256
    )
    result = IfcTesterCapability().check(
        request_for(inputs, data, condition="All IDS requirements pass", ids=selection)
    )
    assert result.outcome == "NEEDS_REVIEW" and not result.evidence
    assert result.expected_condition_satisfied is not True
