import type { DrawingBox, DrawingSource } from "./pdfDiffTypes";
/** Local navigation value. Canonical ViewerTarget publication remains A-owned. */
export interface DrawingNavigation {
  sourceRevisionId: string;
  sourceHash: string;
  page: number;
  region?: DrawingBox;
}
export function validateDrawingNavigation(
  source: DrawingSource,
  target: DrawingNavigation,
) {
  if (
    target.sourceRevisionId !== source.revisionId ||
    target.sourceHash !== source.sourceHash
  )
    throw new Error(
      "Drawing target belongs to a different source revision or hash",
    );
  if (!Number.isInteger(target.page) || target.page < 1 || target.page > 100)
    throw new Error("Invalid drawing target page");
  if (target.region) {
    const { x, y, width, height } = target.region;
    if (
      ![x, y, width, height].every(Number.isFinite) ||
      x < 0 ||
      y < 0 ||
      width <= 0 ||
      height <= 0 ||
      x + width > 100000 ||
      y + height > 100000
    )
      throw new Error("Invalid drawing target region");
  }
}
