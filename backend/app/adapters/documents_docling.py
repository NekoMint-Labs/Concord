"""Local, bounded Docling parsing with opt-in, pre-provisioned Chinese RapidOCR."""

import csv
import hashlib
import io
import zipfile
from pathlib import Path, PurePosixPath
from threading import Lock

from app.adapters.document_normalization import normalize_conversion, normalize_document
from app.domain.errors import CapabilityUnavailable, DomainError, ProviderError
from app.ports.providers import DocumentChunk

__all__ = [
    "DoclingDocumentParser",
    "normalize_conversion",
    "normalize_document",
    "validate_office_archive",
]

IMAGE_FORMATS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}


class DoclingDocumentParser:
    def __init__(
        self,
        max_bytes: int = 25 * 1024 * 1024,
        max_pages: int = 150,
        *,
        converter=None,
        ocr: bool = False,
        ocr_model_directory: Path | None = None,
    ):
        if max_bytes < 1 or max_pages < 1:
            raise ValueError("Document limits must be positive")
        self.max_bytes, self.max_pages = max_bytes, max_pages
        self.ocr, self.ocr_model_directory = ocr, ocr_model_directory
        self._converter = converter
        self._conversion_lock = Lock()

    def _get_converter(self):
        if self._converter is None:
            try:
                from docling.datamodel.base_models import InputFormat
                from docling.datamodel.pipeline_options import PdfPipelineOptions
                from docling.document_converter import (
                    DocumentConverter,
                    ImageFormatOption,
                    PdfFormatOption,
                )
            except ImportError as exc:
                raise CapabilityUnavailable("Install the documents extra for Docling") from exc
            options = PdfPipelineOptions(do_ocr=self.ocr, do_table_structure=True)
            options.enable_remote_services = False
            if self.ocr:
                options.ocr_options = self._ocr_options()
                options.artifacts_path = self.ocr_model_directory
            self._converter = DocumentConverter(
                allowed_formats=[
                    InputFormat.PDF,
                    InputFormat.DOCX,
                    InputFormat.PPTX,
                    InputFormat.XLSX,
                    InputFormat.CSV,
                    InputFormat.HTML,
                    InputFormat.MD,
                    *([InputFormat.IMAGE] if self.ocr else []),
                ],
                format_options={
                    InputFormat.PDF: PdfFormatOption(pipeline_options=options),
                    InputFormat.IMAGE: ImageFormatOption(pipeline_options=options),
                },
            )
        return self._converter

    def _ocr_options(self):
        try:
            import onnxruntime  # noqa: F401
            from docling.datamodel.pipeline_options import RapidOcrOptions
        except ImportError as exc:
            raise CapabilityUnavailable("Local RapidOCR requires the ONNX Runtime pack") from exc
        folder = self.ocr_model_directory
        if folder is None or not folder.is_dir():
            raise CapabilityUnavailable(
                "Prefetch local Docling/RapidOCR model artifacts before OCR"
            )
        ocr_files = tuple((folder / "RapidOcr").glob("*.onnx"))
        if len(ocr_files) < 3 or not all(path.stat().st_size for path in ocr_files):
            raise CapabilityUnavailable("Local RapidOCR ONNX artifacts are incomplete")
        return RapidOcrOptions(lang=["ch"], backend="onnxruntime")

    def parse(self, content: bytes, filename: str) -> list[DocumentChunk]:
        if len(content) > self.max_bytes or not content:
            raise DomainError("Document is empty or exceeds size limit")
        suffix = Path(filename).suffix.lower()
        if suffix in {".txt", ".log"} or (suffix == ".csv" and not _has_csv_structure(content)):
            from app.adapters.documents_light import LightweightDocumentParser

            return LightweightDocumentParser().parse(content, filename)
        if suffix in IMAGE_FORMATS and not self.ocr:
            raise CapabilityUnavailable(
                "Image ingestion requires explicit local RapidOCR processing"
            )
        if (
            suffix
            not in {".pdf", ".docx", ".pptx", ".xlsx", ".csv", ".html", ".md"} | IMAGE_FORMATS
        ):
            raise DomainError("Docling parser does not accept this file format")
        if suffix in {".docx", ".pptx", ".xlsx"}:
            validate_office_archive(content)
        try:
            from docling.datamodel.base_models import DocumentStream
        except ImportError as exc:
            raise CapabilityUnavailable("Docling document streams are unavailable") from exc
        try:
            with self._conversion_lock:
                result = self._get_converter().convert(
                    DocumentStream(name=Path(filename).name, stream=io.BytesIO(content)),
                    max_num_pages=self.max_pages,
                    max_file_size=self.max_bytes,
                )
        except Exception as exc:
            if isinstance(exc, CapabilityUnavailable):
                raise
            raise ProviderError(
                "Local Docling conversion failed; no project state was changed"
            ) from exc
        return normalize_conversion(result, hashlib.sha256(content).hexdigest(), ocr=self.ocr)


def _has_csv_structure(content: bytes) -> bool:
    try:
        rows = csv.reader(io.StringIO(content.decode("utf-8-sig")))
        return any(len(row) > 1 for _, row in zip(range(32), rows, strict=False))
    except (UnicodeError, csv.Error) as exc:
        raise DomainError("CSV import requires readable UTF-8 CSV") from exc


def validate_office_archive(
    content: bytes, *, max_expanded_bytes: int = 200 * 1024 * 1024, max_entries: int = 5000
) -> None:
    """Inspect the OOXML ZIP directory before any SDK decompresses uploaded data.

    This is a resource/format preflight, not an Office parser or an extraction
    routine. Reject ambiguous member paths and encryption, and bound the total
    declared expansion rather than trusting the compressed upload size alone.
    """
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            entries = archive.infolist()
            if (
                len(entries) > max_entries
                or sum(item.file_size for item in entries) > max_expanded_bytes
            ):
                raise DomainError("Office archive exceeds the expanded size or entry limit")
            seen = set()
            for item in entries:
                # filename is normalized by ZipInfo on Windows and truncated at
                # NUL. Validate the original directory entry before conversion.
                name = item.orig_filename
                path = PurePosixPath(name)
                if (
                    not name
                    or name.startswith("/")
                    or "\\" in name
                    or "\x00" in name
                    or ":" in name
                    or ".." in path.parts
                    or path.as_posix().rstrip("/") != name.rstrip("/")
                    or name in seen
                    or item.flag_bits & 1
                ):
                    raise DomainError("Office archive has unsafe, duplicate or encrypted members")
                seen.add(name)
            if "[Content_Types].xml" not in seen:
                raise DomainError("Office archive has no OOXML content type manifest")
    except zipfile.BadZipFile as exc:
        raise DomainError("Office file is not a valid ZIP archive") from exc
