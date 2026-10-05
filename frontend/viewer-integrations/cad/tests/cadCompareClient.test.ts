import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AcDbDatabase } from "@mlightcad/data-model";
import {
  compareCadDatabases,
  disposeCadComparisons,
  registerCadDatabase,
} from "../src/cadCompareClient";
const preparation = vi.hoisted(() => ({ prepare: vi.fn(), clear: vi.fn() }));
vi.mock("../src/cadSnapshots", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  prepareCadSnapshots: preparation.prepare,
  clearCadSnapshots: preparation.clear,
}));
class TestWorker {
  static instances: TestWorker[] = [];
  onmessage?: (event: { data: object }) => void;
  onerror?: (event: { message: string }) => void;
  onmessageerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    TestWorker.instances.push(this);
  }
}
const a = {} as AcDbDatabase,
  b = {} as AcDbDatabase;
const source = {
  name: "source.dxf",
  revisionId: "R1",
  sourceHash: "a".repeat(64),
  data: new ArrayBuffer(8),
};
const result = {
  added: [],
  deleted: [],
  modified: [],
  unchanged: [],
  navigation: [],
  changeSets: [],
};
const prepared = {
  snapshots: [{ objectId: "1" }],
  cacheHit: true,
  visited: 0,
  yields: 0,
};
const settle = async () => {
  for (let i = 0; i < 8; ++i) await Promise.resolve();
};
beforeEach(() => {
  vi.stubGlobal("Worker", TestWorker);
  TestWorker.instances = [];
  preparation.prepare.mockResolvedValue(prepared);
  registerCadDatabase(a, source);
  registerCadDatabase(b, {
    ...source,
    revisionId: "R2",
    sourceHash: "b".repeat(64),
  });
});
afterEach(() => {
  disposeCadComparisons();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("dispatches derived data only and keeps options stable across preparation", async () => {
  const options = { compareProps: 1 };
  const request = compareCadDatabases(a, b, options);
  options.compareProps = 2;
  await settle();
  const worker = TestWorker.instances[0];
  const message = worker.postMessage.mock.calls[0][0];
  expect(message.options.compareProps).toBe(1);
  expect(message.before).toEqual(prepared.snapshots);
  expect(message.after).toEqual(prepared.snapshots);
  expect(JSON.stringify(message)).not.toContain("sourceHash");
  expect(JSON.stringify(message)).not.toContain("revisionId");
  expect(message.before).not.toHaveProperty("data");
  const timing = vi.fn();
  window.addEventListener("concord-cad-timing", timing, { once: true });
  worker.onmessage!({
    data: { id: message.id, result, elapsedMs: 2, sourceParses: 0 },
  });
  expect(await request).toEqual(result);
  expect(timing.mock.calls[0][0].detail).toMatchObject({
    cacheHit: true,
    comparisonSourceParses: 0,
    elapsedMs: 2,
  });
});
it("aborts extraction on disposal and cannot spawn a late worker", async () => {
  let finish!: (value: typeof prepared) => void;
  preparation.prepare.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const request = compareCadDatabases(a, b, {});
  const rejected = expect(request).rejects.toThrow("disposed");
  const signal = preparation.prepare.mock.calls[0][3] as AbortSignal;
  disposeCadComparisons();
  finish(prepared);
  await rejected;
  await settle();
  expect(signal.aborted).toBe(true);
  expect(TestWorker.instances).toHaveLength(0);
  expect(preparation.clear).toHaveBeenCalled();
  await expect(compareCadDatabases(a, b, {})).rejects.toThrow("registered");
});
it("terminates the worker and ignores late results after disposal", async () => {
  const request = compareCadDatabases(a, b, {});
  await settle();
  const worker = TestWorker.instances[0],
    id = worker.postMessage.mock.calls[0][0].id;
  const rejected = expect(request).rejects.toThrow("closed");
  disposeCadComparisons(new Error("closed"));
  await rejected;
  expect(worker.terminate).toHaveBeenCalledOnce();
  worker.onmessage!({ data: { id, result } });
});
it.each(["engine", "missing", "decode", "worker", "empty-worker"])(
  "reports %s failure",
  async (kind) => {
    const request = compareCadDatabases(a, b, {});
    await settle();
    const worker = TestWorker.instances[0],
      id = worker.postMessage.mock.calls[0][0].id;
    const rejected = expect(request).rejects.toThrow();
    if (kind === "engine")
      worker.onmessage!({ data: { id, error: "engine failure" } });
    if (kind === "missing") worker.onmessage!({ data: { id } });
    if (kind === "decode") worker.onmessageerror!();
    if (kind === "worker") worker.onerror!({ message: "worker failure" });
    if (kind === "empty-worker") worker.onerror!({ message: "" });
    await rejected;
  },
);
it("rejects extraction/dispatch errors and releases the timeout", async () => {
  preparation.prepare.mockRejectedValueOnce(new Error("snapshot overflow"));
  await expect(compareCadDatabases(a, b, {})).rejects.toThrow("overflow");
  const request = compareCadDatabases(a, b, {});
  await settle();
  const worker = TestWorker.instances[0];
  worker.postMessage.mockImplementation(() => {
    throw new Error("clone failure");
  });
  await expect(compareCadDatabases(a, b, {})).rejects.toThrow("clone failure");
  const rejected = expect(request).rejects.toThrow("disposed");
  disposeCadComparisons();
  await rejected;
});
it("bounds total preparation/worker duration", async () => {
  vi.useFakeTimers();
  preparation.prepare.mockImplementationOnce(() => new Promise(() => {}));
  const request = compareCadDatabases(a, b, {}),
    rejected = expect(request).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(120000);
  await rejected;
  expect(TestWorker.instances).toHaveLength(0);
});
it("rejects invalid settings before starting preparation", async () => {
  await expect(compareCadDatabases(a, b, { tolerance: NaN })).rejects.toThrow(
    "finite",
  );
  expect(preparation.prepare).not.toHaveBeenCalled();
});

it("rejects an unregistered later database", async () => {
  await expect(compareCadDatabases(a, {} as AcDbDatabase, {})).rejects.toThrow(
    "registered",
  );
});
