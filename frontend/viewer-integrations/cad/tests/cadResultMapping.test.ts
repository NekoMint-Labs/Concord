import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { normalizeCadResult } from "../src/normalizeCadResult";
import { mapCadChanges } from "../../../src/viewers/cad/cadChangeMapping";
import { CAD_ENGINE } from "../src/cadTypes";

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());
it("normalizes the donor pair into one canonical Change with complete input identity", async () => {
  const before = {
    revisionId: "R1",
    sourceHash: "a".repeat(64),
    name: "old.dxf",
    data: new ArrayBuffer(1),
  };
  const after = {
    revisionId: "R2",
    sourceHash: "b".repeat(64),
    name: "new.dxf",
    data: new ArrayBuffer(1),
  };
  const result = normalizeCadResult(
    {
      added: [],
      deleted: [],
      unchanged: [],
      navigation: [],
      changeSets: [],
      modified: [
        {
          side: "left",
          kind: "modified",
          objectId: "A1",
          pairedId: "B1",
          dxfType: "LINE",
          layer: "STRUCTURE",
          changes: [{ field: "endPoint", oldValue: "old", newValue: "new" }],
        },
        {
          side: "right",
          kind: "modified",
          objectId: "B1",
          pairedId: "A1",
          dxfType: "LINE",
          layer: "STRUCTURE",
          changes: [{ field: "endPoint", oldValue: "old", newValue: "new" }],
        },
      ],
    },
    before,
    after,
  );
  expect(result).toMatchObject({
    engine: CAD_ENGINE,
    revisionIds: ["R1", "R2"],
    sourceHashes: [before.sourceHash, after.sourceHash],
  });
  const changes = await mapCadChanges(result, {
    projectId: "project",
    sourceId: "cad",
    operationId: "donor-test",
    before,
    after,
    observedAt: "2026-10-04T09:00:00Z",
  });
  expect(changes).toHaveLength(1);
  expect(changes[0]).toMatchObject({
    kind: "changed",
    aspects: ["endPoint"],
    subject: { source_revision_id: "R2", entity_id: "B1", layer: "STRUCTURE" },
  });
});
