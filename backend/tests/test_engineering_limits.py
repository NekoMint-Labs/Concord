"""Failure and resource boundaries must reject complete operations without truncation."""

import builtins
import io
import zipfile
from pathlib import Path
from types import SimpleNamespace as NS

import pytest
from app.adapters.aec_connectors import AECConnectorBoundary
from app.adapters.bcf import BCFAdapter, validate_archive
from app.adapters.bcf_viewpoints import write_viewpoint
from app.adapters.document_normalization import normalize_document
from app.adapters.engineering_results import BCFViewpoint
from app.adapters.ifc_clash import IfcClashAdapter
from app.adapters.ifc_tester import IfcTesterAdapter
from app.domain.errors import CapabilityUnavailable, DomainError, ProviderError

ROOT = Path(__file__).resolve().parents[2] / "fixtures/coordination-project"


@pytest.mark.parametrize(
    "factory",
    [
        lambda: BCFAdapter(max_bytes=0),
        lambda: IfcClashAdapter(max_results=0),
        lambda: IfcTesterAdapter(max_violations=0),
    ],
)
def test_resource_limits_cannot_be_disabled(factory):
    with pytest.raises(ValueError):
        factory()


@pytest.mark.parametrize("host,external_id", [("unsupported", "x"), ("revit", " ")])
def test_connector_requires_known_host_and_revision(host, external_id):
    with pytest.raises(DomainError):
        AECConnectorBoundary().stage(
            b"export", host=host, external_id=external_id, filename="model.ifc"
        )


@pytest.mark.parametrize("module", ["bcf", "ifcclash", "ifctester"])
def test_missing_optional_engine_is_explicit_and_never_a_success(monkeypatch, module):
    original = builtins.__import__

    def missing(name, *args, **kwargs):
        if name == module or name.startswith(module + "."):
            raise ImportError("Unavailable optional engine")
        return original(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", missing)
    with pytest.raises(CapabilityUnavailable):
        if module == "bcf":
            BCFAdapter().export_viewpoint(
                BCFViewpoint(
                    source_id="model", source_revision_id="R1", title="Review", position=(0, 0, 1)
                )
            )
        elif module == "ifcclash":
            IfcClashAdapter().run(
                b"a", b"b", source_id="model", source_revision_id="R1", comparison_revision_id="R2"
            )
        else:
            IfcTesterAdapter().validate(
                b"model", b"ids", source_id="model", source_revision_id="R1"
            )


def test_ifcclash_rejects_corrupt_models_and_empty_provenance():
    pytest.importorskip("ifcclash")
    with pytest.raises(ProviderError):
        IfcClashAdapter().run(
            b"bad", b"bad", source_id="model", source_revision_id="R1", comparison_revision_id="R2"
        )
    with pytest.raises(DomainError):
        IfcClashAdapter().run(
            b"a", b"b", source_id=" ", source_revision_id="R1", comparison_revision_id="R2"
        )


def test_ifcclash_cannot_return_a_truncated_clash_set(tmp_path):
    pytest.importorskip("ifcclash")
    import ifcopenshell
    from ifcopenshell.util.element import copy_deep

    model = ifcopenshell.file.from_string((ROOT / "R1/mep.ifc").read_text(encoding="utf-8"))
    second_duct = copy_deep(model, model.by_type("IfcDuctSegment")[0])
    second_duct.GlobalId = "2JYqfQ6zP6LQxgT6eT8v1C"
    content = model.to_string().encode()
    with pytest.raises(DomainError, match="result exceeds"):
        IfcClashAdapter(max_results=1).run(
            (ROOT / "R2/structure.ifc").read_bytes(),
            content,
            source_id="model",
            source_revision_id="R1",
            comparison_revision_id="R2",
        )


def test_bcf_snapshot_limit_precedes_engine_loading():
    with pytest.raises(DomainError, match="snapshot"):
        BCFAdapter(max_bytes=4).export_viewpoint(
            BCFViewpoint(
                source_id="model",
                source_revision_id="R1",
                title="Review",
                position=(0, 0, 1),
                snapshot_png=b"oversized",
            )
        )


def bcf_archive(members):
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in members:
            archive.writestr(name, data)
    return output.getvalue()


@pytest.mark.parametrize("name", ["../outside", "topic//view.bcfv", "/absolute", "C:/view.bcfv"])
def test_bcf_rejects_ambiguous_members(name):
    with pytest.raises(DomainError, match="unsafe"):
        validate_archive(bcf_archive([("bcf.version", b"version"), (name, b"data")]), 4096)


def test_bcf_requires_version_and_bounds_decompressed_data():
    with pytest.raises(DomainError, match="version"):
        validate_archive(bcf_archive([("markup.bcf", b"data")]), 4096)
    with pytest.raises(DomainError, match="expansion"):
        validate_archive(bcf_archive([("bcf.version", b"x" * 20000)]), 4096)


def test_bcf_missing_sdk_after_archive_preflight(monkeypatch):
    original = builtins.__import__

    def missing(name, *args, **kwargs):
        if name.startswith("bcf"):
            raise ImportError
        return original(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", missing)
    with pytest.raises(CapabilityUnavailable):
        BCFAdapter().import_viewpoints(
            bcf_archive([("bcf.version", b"version")]), source_id="x", source_revision_id="R1"
        )


def test_bcf_rejects_viewpoint_overflow_and_missing_camera(tmp_path):
    pytest.importorskip("bcf")
    from bcf.v2.bcfxml import BcfXml

    document = BcfXml.create_new("Boundary qualification")
    path = tmp_path / "multiple.bcfzip"
    try:
        for _ in range(2):
            write_viewpoint(
                document,
                BCFViewpoint(
                    source_id="model", source_revision_id="R1", title="Review", position=(0, 0, 1)
                ),
            )
        document.save(path)
    finally:
        document.close()
    with pytest.raises(DomainError, match="viewpoint count"):
        BCFAdapter(max_viewpoints=1).import_viewpoints(
            path.read_bytes(), source_id="model", source_revision_id="R1"
        )
    with zipfile.ZipFile(path) as archive:
        members = []
        for name in archive.namelist():
            data = archive.read(name)
            if name.endswith(".bcfv"):
                from xml.etree import ElementTree as ET

                root = ET.fromstring(data)
                for camera in list(root):
                    if camera.tag.endswith("Camera"):
                        root.remove(camera)
                data = ET.tostring(root)
            members.append((name, data))
    with pytest.raises(ProviderError, match="no camera"):
        BCFAdapter().import_viewpoints(
            bcf_archive(members), source_id="model", source_revision_id="R1"
        )


def test_document_normalization_is_bounded_and_ignores_blank_items(monkeypatch):
    monkeypatch.setattr("app.adapters.document_normalization.MAX_CHUNKS", 1)
    item = NS(text="x" * 2401, prov=[NS(page_no=1), NS(page_no=2)], self_ref="#/texts/0")
    with pytest.raises(DomainError, match="chunk limit"):
        normalize_document(NS(iterate_items=lambda: [(item, 0)]), "hash")
    with pytest.raises(DomainError, match="No text"):
        normalize_document(NS(iterate_items=lambda: [(NS(text=" ", prov=[]), 0)]), "hash")
    markdown = NS(export_to_markdown=lambda doc: "structured source text", prov=[])
    chunk = normalize_document(NS(iterate_items=lambda: [(markdown, 0)]), "hash")[0]
    assert chunk.text == "structured source text"
