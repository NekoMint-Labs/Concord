import { webcrypto } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { mapCadChanges } from "./cadChangeMapping";
import type { CadChangeContext } from "./cadChangeMapping";
import { CAD_ENGINE } from "./cadTypes";
import type { CadChangeCandidate, CadComparison } from "./cadTypes";

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());
function context(): CadChangeContext {
  return {
    projectId: "project",
    sourceId: "drawing",
    operationId: "cad-comparison",
    before: { revisionId: "R1", sourceHash: "a".repeat(64) },
    after: { revisionId: "R2", sourceHash: "b".repeat(64) },
    observedAt: "2026-10-04T09:00:00.000Z",
  };
}
function row(
  revision = "R2",
  kind: CadChangeCandidate["kind"] = "added",
): CadChangeCandidate {
  return {
    kind,
    sourceRevisionId: revision,
    sourceHash: (revision === "R1" ? "a" : "b").repeat(64),
    entityId: revision === "R1" ? "A1" : "B1",
    entityType: "LINE",
    layer: "STRUCTURE",
    location: { minX: 0, minY: 0, maxX: 10, maxY: 0 },
    aspects: [],
  };
}
function pair(): CadChangeCandidate[] {
  return ["R1", "R2"].map((revision) => ({
    ...row(revision, "modified"),
    pairedEntityId: revision === "R1" ? "B1" : "A1",
    aspects: [{ field: "geometry", before: "old", after: "new" }],
  }));
}
function result(changes = [row()]): CadComparison {
  return {
    engine: CAD_ENGINE,
    revisionIds: ["R1", "R2"],
    sourceHashes: ["a".repeat(64), "b".repeat(64)],
    changes,
    warnings: [],
  };
}

it("maps added and deleted native entities to the correct canonical revision targets", async () => {
  const changes = await mapCadChanges(
    result([row(), row("R1", "deleted")]),
    context(),
  );
  expect(changes.map((change) => change.kind)).toEqual(["added", "deleted"]);
  for (const change of changes) {
    expect(change).toMatchObject({
      project_id: "project",
      source_id: "drawing",
      from_revision_id: "R1",
      to_revision_id: "R2",
      detector: "mlightcad",
      detector_version: CAD_ENGINE,
      raw_artifact_key: null,
      created_at: context().observedAt,
    });
    expect(change.id).toMatch(/^[a-f0-9]{64}$/);
  }
  expect(changes[0].subject).toEqual({
    kind: "cad",
    source_revision_id: "R2",
    entity_id: "B1",
    layer: "STRUCTURE",
    view_bounds: [0, 0, 10, 0],
  });
  expect(changes[1].subject.source_revision_id).toBe("R1");
});
it("collapses reciprocal modified hits without using the old entity as the new target", async () => {
  const changes = await mapCadChanges(result(pair()), context());
  expect(changes).toHaveLength(1);
  expect(changes[0]).toMatchObject({
    kind: "changed",
    aspects: ["geometry"],
    subject: { source_revision_id: "R2", entity_id: "B1" },
  });
  expect(await mapCadChanges(result(pair().reverse()), context())).toEqual(
    changes,
  );
});
it("preserves caller artifact references and omits unavailable location/layer hints", async () => {
  const candidate = row();
  delete candidate.location;
  candidate.layer = "";
  const [change] = await mapCadChanges(result([candidate]), {
    ...context(),
    rawArtifactKey: "derived/cad",
  });
  expect(change.raw_artifact_key).toBe("derived/cad");
  expect(change.subject).toEqual({
    kind: "cad",
    source_revision_id: "R2",
    entity_id: "B1",
  });
});
it("returns no Change for verified unchanged inputs without inventing resolution", async () => {
  expect(await mapCadChanges(result([]), context())).toEqual([]);
});
it("binds even empty results to both input identities and the supported engine", async () => {
  const wrong = result([]);
  wrong.sourceHashes[0] = "c".repeat(64);
  await expect(mapCadChanges(wrong, context())).rejects.toThrow(
    "revision/hash pair",
  );
});
it("keeps retry content stable while separating operations, sources and hashes", async () => {
  const first = await mapCadChanges(result(), context());
  expect(await mapCadChanges(result(), context())).toEqual(first);
  for (const override of [
    { operationId: "another-op" },
    { sourceId: "another-source" },
    { projectId: "another-project" },
  ]) {
    expect(
      (await mapCadChanges(result(), { ...context(), ...override }))[0].id,
    ).not.toBe(first[0].id);
  }
  const next = result();
  next.sourceHashes[0] = "c".repeat(64);
  expect(
    (
      await mapCadChanges(next, {
        ...context(),
        before: { revisionId: "R1", sourceHash: "c".repeat(64) },
      })
    )[0].id,
  ).not.toBe(first[0].id);
});
it("owns values before hashing so caller mutations cannot relabel results", async () => {
  const value = result(pair()),
    scope = context();
  const pending = mapCadChanges(value, scope);
  scope.after.revisionId = "R3";
  scope.sourceId = "other";
  value.changes[1].layer = "changed";
  value.sourceHashes[0] = "c".repeat(64);
  expect(await pending).toEqual(await mapCadChanges(result(pair()), context()));
});

