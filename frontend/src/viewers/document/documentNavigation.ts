import type {
  DocumentChunk,
  DocumentTarget,
  DocumentCell,
  ExtractedDocument,
} from "./documentTypes";
export function validateExtractedDocument(source: ExtractedDocument) {
  if (
    !source.sourceRevisionId ||
    !/^[a-f0-9]{64}$/.test(source.sourceHash) ||
    !source.filename
  )
    throw new Error(
      "A document source revision, SHA-256 and filename are required",
    );
  if (!source.chunks.length || source.chunks.length > 5000)
    throw new Error("Document extraction is empty or exceeds the chunk limit");
  const ids = new Set<string>();
  let bytes = 0;
  for (const chunk of source.chunks) {
    if (!chunk.id || ids.has(chunk.id) || chunk.id.length > 1000)
      throw new Error("Document chunk identities must be present and unique");
    ids.add(chunk.id);
    if (chunk.source_hash !== source.sourceHash)
      throw new Error("Document extraction does not match the source hash");
    if (
      typeof chunk.text !== "string" ||
      chunk.text.length > 2400 ||
      !chunk.parser ||
      chunk.parser.length > 256 ||
      (chunk.location?.length ?? 0) > 16000
    )
      throw new Error("Document extraction exceeds the text/location limit");
    if (
      chunk.page !== null &&
      (!Number.isSafeInteger(chunk.page) ||
        chunk.page < 1 ||
        chunk.page > 10000)
    )
      throw new Error("Document page provenance is invalid");
    bytes += chunk.text.length + (chunk.location?.length ?? 0);
    if (bytes > 12 * 1024 * 1024)
      throw new Error("Document extraction exceeds the surface memory limit");
  }
}
/** Paths use actual donor ancestry/cell addresses or the donor item reference. */
function documentPath(chunk: DocumentChunk): string[] {
  const cell = documentCell(chunk);
  if (cell)
    return [
      ...(cell.group === cell.tableId ? [cell.tableId] : cell.group.split("/")),
      `row:${cell.row}`,
      `cell:${cell.address}`,
    ];
  const reference = chunk.location?.split("; ")[0];
  return reference ? [reference] : [];
}
export function documentReference(
  source: ExtractedDocument,
  chunk: DocumentChunk,
): DocumentTarget {
  if (!chunk.location)
    throw new Error("Document excerpt has no stable source location");
  return {
    kind: "document",
    source_revision_id: source.sourceRevisionId,
    page: chunk.page,
    structural_path: documentPath(chunk),
    location: chunk.location,
  };
}
export function resolveDocumentTarget(
  source: ExtractedDocument,
  target: DocumentTarget,
): DocumentChunk {
  validateExtractedDocument(source);
  if (
    !target ||
    (target.kind !== undefined && target.kind !== "document") ||
    target.source_revision_id !== source.sourceRevisionId
  )
    throw new Error("Document target source revision is not loaded");
  const path =
    target.structural_path === undefined ? [] : target.structural_path;
  if (
    !Array.isArray(path) ||
    path.length > 64 ||
    path.some(
      (part) => typeof part !== "string" || !part || part.length > 1000,
    ) ||
    path.join("/").length > 16000 ||
    (target.page != null &&
      (!Number.isSafeInteger(target.page) ||
        target.page < 1 ||
        target.page > 10000)) ||
    (target.location != null &&
      (typeof target.location !== "string" ||
        !target.location ||
        target.location.length > 16000))
  )
    throw new Error("Document target location is invalid");
  // Every supplied selector must agree. No substring/nearest-cell fallback.
  const matches = source.chunks.filter((chunk) => {
    if (target.page != null && target.page !== chunk.page) return false;
    if (target.location != null && target.location !== chunk.location)
      return false;
    const actual = documentPath(chunk);
    return path.every((part, index) => part === actual[index]);
  });
  if (!matches.length)
    throw new Error(
      "Document target location is absent from the requested source revision",
    );
  // Pages/sections open at their first excerpt; exact items/cells need a unique location.
  const exactItem =
    path.length > 0 &&
    matches.some((chunk) => documentPath(chunk).length === path.length);
  if (matches.length > 1 && (target.location != null || exactItem))
    throw new Error(
      "Document target location is ambiguous; an exact source location is required",
    );
  return matches[0];
}
/** Presentation of actual Docling cell addresses; this does not reparse a workbook. */
export function documentCell(chunk: DocumentChunk): DocumentCell | undefined {
  const match =
    /^([^;]+); (?:pages=[^;]+; |ocr-page-confidence=[^;]+; )*(.*)\/row:(\d+)\/cell:([A-Z]+)(\d+); row-span=(\d+); col-span=(\d+); column-header=(True|False); row-header=(True|False)(?:;|$)/.exec(
      chunk.location ?? "",
    );
  if (!match) return undefined;
  const row = Number(match[3]),
    addressRow = Number(match[5]);
  const column = [...match[4]].reduce(
    (value, letter) => value * 26 + letter.charCodeAt(0) - 64,
    0,
  );
  const rowSpan = Number(match[6]),
    columnSpan = Number(match[7]);
  if (
    !Number.isSafeInteger(row) ||
    row < 1 ||
    row !== addressRow ||
    column < 1 ||
    column > 16384 ||
    !Number.isSafeInteger(column) ||
    !Number.isSafeInteger(rowSpan) ||
    !Number.isSafeInteger(columnSpan) ||
    rowSpan < 1 ||
    columnSpan < 1 ||
    row + rowSpan > 1048577 ||
    column + columnSpan > 16385
  )
    throw new Error("Document cell provenance is invalid");
  return {
    group: match[2],
    tableId: match[1],
    address: match[4] + match[5],
    row,
    column,
    rowSpan,
    columnSpan,
    columnHeader: match[8] === "True",
    rowHeader: match[9] === "True",
  };
}
