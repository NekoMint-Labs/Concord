import {
  cachedPdfDiff,
  cachePdfDiff,
  pdfDiffCacheKey,
  pdfDiffCacheGeneration,
} from "./pdfDiffCache";
import {
  normalizeOptions,
  sha256,
  snapshotDrawingSource,
} from "./pdfDiffValidation";
import type {
  DrawingSource,
  PdfDiffArtifact,
  PdfDiffOptions,
  PdfDiffResult,
} from "./pdfDiffTypes";
export async function comparePdfRevisions(
  before: DrawingSource,
  after: DrawingSource,
  options: PdfDiffOptions = {},
  signal?: AbortSignal,
): Promise<PdfDiffResult> {
  const generation = pdfDiffCacheGeneration();
  const assertCurrent = () => {
    signal?.throwIfAborted();
    if (generation !== pdfDiffCacheGeneration())
      throw new Error("PDF comparison invalidated by cache reset");
  };
  before = snapshotDrawingSource(before);
  after = snapshotDrawingSource(after);
  const normalized = structuredClone(normalizeOptions(options));
  assertCurrent();
  const hashes = await Promise.all([sha256(before.data), sha256(after.data)]);
  assertCurrent();
  if (hashes[0] !== before.sourceHash || hashes[1] !== after.sourceHash)
    throw new Error("PDF bytes do not match their source revision hashes");
  const key = pdfDiffCacheKey([hashes[0], hashes[1]], normalized);
  const cached = cachedPdfDiff(key);
  if (cached)
    return {
      artifact: cached,
      revisionIds: [before.revisionId, after.revisionId],
      cacheHit: true,
    };
  const artifact = await runWorker(before, after, normalized, signal);
  assertCurrent();
  cachePdfDiff(key, artifact);
  return {
    artifact,
    revisionIds: [before.revisionId, after.revisionId],
    cacheHit: false,
  };
}
function runWorker(
  before: DrawingSource,
  after: DrawingSource,
  options: PdfDiffOptions,
  signal?: AbortSignal,
): Promise<PdfDiffArtifact> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./pdfDiff.worker.ts", import.meta.url), {
      type: "module",
    });
    let settled = false;
    let artifact: PdfDiffArtifact | undefined;
    let failure: Error | undefined;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      if (error) reject(error);
      else if (failure) reject(failure);
      else if (artifact) resolve(artifact);
      else reject(new Error("PDF worker exited without a result"));
    };
    const abort = () =>
      finish(signal?.reason ?? new DOMException("Cancelled", "AbortError"));
    const timer = setTimeout(
      () => finish(new Error("PDF diff timed out")),
      120000,
    );
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) =>
      finish(new Error(event.message || "PDF worker failed"));
    worker.onmessageerror = () =>
      finish(new Error("PDF worker result could not be decoded"));
    worker.onmessage = ({
      data,
    }: MessageEvent<{
      artifact?: PdfDiffArtifact;
      error?: string;
      disposed?: boolean;
    }>) => {
      if (data.artifact) artifact = data.artifact;
      if (data.error) failure = new Error(data.error);
      if (data.disposed) finish();
    };
    const a = before.data;
    const b = after.data;
    try {
      worker.postMessage(
        {
          before: { ...before, data: a },
          after: { ...after, data: b },
          options,
        },
        [a, b],
      );
    } catch (error) {
      finish(error);
    }
  });
}
