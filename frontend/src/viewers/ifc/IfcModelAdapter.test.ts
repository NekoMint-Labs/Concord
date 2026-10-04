import { beforeEach, expect, it, vi } from "vitest";
import { IfcModelAdapter } from "./IfcModelAdapter";
import type { BimTarget, IfcSource } from "./ifcTypes";
const sdk = vi.hoisted(() => ({
  whenReady: vi.fn(),
  add: vi.fn(),
  getIdsByGuids: vi.fn(),
  getElement: vi.fn(),
  navigateElements: vi.fn(),
  clearTargetSelection: vi.fn(),
  dispose: vi.fn(),
  on: vi.fn(),
}));
vi.mock("../../../vendor/ifc-viewer-online/ifc-viewer-sdk", () => ({
  IfcViewer: class {
    constructor() {
      return sdk;
    }
  },
}));
const beam = "3M0KwyPFrBT9KwklhqZa8W";
const child = "1M0KwyPFrBT9KwklhqZa8W";
const source: IfcSource = {
  revisionId: "R2",
  sourceHash: "a".repeat(64),
  name: "structure.ifc",
  data: new ArrayBuffer(4),
};
const target: BimTarget = {
  kind: "bim",
  source_revision_id: "R2",
  global_ids: [beam, child],
};
beforeEach(() => {
  vi.resetAllMocks();
  sdk.whenReady.mockResolvedValue(undefined);
  sdk.add.mockResolvedValue({
    modelId: "native-model",
    elementCount: 2,
    fromCache: false,
  });
  sdk.getIdsByGuids.mockResolvedValue([1, 2]);
  sdk.getElement.mockImplementation(async (id: number) => ({
    globalId: id === 1 ? beam : child,
  }));
  sdk.navigateElements.mockResolvedValue(undefined);
  sdk.clearTargetSelection.mockResolvedValue(undefined);
});
async function open() {
  const selected = vi.fn(),
    failure = vi.fn();
  const adapter = new IfcModelAdapter(
    document.createElement("div"),
    selected,
    failure,
  );
  await adapter.load([source]);
  return { adapter, selected, failure };
}
it("verifies every native identity and acknowledges the complete canonical selection", async () => {
  const { adapter, selected, failure } = await open();
  let release!: () => void;
  sdk.navigateElements.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const pending = adapter.navigate(target);
  await vi.waitFor(() =>
    expect(sdk.navigateElements).toHaveBeenCalledWith([1, 2], "native-model"),
  );
  expect(selected).not.toHaveBeenCalled();
  release();
  expect(await pending).toEqual(target);
  expect(selected).toHaveBeenCalledExactlyOnceWith(target);
  expect(failure).toHaveBeenLastCalledWith(null);
});
it("rejects stale revisions and unsupported viewpoints, clearing old selection visibly", async () => {
  const { adapter, failure } = await open();
  await expect(
    adapter.navigate({ ...target, source_revision_id: "R1" }),
  ).rejects.toThrow("not loaded");
  await expect(
    adapter.navigate({ ...target, viewpoint: [1, 2, 3, 4, 5, 6] }),
  ).rejects.toThrow("camera semantics");
  expect(sdk.navigateElements).not.toHaveBeenCalled();
  expect(sdk.clearTargetSelection).toHaveBeenCalledTimes(2);
  expect(failure).toHaveBeenLastCalledWith(expect.any(Error));
});
it("requires all GlobalIds to exist in the requested model and retain their identity", async () => {
  const { adapter, selected } = await open();
  sdk.getIdsByGuids.mockResolvedValue([1, null]);
  await expect(adapter.navigate(target)).rejects.toThrow("absent");
  expect(sdk.getElement).not.toHaveBeenCalled();
  sdk.getIdsByGuids.mockResolvedValue([1, 2]);
  sdk.getElement.mockResolvedValue({ globalId: beam });
  await expect(adapter.navigate(target)).rejects.toThrow("identity");
  expect(sdk.navigateElements).not.toHaveBeenCalled();
  expect(selected).not.toHaveBeenCalled();
});
it("snapshots mutable targets and serializes concurrent navigation to avoid late selection overwrite", async () => {
  const { adapter, selected } = await open();
  let release!: () => void;
  sdk.navigateElements.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const mutable = { ...target, global_ids: [beam, child] };
  const first = adapter.navigate(mutable);
  mutable.global_ids[0] = "0M0KwyPFrBT9KwklhqZa8W";
  const second = adapter.navigate({ ...target, source_revision_id: "missing" });
  await vi.waitFor(() => expect(sdk.navigateElements).toHaveBeenCalledOnce());
  expect(sdk.clearTargetSelection).not.toHaveBeenCalled();
  release();
  expect(await first).toEqual(target);
  await expect(second).rejects.toThrow("not loaded");
  expect(selected).toHaveBeenCalledExactlyOnceWith(target);
  expect(sdk.getIdsByGuids).toHaveBeenCalledWith([beam, child], "native-model");
});
it("fences disposed sessions during lookup and rejects all later navigation", async () => {
  const { adapter, selected, failure } = await open();
  let release!: (value: number[]) => void;
  sdk.getIdsByGuids.mockImplementation(
    () =>
      new Promise<number[]>((resolve) => {
        release = resolve;
      }),
  );
  const pending = adapter.navigate(target);
  await vi.waitFor(() => expect(sdk.getIdsByGuids).toHaveBeenCalled());
  adapter.dispose();
  release([1, 2]);
  await expect(pending).rejects.toThrow("closed");
  await expect(adapter.navigate(target)).rejects.toThrow("closed");
  expect(sdk.navigateElements).not.toHaveBeenCalled();
  expect(selected).not.toHaveBeenCalled();
  expect(failure).not.toHaveBeenCalled();
});
it("preserves native failure instead of returning an unacknowledged success", async () => {
  const { adapter, selected, failure } = await open();
  sdk.navigateElements.mockRejectedValue(new Error("native fitting failed"));
  await expect(adapter.navigate(target)).rejects.toThrow(
    "native fitting failed",
  );
  expect(selected).not.toHaveBeenCalled();
  expect(failure).toHaveBeenCalledWith(
    expect.objectContaining({ message: "native fitting failed" }),
  );
  expect(sdk.clearTargetSelection).toHaveBeenCalledOnce();
});
it("reports cleanup failures and recovers on a later valid request", async () => {
  const { adapter, failure } = await open();
  sdk.clearTargetSelection.mockRejectedValueOnce(
    new Error("highlight removal failed"),
  );
  await expect(
    adapter.navigate({ ...target, source_revision_id: "missing" }),
  ).rejects.toThrow("not loaded");
  expect(failure).toHaveBeenLastCalledWith(
    expect.objectContaining({
      message: expect.stringContaining("cleanup failed"),
    }),
  );
  await expect(adapter.navigate(target)).resolves.toEqual(target);
  expect(failure).toHaveBeenLastCalledWith(null);
});
it("maps native user selections to generated BIM targets without leaking source hashes", async () => {
  const { selected } = await open();
  const listener = sdk.on.mock.calls.find(
    ([name]) => name === "element-selected",
  )![1];
  await listener({ modelId: "native-model", expressId: 1 });
  expect(selected).toHaveBeenCalledWith({
    kind: "bim",
    source_revision_id: "R2",
    global_ids: [beam],
  });
});

