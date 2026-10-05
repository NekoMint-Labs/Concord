import { afterEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { comparePdfRevisions } from "./pdfDiffAdapter";
import { sha256, normalizeOptions } from "./pdfDiffValidation";
import { clearPdfDiffCache } from "./pdfDiffCache";
import { PDF_DIFF_ENGINE } from "./pdfDiffTypes";
import type { DrawingSource, PdfDiffOptions } from "./pdfDiffTypes";
afterEach(() => {
  vi.unstubAllGlobals();
  clearPdfDiffCache();
});
it("binds verification, worker input and cache to the same immutable bytes and options", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const make = async (
    value: number,
    revisionId: string,
  ): Promise<DrawingSource> => {
    const data = new Uint8Array([value, 2, 3]).buffer;
    return { revisionId, data, sourceHash: await sha256(data) };
  };
  const before = await make(1, "r1"),
    after = await make(4, "r2");
  const options: PdfDiffOptions = {
    maskRegions: [{ page: 1, x: 0, y: 0, width: 5, height: 6 }],
  };
  let ended = 0;
  vi.stubGlobal(
    "Worker",
    class {
      onmessage?: (event: unknown) => void;
      postMessage(input: {
        before: DrawingSource;
        after: DrawingSource;
        options: PdfDiffOptions;
      }) {
        expect(new Uint8Array(input.before.data)[0]).toBe(1);
        expect(new Uint8Array(input.after.data)[0]).toBe(4);
        expect(input.before.revisionId).toBe("r1");
        expect(input.options.maskRegions![0].width).toBe(5);
        this.onmessage?.({
          data: {
            artifact: {
              engine: PDF_DIFF_ENGINE,
              sourceHashes: [input.before.sourceHash, input.after.sourceHash],
              options: normalizeOptions(input.options),
              pages: [],
              addedPages: [],
              deletedPages: [],
              warnings: [],
              elapsedMs: 1,
            },
            disposed: true,
          },
        });
      }
      terminate() {
        ended++;
      }
    },
  );
  const result = comparePdfRevisions(before, after, options);
  new Uint8Array(before.data)[0] = 99;
  new Uint8Array(after.data)[0] = 99;
  before.revisionId = "different revision";
  options.maskRegions![0].width = 500;
  expect((await result).revisionIds).toEqual(["r1", "r2"]);
  expect(ended).toBe(1);
});
