import { describe, expect, it } from "vitest";
import type { CadSource, CadTarget } from "./cadTypes";
import { toCadNavigation, toCadTarget } from "./cadContract";

const first: CadSource = {
  name: "first.dxf",
  data: new ArrayBuffer(1),
  revisionId: "revision-one",
  sourceHash: "a".repeat(64),
};
const second: CadSource = {
  ...first,
  revisionId: "revision-two",
  sourceHash: "b".repeat(64),
};
const loaded = [first, second] as const;

describe("canonical CAD ViewerTarget adapter", () => {
  it("maps a formal revision ID to the loaded source hash only inside the viewer", () => {
    const contract: CadTarget = {
      kind: "cad",
      source_revision_id: second.revisionId,
      entity_id: "A17",
      layer: "MEP",
      view_bounds: [1, 2, 3, 4],
    };
    expect(toCadNavigation(contract, loaded)).toEqual({
      sourceRevisionId: second.revisionId,
      sourceHash: second.sourceHash,
      entityId: "A17",
      layer: "MEP",
      viewBounds: { minX: 1, minY: 2, maxX: 3, maxY: 4 },
    });
    expect(toCadTarget(toCadNavigation(contract, loaded), loaded)).toEqual(
      contract,
    );
    expect(
      JSON.stringify(toCadTarget(toCadNavigation(contract, loaded), loaded)),
    ).not.toContain(second.sourceHash);
  });

  it.each([{}, { layer: null, view_bounds: null }])(
    "preserves absent or nullable optional hints %j",
    (hints) => {
      const target: CadTarget = {
        source_revision_id: first.revisionId,
        entity_id: "31",
        ...hints,
      };
      const local = toCadNavigation(target, loaded);
      expect(local.sourceHash).toBe(first.sourceHash);
      expect(toCadTarget(local, loaded)).toMatchObject({
        source_revision_id: first.revisionId,
        entity_id: "31",
      });
      expect(toCadTarget(local, loaded)).not.toHaveProperty("sourceHash");
    },
  );

  it("fails clearly for unloaded revisions, absent entities and hash mismatches", () => {
    expect(() =>
      toCadNavigation(
        { source_revision_id: "unknown", entity_id: "31" },
        loaded,
      ),
    ).toThrow("revision unknown is not loaded");
    expect(() =>
      toCadNavigation({ source_revision_id: first.revisionId }, loaded),
    ).toThrow("requires an entity ID");
    expect(() =>
      toCadTarget(
        {
          sourceRevisionId: first.revisionId,
          sourceHash: second.sourceHash,
          entityId: "31",
        },
        loaded,
      ),
    ).toThrow("does not match the loaded revision");
  });
});
