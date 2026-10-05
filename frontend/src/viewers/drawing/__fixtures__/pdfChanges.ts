import type { PdfChangeContext } from "../pdfChangeMapping";
import { PDF_DIFF_ENGINE } from "../pdfDiffTypes";
import type { PdfDiffResult } from "../pdfDiffTypes";
import { normalizeOptions } from "../pdfDiffValidation";

export function context(): PdfChangeContext {
  return {
    projectId: "project",
    sourceId: "drawing",
    operationId: "pdf-comparison",
    before: { revisionId: "R1", sourceHash: "a".repeat(64) },
    after: { revisionId: "R2", sourceHash: "b".repeat(64) },
    observedAt: "2026-10-04T09:00:00.000Z",
  };
}
export function result(): PdfDiffResult {
  return {
    revisionIds: ["R1", "R2"],
    cacheHit: false,
    artifact: {
      engine: PDF_DIFF_ENGINE,
      sourceHashes: ["a".repeat(64), "b".repeat(64)],
      sourcePages: [
        [{ width: 1000, height: 800 }],
        [{ width: 1000, height: 800 }],
      ],
      options: normalizeOptions({ scale: 1 }),
      addedPages: [],
      deletedPages: [],
      warnings: ["Heuristic page matching"],
      elapsedMs: 10,
      pages: [
        {
          pageNumA: 1,
          pageNumB: 1,
          diffPixels: 100,
          width: 1000,
          height: 800,
          boxes: [{ x: 100, y: 160, width: 200, height: 80 }],
          wordHighlightsA: [],
          wordHighlightsB: [],
          overlayA: new Blob(["before"]),
          overlayB: new Blob(["after"]),
          alignment: { dx: 0, dy: 0 },
          similarity: 0.9,
        },
      ],
    },
  };
}
