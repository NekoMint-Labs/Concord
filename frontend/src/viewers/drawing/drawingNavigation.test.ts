import { expect, it } from "vitest";
import { validateDrawingNavigation } from "./drawingNavigation";
const source = {
  revisionId: "r1",
  sourceHash: "a".repeat(64),
  data: new ArrayBuffer(1),
};
const target = {
  sourceRevisionId: "r1",
  sourceHash: source.sourceHash,
  page: 1,
};
it("requires the exact source revision and hash", () => {
  expect(() => validateDrawingNavigation(source, target)).not.toThrow();
  expect(() =>
    validateDrawingNavigation(source, { ...target, sourceRevisionId: "r2" }),
  ).toThrow("revision or hash");
  expect(() =>
    validateDrawingNavigation(source, {
      ...target,
      sourceHash: "b".repeat(64),
    }),
  ).toThrow("revision or hash");
});
it.each([0, -1, 1.5, NaN, Infinity, 101])(
  "rejects invalid target page %s",
  (page) => {
    expect(() =>
      validateDrawingNavigation(source, { ...target, page }),
    ).toThrow("page");
  },
);
it("bounds finite source-space regions", () => {
  expect(() =>
    validateDrawingNavigation(source, {
      ...target,
      region: { x: 0, y: 0, width: 0.5, height: 1 },
    }),
  ).not.toThrow();
  for (const region of [
    { x: -1, y: 0, width: 1, height: 1 },
    { x: 0, y: 0, width: NaN, height: 1 },
    { x: 0, y: 0, width: 0, height: 1 },
    { x: 100000, y: 0, width: 1, height: 1 },
  ])
    expect(() =>
      validateDrawingNavigation(source, { ...target, region }),
    ).toThrow("region");
});
