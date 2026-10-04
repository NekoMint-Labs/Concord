import { expect, it } from "vitest";
import { snapshotBimTarget } from "./ifcTarget";
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