it("bounds queued requests and reports overflow without dispatching excess work", async () => {
  const { adapter, failure } = await open();
  const queued = Array.from({ length: 16 }, () => adapter.navigate(target));
  await expect(adapter.navigate(target)).rejects.toThrow("Too many pending");
  expect(failure).toHaveBeenCalledWith(
    expect.objectContaining({
      message: "Too many pending BIM navigation requests",
    }),
  );
  await Promise.all(queued);
  expect(sdk.navigateElements).toHaveBeenCalledTimes(16);
});
it("rejects incomplete lookup responses and propagates lookup exceptions", async () => {
  const { adapter, selected } = await open();
  sdk.getIdsByGuids.mockResolvedValueOnce([1]);
  await expect(adapter.navigate(target)).rejects.toThrow("absent");
  sdk.getIdsByGuids.mockRejectedValueOnce(new Error("fragment lookup failed"));
  await expect(adapter.navigate(target)).rejects.toThrow(
    "fragment lookup failed",
  );
  expect(selected).not.toHaveBeenCalled();
  expect(sdk.navigateElements).not.toHaveBeenCalled();
});
it("does not publish a model after disposal while its native import is pending", async () => {
  const adapter = new IfcModelAdapter(document.createElement("div"));
  let release!: (value: unknown) => void;
  sdk.add.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = adapter.load([source]);
  await vi.waitFor(() => expect(sdk.add).toHaveBeenCalled());
  adapter.dispose();
  release({ modelId: "late-model", elementCount: 2 });
  await expect(pending).rejects.toThrow("closed");
  expect(adapter.summaries).toEqual([]);
});
it("shows missing native user-selection identity and ignores unloaded models", async () => {
  const { selected, failure } = await open();
  const listener = sdk.on.mock.calls.find(
    ([name]) => name === "element-selected",
  )![1];
  await listener({ modelId: "missing-model", expressId: 1 });
  expect(sdk.getElement).not.toHaveBeenCalled();
  sdk.getElement.mockResolvedValueOnce(null);
  await listener({ modelId: "native-model", expressId: 1 });
  expect(selected).not.toHaveBeenCalled();
  expect(failure).toHaveBeenCalledWith(
    expect.objectContaining({
      message: "IFC selection has no stable GlobalId",
    }),
  );
});

it("clears source-only selection after pending element navigation without issuing another navigation", async () => {
  const { adapter, failure } = await open();
  let release!: () => void;
  sdk.navigateElements.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const navigation = adapter.navigate(target);
  await vi.waitFor(() => expect(sdk.navigateElements).toHaveBeenCalledOnce());
  const clearing = adapter.clearSelection();
  expect(sdk.clearTargetSelection).not.toHaveBeenCalled();
  release();
  await navigation;
  await clearing;
  expect(sdk.clearTargetSelection).toHaveBeenCalledOnce();
  expect(sdk.navigateElements).toHaveBeenCalledOnce();
  expect(failure).toHaveBeenLastCalledWith(null);
});
it("preserves rejection state when clearing a malformed surface target", async () => {
  const { adapter, failure } = await open();
  await adapter.clearSelection(false);
  expect(sdk.clearTargetSelection).toHaveBeenCalledOnce();
  expect(failure).not.toHaveBeenCalled();
  sdk.clearTargetSelection.mockRejectedValueOnce(
    new Error("Native cleanup failed"),
  );
  await expect(adapter.clearSelection()).rejects.toThrow(
    "Native cleanup failed",
  );
  expect(failure).toHaveBeenLastCalledWith(expect.any(Error));
  adapter.dispose();
  await expect(adapter.clearSelection()).rejects.toThrow("closed");
});
