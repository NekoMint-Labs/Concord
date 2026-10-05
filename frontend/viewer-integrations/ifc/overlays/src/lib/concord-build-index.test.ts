import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FragmentIndex } from "./concord-fragment-index";
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  entries: new Map<string, object>(),
  trees: new Map(),
  decomp: new Map(),
  diagnostics: { builds: 0, hits: 0, writes: 0, failures: 0 },
}));
vi.mock("./concord-index-cache", () => ({
  readIndex: mocks.read,
  writeIndex: mocks.write,
  indexDiagnostics: mocks.diagnostics,
}));
vi.mock("./model-registry", () => ({
  modelRegistry: { get: (id: string) => mocks.entries.get(id) },
}));
vi.mock("../stores/validationStore", () => ({
  useValidationStore: {
    getState: () => ({
      setSpatialTreeForModel: (id: string, tree: unknown) =>
        mocks.trees.set(id, tree),
      setDecompMapForModel: (id: string, map: unknown) =>
        mocks.decomp.set(id, map),
    }),
  },
}));
import { buildConcordIndex } from "./concord-build-index";
const index: FragmentIndex = {
  tree: [
    {
      expressId: 1,
      globalId: "g",
      ifcClass: "IFCPROJECT",
      name: "Project",
      children: [],
      containedElements: [],
    },
  ],
  decomp: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.entries.clear();
  mocks.trees.clear();
  mocks.decomp.clear();
  Object.assign(mocks.diagnostics, {
    builds: 0,
    hits: 0,
    writes: 0,
    failures: 0,
  });
  mocks.entries.set("m", { opfsCacheKey: "key" });
  mocks.read.mockResolvedValue(null);
  mocks.write.mockResolvedValue(undefined);
});
describe("derived index publication", () => {
  it("produces and stores a native index once", async () => {
    const produce = vi.fn(async () => index);
    await buildConcordIndex("m", produce);
    expect(mocks.write).toHaveBeenCalledWith("key", index);
    expect(mocks.trees.get("m")).toEqual(index.tree);
    expect(mocks.diagnostics.builds).toBe(1);
  });
  it("warm read does not invoke the native builder", async () => {
    mocks.read.mockResolvedValue(index);
    const produce = vi.fn();
    await buildConcordIndex("m", produce);
    expect(produce).not.toHaveBeenCalled();
    expect(mocks.diagnostics.hits).toBe(1);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("does not restore a removed or replaced registration", async () => {
    mocks.read.mockImplementation(async () => {
      mocks.entries.set("m", { opfsCacheKey: "other" });
      return index;
    });
    const produce = vi.fn();
    await buildConcordIndex("m", produce);
    expect(mocks.trees.size).toBe(0);
    expect(produce).not.toHaveBeenCalled();
  });
  it("drops late native data after model removal", async () => {
    await buildConcordIndex("m", async () => {
      mocks.entries.delete("m");
      return index;
    });
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.trees.size).toBe(0);
  });
  it("drops publication after removal during cache write", async () => {
    mocks.write.mockImplementation(async () => {
      mocks.entries.delete("m");
    });
    await buildConcordIndex("m", async () => index);
    expect(mocks.trees.size).toBe(0);
  });
  it("propagates engine failure and never caches partial data", async () => {
    await expect(
      buildConcordIndex("m", async () => {
        throw new Error("SDK failed");
      }),
    ).rejects.toThrow("SDK failed");
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.diagnostics.failures).toBe(1);
  });
  it("rebuilds invalid cache entries", async () => {
    mocks.read.mockResolvedValue({ tree: [], decomp: [] });
    const produce = vi.fn(async () => index);
    await buildConcordIndex("m", produce);
    expect(produce).toHaveBeenCalledOnce();
  });
  it("does not produce data for a missing model registration", async () => {
    const produce = vi.fn();
    await buildConcordIndex("missing", produce);
    expect(produce).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("rejects an empty native tree without caching it", async () => {
    await expect(
      buildConcordIndex("m", async () => ({ tree: [], decomp: [] })),
    ).rejects.toThrow("no model tree");
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.trees.size).toBe(0);
  });
});
