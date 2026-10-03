/** Adapted from OpenTakeoff pdfTile.worker.ts at 60c82e34; Apache-2.0. */
export class OffscreenCanvasFactory {
  create(width: number, height: number) {
    if (width <= 0 || height <= 0 || width * height > 6000000)
      throw new Error("Invalid or oversized PDF canvas");
    const canvas = new OffscreenCanvas(width, height);
    return {
      canvas,
      context: canvas.getContext("2d", { willReadFrequently: true }),
    };
  }
  reset(cc: { canvas: OffscreenCanvas | null }, width: number, height: number) {
    if (!cc.canvas || width <= 0 || height <= 0 || width * height > 6000000)
      throw new Error("Invalid or oversized PDF canvas");
    cc.canvas.width = width;
    cc.canvas.height = height;
  }
  destroy(cc: { canvas: OffscreenCanvas | null; context: unknown }) {
    if (!cc.canvas) return;
    cc.canvas.width = 0;
    cc.canvas.height = 0;
    cc.canvas = null;
    cc.context = null;
  }
}
// The donor's DOM-less rendering path has no SVG filters. This limitation is
// reported in every diff result; it must not silently imply complete fidelity.
export class WorkerFilterFactory {
  addFilter() {
    return "none";
  }
  addHCMFilter() {
    return "none";
  }
  addAlphaFilter() {
    return "none";
  }
  addLuminosityFilter() {
    return "none";
  }
  addHighlightHCMFilter() {
    return "none";
  }
  destroy() {}
}
