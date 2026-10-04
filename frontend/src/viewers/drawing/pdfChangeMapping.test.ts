import { webcrypto } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { mapPdfChanges } from "./pdfChangeMapping";
import type { PdfChangeContext } from "./pdfChangeMapping";
import { PDF_DIFF_ENGINE } from "./pdfDiffTypes";
import type { PdfDiffResult } from "./pdfDiffTypes";
import { normalizeOptions } from "./pdfDiffValidation";

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());
import { context, result } from "./__fixtures__/pdfChanges";
it("maps donor pixel differences to later-revision canonical drawing regions", async () => {
  const source = result();
  const [change] = await mapPdfChanges(source, {
    ...context(),
    rawArtifactKey: "retained-artifact",
  });
  expect(change).toMatchObject({
    project_id: "project",
    source_id: "drawing",
    from_revision_id: "R1",
    to_revision_id: "R2",
    kind: "changed",
    aspects: ["visual_difference"],
    detector: "pdf-diff-viewer",
    detector_version: PDF_DIFF_ENGINE,
    raw_artifact_key: "retained-artifact",
    created_at: context().observedAt,
    subject: {
      kind: "drawing",
      source_revision_id: "R2",
      page: 1,
      normalized_bbox: [0.1, 0.2, 0.3, 0.3],
    },
  });
  expect(change.id).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(change)).not.toMatch(
    /overlay|diffPixels|sourceHash|sourcePages|warnings/,
  );
  expect(source.artifact.warnings).toEqual(["Heuristic page matching"]);
});

it("maps inserted/deleted pages without relabelling deleted content as the new revision", async () => {
  const source = result();
  source.artifact.pages = [];
  source.artifact.addedPages = [1];
  source.artifact.deletedPages = [1];
  const changes = await mapPdfChanges(source, context());
  expect(
    changes.map((change) => [
      change.kind,
      change.subject.source_revision_id,
      change.subject.kind === "drawing" && change.subject.page,
      change.aspects,
    ]),
  ).toEqual([
    ["added", "R2", 1, ["page_presence"]],
    ["deleted", "R1", 1, ["page_presence"]],
  ]);
  expect(
    changes.every(
      (change) =>
        change.from_revision_id === "R1" && change.to_revision_id === "R2",
    ),
  ).toBe(true);
});

it("reverses alignment and crop offsets before normalizing against full source dimensions", async () => {
  const source = result();
  source.artifact.options = normalizeOptions({
    scale: 2,
    cropRegions: [{ page: 1, x: 100, y: 200, width: 400, height: 300 }],
  });
  Object.assign(source.artifact.pages[0], {
    width: 400,
    height: 300,
    boxes: [{ x: 20, y: 30, width: 40, height: 50 }],
    alignment: { dx: 2, dy: -1 },
  });
  const [change] = await mapPdfChanges(source, context());
  expect(change.subject).toMatchObject({
    normalized_bbox: [0.059, 0.144375, 0.079, 0.175625],
  });
});

it("unions donor pixel regions and clips translated coordinates at the later sheet edge", async () => {
  const source = result();
  Object.assign(source.artifact.pages[0], {
    boxes: [
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 980, y: 790, width: 20, height: 10 },
    ],
    alignment: { dx: 3, dy: -3 },
  });
  expect((await mapPdfChanges(source, context()))[0].subject).toMatchObject({
    normalized_bbox: [0, 0.00375, 0.997, 1],
  });
});

it.each(["threshold", "padding"])(
  "retains an honest page-only target for %s-only differences",
  async (kind) => {
    const source = result();
    if (kind === "threshold") source.artifact.pages[0].boxes = [];
    else {
      source.artifact.sourcePages[1][0].width = 50;
      source.artifact.pages[0].boxes = [
        { x: 100, y: 0, width: 20, height: 20 },
      ];
    }
    const [change] = await mapPdfChanges(source, context());
    expect(change.subject).toEqual({
      kind: "drawing",
      source_revision_id: "R2",
      page: 1,
    });
    expect(change.kind).toBe("changed");
  },
);

it("keeps page order and sheet size changes distinct from pixel changes", async () => {
  const source = result();
  source.artifact.sourcePages[1].push({ width: 1000, height: 900 });
  Object.assign(source.artifact.pages[0], {
    pageNumB: 2,
    diffPixels: 0,
    height: 900,
    boxes: [],
  });
  source.artifact.addedPages = [1];
  const [change] = await mapPdfChanges(source, context());
  expect(change.aspects).toEqual(["page_order", "page_size"]);
  expect(change.subject).toEqual({
    kind: "drawing",
    source_revision_id: "R2",
    page: 2,
  });
});

it("unchanged or fully masked pages produce no Changes", async () => {
  const source = result();
  source.artifact.pages[0].diffPixels = 0;
  source.artifact.pages[0].boxes = [];
  source.artifact.options.maskRegions = [
    { page: 1, x: 0, y: 0, width: 1000, height: 800 },
  ];
  expect(await mapPdfChanges(source, context())).toEqual([]);
});

it("preserves retry IDs across timings, overlay bytes and cache hits but binds masks and identities", async () => {
  const first = await mapPdfChanges(result(), context());
  const source = result();
  source.cacheHit = true;
  source.artifact.elapsedMs = 900;
  source.artifact.pages[0].overlayA = new Blob(["different encoding"]);
  expect(await mapPdfChanges(source, context())).toEqual(first);
  for (const mutate of [
    (r: PdfDiffResult, c: PdfChangeContext) => {
      c.operationId = "different operation";
    },
    (r: PdfDiffResult, c: PdfChangeContext) => {
      c.sourceId = "other source";
    },
    (r: PdfDiffResult, c: PdfChangeContext) => {
      c.before.sourceHash = "c".repeat(64);
      r.artifact.sourceHashes[0] = c.before.sourceHash;
    },
    (r: PdfDiffResult) => {
      r.artifact.options.maskRegions.push({
        page: 1,
        x: 900,
        y: 700,
        width: 10,
        height: 10,
      });
    },
  ]) {
    const r = result(),
      c = context();
    mutate(r, c);
    expect((await mapPdfChanges(r, c))[0].id).not.toBe(first[0].id);
  }
});

it("owns provenance and regions before asynchronous hashing without cloning blobs", async () => {
  const source = result(),
    c = context();
  const expected = await mapPdfChanges(source, c);
  const promise = mapPdfChanges(source, c);
  source.artifact.pages[0].boxes[0].x = 900;
  source.artifact.sourcePages[1][0].width = 500;
  c.after.revisionId = "changed";
  c.observedAt = "2026-10-05T00:00:00Z";
  expect(await promise).toEqual(expected);
});
