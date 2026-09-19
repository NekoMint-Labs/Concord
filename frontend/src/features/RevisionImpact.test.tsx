import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api, type DTO } from "../api/client";
import { RevisionImpact } from "./RevisionImpact";

const revisions = [
  { id: "r1", sequence: 1 },
  { id: "r2", sequence: 2 },
].map(
  (item) =>
    ({
      ...item,
      project_id: "project",
      source_id: "source",
      external_label: null,
      original_filename: `model-${item.sequence}.ifc`,
      sha256: `hash-${item.sequence}`,
      media_type: "application/x-step",
      size_bytes: 100,
      storage_key: `key-${item.sequence}`,
      import_status: "STORED",
      imported_at: "2026-01-01T00:00:00Z",
    }) satisfies DTO<"ProjectSourceRevision">,
);
const comparison = {
  id: "comparison",
  project_id: "project",
  source_id: "source",
  from_revision_id: "r1",
  to_revision_id: "r2",
  engine: "IfcDiff",
  engine_version: "0.8.5",
  status: "COMPLETED",
  summary: {
    added: 2,
    deleted: 1,
    changed: 3,
    from_elements: 10,
    to_elements: 11,
    common_global_ids: 2,
    global_id_continuity: 0.2,
    warnings: ["Low GlobalId continuity"],
    compare_seconds: 0.3,
  },
  raw_result_key: "raw",
  evidence_ids: ["evidence-1"],
  created_at: "2026-01-01T00:00:00Z",
} satisfies DTO<"RevisionComparison">;

function renderImpact(comparisons: DTO<"RevisionComparison">[]) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RevisionImpact
        project="project"
        source="source"
        revisions={revisions}
        comparisons={comparisons}
        comparing={false}
        onCompare={() => {}}
        onInspect={() => {}}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

it("states no-comparison explicitly instead of rendering an empty pane", () => {
  renderImpact([]);
  expect(screen.getByText("尚无版本比较")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "比较最近两个版本" }),
  ).toBeVisible();
});

it("surfaces summary, affected WP, Evidence and continuity warnings", async () => {
  vi.spyOn(api, "comparison").mockResolvedValue({
    comparison,
    changes: [],
    affected_work_packages: [
      {
        work_package_id: "WP-27",
        changes: [
          {
            comparison_id: "comparison",
            global_id: "gid-1",
            change_kind: "changed",
            changed_aspects: ["geometry"],
          },
        ],
      },
    ],
  });
  renderImpact([comparison]);
  expect(await screen.findByText("WP-27")).toBeVisible();
  expect(screen.getByText(/GlobalId 连续性提醒/)).toBeVisible();
  expect(screen.getByText("evidence-1")).toBeVisible();
  expect(screen.getByText("3")).toBeVisible();
});
