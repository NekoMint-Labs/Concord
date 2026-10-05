import type {
  DocumentChunk,
  DocumentNavigation,
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
export function documentReference(
  source: ExtractedDocument,
  chunk: DocumentChunk,
): DocumentNavigation {
  return {
    sourceRevisionId: source.sourceRevisionId,
    sourceHash: source.sourceHash,
    chunkId: chunk.id,
    page: chunk.page,
    location: chunk.location,
  };
}
export function resolveDocumentTarget(
  source: ExtractedDocument,
  target: DocumentNavigation,
): DocumentChunk {
  if (
    target.sourceRevisionId !== source.sourceRevisionId ||
    target.sourceHash !== source.sourceHash
  )
    throw new Error(
      "Document target revision is not loaded or its hash changed",
    );
  const chunk = source.chunks.find((item) => item.id === target.chunkId);
  if (!chunk)
    throw new Error(
      "Document excerpt is absent from the requested source revision",
    );
  if (
    (target.page !== undefined && target.page !== chunk.page) ||
    (target.location !== undefined && target.location !== chunk.location)
  )
    throw new Error(
      "Document target location does not match the source excerpt",
    );
  return chunk;
}
/** Presentation of actual Docling cell addresses; this does not reparse a workbook. */
export function documentCell(chunk: DocumentChunk): DocumentCell | undefined {
  const match =
    /^([^;]+); (.*)\/row:(\d+)\/cell:([A-Z]+)(\d+); row-span=(\d+); col-span=(\d+); column-header=(True|False); row-header=(True|False)(?:;|$)/.exec(
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
