import { afterEach, beforeEach, expect, it, vi } from "vitest";
// Node Blob preserves immutable bytes through structuredClone in the jsdom runtime.
import { Blob } from "node:buffer";
import { webcrypto } from "node:crypto";
import { prepareDrawingSource } from "./drawingPreparation";
import { clearDrawingArtifactCache } from "./drawingArtifactCache";
import { sha256 } from "./pdfDiffValidation";
import { DRAWING_ENGINE } from "./drawingArtifactTypes";
import type { DrawingArtifact } from "./drawingArtifactTypes";
import type { DrawingSource } from "./pdfDiffTypes";
const engine = vi.hoisted(() => ({ produce: vi.fn() }));
vi.mock("./produceDrawingArtifact", () => ({
  produceDrawingArtifact: engine.produce,
}));
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  engine.produce.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearDrawingArtifactCache();
});
async function source(value = 1): Promise<DrawingSource> {
  const data = new Uint8Array([value, 2, 3]).buffer;
  return { revisionId: "r1", data, sourceHash: await sha256(data) };
}
function result(hash: string): DrawingArtifact {
  return {
    engine: DRAWING_ENGINE,
    sourceHash: hash,
    preparationMs: 3,
    sheets: [
      {
        page: 1,
        width: 600,
        height: 420,
        pixelWidth: 2400,
        pixelHeight: 1680,
        image: new Blob(["image"], {
          type: "image/png",
        }) as unknown as globalThis.Blob,
        textRuns: [],
      },
    ],
  };
}
it("verifies immutable source bytes even before warm reuse", async () => {
  const input = await source();
  engine.produce.mockImplementation(async (snapshot: DrawingSource) => {
    expect(new Uint8Array(snapshot.data)[0]).toBe(1);
    return result(snapshot.sourceHash);
  });
  const first = prepareDrawingSource(input, new AbortController().signal);
  new Uint8Array(input.data)[0] = 99;
  expect((await first).cacheHit).toBe(false);
  await expect(
    prepareDrawingSource(input, new AbortController().signal),
  ).rejects.toThrow("source hash");
  const fresh = await source();
  fresh.revisionId = "r2";
  expect(
    (await prepareDrawingSource(fresh, new AbortController().signal)).cacheHit,
  ).toBe(true);
  expect(engine.produce).toHaveBeenCalledTimes(1);
});
it("shares one preparation and cancels only after the last reader leaves", async () => {
  const input = await source(),
    firstAbort = new AbortController(),
    secondAbort = new AbortController();
  let sdkSignal: AbortSignal | undefined;
  let complete: ((value: DrawingArtifact) => void) | undefined;
  let report: ((page: number, total: number) => void) | undefined;
  const firstProgress = vi.fn(),
    secondProgress = vi.fn();
  engine.produce.mockImplementation(
    (
      _snapshot: DrawingSource,
      signal: AbortSignal,
      progress: (page: number, total: number) => void,
    ) => {
      sdkSignal = signal;
      report = progress;
      return new Promise<DrawingArtifact>((resolve) => {
        complete = resolve;
      });
    },
  );
  const first = prepareDrawingSource(input, firstAbort.signal, firstProgress);
  const second = prepareDrawingSource(
    input,
    secondAbort.signal,
    secondProgress,
  );
  const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(engine.produce).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => {
    report!(1, 2);
    expect(firstProgress).toHaveBeenCalledWith(1, 2);
    expect(secondProgress).toHaveBeenCalledWith(1, 2);
  });
  firstAbort.abort();
  await rejected;
  expect(sdkSignal!.aborted).toBe(false);
  complete!(result(input.sourceHash));
  expect((await second).artifact.sourceHash).toBe(input.sourceHash);
  expect(engine.produce).toHaveBeenCalledTimes(1);
});
it("aborts the SDK on final cancellation and does not publish partial derived data", async () => {
  const input = await source(),
    abort = new AbortController();
  let sdkSignal: AbortSignal | undefined;
  engine.produce.mockImplementation(
    (_snapshot: DrawingSource, signal: AbortSignal) => {
      sdkSignal = signal;
      return new Promise<DrawingArtifact>((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        }),
      );
    },
  );
  const pending = prepareDrawingSource(input, abort.signal);
  const rejected = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  await vi.waitFor(() => expect(engine.produce).toHaveBeenCalledTimes(1));
  abort.abort();
  await rejected;
  expect(sdkSignal!.aborted).toBe(true);
  engine.produce.mockResolvedValueOnce(result(input.sourceHash));
  expect(
    (await prepareDrawingSource(input, new AbortController().signal)).cacheHit,
  ).toBe(false);
});
it("propagates missing/failed engine states and rejects invalid bytes before SDK loading", async () => {
  const input = await source();
  engine.produce.mockRejectedValueOnce(
    new Error("Optional engine unavailable"),
  );
  await expect(
    prepareDrawingSource(input, new AbortController().signal),
  ).rejects.toThrow("engine unavailable");
  engine.produce.mockResolvedValueOnce(result(input.sourceHash));
  expect(
    (await prepareDrawingSource(input, new AbortController().signal)).cacheHit,
  ).toBe(false);
  const cancelled = new AbortController();
  cancelled.abort();
  await expect(
    prepareDrawingSource(input, cancelled.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(engine.produce).toHaveBeenCalledTimes(2);
});
