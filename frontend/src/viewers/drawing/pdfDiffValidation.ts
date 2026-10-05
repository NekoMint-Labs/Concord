import type { DrawingSource, PdfDiffOptions } from "./pdfDiffTypes";
export function validateSource(source: DrawingSource) {
  if (
    typeof source.revisionId !== "string" ||
    !source.revisionId ||
    source.revisionId.length > 512 ||
    typeof source.sourceHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(source.sourceHash)
  )
    throw new Error("A source revision and SHA-256 are required");
  let size: number;
  try {
    size = Object.getOwnPropertyDescriptor(
      ArrayBuffer.prototype,
      "byteLength",
    )!.get!.call(source.data);
  } catch {
    throw new Error("PDF bytes must be an ArrayBuffer");
  }
  if (!size || size > 32 * 1024 * 1024)
    throw new Error("PDF input must be between one byte and 32 MiB");
}
export function snapshotDrawingSource(source: DrawingSource): DrawingSource {
  validateSource(source);
  const data = new ArrayBuffer(source.data.byteLength);
  new Uint8Array(data).set(new Uint8Array(source.data));
  return { revisionId: source.revisionId, sourceHash: source.sourceHash, data };
}
export function normalizeOptions(
  options: PdfDiffOptions = {},
): Required<PdfDiffOptions> {
  const normalized = {
    scale: options.scale ?? 1.5,
    maxShift: options.maxShift ?? 3,
    colorTolerance: options.colorTolerance ?? 120,
    minHighlightArea: options.minHighlightArea ?? 60,
    cropRegions: options.cropRegions ?? [],
    maskRegions: options.maskRegions ?? [],
  };
  for (const [key, min, max] of [
    ["scale", 0.25, 3],
    ["maxShift", 0, 10],
    ["colorTolerance", 0, 765],
    ["minHighlightArea", 0, 6000000],
  ] as const) {
    const value = normalized[key];
    if (!Number.isFinite(value) || value < min || value > max)
      throw new Error(`Invalid PDF diff option: ${key}`);
    if (key !== "scale" && !Number.isInteger(value))
      throw new Error(`PDF diff option must be integral: ${key}`);
  }
  if (normalized.cropRegions.length + normalized.maskRegions.length > 256)
    throw new Error("Too many PDF regions");
  const pages = new Set<number>();
  for (const [kind, regions] of [
    ["crop", normalized.cropRegions],
    ["mask", normalized.maskRegions],
  ] as const) {
    for (const region of regions) {
      if (
        ![region.page, region.x, region.y, region.width, region.height].every(
          Number.isInteger,
        ) ||
        region.page < 1 ||
        region.x < 0 ||
        region.y < 0 ||
        region.width < 1 ||
        region.height < 1 ||
        region.x + region.width > 100000 ||
        region.y + region.height > 100000
      )
        throw new Error("Invalid PDF region; coordinates are rendered pixels");
      if (kind === "crop" && pages.has(region.page))
        throw new Error("Duplicate page crop");
      if (kind === "crop") pages.add(region.page);
    }
  }
  return normalized;
}
export async function sha256(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
