import { afterEach, describe, expect, it } from "vitest";
import type { AcDbDatabase, AcDbEntity } from "@mlightcad/data-model";
import { acapCompareDrawings as originalCompare } from "../node_modules/@mlightcad/cad-diff-viewer/lib/compare/acapCompareDrawings.js";
import {
  acapCompareSnapshots,
  type AcApDiffCompareOptions,
} from "../vendor/compare/acapCompareDrawings";
import {
  cadSnapshotKey,
  clearCadSnapshots,
  prepareCadSnapshots,
  snapshotCadOptions,
} from "../src/cadSnapshots";
const hash = "a".repeat(64);
const db = (entities: unknown[]) =>
  ({
    tables: {
      blockTable: { modelSpace: { newIterator: () => entities.values() } },
    },
  }) as unknown as AcDbDatabase;
const entity = (id: string, overrides: object = {}) => ({
  objectId: id,
  dxfTypeName: "LINE",
  layer: "structure",
  startPoint: { x: 0, y: 0, z: 0 },
  endPoint: { x: 10, y: 0, z: 0 },
  color: { toString: () => "red" },
  lineType: "Continuous",
  lineWeight: 1,
  geometricExtents: {
    isEmpty: () => false,
    min: { x: 0, y: 0 },
    max: { x: 10, y: 0 },
  },
  ...overrides,
});
const before = db([
  entity("1"),
  entity("2", { dxfTypeName: "CIRCLE", radius: 5, center: { x: 2, y: 3 } }),
  entity("3", { dxfTypeName: "TEXT", textString: "Beam B01" }),
  entity("4", { dxfTypeName: "HATCH" }),
  entity("5"),
  entity("6"),
  entity("7"),
]);
const after = db([
  entity("1", { endPoint: { x: 12, y: 0, z: 0 } }),
  entity("2", {
    dxfTypeName: "ARC",
    radius: 5,
    center: { x: 2, y: 3 },
    startAngle: 0,
    endAngle: 1,
  }),
  entity("3", { dxfTypeName: "TEXT", textString: "Beam B02" }),
  entity("4", { dxfTypeName: "HATCH", layer: "mep" }),
  entity("50"),
  entity("6", { color: { toString: () => "blue" }, layer: "mep" }),
  entity("7", {
    startPoint: { x: 10, y: 0, z: 0 },
    endPoint: { x: 0, y: 0, z: 0 },
  }),
]);
afterEach(clearCadSnapshots);
describe("native donor snapshot comparison", () => {
  it.each<AcApDiffCompareOptions>([
    {},
    { includeUnchanged: true },
    { compareProps: 127 },
    { compareHatch: 1, compareText: 0 },
    { tolerance: 100, compareRcMargin: 25 },
    { compareTolerance: 0, compareProps: 2, includeUnchanged: true },
  ])("matches the installed unmodified donor for %j", async (options) => {
    const signal = new AbortController().signal;
    const left = await prepareCadSnapshots(before, hash, options, signal);
    const right = await prepareCadSnapshots(
      after,
      "b".repeat(64),
      options,
      signal,
    );
    expect(
      acapCompareSnapshots(left.snapshots, right.snapshots, options),
    ).toEqual(originalCompare(before, after, options));
    expect(() => structuredClone(left.snapshots)).not.toThrow();
    expect(left.snapshots.every((snapshot) => !("entity" in snapshot))).toBe(
      true,
    );
  });
  it("reuses derived data for the same hash/settings without reading the database", async () => {
    const signal = new AbortController().signal;
    const cold = await prepareCadSnapshots(before, hash, {}, signal);
    const inaccessible = db([]);
    inaccessible.tables.blockTable.modelSpace.newIterator = () => {
      throw new Error("must not iterate warm DB");
    };
    const warm = await prepareCadSnapshots(
      inaccessible,
      hash,
      { compareTolerance: 6, compareHatch: 0 },
      signal,
    );
    expect(cold.cacheHit).toBe(false);
    expect(warm).toMatchObject({ cacheHit: true, visited: 0, yields: 0 });
    expect(warm.snapshots).toBe(cold.snapshots);
    expect(cadSnapshotKey(hash, {})).not.toBe(
      cadSnapshotKey(hash, { compareProps: 1 }),
    );
    expect(cadSnapshotKey(hash, {})).not.toBe(
      cadSnapshotKey("c".repeat(64), {}),
    );
  });
  it("freezes options while cooperatively yielding during preparation", async () => {
    const options = { compareText: 1 };
    const many = db(
      Array.from({ length: 300 }, (_, index) =>
        entity(String(index), { dxfTypeName: "TEXT", textString: "A" }),
      ),
    );
    let yields = 0;
    const prepared = await prepareCadSnapshots(
      many,
      hash,
      options,
      new AbortController().signal,
      async () => {
        ++yields;
        options.compareText = 0;
      },
    );
    expect(prepared.snapshots).toHaveLength(300);
    expect(yields).toBeGreaterThanOrEqual(2);
    expect(prepared.yields).toBe(yields);
  });
  it("cancels between batches and never caches partial results", async () => {
    const many = db(
      Array.from({ length: 300 }, (_, index) => entity(String(index))),
    );
    const controller = new AbortController();
    await expect(
      prepareCadSnapshots(many, hash, {}, controller.signal, async () =>
        controller.abort(new Error("closed")),
      ),
    ).rejects.toThrow("closed");
    const next = await prepareCadSnapshots(
      before,
      hash,
      {},
      new AbortController().signal,
    );
    expect(next.cacheHit).toBe(false);
    expect(next.snapshots).toHaveLength(6);
  });
  it("bounds traversal even when all entities are excluded", async () => {
    const hidden = entity("h", { dxfTypeName: "HATCH" });
    await expect(
      prepareCadSnapshots(
        db(Array(100001).fill(hidden)),
        hash,
        {},
        new AbortController().signal,
        async () => {},
      ),
    ).rejects.toThrow("entity limit");
  });
  it("rejects oversized derived artifacts without caching them", async () => {
    const huge = entity("1", {
      dxfTypeName: "TEXT",
      textString: "x".repeat(6 * 1024 * 1024),
    });
    await expect(
      prepareCadSnapshots(db([huge]), hash, {}, new AbortController().signal),
    ).rejects.toThrow("byte limit");
    expect(
      (
        await prepareCadSnapshots(
          before,
          hash,
          {},
          new AbortController().signal,
        )
      ).cacheHit,
    ).toBe(false);
  });
  it("evicts bounded LRU entries and clears them at viewer exit", async () => {
    const signal = new AbortController().signal;
    for (const prefix of ["a", "b", "c", "d", "e"])
      await prepareCadSnapshots(before, prefix.repeat(64), {}, signal);
    expect((await prepareCadSnapshots(before, hash, {}, signal)).cacheHit).toBe(
      false,
    );
    clearCadSnapshots();
    expect((await prepareCadSnapshots(before, hash, {}, signal)).cacheHit).toBe(
      false,
    );
  });
  it.each([
    { tolerance: NaN },
    { compareProps: 128 },
    { compareHatch: 2 },
    { compareText: -1 },
    { compareTolerance: 15 },
    { compareRcMargin: 0 },
    { compareProps: 1.1 },
    { includeUnchanged: "yes" },
  ])("rejects invalid options %j", (options) => {
    expect(() =>
      snapshotCadOptions(options as AcApDiffCompareOptions),
    ).toThrow();
  });
  it("preserves donor fallback semantics for non-positive explicit tolerance", () => {
    expect(cadSnapshotKey(hash, { tolerance: 0 })).toBe(
      cadSnapshotKey(hash, {}),
    );
    expect(cadSnapshotKey(hash, { tolerance: -1 })).toBe(
      cadSnapshotKey(hash, {}),
    );
    expect(snapshotCadOptions({ tolerance: 0 })).toMatchObject({
      tolerance: 0,
    });
  });
  it("rejects an invalid source hash or already cancelled request", async () => {
    const controller = new AbortController();
    controller.abort(new Error("gone"));
    await expect(
      prepareCadSnapshots(before, hash, {}, controller.signal),
    ).rejects.toThrow("gone");
    expect(() => cadSnapshotKey("bad", {})).toThrow("hash");
  });
});

