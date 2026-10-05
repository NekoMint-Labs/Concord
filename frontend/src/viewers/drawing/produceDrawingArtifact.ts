import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { previewViewport } from "../../../vendor/opentakeoff/sheetPreview.js";
import { nativeTextRuns } from "../../../vendor/opentakeoff/annotationTools.js";
import {
  DRAWING_ENGINE,
  DRAWING_RENDER_OPTIONS,
  DRAWING_CACHE_BYTES,
  drawingSheetBytes,
} from "./drawingArtifactTypes";
import type {
  DrawingArtifact,
  DrawingSheetArtifact,
} from "./drawingArtifactTypes";
import type { DrawingSource } from "./pdfDiffTypes";
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
function png(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Drawing raster encoding failed")),
      "image/png",
    ),
  );
}
/** Parse one verified snapshot, materialize all bounded sheets, then release the SDK lifetime. */
export async function produceDrawingArtifact(
  source: DrawingSource,
  signal: AbortSignal,
  progress: (page: number, total: number) => void,
): Promise<DrawingArtifact> {
  signal.throwIfAborted();
  const started = performance.now();
  const task = pdfjs.getDocument({
    data: source.data,
    isEvalSupported: false,
    cMapUrl: "/viewer/pdf/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/viewer/pdf/standard_fonts/",
  });
  let canvas: HTMLCanvasElement | undefined;
  let renderTask: pdfjs.RenderTask | undefined;
  const abort = () => {
    renderTask?.cancel();
    void task.destroy().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const document = await task.promise;
    signal.throwIfAborted();
    if (
      document.numPages < 1 ||
      document.numPages > DRAWING_RENDER_OPTIONS.maxPages
    )
      throw new Error("Drawing exceeds the 100-page limit");
    const sheets: DrawingSheetArtifact[] = [];
    let bytes = 0,
      textRuns = 0;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      signal.throwIfAborted();
      progress(pageNumber, document.numPages);
      const page = await document.getPage(pageNumber);
      try {
        const base = page.getViewport({ scale: 1 });
        if (
          ![base.width, base.height].every(
            (value) => Number.isFinite(value) && value > 0 && value <= 100000,
          )
        )
          throw new Error("Drawing page dimensions are unsupported");
        const viewport = previewViewport(page, DRAWING_RENDER_OPTIONS.width);
        const width = Math.floor(viewport.width),
          height = Math.floor(viewport.height);
        if (
          width < 1 ||
          height < 1 ||
          width > 16384 ||
          height > 16384 ||
          width * height > DRAWING_RENDER_OPTIONS.maxPixels
        )
          throw new Error("Drawing raster exceeds the canvas budget");
        canvas = window.document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Drawing canvas is unavailable");
        renderTask = page.render({
          canvasContext: context,
          viewport,
          background: "#ffffff",
        });
        await renderTask.promise;
        renderTask = undefined;
        signal.throwIfAborted();
        const nativeRuns = nativeTextRuns(
          await page.getTextContent(),
          base.transform,
        );
        textRuns += nativeRuns.length;
        if (nativeRuns.length > 20000 || textRuns > 100000)
          throw new Error("Drawing native text exceeds the extraction budget");
        const sheet: DrawingSheetArtifact = {
          page: pageNumber,
          width: base.width,
          height: base.height,
          pixelWidth: width,
          pixelHeight: height,
          image: await png(canvas),
          textRuns: nativeRuns,
        };
        signal.throwIfAborted();
        bytes += drawingSheetBytes(sheet);
        if (bytes > DRAWING_CACHE_BYTES)
          throw new Error("Drawing artifacts exceed the 32 MiB cache limit");
        sheets.push(sheet);
      } finally {
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
          canvas = undefined;
        }
        renderTask = undefined;
        page.cleanup();
      }
    }
    return {
      engine: DRAWING_ENGINE,
      sourceHash: source.sourceHash,
      sheets,
      preparationMs: performance.now() - started,
    };
  } catch (failure) {
    if (signal.aborted) signal.throwIfAborted();
    throw failure;
  } finally {
    signal.removeEventListener("abort", abort);
    renderTask?.cancel();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    await task.destroy();
  }
}
