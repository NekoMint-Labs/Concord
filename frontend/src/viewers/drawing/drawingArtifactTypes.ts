import type { NativeTextRun } from "../../../vendor/opentakeoff/AnnotationWorkbench";
/** Internal derived drawing data; source revisions bind at the surface, outside the cache. */
export interface DrawingSheetArtifact {
  page: number;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  image: Blob;
  textRuns: NativeTextRun[];
}
export interface DrawingArtifact {
  engine: string;
  sourceHash: string;
  sheets: DrawingSheetArtifact[];
  preparationMs: number;
}
export const DRAWING_ENGINE =
  "opentakeoff@60c82e34b389384401a083cefeb9389f89fbaae1/pdfjs@4.10.38/drawing-raster-v1";
export const DRAWING_RENDER_OPTIONS = Object.freeze({
  width: 2400,
  maxPixels: 6000000,
  maxPages: 100,
});
export const DRAWING_CACHE_BYTES = 32 * 1024 * 1024;
export function drawingSheetBytes(sheet: DrawingSheetArtifact) {
  // Conservative serialized metadata estimate plus immutable PNG bytes; no source/SDK state is retained.
  return (
    sheet.image.size +
    JSON.stringify({ ...sheet, image: null }).length * 2 +
    sheet.textRuns.length * 128
  );
}
