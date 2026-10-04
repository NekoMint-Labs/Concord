import { expect, it } from "vitest";
import { snapshotBimTarget, bimSurfaceTarget } from "./ifcTarget";
import type { BimTarget } from "./ifcTypes";
const target: BimTarget = {
  source_revision_id: "R2",
  global_ids: ["3M0KwyPFrBT9KwklhqZa8W"],
};
it("consumes generated revision/GlobalId targets, with nullable optional viewpoint", () => {
  expect(snapshotBimTarget({ ...target, viewpoint: null })).toEqual({
    ...target,
    kind: "bim",
  });
  expect(snapshotBimTarget(target).global_ids).not.toBe(target.global_ids);
});
it.each([
  null,
  { kind: "cad" },
  { source_revision_id: "" },
  { source_revision_id: 4 },
  { global_ids: null },
  { global_ids: [] },
  { global_ids: "invalid" },
  { global_ids: ["invalid"] },
  { global_ids: [...target.global_ids!, ...target.global_ids!] },
  { global_ids: Array(1001).fill(target.global_ids![0]) },
  { viewpoint: [1, 2, 3, 4, 5, 6] },
])("rejects malformed, ambiguous or unsupported requests: %j", (patch) => {
  expect(() =>
    snapshotBimTarget(
      patch === null
        ? (null as unknown as BimTarget)
        : ({ ...target, ...patch } as BimTarget),
    ),
  ).toThrow();
});

const loaded = [
  {
    revisionId: "R2",
    sourceHash: "a".repeat(64),
    name: "model.ifc",
    data: new ArrayBuffer(1),
  },
];
it("normalizes only verified source-only targets and keeps explicit camera failures", () => {
  expect(
    bimSurfaceTarget({ source_revision_id: "R2", global_ids: [] }, loaded),
  ).toBeUndefined();
  expect(
    bimSurfaceTarget({ source_revision_id: "R2" }, loaded),
  ).toBeUndefined();
  expect(bimSurfaceTarget(target, loaded)).toEqual({ ...target, kind: "bim" });
  expect(() =>
    bimSurfaceTarget(
      { ...target, source_revision_id: "R1", global_ids: [] },
      loaded,
    ),
  ).toThrow("not loaded");
  expect(() =>
    bimSurfaceTarget(
      { ...target, global_ids: [], viewpoint: [1, 2, 3, 4, 5, 6] },
      loaded,
    ),
  ).toThrow("reserved");
  expect(() =>
    bimSurfaceTarget(
      { ...target, global_ids: null } as unknown as BimTarget,
      loaded,
    ),
  ).toThrow();
});