it.each([
  ["missing project", { projectId: " " }, "identities"],
  ["missing source", { sourceId: "" }, "identities"],
  ["long operation", { operationId: "a".repeat(101) }, "identities"],
  [
    "missing revision",
    { before: { revisionId: "", sourceHash: "a".repeat(64) } },
    "revision IDs",
  ],
  [
    "invalid hash",
    { before: { revisionId: "R1", sourceHash: "bad" } },
    "SHA-256",
  ],
  [
    "same revision",
    { after: { revisionId: "R1", sourceHash: "b".repeat(64) } },
    "distinct",
  ],
  ["naive time", { observedAt: "2026-10-04T09:00:00" }, "UTC"],
  ["invalid time", { observedAt: "2026-99-04T09:00:00Z" }, "UTC"],
  ["impossible day", { observedAt: "2026-02-31T09:00:00Z" }, "UTC"],
])("rejects %s", async (_label, override, message) => {
  await expect(
    mapCadChanges(result(), { ...context(), ...override }),
  ).rejects.toThrow(message);
});
it.each([
  [
    "wrong engine",
    (value: CadComparison) => {
      value.engine = "unqualified";
    },
    "revision/hash pair",
  ],
  [
    "swapped revisions",
    (value: CadComparison) => {
      value.revisionIds.reverse();
    },
    "revision/hash pair",
  ],
  [
    "incomplete hashes",
    (value: CadComparison) => {
      value.sourceHashes.pop();
    },
    "revision/hash pair",
  ],
  [
    "stale row",
    (value: CadComparison) => {
      value.changes[0].sourceRevisionId = "R3";
    },
    "provenance",
  ],
  [
    "wrong row hash",
    (value: CadComparison) => {
      value.changes[0].sourceHash = "c".repeat(64);
    },
    "provenance",
  ],
  [
    "invalid kind",
    (value: CadComparison) => {
      value.changes[0].kind = "unknown" as never;
    },
    "kind",
  ],
  [
    "deleted new entity",
    (value: CadComparison) => {
      value.changes[0].kind = "deleted";
    },
    "side",
  ],
  [
    "nonfinite bounds",
    (value: CadComparison) => {
      value.changes[0].location!.minX = NaN;
    },
    "target",
  ],
  [
    "empty aspect",
    (value: CadComparison) => {
      value.changes[0].aspects = [{ field: "", before: "", after: "" }];
    },
    "aspects",
  ],
  [
    "too many aspects",
    (value: CadComparison) => {
      value.changes[0].aspects = Array(257).fill({ field: "x" });
    },
    "aspects",
  ],
  [
    "duplicate entity",
    (value: CadComparison) => {
      value.changes.push({ ...value.changes[0], entityId: "b1" });
    },
    "duplicate",
  ],
  [
    "unmatched pair",
    (value: CadComparison) => {
      value.changes[0].pairedEntityId = "A1";
    },
    "Unmatched",
  ],
  [
    "oversized donor result",
    (value: CadComparison) => {
      value.changes = Array(2001).fill(row());
    },
    "bounded",
  ],
])("rejects %s", async (_label, mutate, message) => {
  const value = result();
  mutate(value);
  await expect(mapCadChanges(value, context())).rejects.toThrow(message);
});
it.each(["missing", "wrong reciprocal", "different aspects"])(
  "rejects %s modified pairs",
  async (failure) => {
    const candidates = pair();
    if (failure === "missing") candidates.pop();
    if (failure === "wrong reciprocal") candidates[1].pairedEntityId = "FF";
    if (failure === "different aspects") candidates[1].aspects = [];
    await expect(mapCadChanges(result(candidates), context())).rejects.toThrow(
      "reciprocal",
    );
  },
);
it("rejects added records attributed to the old revision", async () => {
  await expect(mapCadChanges(result([row("R1")]), context())).rejects.toThrow(
    "side",
  );
});
it("enforces the platform limit after donor pair reduction", async () => {
  const candidates = Array.from({ length: 1001 }, (_, index) => ({
    ...row(),
    entityId: (index + 1).toString(16),
  }));
  await expect(mapCadChanges(result(candidates), context())).rejects.toThrow(
    "platform",
  );
});

it("copies revision metadata without copying loaded source bytes", async () => {
  const scope = context();
  Object.defineProperty(scope.before, "data", {
    enumerable: true,
    get: () => {
      throw new Error("Source bytes should not be read");
    },
  });
  expect(await mapCadChanges(result(), scope)).toEqual(
    await mapCadChanges(result(), context()),
  );
});

it("retains distinct revision identities when both revisions have identical bytes", async () => {
  const sameBytes = result(pair());
  sameBytes.sourceHashes[1] = sameBytes.sourceHashes[0];
  sameBytes.changes[1].sourceHash = sameBytes.sourceHashes[0];
  const [change] = await mapCadChanges(sameBytes, {
    ...context(),
    after: { revisionId: "R2", sourceHash: "a".repeat(64) },
  });
  expect(change).toMatchObject({
    from_revision_id: "R1",
    to_revision_id: "R2",
    subject: { source_revision_id: "R2" },
  });
});
