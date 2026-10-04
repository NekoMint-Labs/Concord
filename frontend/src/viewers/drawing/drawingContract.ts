import type { components } from "../../api/schema";
import type { DrawingSource } from "./pdfDiffTypes";
import type { DrawingNavigation } from "./drawingNavigation";
import { validateDrawingNavigation } from "./drawingNavigation";

export type DrawingTarget = components["schemas"]["DrawingTarget"];

/** Canonical revision identity crosses the seam; hashes stay inside the viewer. */
export function validateDrawingTarget(
  source: DrawingSource,
  target: DrawingTarget,
) {
  if (target.kind != null && target.kind !== "drawing")
    throw new Error("Viewer target is not a drawing target");
  validateDrawingNavigation(source, {
    sourceRevisionId: target.source_revision_id,
    sourceHash: source.sourceHash,
    page: target.page,
  });
  const box = target.normalized_bbox;
  if (box != null) {
    const [x0, y0, x1, y1] = box;
    if (
      box.length !== 4 ||
      !box.every(Number.isFinite) ||
      !(0 <= x0 && x0 < x1 && x1 <= 1 && 0 <= y0 && y0 < y1 && y1 <= 1)
    )
      throw new Error("Invalid normalized drawing target region");
  }
}

export function toDrawingNavigation(
  target: DrawingTarget,
  source: DrawingSource,
  dimensions: { width: number; height: number },
): DrawingNavigation {
  validateDrawingTarget(source, target);
  if (
    ![dimensions.width, dimensions.height].every(Number.isFinite) ||
    dimensions.width <= 0 ||
    dimensions.height <= 0
  )
    throw new Error("Drawing sheet dimensions are unavailable");
  const box = target.normalized_bbox;
  const navigation: DrawingNavigation = {
    sourceRevisionId: source.revisionId,
    sourceHash: source.sourceHash,
    page: target.page,
    ...(box != null
      ? {
          region: {
            x: box[0] * dimensions.width,
            y: box[1] * dimensions.height,
            width: (box[2] - box[0]) * dimensions.width,
            height: (box[3] - box[1]) * dimensions.height,
          },
        }
      : {}),
  };
  validateDrawingNavigation(source, navigation);
  return navigation;
}
