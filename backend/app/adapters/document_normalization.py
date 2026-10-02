"""Normalize Docling structure without leaking SDK objects into project contracts."""

from math import isfinite

from app.domain.errors import DomainError, ProviderError
from app.domain.models import new_id
from app.ports.providers import DocumentChunk

MAX_CHUNKS = 5000


def normalize_conversion(result, source_hash: str, *, ocr: bool = False) -> list[DocumentChunk]:
    status = getattr(result, "status", None)
    if getattr(status, "value", status) != "success":
        raise ProviderError(
            "Docling conversion did not fully succeed; partial output was not published"
        )
    return normalize_document(
        result.document,
        source_hash,
        ocr=ocr,
        confidence=result.confidence if hasattr(result, "confidence") else None,
    )


def normalize_document(
    document, source_hash: str, *, ocr: bool = False, confidence=None
) -> list[DocumentChunk]:
    """Retain tables as addressable cells, paragraphs as source-located chunks."""
    chunks = []
    for item, _depth in document.iterate_items():
        provenance = getattr(item, "prov", None) or []
        pages = sorted({p.page_no for p in provenance if getattr(p, "page_no", None) is not None})
        location = str(getattr(item, "self_ref", "document"))
        if len(pages) > 1:
            location += "; pages=" + ",".join(map(str, pages))
        page = pages[0] if pages else None
        if ocr:
            location += _confidence_location(confidence, page)
        table = getattr(item, "data", None)
        cells = getattr(table, "table_cells", None)
        if cells is not None:
            table_path = _structural_path(document, item)
            for cell in cells:
                row, column = cell.start_row_offset_idx + 1, cell.start_col_offset_idx + 1
                cell_location = (
                    f"{location}; {table_path}/row:{row}/cell:{_column_name(column)}{row}"
                    f"; row-span={cell.end_row_offset_idx - cell.start_row_offset_idx}"
                    f"; col-span={cell.end_col_offset_idx - cell.start_col_offset_idx}"
                    f"; column-header={bool(getattr(cell, 'column_header', False))}"
                    f"; row-header={bool(getattr(cell, 'row_header', False))}"
                )
                _append(chunks, cell.text, page, cell_location, source_hash, ocr)
            continue
        value = getattr(item, "text", None)
        if not value and hasattr(item, "export_to_markdown"):
            value = item.export_to_markdown(doc=document)
        _append(chunks, value, page, location, source_hash, ocr)
    if not chunks:
        raise DomainError(
            "No text could be extracted; scanned pages require explicit local OCR processing"
        )
    return chunks


def _append(chunks, text, page, location, source_hash: str, ocr: bool) -> None:
    if not isinstance(text, str) or not text.strip():
        return
    for offset in range(0, len(text), 2400):
        chunks.append(
            DocumentChunk(
                id=new_id(),
                text=text[offset : offset + 2400],
                page=page,
                location=f"{location}; offset={offset}",
                source_hash=source_hash,
                parser="docling-local-rapidocr/ch" if ocr else "docling-local-no-ocr",
            )
        )
        if len(chunks) > MAX_CHUNKS:
            raise DomainError("Document exceeded the normalized chunk limit")


def _structural_path(document, item) -> str:
    """Use the donor's actual group names (including workbook sheet names)."""
    names, visited = [], set()
    parent = getattr(item, "parent", None)
    while parent is not None:
        reference = getattr(parent, "cref", None) or id(parent)
        if reference in visited or len(visited) >= 32:
            raise ProviderError("Document structure has cyclic or excessive ancestry")
        visited.add(reference)
        resolver = getattr(parent, "resolve", None)
        group = resolver(document) if callable(resolver) else parent
        name = getattr(group, "name", None)
        if name and name not in {"body", "furniture", "_root_"}:
            names.append(str(name))
        parent = getattr(group, "parent", None)
    return "/".join(reversed(names)) or str(getattr(item, "self_ref", "table"))


def _column_name(index: int) -> str:
    name = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(65 + remainder) + name
    return name


def _confidence_location(confidence, page: int | None) -> str:
    """Keep the measured donor page OCR confidence; never invent a score."""
    pages = getattr(confidence, "pages", {}) or {}
    value = getattr(pages.get(page), "ocr_score", None)
    if isinstance(value, (int, float)) and isfinite(value):
        return f"; ocr-page-confidence={value}"
    return "; ocr-page-confidence=unavailable"
