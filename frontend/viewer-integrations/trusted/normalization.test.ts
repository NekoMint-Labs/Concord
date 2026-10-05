import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { validateOptions, normalize, versions } from "./normalization";
import {
  result,
  context,
} from "../../src/viewers/drawing/__fixtures__/pdfChanges";
import { PDF_DIFF_ENGINE } from "../../src/viewers/drawing/pdfDiffTypes";
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());
it.each([
  ["pdf_comparison", { scale: null }],
  ["pdf_comparison", { maxShift: true }],
  ["pdf_comparison", { maskRegions: {} }],
  ["pdf_comparison", { maskRegions: [null] }],
  [
    "pdf_comparison",
    {
      cropRegions: [
        { page: 1, x: 0, y: 0, width: 2, height: 3, script: "untrusted" },
      ],
    },
  ],
  ["pdf_comparison", { colorTolerance: 999 }],
  ["pdf_comparison", { scale: 0.01 }],
  ["cad_comparison", { tolerance: -1 }],
  ["cad_comparison", { compareProps: 128 }],
  ["cad_comparison", { compareText: null }],
  ["cad_comparison", { includeUnchanged: "yes" }],
  ["cad_comparison", { program: "arbitrary" }],
  ["pdf_comparison", { url: "external" }],
  ["other", {}],
])("rejects unsupported %s settings %j", (kind, options) => {
  expect(() => validateOptions(kind, options)).toThrow();
});
it("accepts the documented pinned engine options", () => {
  expect(() =>
    validateOptions("pdf_comparison", {
      scale: 1,
      maxShift: 0,
      maskRegions: [],
    }),
  ).not.toThrow();
  expect(() =>
    validateOptions("cad_comparison", {
      compareProps: 8,
      compareText: 0,
      tolerance: 0.001,
    }),
  ).not.toThrow();
});
function request() {
  return {
    kind: "pdf_comparison" as const,
    options: { scale: 1, maxShift: 3 },
    context: { ...context(), rawArtifactKey: "retained-key" },
    raw: {
      schema: 1,
      kind: "pdf_comparison",
      engine: PDF_DIFF_ENGINE,
      options: { maxShift: 3, scale: 1 },
      result: result(),
    },
  };
}
it("reuses the canonical mapper, stable context and artifact key regardless of option key order", async () => {
  const input = request();
  const draft = await normalize(input);
  expect(draft.changes).toHaveLength(1);
  expect(draft.changes[0]).toMatchObject({
    detector: "pdf-diff-viewer",
    detector_version: versions.pdf_comparison,
    raw_artifact_key: "retained-key",
    created_at: input.context.observedAt,
    subject: { kind: "drawing", source_revision_id: "R2" },
  });
  expect(await normalize(input)).toEqual(draft);
});
it.each(["schema", "kind", "engine", "options", "effective"])(
  "rejects retained artifact %s mismatch",
  async (field) => {
    const input = request();
    if (field === "schema") input.raw.schema = 2;
    if (field === "kind") input.raw.kind = "cad_comparison";
    if (field === "engine") input.raw.engine = "other";
    if (field === "options") input.raw.options.scale = 2;
    if (field === "effective") input.raw.result.artifact.options.scale = 2;
    await expect(normalize(input)).rejects.toThrow("mismatch");
  },
);
