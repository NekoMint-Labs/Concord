import {
  previewPixelWidth,
  previewViewport,
} from "../../../vendor/opentakeoff/sheetPreview.js";
import type { DrawingSheetArtifact } from "./drawingArtifactTypes";
/** Paint cached donor rasters without reopening a PDF parser or retaining decoded images. */
export async function paintDrawingSheet(
  canvas: HTMLCanvasElement,
  sheet: DrawingSheetArtifact,
  zoom: number,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (typeof createImageBitmap !== "function")
    throw new Error("Drawing bitmap decoding is unavailable");
  const bitmap = await createImageBitmap(sheet.image);
  try {
    signal.throwIfAborted();
    const viewport = previewViewport(
      {
        getViewport: ({ scale }: { scale: number }) => ({
          width: sheet.width * scale,
          height: sheet.height * scale,
        }),
      },
      previewPixelWidth(900 * zoom, window.devicePixelRatio),
    );
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Drawing canvas is unavailable");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  } finally {
    bitmap.close();
  }
}
