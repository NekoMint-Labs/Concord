import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { comparePdfRevisions } from "./pdfDiffAdapter";
import { clearPdfDiffCache } from "./pdfDiffCache";
import { PDF_DIFF_ENGINE } from "./pdfDiffTypes";
import type {
  DrawingSource,
  PdfDiffArtifact,
  PdfDiffOptions,
} from "./pdfDiffTypes";
import { normalizeOptions, sha256 } from "./pdfDiffValidation";

class ControlledWorker {
  static instances: ControlledWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  input!: {
    before: DrawingSource;
    after: DrawingSource;
    options: PdfDiffOptions;
  };
  terminate = vi.fn();
  constructor() {
    ControlledWorker.instances.push(this);
  }
  postMessage(input: ControlledWorker["input"]) {
    this.input = input;
  }
  result(warnings: string[] = []) {
    const artifact: PdfDiffArtifact = {
      engine: PDF_DIFF_ENGINE,
      sourceHashes: [this.input.before.sourceHash, this.input.after.sourceHash],
      sourcePages: [[{ width: 10, height: 10 }], [{ width: 10, height: 10 }]],
      options: normalizeOptions(this.input.options),
      pages: [],
      addedPages: [1],
      deletedPages: [1],
      warnings,
      elapsedMs: 1,
    };
    this.onmessage?.({ data: { artifact, disposed: true } });
  }
}
let before: DrawingSource, after: DrawingSource;
beforeEach(async () => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Worker", ControlledWorker);
  ControlledWorker.instances = [];
  clearPdfDiffCache();
  const source = async (value: number, revisionId: string) => {
    const data = new Uint8Array([value, 2, 3]).buffer;
    return { data, revisionId, sourceHash: await sha256(data) };
  };
  before = await source(1, "r1");
  after = await source(4, "r2");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  clearPdfDiffCache();
});
async function worker(index = 0) {
  await vi.waitFor(() =>
    expect(ControlledWorker.instances).toHaveLength(index + 1),
  );
  return ControlledWorker.instances[index];
}
function released(instance: ControlledWorker) {
  expect(instance.terminate).toHaveBeenCalledTimes(1);
  expect(instance.onmessage).toBeNull();
  expect(instance.onerror).toBeNull();
  expect(instance.onmessageerror).toBeNull();
}

it("rejects work invalidated while hashes are being verified before starting a worker", async () => {
  const pending = comparePdfRevisions(before, after);
  clearPdfDiffCache();
  await expect(pending).rejects.toThrow("invalidated");
  expect(ControlledWorker.instances).toHaveLength(0);
});
it("does not refill a cleared cache or return an obsolete worker result", async () => {
  const pending = comparePdfRevisions(before, after);
  const old = await worker();
  clearPdfDiffCache();
  const rejection = expect(pending).rejects.toThrow("invalidated");
  old.result();
  await rejection;
  released(old);
  const fresh = comparePdfRevisions(before, after);
  const next = await worker(1);
  next.result();
  expect((await fresh).cacheHit).toBe(false);
  expect((await comparePdfRevisions(before, after)).cacheHit).toBe(true);
  released(next);
});
it("retains the new generation when an older identical comparison finishes last", async () => {
  const stale = comparePdfRevisions(before, after);
  const old = await worker();
  clearPdfDiffCache();
  const fresh = comparePdfRevisions(before, after);
  const next = await worker(1);
  next.result(["current"]);
  await fresh;
  const rejection = expect(stale).rejects.toThrow("invalidated");
  old.result(["obsolete"]);
  await rejection;
  const cached = await comparePdfRevisions(before, after);
  expect(cached.cacheHit).toBe(true);
  expect(cached.artifact.warnings).toEqual(["current"]);
  released(old);
  released(next);
});
it("reuses immutable artifacts while rebinding them to the requested revision IDs", async () => {
  const pending = comparePdfRevisions(before, after);
  (await worker()).result(["quality warning"]);
  const result = await pending;
  result.artifact.warnings.push("caller mutation");
  const cached = await comparePdfRevisions(
    { ...before, revisionId: "r3" },
    { ...after, revisionId: "r4" },
  );
  expect(cached.cacheHit).toBe(true);
  expect(cached.revisionIds).toEqual(["r3", "r4"]);
  expect(cached.artifact.warnings).toEqual(["quality warning"]);
  expect(ControlledWorker.instances).toHaveLength(1);
});
it("verifies originals even when a matching artifact is cached", async () => {
  const pending = comparePdfRevisions(before, after);
  (await worker()).result();
  await pending;
  await expect(
    comparePdfRevisions(
      { ...before, data: new Uint8Array([99]).buffer },
      after,
    ),
  ).rejects.toThrow("hashes");
  expect(ControlledWorker.instances).toHaveLength(1);
});
it("rejects cancellation before startup and during hash verification", async () => {
  const early = new AbortController();
  early.abort();
  await expect(
    comparePdfRevisions(before, after, {}, early.signal),
  ).rejects.toThrow();
  const duringHash = new AbortController();
  const pending = comparePdfRevisions(before, after, {}, duringHash.signal);
  duringHash.abort();
  await expect(pending).rejects.toThrow();
  expect(ControlledWorker.instances).toHaveLength(0);
});
it("terminates an aborted worker without returning or retaining its late result", async () => {
  const controller = new AbortController();
  const pending = comparePdfRevisions(before, after, {}, controller.signal);
  const instance = await worker();
  const late = instance.onmessage!;
  const rejection = expect(pending).rejects.toThrow("cancelled by caller");
  controller.abort(new Error("cancelled by caller"));
  await rejection;
  late({ data: { error: "late", disposed: true } });
  released(instance);
  const fresh = comparePdfRevisions(before, after);
  (await worker(1)).result();
  expect((await fresh).cacheHit).toBe(false);
});
it.each(["engine", "worker", "worker-message", "decode", "empty"])(
  "releases the worker after %s failure",
  async (kind) => {
    const pending = comparePdfRevisions(before, after);
    const instance = await worker();
    const rejection = expect(pending).rejects.toThrow();
    if (kind === "engine")
      instance.onmessage?.({
        data: { error: "engine failure", disposed: true },
      });
    if (kind === "worker") instance.onerror?.({ message: "" });
    if (kind === "worker-message")
      instance.onerror?.({ message: "SDK worker crashed" });
    if (kind === "decode") instance.onmessageerror?.();
    if (kind === "empty") instance.onmessage?.({ data: { disposed: true } });
    await rejection;
    released(instance);
  },
);
it("releases a timed-out worker", async () => {
  vi.useFakeTimers();
  const pending = comparePdfRevisions(before, after);
  const instance = await worker();
  const rejection = expect(pending).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(120000);
  await rejection;
  released(instance);
});
it("releases the worker when dispatch throws", async () => {
  vi.spyOn(ControlledWorker.prototype, "postMessage").mockImplementationOnce(
    () => {
      throw new Error("dispatch failed");
    },
  );
  await expect(comparePdfRevisions(before, after)).rejects.toThrow(
    "dispatch failed",
  );
  released(ControlledWorker.instances[0]);
});
it("waits for donor cleanup before returning an emitted result", async () => {
  const pending = comparePdfRevisions(before, after);
  const instance = await worker();
  const emit = instance.onmessage!;
  instance.onmessage = ({ data }) => {
    emit({ data: { ...(data as object), disposed: false } });
  };
  instance.result();
  expect(instance.terminate).not.toHaveBeenCalled();
  emit({ data: { disposed: true } });
  expect((await pending).cacheHit).toBe(false);
  released(instance);
});
