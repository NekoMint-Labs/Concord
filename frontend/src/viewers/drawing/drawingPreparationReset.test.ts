import { Blob } from "node:buffer";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prepareDrawingSource } from "./drawingPreparation";
import { clearDrawingArtifactCache } from "./drawingArtifactCache";
import { DRAWING_ENGINE } from "./drawingArtifactTypes";
import type { DrawingArtifact } from "./drawingArtifactTypes";
import type { DrawingSource } from "./pdfDiffTypes";
import { sha256 } from "./pdfDiffValidation";

const engine = vi.hoisted(() => ({ produce: vi.fn() }));
vi.mock("./produceDrawingArtifact", () => ({
  produceDrawingArtifact: engine.produce,
}));
interface Job {
  signal: AbortSignal;
  progress: (page: number, total: number) => void;
  finish: (label?: number) => void;
}
let input: DrawingSource;
let jobs: Job[];
beforeEach(async () => {
  vi.stubGlobal("crypto", webcrypto);
  clearDrawingArtifactCache();
  jobs = [];
  engine.produce.mockReset();
  engine.produce.mockImplementation(
    (source: DrawingSource, signal: AbortSignal, progress: Job["progress"]) =>
      new Promise<DrawingArtifact>((resolve) => {
        jobs.push({
          signal,
          progress,
          // Intentionally accept late completion: cancellation is cooperative.
          finish: (label = 1) =>
            resolve({
              engine: DRAWING_ENGINE,
              sourceHash: source.sourceHash,
              preparationMs: label,
              sheets: [
                {
                  page: 1,
                  width: 10,
                  height: 10,
                  pixelWidth: 10,
                  pixelHeight: 10,
                  image: new Blob(["image"]) as unknown as globalThis.Blob,
                  textRuns: [],
                },
              ],
            }),
        });
      }),
  );
  const data = new Uint8Array([1, 2, 3]).buffer;
  input = { data, revisionId: "r1", sourceHash: await sha256(data) };
});
afterEach(async () => {
  jobs.forEach((entry) => entry.finish());
  await Promise.resolve();
  clearDrawingArtifactCache();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function job(index = 0) {
  await vi.waitFor(() => expect(jobs).toHaveLength(index + 1));
  return jobs[index];
}
const open = (source = input) =>
  prepareDrawingSource(source, new AbortController().signal);
const outcome = (request: ReturnType<typeof open>) =>
  request.then(
    (result) => ({ result, error: undefined }),
    (error: Error) => ({ result: undefined, error }),
  );

it("rejects a reset during hash verification before preparing sheets", async () => {
  const hash = await webcrypto.subtle.digest("SHA-256", input.data);
  let release!: (hash: ArrayBuffer) => void;
  vi.spyOn(webcrypto.subtle, "digest").mockImplementationOnce(
    () =>
      new Promise<ArrayBuffer>((resolve) => {
        release = resolve;
      }),
  );
  let settled = false;
  const pending = outcome(open()).then((result) => {
    settled = true;
    return result;
  });
  clearDrawingArtifactCache();
  release(hash);
  await vi.waitFor(() => expect(settled || jobs.length > 0).toBe(true));
  jobs.forEach((entry) => entry.finish());
  expect((await pending).error?.message).toContain("invalidated");
  expect(jobs).toHaveLength(0);
});
it("does not refill a cleared cache after a late preparation completes", async () => {
  const progress = vi.fn();
  const pending = outcome(
    prepareDrawingSource(input, new AbortController().signal, progress),
  );
  const old = await job();
  old.progress(1, 2);
  expect(progress).toHaveBeenCalledTimes(1);
  clearDrawingArtifactCache();
  old.progress(2, 2);
  expect(progress).toHaveBeenCalledTimes(1);
  old.finish();
  expect((await pending).error?.message).toContain("invalidated");
  const fresh = open();
  (await job(1)).finish();
  expect((await fresh).cacheHit).toBe(false);
  expect((await open()).cacheHit).toBe(true);
});
it("starts a separate generation and retains its result when the old job finishes last", async () => {
  const stale = outcome(open());
  const old = await job();
  clearDrawingArtifactCache();
  const fresh = outcome(open());
  const next = await job(1);
  expect(old.signal.aborted).toBe(true);
  next.finish(2);
  expect((await fresh).result?.artifact.preparationMs).toBe(2);
  old.finish(99);
  expect((await stale).error?.message).toContain("invalidated");
  expect((await open()).artifact.preparationMs).toBe(2);
});

it("rejects an artifact invalidated between SDK completion and reader delivery", async () => {
  const pending = outcome(open());
  const old = await job();
  old.finish();
  await Promise.resolve();
  clearDrawingArtifactCache();
  expect((await pending).error?.message).toContain("invalidated");
});
it("releases obsolete capacity across different source keys and preserves the new shared job", async () => {
  const data = new Uint8Array([4, 5, 6]).buffer;
  const second = { ...input, data, sourceHash: await sha256(data) };
  const firstOld = outcome(open());
  const old = await job();
  const secondOld = outcome(open(second));
  const other = await job(1);
  clearDrawingArtifactCache();
  const fresh = outcome(open());
  const next = await job(2);
  expect(old.signal.aborted).toBe(true);
  expect(other.signal.aborted).toBe(true);
  old.finish();
  other.finish();
  expect((await firstOld).error?.message).toContain("invalidated");
  expect((await secondOld).error?.message).toContain("invalidated");
  const progress = vi.fn();
  const joined = outcome(
    prepareDrawingSource(input, new AbortController().signal, progress),
  );
  await vi.waitFor(() => {
    next.progress(1, 1);
    expect(progress).toHaveBeenCalledWith(1, 1);
  });
  next.finish(7);
  for (const pending of [fresh, joined]) {
    const result = (await pending).result;
    expect(result?.artifact.preparationMs).toBe(7);
    expect(result?.cacheHit).toBe(false);
  }
  expect(jobs).toHaveLength(3);
});

it("enforces the two-job capacity limit within the current generation", async () => {
  const first = outcome(open());
  await job();
  const data = new Uint8Array([4]).buffer;
  const second = outcome(
    open({ ...input, data, sourceHash: await sha256(data) }),
  );
  await job(1);
  const thirdData = new Uint8Array([5]).buffer;
  await expect(
    open({ ...input, data: thirdData, sourceHash: await sha256(thirdData) }),
  ).rejects.toThrow("capacity");
  jobs.forEach((entry) => entry.finish());
  expect((await first).result).toBeDefined();
  expect((await second).result).toBeDefined();
});
it("aborts timed-out SDK work and rejects late output without retaining it", async () => {
  vi.useFakeTimers();
  const pending = outcome(open());
  const old = await job();
  await vi.advanceTimersByTimeAsync(120000);
  expect(old.signal.aborted).toBe(true);
  old.finish();
  expect((await pending).error?.message).toContain("timed out");
  vi.useRealTimers();
  const fresh = outcome(open());
  (await job(1)).finish();
  expect((await fresh).result?.cacheHit).toBe(false);
});

it("handles a caller cancellation during SDK dispatch before the subscription attaches", async () => {
  const controller = new AbortController();
  const produce = engine.produce.getMockImplementation()!;
  engine.produce.mockImplementationOnce((...args: unknown[]) => {
    const pending = produce(...args);
    controller.abort(new Error("cancelled during dispatch"));
    return pending;
  });
  const pending = outcome(prepareDrawingSource(input, controller.signal));
  expect((await pending).error?.message).toContain("cancelled during dispatch");
  expect(jobs[0].signal.aborted).toBe(true);
  jobs[0].finish();
  const fresh = outcome(open());
  (await job(1)).finish();
  expect((await fresh).result?.cacheHit).toBe(false);
});
