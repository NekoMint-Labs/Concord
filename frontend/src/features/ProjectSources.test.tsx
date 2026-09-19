import { expect, it } from "vitest";
import type { DTO } from "../api/client";
import { revisionState } from "./ProjectSources";

const source = {
  source: {
    id: "source",
    project_id: "project",
    name: "MEP model",
    kind: "BIM",
    created_at: "2026-01-01T00:00:00Z",
  },
  latest_revision_id: "r2",
  accepted_revision_id: "r1",
  baseline_id: "b1",
  has_pending_revision: true,
} satisfies DTO<"ProjectSourceStatus">;

it("keeps latest, accepted, and pending source revision meanings distinct", () => {
  expect(revisionState(source, "r2")).toBe("latest");
  expect(revisionState(source, "r1")).toBe("accepted");
  expect(revisionState(source, "older")).toBe("historical");
  expect(
    revisionState(
      {
        ...source,
        accepted_revision_id: "r2",
        has_pending_revision: false,
      },
      "r2",
    ),
  ).toBe("latest-accepted");
});
