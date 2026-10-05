import { snapshotCadOptions } from "../cad/src/cadSnapshots";
import { mapPdfChanges } from "../../src/viewers/drawing/pdfChangeMapping";
import { mapCadChanges } from "../../src/viewers/cad/cadChangeMapping";
import { PDF_DIFF_ENGINE } from "../../src/viewers/drawing/pdfDiffTypes";
import { CAD_ENGINE } from "../../src/viewers/cad/cadTypes";
import { normalizeOptions } from "../../src/viewers/drawing/pdfDiffValidation";
import type {
  PdfDiffResult,
  PdfDiffOptions,
} from "../../src/viewers/drawing/pdfDiffTypes";
import type { CadComparison } from "../../src/viewers/cad/cadTypes";
import type { PdfChangeContext } from "../../src/viewers/drawing/pdfChangeMapping";
export const runtimeVersion = "playwright@1.63.0/chromium@153.0.8010.12";
export const versions = {
  pdf_comparison: PDF_DIFF_ENGINE + "/trusted-v1/" + runtimeVersion,
  cad_comparison: CAD_ENGINE + "/trusted-v1/" + runtimeVersion,
};
export function validateOptions(
  kind: string,
  options: Record<string, unknown>,
) {
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw new Error("Comparison options must be an object");
  if (kind === "cad_comparison") {
    const keys = [
      "tolerance",
      "includeUnchanged",
      "compareProps",
      "compareHatch",
      "compareText",
      "compareTolerance",
      "compareRcMargin",
    ];
    if (Object.keys(options).some((key) => !keys.includes(key)))
      throw new Error("Unknown CAD comparison option");
    snapshotCadOptions(options);
    if (
      options.tolerance !== undefined &&
      (typeof options.tolerance !== "number" || options.tolerance <= 0)
    )
      throw new Error("CAD tolerance must be positive");
    return;
  }
  if (kind !== "pdf_comparison") throw new Error("Unsupported comparison kind");
  const keys = [
    "scale",
    "maxShift",
    "colorTolerance",
    "minHighlightArea",
    "cropRegions",
    "maskRegions",
  ];
  if (Object.keys(options).some((key) => !keys.includes(key)))
    throw new Error("Unknown PDF comparison option");
  for (const key of ["cropRegions", "maskRegions"]) {
    const regions = options[key];
    if (
      regions !== undefined &&
      (!Array.isArray(regions) ||
        regions.some(
          (region) =>
            !region ||
            typeof region !== "object" ||
            Object.keys(region).some(
              (field) => !["page", "x", "y", "width", "height"].includes(field),
            ),
        ))
    )
      throw new Error("Invalid PDF regions");
  }
  for (const key of [
    "scale",
    "maxShift",
    "colorTolerance",
    "minHighlightArea",
  ]) {
    if (options[key] !== undefined && typeof options[key] !== "number")
      throw new Error(`PDF option ${key} must be numeric`);
  }
  normalizeOptions(options as PdfDiffOptions);
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (key) =>
            JSON.stringify(key) +
            ":" +
            stable((value as Record<string, unknown>)[key]),
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export async function normalize(input: {
  kind: keyof typeof versions;
  raw: {
    schema: number;
    kind: string;
    engine: string;
    options: Record<string, unknown>;
    result: PdfDiffResult | CadComparison;
  };
  context: PdfChangeContext;
  options: Record<string, unknown>;
}) {
  validateOptions(input.kind, input.options);
  const { raw } = input;
  const engine = input.kind === "pdf_comparison" ? PDF_DIFF_ENGINE : CAD_ENGINE;
  if (
    raw.schema !== 1 ||
    raw.kind !== input.kind ||
    raw.engine !== engine ||
    stable(raw.options) !== stable(input.options)
  )
    throw new Error("Trusted artifact recipe mismatch");
  if (input.kind === "pdf_comparison") {
    const result = raw.result as PdfDiffResult;
    if (
      stable(result.artifact.options) !==
      stable(normalizeOptions(input.options as PdfDiffOptions))
    )
      throw new Error("PDF artifact options mismatch");
  }
  const changes =
    input.kind === "pdf_comparison"
      ? await mapPdfChanges(raw.result as PdfDiffResult, input.context)
      : await mapCadChanges(raw.result as CadComparison, input.context);
  return {
    operation_id: input.context.operationId,
    changes: changes.map((change) => ({
      ...change,
      detector_version: versions[input.kind],
    })),
    evidence: [],
  };
}
