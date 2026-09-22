import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api, type DTO } from "../api/client";
import { RevisionImpact } from "./RevisionImpact";

const revisions = [
  { id: "r1", sequence: 1 },
  { id: "r2", sequence: 2 },
  { id: "r3", sequence: 3 },
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

function comparison(
  id: string,
  from: string,
  to: string,
): DTO<"RevisionComparison"> {
  return {
    id,
    project_id: "project",
    source_id: "source",
    from_revision_id: from,
    to_revision_id: to,
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
  };
}

const r1ToR2 = comparison("comparison-12", "r1", "r2");

function renderImpact(
  comparisons: DTO<"RevisionComparison">[],
  callbacks: {
    onSelectComparison?: (item: DTO<"RevisionComparison">) => void;
    onInvestigate?: (item: DTO<"RevisionComparison">, ids: string[]) => void;
    onInspect?: (input: {
      workPackageId: string;
      fromRevisionId: string;
      toRevisionId: string;
      changes: DTO<"BimElementChange">[];
    }) => void;
  } = {},
) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RevisionImpact
        project="project"
        source="source"
        revisions={revisions}
        comparisons={comparisons}
        comparing={false}
        onCompare={() => {}}
        onSelectComparison={callbacks.onSelectComparison ?? (() => {})}
        onInvestigate={callbacks.onInvestigate ?? (() => {})}
        onInspect={callbacks.onInspect ?? (() => {})}
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
    comparison: r1ToR2,
    changes: [],
    affected_work_packages: [
      {
        work_package_id: "WP-27",
        changes: [
          {
            comparison_id: r1ToR2.id,
            global_id: "gid-1",
            change_kind: "changed",
            changed_aspects: ["geometry"],
          },
        ],
      },
    ],
  });
  renderImpact([r1ToR2]);
  expect(await screen.findByText("WP-27")).toBeVisible();
  expect(screen.getByText(/GlobalId 连续性提醒/)).toBeVisible();
  expect(screen.getByText("evidence-1")).toBeVisible();
  expect(screen.getByText("3")).toBeVisible();
  expect(screen.getByText("changed · gid-1")).toBeVisible();
});

it("keeps a selected historical comparison pair for BIM inspection and investigation", async () => {
  const r2ToR3 = comparison("comparison-23", "r2", "r3");
  const deleted: DTO<"BimElementChange"> = {
    comparison_id: r1ToR2.id,
    global_id: "gid-deleted",
    change_kind: "deleted",
    changed_aspects: [],
  };
  vi.spyOn(api, "comparison").mockImplementation(
    async (_project, _source, id) => ({
      comparison: id === r1ToR2.id ? r1ToR2 : r2ToR3,
      changes: id === r1ToR2.id ? [deleted] : [],
      affected_work_packages: [
        {
          work_package_id: id === r1ToR2.id ? "WP-12" : "WP-23",
          changes: id === r1ToR2.id ? [deleted] : [],
        },
      ],
    }),
  );
  const onSelectComparison = vi.fn();
  const onInvestigate = vi.fn();
  const onInspect = vi.fn();
  renderImpact([r1ToR2, r2ToR3], {
    onSelectComparison,
    onInvestigate,
    onInspect,
  });

  expect(await screen.findByText("WP-23")).toBeVisible();
  fireEvent.click(screen.getByLabelText("版本比较"));
  fireEvent.click(screen.getByRole("option", { name: /R1 → R2/ }));
  fireEvent.click(await screen.findByText("WP-12"));

  expect(onInspect).toHaveBeenCalledWith({
    workPackageId: "WP-12",
    fromRevisionId: "r1",
    toRevisionId: "r2",
    changes: [deleted],
  });
  expect(onSelectComparison).toHaveBeenCalledWith(r1ToR2);
  fireEvent.click(screen.getByRole("button", { name: "调查此比较" }));
  await waitFor(() =>
    expect(onInvestigate).toHaveBeenCalledWith(r1ToR2, ["gid-deleted"]),
  );
});
