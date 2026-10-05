import { PDF_DIFF_ENGINE } from "./pdfDiffTypes";
import type { PdfDiffArtifact, PdfDiffOptions } from "./pdfDiffTypes";
import { normalizeOptions } from "./pdfDiffValidation";
const artifacts = new Map<
  string,
  { artifact: PdfDiffArtifact; bytes: number }
>();
const MAX_BYTES = 32 * 1024 * 1024;
let totalBytes = 0;
let generation = 0;
export function pdfDiffCacheGeneration() {
  return generation;
}
export function pdfDiffCacheKey(
  hashes: [string, string],
  options: PdfDiffOptions,
) {
  return JSON.stringify([PDF_DIFF_ENGINE, hashes, normalizeOptions(options)]);
}
export function cachedPdfDiff(key: string): PdfDiffArtifact | undefined {
  const entry = artifacts.get(key);
  if (!entry) return;
  artifacts.delete(key);
  artifacts.set(key, entry);
  return structuredClone(entry.artifact);
}
export function cachePdfDiff(key: string, artifact: PdfDiffArtifact) {
  const bytes =
    artifact.pages.reduce(
      (sum, p) => sum + p.overlayA.size + p.overlayB.size,
      0,
    ) +
    new TextEncoder().encode(
      JSON.stringify({
        ...artifact,
        pages: artifact.pages.map((p) => ({
          ...p,
          overlayA: null,
          overlayB: null,
        })),
      }),
    ).byteLength;
  if (bytes > MAX_BYTES) return;
  const previous = artifacts.get(key);
  if (previous) totalBytes -= previous.bytes;
  artifacts.delete(key);
  artifacts.set(key, { artifact: structuredClone(artifact), bytes });
  totalBytes += bytes;
  while (totalBytes > MAX_BYTES || artifacts.size > 4) {
    const oldest = artifacts.keys().next().value!;
    totalBytes -= artifacts.get(oldest)!.bytes;
    artifacts.delete(oldest);
  }
}
export function clearPdfDiffCache() {
  ++generation;
  artifacts.clear();
  totalBytes = 0;
}
