from typing import cast

import pytest
from app.adapters.aec_connectors import AECConnectorBoundary, ConnectorCapability, ConnectorHost
from app.domain.errors import CapabilityUnavailable, DomainError


@pytest.mark.parametrize(
    ("host", "filename", "kind"),
    [
        ("revit", "model.ifc", "BIM"),
        ("autocad", "plan.dxf", "DRAWING"),
    ],
)
def test_connector_exports_are_hashable_staged_artifacts(host, filename, kind):
    artifact = AECConnectorBoundary().stage(
        b"exported artifact",
        host=host,
        external_id="host-revision-023",
        filename=filename,
    )
    assert artifact.source_kind == kind
    assert artifact.requires_project_source_revision is True
    assert len(artifact.sha256) == 64


@pytest.mark.parametrize(
    "filename", ["model.rvt", "drawing.dwg", "coordination.nwd", "coordination.nwc"]
)
def test_native_host_files_cannot_bypass_source_revision(filename):
    with pytest.raises(CapabilityUnavailable, match="approved artifact"):
        AECConnectorBoundary().stage(
            b"native file",
            host="revit" if filename.endswith("rvt") else "autocad",
            external_id="native-1",
            filename=filename,
        )


def test_connector_rejects_empty_or_pathful_input():
    boundary = AECConnectorBoundary()
    with pytest.raises(DomainError):
        boundary.stage(b"", host="revit", external_id="x", filename="model.ifc")
    with pytest.raises(DomainError):
        boundary.stage(b"x", host="revit", external_id="x", filename="folder/model.ifc")


@pytest.mark.parametrize(
    "filename",
    ["folder/model.ifc", "folder\\model.ifc", "C:model.ifc", "bad\n.ifc", "model.exe", "model.dxf"],
)
def test_connector_rejects_unsafe_or_host_incompatible_exports(filename):
    with pytest.raises(DomainError):
        AECConnectorBoundary().stage(
            b"content", host="revit", external_id="revision", filename=filename
        )


@pytest.mark.parametrize("filename", ["coordination.ifc", "model.json", "model.fbx"])
def test_navisworks_does_not_claim_an_unqualified_native_conversion(filename):
    with pytest.raises(CapabilityUnavailable, match="qualified native host conversion"):
        AECConnectorBoundary().stage(
            b"artifact", host="navisworks", external_id="host-1", filename=filename
        )


def test_connector_staging_checks_limits_before_hashing():
    with pytest.raises(ValueError, match="positive"):
        AECConnectorBoundary(max_bytes=0)
    boundary = AECConnectorBoundary(max_bytes=3)
    with pytest.raises(DomainError, match="size limit"):
        boundary.stage(b"four", host="revit", external_id="r1", filename="model.ifc")
    assert (
        boundary.stage(b"ifc", host="revit", external_id="r1", filename="model.ifc").size_bytes == 3
    )
    with pytest.raises(DomainError, match="external identifier"):
        boundary.stage(b"ifc", host="revit", external_id="x" * 513, filename="model.ifc")
    with pytest.raises(DomainError, match="filename"):
        boundary.stage(b"ifc", host="revit", external_id="r1", filename="x" * 256 + ".ifc")


def test_connector_capabilities_are_explicit_and_stable():
    capabilities = AECConnectorBoundary().describe()
    assert all(isinstance(capability, ConnectorCapability) for capability in capabilities)
    assert [capability.host for capability in capabilities] == ["revit", "autocad", "navisworks"]
    assert capabilities[0].status == "staging_only"
    assert capabilities[0].accepted_extensions == (".ifc",)
    assert capabilities[1].accepted_extensions == (".dxf", ".pdf")
    assert capabilities[2].status == "unavailable"
    assert capabilities[2].accepted_extensions == ()
    assert all(
        "native" in capability.reason.lower() or capability.host == "navisworks"
        for capability in capabilities
    )


def test_unknown_host_is_rejected_before_native_extension_policy():
    with pytest.raises(DomainError, match="Unsupported AEC connector host"):
        AECConnectorBoundary().stage(
            b"native", host=cast(ConnectorHost, "unsupported"),
            external_id="x",
            filename="model.rvt"
        )


def test_control_character_del_is_rejected():
    with pytest.raises(DomainError, match="filename"):
        AECConnectorBoundary().stage(
            b"ifc", host="revit", external_id="r1", filename="model\x7f.ifc"
        )
