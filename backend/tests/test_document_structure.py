"""Docling boundary regressions; these doubles do not qualify a real engine."""

from types import SimpleNamespace as NS

import pytest
from app.adapters.documents_docling import DoclingDocumentParser, normalize_document
from app.domain.errors import CapabilityUnavailable, DomainError, ProviderError


def cell(text, row, col, *, row_span=1, col_span=1, header=False):
    return NS(
        text=text,
        start_row_offset_idx=row,
        start_col_offset_idx=col,
        end_row_offset_idx=row + row_span,
        end_col_offset_idx=col + col_span,
        column_header=header,
        row_header=False,
    )


def table_document(cells):
    group = NS(name="Coordination", parent=None)
    reference = NS(cref="#/groups/0", resolve=lambda _: group)
    table = NS(data=NS(table_cells=cells), prov=[], self_ref="#/tables/0", parent=reference)
    return NS(iterate_items=lambda: [(table, 0)])


def test_table_cells_keep_sheet_address_and_spans_without_flattening():
    document = table_document(
        [
            cell("Status", 0, 2, header=True),
            cell("Needs review", 3, 2),
            cell("Merged area", 5, 0, row_span=2, col_span=3),
        ]
    )
    chunks = normalize_document(document, "original-workbook-hash")
    assert [c.text for c in chunks] == ["Status", "Needs review", "Merged area"]
    assert "Coordination/row:4/cell:C4" in chunks[1].location
    assert "row-span=2; col-span=3" in chunks[2].location
    assert "column-header=True" in chunks[0].location
    assert all(c.page is None and c.source_hash == "original-workbook-hash" for c in chunks)


def test_long_cells_retain_one_source_address_across_chunks():
    chunks = normalize_document(table_document([cell("x" * 2401, 1, 26)]), "hash")
    assert len(chunks) == 2
    assert all("cell:AA2" in c.location for c in chunks)
    assert "offset=2400" in chunks[1].location


def test_document_ancestry_cycle_fails_instead_of_hanging():
    group = NS(name="Cycle", parent=None)
    reference = NS(cref="#/groups/0", resolve=lambda _: group)
    group.parent = reference
    table = NS(
        data=NS(table_cells=[cell("text", 0, 0)]), prov=[], self_ref="#/tables/0", parent=reference
    )
    document = NS(iterate_items=lambda: [(table, 0)])
    with pytest.raises(ProviderError, match="cyclic"):
        normalize_document(document, "hash")


def test_ocr_provenance_retains_measured_confidence_and_parser_origin():
    item = NS(text="设计变更 023", prov=[NS(page_no=2)], self_ref="#/texts/0")
    document = NS(iterate_items=lambda: [(item, 0)])
    confidence = NS(pages={2: NS(ocr_score=0.91)})
    chunks = normalize_document(document, "scan-hash", ocr=True, confidence=confidence)
    assert chunks[0].page == 2
    assert chunks[0].parser == "docling-local-rapidocr/ch"
    assert "ocr-page-confidence=0.91" in chunks[0].location
    missing = normalize_document(document, "scan-hash", ocr=True)
    assert "ocr-page-confidence=unavailable" in missing[0].location


@pytest.mark.parametrize("filename", ["scan.png", "scan.jpeg", "scan.tiff"])
def test_images_require_explicit_ocr_before_any_converter_initialization(filename):
    parser = DoclingDocumentParser()
    with pytest.raises(CapabilityUnavailable, match="explicit local RapidOCR"):
        parser.parse(b"image", filename)
    assert parser._converter is None


def test_xlsx_archive_preflight_runs_before_sdk_initialization():
    parser = DoclingDocumentParser()
    with pytest.raises(DomainError, match="valid ZIP"):
        parser.parse(b"invalid zip", "bad.xlsx")
    assert parser._converter is None


@pytest.mark.parametrize("limits", [{"max_bytes": 0}, {"max_pages": 0}])
def test_document_resource_limits_are_positive(limits):
    with pytest.raises(ValueError):
        DoclingDocumentParser(**limits)


def test_structured_csv_uses_docling_and_preserves_original_hash(monkeypatch):
    import hashlib
    import sys

    content = b"Element,Status\nBEAM-01,Needs review\n"
    document = table_document(
        [
            cell("Element", 0, 0),
            cell("Status", 0, 1),
            cell("BEAM-01", 1, 0),
            cell("Needs review", 1, 1),
        ]
    )
    calls = []

    class Converter:
        def convert(self, stream, **limits):
            calls.append(stream.name)
            return NS(status="success", document=document)

    monkeypatch.setitem(sys.modules, "docling.datamodel.base_models", NS(DocumentStream=NS))
    chunks = DoclingDocumentParser(converter=Converter()).parse(content, "coordination.csv")
    assert calls == ["coordination.csv"]
    assert all(c.source_hash == hashlib.sha256(content).hexdigest() for c in chunks)
    assert "cell:B2" in chunks[3].location



def test_rapidocr_configuration_uses_prefetched_root_and_chinese_onnx(tmp_path):
    pytest.importorskip("docling")
    pytest.importorskip("onnxruntime")
    models = tmp_path / "RapidOcr"
    models.mkdir()
    for name in ("det", "cls", "rec"):
        (models / f"{name}.onnx").write_bytes(b"configuration fixture, not an ONNX model")
    parser = DoclingDocumentParser(ocr=True, ocr_model_directory=tmp_path)
    options = parser._ocr_options()
    assert options.lang == ["ch"]
    assert options.backend == "onnxruntime"
    assert parser._converter is None


@pytest.mark.parametrize("model_count", [0, 2])
def test_rapidocr_incomplete_model_pack_fails_before_conversion(tmp_path, model_count):
    pytest.importorskip("docling")
    pytest.importorskip("onnxruntime")
    models = tmp_path / "RapidOcr"
    models.mkdir()
    for index in range(model_count):
        (models / f"model-{index}.onnx").write_bytes(b"incomplete configuration fixture")
    parser = DoclingDocumentParser(ocr=True, ocr_model_directory=tmp_path)
    with pytest.raises(CapabilityUnavailable, match="incomplete"):
        parser._ocr_options()
    assert parser._converter is None
