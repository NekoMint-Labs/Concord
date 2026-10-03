import { expect, it } from "vitest";
import { engineeringContextKey, scopeFor } from "./agentContext";

it("retains the exact selection at the Agent limit and rejects larger scope instead of truncating it", () => {
  const elementIds = Array.from({ length: 200 }, (_, i) => `gid-${i}`);
  expect(scopeFor({ elementIds }).element_ids).toEqual(elementIds);
  expect(() => scopeFor({ elementIds: [...elementIds, "gid-200"] })).toThrow(
    /200/,
  );
});

it("engineering identity ignores display metadata and normalizes element selections", () => {
  const scope = {
    sourceId: "source",
    revisionId: "r2",
    fromRevisionId: "r1",
    workPackageId: "WP-A",
    elementIds: ["a", "b"],
  };
  expect(engineeringContextKey("project", scope)).toBe(
    engineeringContextKey("project", {
      ...scope,
      projectName: "Renamed project",
      sourceName: "Renamed source",
      revisionLabel: "Renamed revision",
      fromRevisionLabel: "Renamed baseline",
      workPackageName: "Renamed package",
      elementIds: ["b", "a", "a"],
    }),
  );
  expect(engineeringContextKey("project", { workPackageId: null })).toBe(
    engineeringContextKey("project", {}),
  );
});
