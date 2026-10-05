import { webcrypto } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { mapPdfChanges } from "./pdfChangeMapping";
import type { PdfChangeContext } from "./pdfChangeMapping";
import type { PdfDiffResult } from "./pdfDiffTypes";
import { context, result } from "./__fixtures__/pdfChanges";
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());

const invalidContext: [
  string,
  (r: PdfDiffResult, c: PdfChangeContext) => void,
][] = [
  [
    "empty project",
    (_, c) => {
      c.projectId = " ";
    },
  ],
  [
    "empty source",
    (_, c) => {
      c.sourceId = "";
    },
  ],
  [
    "empty operation",
    (_, c) => {
      c.operationId = "";
    },
  ],
  [
    "long operation",
    (_, c) => {
      c.operationId = "x".repeat(101);
    },
  ],
  [
    "empty revision",
    (_, c) => {
      c.before.revisionId = " ";
    },
  ],
  [
    "long revision",
    (_, c) => {
      c.after.revisionId = "x".repeat(513);
    },
  ],
  [
    "bad hash",
    (_, c) => {
      c.after.sourceHash = "invalid";
    },
  ],
  [
    "same revision",
    (_, c) => {
      c.after.revisionId = c.before.revisionId;
    },
  ],
  [
    "local timestamp",
    (_, c) => {
      c.observedAt = "2026-10-04T09:00:00";
    },
  ],
  [
    "invalid day",
    (_, c) => {
      c.observedAt = "2026-02-30T09:00:00Z";
    },
  ],
  [
    "invalid date",
    (_, c) => {
      c.observedAt = "2026-99-99T09:00:00Z";
    },
  ],
  [
    "wrong engine",
    (r) => {
      r.artifact.engine = "old worker";
    },
  ],
  [
    "wrong revision",
    (r) => {
      r.revisionIds[0] = "R3";
    },
  ],
  [
    "wrong after revision",
    (r) => {
      r.revisionIds[1] = "R3";
    },
  ],
  [
    "wrong before hash",
    (r) => {
      r.artifact.sourceHashes[0] = "c".repeat(64);
    },
  ],
  [
    "wrong after hash",
    (r) => {
      r.artifact.sourceHashes[1] = "c".repeat(64);
    },
  ],
  [
    "short revision pair",
    (r) => {
      r.revisionIds.pop();
    },
  ],
  [
    "short hash pair",
    (r) => {
      r.artifact.sourceHashes.pop();
    },
  ],
];
it.each(invalidContext)(
  "rejects %s even for unchanged output",
  async (_, mutate) => {
    const r = result(),
      c = context();
    r.artifact.pages[0].boxes = [];
    r.artifact.pages[0].diffPixels = 0;
    mutate(r, c);
    await expect(mapPdfChanges(r, c)).rejects.toThrow();
  },
);

const invalidArtifact: [string, (r: PdfDiffResult) => void][] = [
  [
    "missing inventory",
    (r) => {
      r.artifact.sourcePages = undefined as never;
    },
  ],
  [
    "short inventory",
    (r) => {
      r.artifact.sourcePages.pop();
    },
  ],
  [
    "empty inventory",
    (r) => {
      r.artifact.sourcePages[0] = [];
    },
  ],
  [
    "too many source pages",
    (r) => {
      r.artifact.sourcePages[0] = Array(101).fill({ width: 10, height: 10 });
    },
  ],
  [
    "invalid dimensions",
    (r) => {
      r.artifact.sourcePages[1][0].width = NaN;
    },
  ],
  [
    "oversized dimensions",
    (r) => {
      r.artifact.sourcePages[1][0].height = 100001;
    },
  ],
  [
    "too many mapped pages",
    (r) => {
      r.artifact.pages = Array(101).fill(r.artifact.pages[0]);
    },
  ],
  [
    "too many added pages",
    (r) => {
      r.artifact.addedPages = Array(101).fill(1);
    },
  ],
  [
    "too many deleted pages",
    (r) => {
      r.artifact.deletedPages = Array(101).fill(1);
    },
  ],
  [
    "zero page",
    (r) => {
      r.artifact.pages[0].pageNumA = 0;
    },
  ],
  [
    "out-of-range page",
    (r) => {
      r.artifact.pages[0].pageNumB = 2;
    },
  ],
  [
    "fractional page",
    (r) => {
      r.artifact.pages[0].pageNumA = 1.5;
    },
  ],
  [
    "duplicate mapping",
    (r) => {
      r.artifact.pages.push(r.artifact.pages[0]);
    },
  ],
  [
    "duplicate deletion",
    (r) => {
      r.artifact.deletedPages = [1];
    },
  ],
  [
    "duplicate addition",
    (r) => {
      r.artifact.addedPages = [1];
    },
  ],
  [
    "missing page",
    (r) => {
      r.artifact.pages = [];
    },
  ],
  [
    "wrong crop",
    (r) => {
      r.artifact.options.cropRegions.push({
        page: 1,
        x: 990,
        y: 0,
        width: 100,
        height: 100,
      });
    },
  ],
  [
    "wrong raster size",
    (r) => {
      r.artifact.pages[0].width = 999;
    },
  ],
  [
    "negative count",
    (r) => {
      r.artifact.pages[0].diffPixels = -1;
    },
  ],
  [
    "fractional count",
    (r) => {
      r.artifact.pages[0].diffPixels = 1.5;
    },
  ],
  [
    "excessive count",
    (r) => {
      r.artifact.pages[0].diffPixels = 800001;
    },
  ],
  [
    "invalid shift",
    (r) => {
      r.artifact.pages[0].alignment.dx = 4;
    },
  ],
  [
    "fractional shift",
    (r) => {
      r.artifact.pages[0].alignment.dy = 0.5;
    },
  ],
  [
    "invalid similarity",
    (r) => {
      r.artifact.pages[0].similarity = NaN;
    },
  ],
  [
    "oversized similarity",
    (r) => {
      r.artifact.pages[0].similarity = 1.1;
    },
  ],
  [
    "too many regions",
    (r) => {
      r.artifact.pages[0].boxes = Array(20001).fill(
        r.artifact.pages[0].boxes[0],
      );
    },
  ],
  [
    "invalid box",
    (r) => {
      r.artifact.pages[0].boxes[0].width = -1;
    },
  ],
  [
    "off-sheet box",
    (r) => {
      r.artifact.pages[0].boxes[0].x = 999;
    },
  ],
  [
    "fractional pixel box",
    (r) => {
      r.artifact.pages[0].boxes[0].width = 1.5;
    },
  ],
  [
    "invalid word box",
    (r) => {
      r.artifact.pages[0].wordHighlightsA = [
        { x: NaN, y: 0, width: 1, height: 1 },
      ];
    },
  ],
  [
    "highlighted unchanged page",
    (r) => {
      r.artifact.pages[0].diffPixels = 0;
    },
  ],
];
it.each(invalidArtifact)(
  "rejects %s without producing partial Changes",
  async (_, mutate) => {
    const r = result();
    mutate(r);
    await expect(mapPdfChanges(r, context())).rejects.toThrow();
  },
);
