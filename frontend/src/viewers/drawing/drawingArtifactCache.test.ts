import { afterEach, expect, it } from "vitest";
// Node Blob preserves immutable bytes through structuredClone in the jsdom runtime.
import { Blob } from "node:buffer";
import {
  cachedDrawingArtifact,
  cacheDrawingArtifact,
  clearDrawingArtifactCache,
  drawingArtifactKey,
} from "./drawingArtifactCache";
import { DRAWING_ENGINE } from "./drawingArtifactTypes";
import type { DrawingArtifact } from "./drawingArtifactTypes";
afterEach(clearDrawingArtifactCache);
const artifact = (hash: string, bytes = 1): DrawingArtifact => ({
  engine: DRAWING_ENGINE,
  sourceHash: hash,
  preparationMs: 2,
  sheets: [
    {
      page: 1,
      width: 600,
      height: 420,
      pixelWidth: 2400,
      pixelHeight: 1680,
      image: new Blob([new Uint8Array(bytes)], {
        type: "image/png",
      }) as unknown as globalThis.Blob,
      textRuns: [
        {
          text: "Original",
          quad: [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ],
          rect: [
            [0, 0],
            [1, 1],
          ],
        },
      ],
    },
  ],
});
it("separates derived identity from revision IDs and protects mutable metadata", () => {
  const hash = "a".repeat(64),
    key = drawingArtifactKey(hash);
  expect(key).toContain(DRAWING_ENGINE);
  expect(key).toContain("2400");
  const original = artifact(hash);
  cacheDrawingArtifact(key, original);
  original.sheets[0].textRuns[0].text = "Caller mutation";
  const copy = cachedDrawingArtifact(key)!;
  copy.sheets[0].textRuns[0].quad[0][0] = 999;
  expect(cachedDrawingArtifact(key)!.sheets[0].textRuns[0]).toMatchObject({
    text: "Original",
    quad: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  });
  expect(copy.sheets[0].image.size).toBe(1);
  expect(JSON.stringify(copy)).not.toContain("revisionId");
});
it("evicts least-recently-used artifacts by entry count", () => {
  for (const hash of ["a", "b", "c", "d"])
    cacheDrawingArtifact(drawingArtifactKey(hash), artifact(hash));
  expect(cachedDrawingArtifact(drawingArtifactKey("a"))).toBeDefined();
  cacheDrawingArtifact(drawingArtifactKey("e"), artifact("e"));
  expect(cachedDrawingArtifact(drawingArtifactKey("b"))).toBeUndefined();
  expect(cachedDrawingArtifact(drawingArtifactKey("a"))).toBeDefined();
});
it("enforces a total byte budget and never inserts an oversized or misbound artifact", () => {
  cacheDrawingArtifact(
    drawingArtifactKey("a"),
    artifact("a", 17 * 1024 * 1024),
  );
  cacheDrawingArtifact(
    drawingArtifactKey("b"),
    artifact("b", 17 * 1024 * 1024),
  );
  expect(cachedDrawingArtifact(drawingArtifactKey("a"))).toBeUndefined();
  expect(cachedDrawingArtifact(drawingArtifactKey("b"))).toBeDefined();
  expect(() =>
    cacheDrawingArtifact(
      drawingArtifactKey("c"),
      artifact("c", 32 * 1024 * 1024),
    ),
  ).toThrow("32 MiB");
  expect(() =>
    cacheDrawingArtifact(drawingArtifactKey("c"), artifact("other")),
  ).toThrow("identity");
  expect(cachedDrawingArtifact(drawingArtifactKey("c"))).toBeUndefined();
});
