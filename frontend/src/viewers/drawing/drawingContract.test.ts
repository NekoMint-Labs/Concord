import { describe, expect, it } from "vitest";
import { toDrawingNavigation, validateDrawingTarget } from "./drawingContract";
import type { DrawingTarget } from "./drawingContract";

const source = {
  revisionId: "r2",
  sourceHash: "a".repeat(64),
  data: new ArrayBuffer(1),
};
const target: DrawingTarget = {
  kind: "drawing",
  source_revision_id: "r2",
  page: 2,
  normalized_bbox: [0.1, 0.2, 0.5, 0.8],
};

describe("canonical DrawingTarget navigation", () => {
  it("binds the loaded revision hash and uses the actual requested sheet dimensions", () => {
    const first = toDrawingNavigation(target, source, {
      width: 600,
      height: 800,
    });
    expect(first).toMatchObject({
      sourceRevisionId: "r2",
      sourceHash: source.sourceHash,
      page: 2,
    });
    expect(first.region!.x).toBe(60);
    expect(first.region!.y).toBe(160);
    expect(first.region!.width).toBe(240);
    expect(first.region!.height).toBeCloseTo(480);
    const second = toDrawingNavigation(target, source, {
      width: 800,
      height: 600,
    });
    expect(second.region!.x).toBe(80);
    expect(second.region!.y).toBe(120);
    expect(second.region!.width).toBe(320);
    expect(second.region!.height).toBeCloseTo(360);
    expect(target.normalized_bbox).toEqual([0.1, 0.2, 0.5, 0.8]);
  });
  it.each([undefined, null])(
    "supports page-only targets with region %s",
    (normalized_bbox) => {
      const result = toDrawingNavigation(
        { ...target, normalized_bbox },
        source,
        { width: 600, height: 800 },
      );
      expect(result).not.toHaveProperty("region");
      expect(result.page).toBe(2);
    },
  );
  it("rejects an unloaded revision before navigating and accepts a new identity for the same bytes", () => {
    expect(() =>
      validateDrawingTarget(source, { ...target, source_revision_id: "r1" }),
    ).toThrow("revision or hash");
    expect(() =>
      validateDrawingTarget(
        { ...source, revisionId: "r3" },
        { ...target, source_revision_id: "r3" },
      ),
    ).not.toThrow();
  });
  it.each([
    [-0.1, 0, 0.5, 1],
    [0, 0, 1.1, 1],
    [0.5, 0, 0.1, 1],
    [0, 0.5, 1, 0.1],
    [0, 0, 0, 1],
    [0, 0, 1, NaN],
    [0, 0, Infinity, 1],
    [0, 0, 1],
    [0, 0, 1, 1, 2],
  ])("rejects invalid normalized geometry %j", (...box) => {
    expect(() =>
      validateDrawingTarget(source, {
        ...target,
        normalized_bbox: box as DrawingTarget["normalized_bbox"],
      }),
    ).toThrow("normalized");
  });
  it.each([0, 101, 1.5, NaN])(
    "rejects unavailable or invalid page %s",
    (page) => {
      expect(() => validateDrawingTarget(source, { ...target, page })).toThrow(
        "page",
      );
    },
  );
  it("rejects wrong target kinds and invalid sheet dimensions", () => {
    expect(() =>
      validateDrawingTarget(source, {
        ...target,
        kind: "bim",
      } as unknown as DrawingTarget),
    ).toThrow("not a drawing");
    for (const dimensions of [
      { width: 0, height: 1 },
      { width: 1, height: NaN },
      { width: Infinity, height: 1 },
    ])
      expect(() => toDrawingNavigation(target, source, dimensions)).toThrow(
        "dimensions",
      );
  });
});
