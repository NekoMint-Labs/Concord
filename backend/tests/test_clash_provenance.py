import pytest
from app.adapters.clash_provenance import orient_clash_row
from app.domain.errors import ProviderError


def row():
    return dict(
        a_global_id="beam",
        b_global_id="duct",
        a_ifc_class="IfcBeam",
        b_ifc_class="IfcDuctSegment",
        a_name="BEAM",
        b_name="DUCT",
        p1=(1, 2, 3),
        p2=(4, 5, 6),
        distance=0.1,
        type="intersection",
    )


def test_donor_forward_order_is_unchanged():
    assert orient_clash_row(row(), {"beam"}, {"duct"}) == row()


def test_donor_reverse_order_restores_source_ids_names_and_points():
    reversed_row = orient_clash_row(row(), {"duct"}, {"beam"})
    assert reversed_row["a_global_id"] == "duct"
    assert reversed_row["a_ifc_class"] == "IfcDuctSegment"
    assert reversed_row["a_name"] == "DUCT"
    assert reversed_row["p1"] == (4, 5, 6)
    assert reversed_row["b_global_id"] == "beam"
    assert reversed_row["p2"] == (1, 2, 3)
    assert reversed_row["distance"] == 0.1
    assert row()["a_global_id"] == "beam"


@pytest.mark.parametrize(
    "first,second",
    [({"other"}, {"duct"}), ({"beam"}, {"other"}), ({"beam", "duct"}, {"beam", "duct"})],
)
def test_missing_or_cross_source_ambiguous_guids_fail_explicitly(first, second):
    with pytest.raises(ProviderError, match="absent or ambiguous"):
        orient_clash_row(row(), first, second)


def test_same_guid_in_each_model_remains_a_source_qualified_pair():
    value = {**row(), "b_global_id": "beam"}
    assert orient_clash_row(value, {"beam"}, {"beam"}) == value
