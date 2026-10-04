from pathlib import Path

import pytest
from app.adapters.engineering_cache import engineering_cache_key, ids_cache_key
from app.adapters.ifc_tester import IfcTesterAdapter


def test_engineering_cache_key_is_canonical_for_mapping_order():
    common = {
        "source_hashes": ("a" * 64, "b" * 64),
        "engine": "ifcclash",
        "engine_version": "0.8.5",
    }
    left = engineering_cache_key(
        **common, parameters={"tolerance": 0, "mode": "intersection"}
    )
    right = engineering_cache_key(
        **common, parameters={"mode": "intersection", "tolerance": 0}
    )
    assert left == right


def test_engineering_cache_key_keeps_ordered_source_roles_distinct():
    common = {"engine": "ifcclash", "engine_version": "0.8.5", "parameters": {}}
    assert engineering_cache_key(source_hashes=("a", "b"), **common) != engineering_cache_key(
        source_hashes=("b", "a"), **common
    )


def test_ids_cache_key_changes_when_requirements_change():
    common = {"source_hash": "a" * 64, "engine": "ifctester", "engine_version": "0.8.5"}
    assert ids_cache_key(requirements_hash="b" * 64, **common) != ids_cache_key(
        requirements_hash="c" * 64, **common
    )


def test_engineering_cache_key_rejects_non_finite_parameters():
    with pytest.raises(ValueError):
        engineering_cache_key(
            source_hashes=("a" * 64,),
            engine="ifctester",
            engine_version="0.8.5",
            parameters={"tolerance": float("nan")},
        )


def test_ifctester_result_exposes_requirements_aware_cache_identity():
    fixture = Path(__file__).resolve().parents[2] / "fixtures" / "coordination-project"
    ifc = (fixture / "R1" / "structure.ifc").read_bytes()
    ids = (fixture / "R1" / "requirements.ids").read_bytes()
    result = IfcTesterAdapter().validate(
        ifc, ids, source_id="structure", source_revision_id="R1"
    )
    assert result.cache_key == ids_cache_key(
        source_hash=result.source_hash,
        requirements_hash=result.requirements_hash,
        engine=result.engine,
        engine_version=result.engine_version,
    )