it("uses real task yielding rather than a single synchronous extraction pass", async () => {
  const many = db(
    Array.from({ length: 300 }, (_, index) => entity(String(index))),
  );
  const result = await prepareCadSnapshots(
    many,
    hash,
    {},
    new AbortController().signal,
  );
  expect(result.yields).toBeGreaterThanOrEqual(2);
});
it("reconciles concurrent preparations without double-counting cached bytes", async () => {
  const many = db(
    Array.from({ length: 300 }, (_, index) => entity(String(index))),
  );
  const signal = new AbortController().signal;
  const [first, second] = await Promise.all([
    prepareCadSnapshots(many, hash, {}, signal),
    prepareCadSnapshots(many, hash, {}, signal),
  ]);
  expect(first.snapshots).toEqual(second.snapshots);
  expect((await prepareCadSnapshots(many, hash, {}, signal)).cacheHit).toBe(
    true,
  );
});
it("evicts on byte pressure before reaching the entry-count limit", async () => {
  const large = db([
    entity("1", {
      dxfTypeName: "TEXT",
      textString: "x".repeat(3 * 1024 * 1024),
    }),
  ]);
  const signal = new AbortController().signal;
  await prepareCadSnapshots(large, hash, {}, signal);
  await prepareCadSnapshots(large, "b".repeat(64), {}, signal);
  expect((await prepareCadSnapshots(before, hash, {}, signal)).cacheHit).toBe(
    false,
  );
});
