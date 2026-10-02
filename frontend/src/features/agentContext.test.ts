import { expect, it } from "vitest";
import { scopeFor } from "./agentContext";

it("retains the exact selection at the Agent limit and rejects larger scope instead of truncating it", () => {
  const elementIds = Array.from({ length: 200 }, (_, i) => `gid-${i}`);
  expect(scopeFor({ elementIds }).element_ids).toEqual(elementIds);
  expect(() => scopeFor({ elementIds: [...elementIds, "gid-200"] })).toThrow(
    /200/,
  );
});
