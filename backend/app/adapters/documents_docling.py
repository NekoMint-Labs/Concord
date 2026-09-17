"""Local, bounded Docling parsing. No URLs or remote document uploads are accepted."""

import hashlib
import io
import zipfile
from pathlib import Path, PurePosixPath
from threading import Lock

from app.domain.errors import CapabilityUnavailable, DomainError, ProviderError
from app.domain.models import new_id
from app.ports.providers import DocumentChunk


class DoclingDocumentParser:
    def __init__(self, max_bytes: int = 25 * 1024 * 1024, max_pages: int = 150, *, converter=None):
        self.max_bytes, self.max_pages = max_bytes, max_pages
        self._converter = converter
        self._conversion_lock = Lock()

    def _get_converter(self):
        if self._converter is None:
            try:
                from docling.datamodel.base_models import InputFormat
                from docling.datamodel.pipeline_options import PdfPipelineOptions
                from docling.document_converter import DocumentConverter, PdfFormatOption
            except ImportError as exc:
                raise CapabilityUnavailable("Install the documents extra for Docling") from exc
            options = PdfPipelineOptions(do_ocr=False, do_table_structure=True)
            options.enable_remote_services = False
            self._converter = DocumentConverter(
                allowed_formats=[
                    InputFormat.PDF,
                    InputFormat.DOCX,
                    InputFormat.PPTX,
                    InputFormat.HTML,
                    InputFormat.MD,
                ],
                format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)},
            )
        return self._converter

    def parse(self, content: bytes, filename: str) -> list[DocumentChunk]:
        if len(content) > self.max_bytes or not content:
            raise DomainError("Document is empty or exceeds size limit")
        suffix = Path(filename).suffix.lower()
        if suffix in {".txt", ".csv", ".log"}:
            # Selecting the advanced parser must not disable the existing text formats.
            from app.adapters.documents_light import LightweightDocumentParser

            return LightweightDocumentParser().parse(content, filename)
        if suffix not in {".pdf", ".docx", ".pptx", ".html", ".md"}:
            raise DomainError("Docling parser does not accept this file format")
        if suffix in {".docx", ".pptx"}:
            validate_office_archive(content)
        try:
            from docling.datamodel.base_models import DocumentStream
        except ImportError as exc:
            raise CapabilityUnavailable("Docling document streams are unavailable") from exc
        try:
            # The lazily initialized converter owns reusable model/pipeline state.
            # Do not initialize or drive it concurrently from durable worker threads.
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
        return normalize_conversion(result, hashlib.sha256(content).hexdigest())


def normalize_conversion(result, source_hash: str) -> list[DocumentChunk]:
    status = getattr(result, "status", None)
    if getattr(status, "value", status) != "success":
        # A partial conversion cannot silently become complete evidence. Keep the
        # original import and failed job for inspection/retry; do not publish chunks.
        raise ProviderError(
            "Docling conversion did not fully succeed; partial output was not published"
        )
    return normalize_document(result.document, source_hash)


def normalize_document(document, source_hash: str) -> list[DocumentChunk]:
    """Normalize actual Docling items; page numbers are never invented for Office/HTML."""
    chunks = []
    for item, _depth in document.iterate_items():
        value = getattr(item, "text", None)
        if not value and hasattr(item, "export_to_markdown"):
            value = item.export_to_markdown(doc=document)
        if not isinstance(value, str) or not value.strip():
            continue
        provenance = getattr(item, "prov", None) or []
        pages = sorted({p.page_no for p in provenance if getattr(p, "page_no", None) is not None})
        location = str(getattr(item, "self_ref", "document"))
        if len(pages) > 1:
            location += "; pages=" + ",".join(map(str, pages))
        for offset in range(0, len(value), 2400):
            chunks.append(
                DocumentChunk(
                    id=new_id(),
                    text=value[offset : offset + 2400],
                    page=pages[0] if pages else None,
                    location=f"{location}; offset={offset}",
                    source_hash=source_hash,
                    parser="docling-local-no-ocr",
                )
            )
            if len(chunks) > 5000:
                raise DomainError("Document exceeded the normalized chunk limit")
    if not chunks:
        raise DomainError(
            "No text could be extracted; OCR is disabled and scanned pages need explicit processing"
        )
    return chunks


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
