import type { components } from "../../api/schema";
import type { DrawingTarget } from "./drawingContract";
import {
  validatePdfChangeContext,
  validatePdfChangeArtifact,
} from "./pdfChangeValidation";
import type { PdfChangeContext } from "./pdfChangeValidation";
import { normalizeOptions } from "./pdfDiffValidation";
import type {
  PdfDiffArtifact,
  PdfDiffPage,
  PdfDiffResult,
} from "./pdfDiffTypes";
export type { PdfChangeContext } from "./pdfChangeValidation";
export type PdfCanonicalChange = components["schemas"]["Change"];

function changedTarget(
  page: Pick<
    PdfDiffPage,
    "pageNumA" | "pageNumB" | "diffPixels" | "boxes" | "alignment"
  >,
  artifact: Pick<PdfDiffArtifact, "options" | "sourcePages">,
  revision: string,
): DrawingTarget {
  const target: DrawingTarget = {
    kind: "drawing",
    source_revision_id: revision,
    page: page.pageNumB,
  };
  if (!page.diffPixels || !page.boxes.length) return target;
  const crop = artifact.options.cropRegions.find(
    (region) => region.page === page.pageNumA,
  );
  const size = artifact.sourcePages[1][page.pageNumB - 1];
  const { scale } = artifact.options;
  // Donor boxes are in A's cropped/aligned raster. Reverse B's shift first.
  const bounds = page.boxes
    .map((box) => {
      const x = (box.x - page.alignment.dx + (crop?.x ?? 0)) / scale;
      const y = (box.y - page.alignment.dy + (crop?.y ?? 0)) / scale;
      return [
        Math.max(0, x),
        Math.max(0, y),
        Math.min(size.width, x + box.width / scale),
        Math.min(size.height, y + box.height / scale),
      ];
    })
    .filter(([x0, y0, x1, y1]) => x0 < x1 && y0 < y1);
  // Diff noise below the donor threshold or padding outside B has no exact region.
  if (!bounds.length) return target;
  target.normalized_bbox = [
    Math.min(...bounds.map((box) => box[0])) / size.width,
    Math.min(...bounds.map((box) => box[1])) / size.height,
    Math.max(...bounds.map((box) => box[2])) / size.width,
    Math.max(...bounds.map((box) => box[3])) / size.height,
  ];
  return target;
}

/** Canonical page-level drafts only; no donor engine, write API or business decision. */
export async function mapPdfChanges(
  comparison: PdfDiffResult,
  input: PdfChangeContext,
): Promise<PdfCanonicalChange[]> {
  validatePdfChangeContext(comparison, input);
  validatePdfChangeArtifact(comparison.artifact);
  // Own small provenance/region values before hashing, without cloning PDF bytes or overlays.
  const context: PdfChangeContext = {
    ...input,
    before: { ...input.before },
    after: { ...input.after },
  };
  const source = comparison.artifact;
  const artifact = structuredClone({
    engine: source.engine,
    sourceHashes: source.sourceHashes,
    sourcePages: source.sourcePages,
    options: normalizeOptions(source.options),
    addedPages: source.addedPages,
    deletedPages: source.deletedPages,
    pages: source.pages.map(
      ({
        overlayA: _a,
        overlayB: _b,
        sourceRegionsA: _ra,
        sourceRegionsB: _rb,
        ...page
      }) => page,
    ),
  });
  const candidates: {
    subject: DrawingTarget;
    kind: string;
    aspects: string[];
  }[] = [];
  for (const page of artifact.pages) {
    const a = artifact.sourcePages[0][page.pageNumA - 1],
      b = artifact.sourcePages[1][page.pageNumB - 1];
    const aspects = [
      ...(page.diffPixels ? ["visual_difference"] : []),
      ...(page.pageNumA !== page.pageNumB ? ["page_order"] : []),
      ...(a.width !== b.width || a.height !== b.height ? ["page_size"] : []),
    ];
    if (aspects.length)
      candidates.push({
        subject: changedTarget(page, artifact, context.after.revisionId),
        kind: "changed",
        aspects,
      });
  }
  for (const [kind, revision, pages] of [
    ["added", context.after.revisionId, artifact.addedPages],
    ["deleted", context.before.revisionId, artifact.deletedPages],
  ] as const) {
    for (const page of pages)
      candidates.push({
        subject: { kind: "drawing", source_revision_id: revision, page },
        kind,
        aspects: ["page_presence"],
      });
  }
  const artifactBytes = new TextEncoder().encode(JSON.stringify(artifact));
  const artifactHash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", artifactBytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return Promise.all(
    candidates.map(async (candidate) => {
      const value = {
        project_id: context.projectId,
        source_id: context.sourceId,
        from_revision_id: context.before.revisionId,
        to_revision_id: context.after.revisionId,
        ...candidate,
        detector: "pdf-diff-viewer",
        detector_version: artifact.engine,
        raw_artifact_key: context.rawArtifactKey ?? null,
        created_at: context.observedAt,
      };
      const bytes = new TextEncoder().encode(
        JSON.stringify([
          "concord:pdf-change:v1",
          context.operationId,
          artifactHash,
          value,
        ]),
      );
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const id = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      return { id, ...value };
    }),
  );
}
