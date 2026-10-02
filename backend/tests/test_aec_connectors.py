import pytest
from app.adapters.aec_connectors import AECConnectorBoundary
from app.domain.errors import CapabilityUnavailable, DomainError


@pytest.mark.parametrize(
    ("host", "filename", "kind"),
    [
        ("revit", "model.ifc", "BIM"),
        ("autocad", "plan.dxf", "DRAWING"),
        ("navisworks", "coordination.ifc", "BIM"),
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
