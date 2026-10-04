import { PDF_DIFF_ENGINE } from "./pdfDiffTypes";
import { normalizeOptions } from "./pdfDiffValidation";
import type {
  DrawingBox,
  DrawingSource,
  PdfDiffArtifact,
  PdfDiffResult,
  PdfSheetSize,
} from "./pdfDiffTypes";

/** Trusted invocation identities; does not authorize publication or a Finding. */
export interface PdfChangeContext {
  projectId: string;
  sourceId: string;
  operationId: string;
  before: Pick<DrawingSource, "revisionId" | "sourceHash">;
  after: Pick<DrawingSource, "revisionId" | "sourceHash">;
  observedAt: string;
  rawArtifactKey?: string | null;
}

export function validatePdfChangeContext(
  result: PdfDiffResult,
  context: PdfChangeContext,
) {
  if (
    [context.projectId, context.sourceId, context.operationId].some(
      (value) => typeof value !== "string" || !value.trim(),
    ) ||
    context.operationId.length > 100
  )
    throw new Error(
      "PDF mapping requires project, source and operation identities",
    );
  for (const source of [context.before, context.after]) {
    if (
      typeof source.revisionId !== "string" ||
      !source.revisionId.trim() ||
      source.revisionId.length > 512 ||
      !/^[a-f0-9]{64}$/.test(source.sourceHash)
    )
      throw new Error(
        "PDF mapping requires revision IDs and full SHA-256 hashes",
      );
  }
  if (context.before.revisionId === context.after.revisionId)
    throw new Error("PDF comparison revisions must be distinct");
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(
      context.observedAt,
    ) ||
    !Number.isFinite(Date.parse(context.observedAt)) ||
    new Date(context.observedAt).toISOString().slice(0, 19) !==
      context.observedAt.slice(0, 19)
  )
    throw new Error("PDF mapping requires a stable UTC observation time");
  if (
    result.artifact.engine !== PDF_DIFF_ENGINE ||
    result.revisionIds.length !== 2 ||
    result.artifact.sourceHashes.length !== 2 ||
    result.revisionIds[0] !== context.before.revisionId ||
    result.revisionIds[1] !== context.after.revisionId ||
    result.artifact.sourceHashes[0] !== context.before.sourceHash ||
    result.artifact.sourceHashes[1] !== context.after.sourceHash
  )
    throw new Error(
      "PDF comparison does not match its engine or revision/hash pair",
    );
}

function pageSizes(sizes: PdfSheetSize[]) {
  if (
    !Array.isArray(sizes) ||
    sizes.length < 1 ||
    sizes.length > 100 ||
    sizes.some(
      (size) =>
        ![size.width, size.height].every(
          (value) => Number.isFinite(value) && value > 0 && value <= 100000,
        ),
    )
  )
    throw new Error("PDF mapping requires bounded full source page dimensions");
}
function claim(page: number, sizes: PdfSheetSize[], claimed: Set<number>) {
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > sizes.length ||
    claimed.has(page)
  )
    throw new Error(
      "PDF comparison contains an invalid or duplicate page assignment",
    );
  claimed.add(page);
}
function boxes(
  regions: DrawingBox[],
  width: number,
  height: number,
  raster: boolean,
) {
  for (const box of regions) {
    if (
      ![box.x, box.y, box.width, box.height].every(Number.isFinite) ||
      box.width <= 0 ||
      box.height <= 0 ||
      (raster &&
        (!Object.values(box).every(Number.isInteger) ||
          box.x < 0 ||
          box.y < 0 ||
          box.x + box.width > width ||
          box.y + box.height > height))
    )
      throw new Error("PDF comparison contains an invalid region");
  }
}

/** Checks the complete page partition even when a result would produce no Changes. */
export function validatePdfChangeArtifact(artifact: PdfDiffArtifact) {
  if (!Array.isArray(artifact.sourcePages) || artifact.sourcePages.length !== 2)
    throw new Error("PDF mapping requires full source page inventories");
  const [before, after] = artifact.sourcePages;
  pageSizes(before);
  pageSizes(after);
  if (
    artifact.pages.length > 100 ||
    artifact.addedPages.length > 100 ||
    artifact.deletedPages.length > 100
  )
    throw new Error("PDF mapping exceeds the bounded page result limit");
  const options = normalizeOptions(artifact.options);
  const usedA = new Set<number>(),
    usedB = new Set<number>();
  let totalRegions = 0;
  for (const page of artifact.pages) {
    claim(page.pageNumA, before, usedA);
    claim(page.pageNumB, after, usedB);
    const a = before[page.pageNumA - 1],
      b = after[page.pageNumB - 1];
    const crop = options.cropRegions.find(
      (region) => region.page === page.pageNumA,
    );
    if (
      crop &&
      [a, b].some(
        (size) =>
          crop.x + crop.width > Math.floor(size.width * options.scale) ||
          crop.y + crop.height > Math.floor(size.height * options.scale),
      )
    )
      throw new Error("PDF crop contradicts source page dimensions");
    const width =
      crop?.width ??
      Math.max(
        Math.floor(a.width * options.scale),
        Math.floor(b.width * options.scale),
      );
    const height =
      crop?.height ??
      Math.max(
        Math.floor(a.height * options.scale),
        Math.floor(b.height * options.scale),
      );
    if (
      page.width !== width ||
      page.height !== height ||
      width < 1 ||
      height < 1 ||
      width * height > 6000000 ||
      !Number.isInteger(page.diffPixels) ||
      page.diffPixels < 0 ||
      page.diffPixels > width * height ||
      ![page.alignment.dx, page.alignment.dy].every(
        (value) =>
          Number.isInteger(value) && Math.abs(value) <= options.maxShift,
      ) ||
      (page.similarity != null &&
        (!Number.isFinite(page.similarity) ||
          page.similarity < 0 ||
          page.similarity > 1))
    )
      throw new Error(
        "PDF comparison has inconsistent raster, alignment or pixel statistics",
      );
    const count =
      page.boxes.length +
      page.wordHighlightsA.length +
      page.wordHighlightsB.length;
    totalRegions += count;
    if (count > 20000 || totalRegions > 100000)
      throw new Error("PDF comparison exceeds the bounded region result limit");
    boxes(page.boxes, width, height, true);
    boxes(page.wordHighlightsA, width, height, false);
    boxes(page.wordHighlightsB, width, height, false);
    if (
      page.diffPixels === 0 &&
      (page.boxes.length ||
        page.wordHighlightsA.length ||
        page.wordHighlightsB.length)
    )
      throw new Error("Unchanged PDF page contradicts its highlighted regions");
  }
  for (const page of artifact.deletedPages) claim(page, before, usedA);
  for (const page of artifact.addedPages) claim(page, after, usedB);
  if (usedA.size !== before.length || usedB.size !== after.length)
    throw new Error("PDF comparison page assignments are incomplete");
}
