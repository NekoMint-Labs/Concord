import { describe, expect, it } from "vitest";
import {
  normalizeOptions,
  validateSource,
  snapshotDrawingSource,
} from "./pdfDiffValidation";
import {
  pdfDiffCacheKey,
  cachePdfDiff,
  cachedPdfDiff,
  clearPdfDiffCache,
} from "./pdfDiffCache";
import { PDF_DIFF_ENGINE } from "./pdfDiffTypes";
describe("PDF worker boundary", () => {
  it("requires revision-bound bytes and bounded input", () => {
    expect(() =>
      validateSource({
        revisionId: "r1",
        sourceHash: "a".repeat(64),
        data: new ArrayBuffer(1),
      }),
    ).not.toThrow();
    for (const source of [
      { revisionId: "", sourceHash: "a".repeat(64), data: new ArrayBuffer(1) },
      { revisionId: "r1", sourceHash: "invalid", data: new ArrayBuffer(1) },
      {
        revisionId: "r1",
        sourceHash: "a".repeat(64),
        data: new ArrayBuffer(0),
      },
      {
        revisionId: "r1",
        sourceHash: "a".repeat(64),
        data: new ArrayBuffer(32 * 1024 * 1024 + 1),
      },
    ])
      expect(() => validateSource(source)).toThrow();
  });
  it("checks the actual byte-buffer brand and snapshots before asynchronous work", () => {
    const source = {
      revisionId: "r1",
      sourceHash: "a".repeat(64),
      data: new Uint8Array([1, 2, 3]).buffer,
    };
    const snapshot = snapshotDrawingSource(source);
    new Uint8Array(source.data)[0] = 99;
    source.revisionId = "r2";
    expect(new Uint8Array(snapshot.data)).toEqual(new Uint8Array([1, 2, 3]));
    expect(snapshot.revisionId).toBe("r1");
    for (const fake of [
      { byteLength: 5, slice: () => new ArrayBuffer(5) },
      new Uint8Array(5),
      new SharedArrayBuffer(5),
    ]) {
      expect(() =>
        validateSource({ ...source, data: fake as ArrayBuffer }),
      ).toThrow("ArrayBuffer");
    }
  });
  it.each([
    { scale: Infinity },
    { maxShift: 100 },
    { maxShift: 0.5 },
    { colorTolerance: -1 },
    { minHighlightArea: NaN },
    { cropRegions: [{ page: 1, x: -1, y: 0, width: 1, height: 1 }] },
    { maskRegions: [{ page: 0, x: 0, y: 0, width: 1, height: 1 }] },
    { maskRegions: [{ page: 1, x: 0, y: 0, width: 1.5, height: 1 }] },
  ])("rejects invalid options %j", (options) =>
    expect(() => normalizeOptions(options)).toThrow(),
  );
  it("validates region counts and preserves explicit zeros", () => {
    const region = { page: 1, x: 0, y: 0, width: 1, height: 1 };
    expect(() => normalizeOptions({ cropRegions: [region, region] })).toThrow();
    expect(() =>
      normalizeOptions({ maskRegions: Array(257).fill(region) }),
    ).toThrow();
    expect(
      normalizeOptions({ maxShift: 0, colorTolerance: 0, minHighlightArea: 0 }),
    ).toMatchObject({ maxShift: 0, colorTolerance: 0, minHighlightArea: 0 });
  });
  it("keys derived results by both hashes, engine version and effective options", () => {
    const key = pdfDiffCacheKey(["a", "b"], {});
    expect(key).toContain(PDF_DIFF_ENGINE);
    expect(key).toBe(pdfDiffCacheKey(["a", "b"], normalizeOptions()));
    expect(key).not.toBe(pdfDiffCacheKey(["a", "c"], {}));
    expect(key).not.toBe(pdfDiffCacheKey(["a", "b"], { scale: 2 }));
  });
  it("copies cache values and evicts old artifacts", () => {
    clearPdfDiffCache();
    const artifact = {
      engine: PDF_DIFF_ENGINE,
      options: normalizeOptions(),
      sourcePages: [[], []] as [[], []],
      sourceHashes: ["a", "b"] as [string, string],
      pages: [],
      addedPages: [],
      deletedPages: [],
      warnings: [],
      elapsedMs: 10,
    };
    for (let i = 0; i < 5; i++) cachePdfDiff(String(i), artifact);
    expect(cachedPdfDiff("0")).toBeUndefined();
    const cached = cachedPdfDiff("4")!;
    cached.warnings.push("mutation");
    expect(cachedPdfDiff("4")?.warnings).toEqual([]);
    clearPdfDiffCache();
    expect(cachedPdfDiff("4")).toBeUndefined();
  });
});
