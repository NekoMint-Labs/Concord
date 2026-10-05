import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import PDFDiffViewer, {
  releaseCanvases,
} from "../../../vendor/pdf-diff-viewer/PDFDiffViewer.js";
import { OffscreenCanvasFactory, WorkerFilterFactory } from "./workerCanvas";
import { normalizeOptions, sha256 } from "./pdfDiffValidation";
import { PDF_DIFF_ENGINE } from "./pdfDiffTypes";
import type {
  DrawingSource,
  PdfDiffArtifact,
  PdfDiffOptions,
} from "./pdfDiffTypes";
const post = self.postMessage as (message: unknown) => void;
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
self.onmessage = async ({
  data,
}: MessageEvent<{
  before: DrawingSource;
  after: DrawingSource;
  options: PdfDiffOptions;
}>) => {
  const tasks: pdfjs.PDFDocumentLoadingTask[] = [];
  const started = performance.now();
  try {
    if (typeof OffscreenCanvas === "undefined")
      throw new Error("OffscreenCanvas is unavailable");
    const options = normalizeOptions(data.options);
    const hashes = await Promise.all([
      sha256(data.before.data),
      sha256(data.after.data),
    ]);
    if (
      hashes[0] !== data.before.sourceHash ||
      hashes[1] !== data.after.sourceHash
    )
      throw new Error("PDF bytes do not match their source revision hashes");
    const load = (bytes: ArrayBuffer) => {
      const task = pdfjs.getDocument({
        data: bytes,
        verbosity: 0,
        CanvasFactory: OffscreenCanvasFactory,
        FilterFactory: WorkerFilterFactory,
        ownerDocument: self as unknown as Document,
        cMapUrl: new URL("/viewer/pdf/cmaps/", self.location.origin).href,
        cMapPacked: true,
        standardFontDataUrl: new URL(
          "/viewer/pdf/standard_fonts/",
          self.location.origin,
        ).href,
        isEvalSupported: false,
        useWorkerFetch: true,
      });
      tasks.push(task);
      return task.promise;
    };
    const [before, after] = await Promise.all([
      load(data.before.data),
      load(data.after.data),
    ]);
    if (before.numPages > 100 || after.numPages > 100)
      throw new Error("PDF diff is limited to 100 pages per source");
    const engine = new PDFDiffViewer({}, { ...options, workerSrc: workerUrl });
    const mappings = await engine._findPageMappings(before, after);
    const artifact: PdfDiffArtifact = {
      engine: PDF_DIFF_ENGINE,
      sourceHashes: [hashes[0], hashes[1]],
      options,
      pages: [],
      addedPages: [],
      deletedPages: [],
      elapsedMs: 0,
      warnings: [
        "Text matching is heuristic; scan-only pages have no reliable text identity.",
        "Worker rasterization does not apply PDF SVG color filters.",
        "Region coordinates are rendered pixels; masks are relative to the cropped page.",
      ],
    };
    let outputBytes = 0;
    for (const mapping of mappings) {
      try {
        const page = await engine._comparePagePair(
          before,
          after,
          mapping.pageA,
          mapping.pageB,
        );
        outputBytes += page.overlayA.size + page.overlayB.size;
        if (outputBytes > 32 * 1024 * 1024)
          throw new Error("PDF comparison exceeds the 32 MiB artifact limit");
        if (
          page.boxes.length +
            page.wordHighlightsA.length +
            page.wordHighlightsB.length >
          20000
        )
          throw new Error("PDF comparison region limit exceeded");
        const crop = options.cropRegions.find(
          (region) => region.page === mapping.pageA,
        );
        const toSource = (box: {
          x: number;
          y: number;
          width: number;
          height: number;
        }) => ({
          x: (box.x + (crop?.x ?? 0)) / options.scale,
          y: (box.y + (crop?.y ?? 0)) / options.scale,
          width: box.width / options.scale,
          height: box.height / options.scale,
        });
        artifact.pages.push({
          ...page,
          similarity: mapping.similarity,
          sourceRegionsA: page.wordHighlightsA.map(toSource),
          sourceRegionsB: page.wordHighlightsB.map(toSource),
        });
      } finally {
        releaseCanvases();
      }
    }
    const mappedA = new Set(mappings.map((p) => p.pageA));
    const mappedB = new Set(mappings.map((p) => p.pageB));
    for (let page = 1; page <= before.numPages; page++)
      if (!mappedA.has(page)) artifact.deletedPages.push(page);
    for (let page = 1; page <= after.numPages; page++)
      if (!mappedB.has(page)) artifact.addedPages.push(page);
    artifact.elapsedMs = performance.now() - started;
    post({ artifact });
  } catch (error) {
    post({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    releaseCanvases();
    await Promise.allSettled(tasks.map((task) => task.destroy()));
    post({ disposed: true });
  }
};
