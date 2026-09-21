import { expect, it } from "vitest";
import type { DTO } from "../api/client";
import { baselineEntryLabel } from "./BaselineHistory";
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

it("resolves baseline entries against their own source revision catalog", () => {
  expect(
    baselineEntryLabel(
      { source_id: "source-2", revision_id: "r2" },
      [
        source,
        {
          ...source,
          source: { ...source.source, id: "source-2", name: "Structure" },
          latest_revision_id: "r2",
          accepted_revision_id: "r2",
          has_pending_revision: false,
        },
      ],
      [
        {
          id: "r2",
          project_id: "project",
          source_id: "source-2",
          sequence: 2,
          external_label: null,
          original_filename: "structure.ifc",
          sha256: "hash".padEnd(64, "0"),
          media_type: "application/x-step",
          size_bytes: 1,
          storage_key: "key",
          import_status: "STORED",
          imported_at: "2026-01-01T00:00:00Z",
        },
      ],
    ),
  ).toBe("Structure：R2");
});
