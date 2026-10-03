"""Offline real Docling/RapidOCR qualification; model provisioning is explicit."""

import hashlib
import io
import os
import socket
import time
from pathlib import Path

import pytest
from app.adapters.documents_docling import DoclingDocumentParser

pytestmark = pytest.mark.integration
ROOT = Path(__file__).resolve().parents[3] / "fixtures/coordination-project"


def artifacts(*, ocr: bool = False) -> Path:
    pytest.importorskip("docling")
    setting = "CCA_TEST_RAPIDOCR_ARTIFACTS" if ocr else "DOCLING_ARTIFACTS_PATH"
    path = os.environ.get(setting)
    if not path:
        pytest.skip(f"Provision local model artifacts and set {setting} for offline qualification")
    directory = Path(path)
    assert directory.is_dir(), f"Configured model directory is missing: {directory}"
    return directory


def forbid_network(monkeypatch):
    def connect(*args, **kwargs):
        raise AssertionError("Document processing attempted network access after model setup")

    monkeypatch.setattr(socket.socket, "connect", connect)
    monkeypatch.setenv("HF_HUB_OFFLINE", "1")
    monkeypatch.setenv("TRANSFORMERS_OFFLINE", "1")


def test_golden_offline_pdf_preserves_pages_and_source_hash(monkeypatch, record_property):
    directory = artifacts()
    monkeypatch.setenv("DOCLING_ARTIFACTS_PATH", str(directory))
    forbid_network(monkeypatch)
    content = (ROOT / "R1/specification.pdf").read_bytes()
    started = time.perf_counter()
    chunks = DoclingDocumentParser().parse(content, "specification.pdf")
    record_property("parse_seconds", time.perf_counter() - started)
    assert any("GOLDEN-SPEC-PAGE-1" in c.text and c.page == 1 for c in chunks)
    assert any("GOLDEN-SPEC-PAGE-2" in c.text and c.page == 2 for c in chunks)
    assert all(c.source_hash == hashlib.sha256(content).hexdigest() for c in chunks)


@pytest.mark.parametrize("format", ["image", "scanned_pdf"])
def test_golden_chinese_rapidocr_is_offline_and_retains_measured_provenance(
    monkeypatch, record_property, format
):
    directory = artifacts(ocr=True)
    pytest.importorskip("rapidocr")
    pytest.importorskip("onnxruntime")
    content = (ROOT / "R2/design-change-023-scan.png").read_bytes()
    filename = "design-change-023.png"
    if format == "scanned_pdf":
        from PIL import Image

        output = io.BytesIO()
        with Image.open(io.BytesIO(content)) as image:
            image.save(output, format="PDF", resolution=150.0)
        content, filename = output.getvalue(), "design-change-023.pdf"
    forbid_network(monkeypatch)
    parser = DoclingDocumentParser(ocr=True, ocr_model_directory=directory)
    assert parser._converter is None
    started = time.perf_counter()
    chunks = parser.parse(content, filename)
    record_property("ocr_seconds", time.perf_counter() - started)
    text = "\n".join(c.text for c in chunks)
    assert "设计变更 023" in text
    assert "机电管线需要调整" in text
    assert all(c.page == 1 and c.source_hash == hashlib.sha256(content).hexdigest() for c in chunks)
    assert all(c.parser == "docling-local-rapidocr/ch" for c in chunks)
    assert all("ocr-page-confidence=" in c.location for c in chunks)
    assert all("ocr-page-confidence=unavailable" not in c.location for c in chunks)
