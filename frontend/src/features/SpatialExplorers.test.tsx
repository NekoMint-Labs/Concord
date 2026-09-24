import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import fixture from "../../tests/fixtures/inspector.json";
import { api, type DTO, type Workspace } from "../api/client";
import { ChangeExplorer } from "./ChangeExplorer";
import { IssueExplorer } from "./IssueExplorer";

vi.mock("../viewers/BIMWorkspace", () => ({
  default: ({
    impacted,
    changes,
    onViewerSelected,
    toolbar,
    issues,
    onIssueResolution,
  }: {
    impacted: readonly string[];
    changes?: DTO<"BimElementChange">[];
    onViewerSelected?: (id: string) => void;
    toolbar?: React.ReactNode;
    issues?: DTO<"Constraint">[];
    onIssueResolution?: (id: string) => void;
  }) => (
    <div>
      <div data-testid="model-selection">{impacted.join(",")}</div>
      <button
        type="button"
        onClick={() => onViewerSelected?.(changes?.[0]?.global_id ?? "")}
      >
        Select change
      </button>
      {toolbar}
      <span>Issues {issues?.length ?? 0}</span>
      {issues?.[0] && (
        <button type="button" onClick={() => onIssueResolution?.(issues[0].id)}>
          Review resolution
        </button>
      )}
    </div>
  ),
}));
const wrap = (node: React.ReactNode) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {node}
    </QueryClientProvider>,
  );

it("selects a real comparison change and connects its linked work package to model context", async () => {
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  const source = {
    source: { id: "s1", name: "MEP", kind: "BIM" },
    latest_revision_id: "r2",
    accepted_revision_id: "r1",
    has_pending_revision: true,
  } as DTO<"ProjectSourceStatus">;
  const comparison: DTO<"RevisionComparison"> = {
    id: "c1",
    project_id: "harbor-east",
    source_id: "s1",
    from_revision_id: "r1",
    to_revision_id: "r2",
    engine: "IfcDiff",
    engine_version: "1",
    status: "COMPLETED",
    raw_result_key: "result",
    created_at: "2026-01-01",
    evidence_ids: ["ev"],
    summary: {
      added: 0,
      deleted: 0,
      changed: 1,
      warnings: [],
      from_elements: 1,
      to_elements: 1,
      common_global_ids: 1,
      global_id_continuity: 1,
      compare_seconds: 0,
    },
  };
  const change = {
    comparison_id: "c1",
    global_id: "gid-1",
    change_kind: "changed",
    changed_aspects: ["geometry"],
  } as DTO<"BimElementChange">;
  vi.spyOn(api, "sourceStatuses").mockResolvedValue([source]);
  vi.spyOn(api, "sourceRevisions").mockResolvedValue([
    { id: "r1", sequence: 1 },
    { id: "r2", sequence: 2 },
  ] as DTO<"ProjectSourceRevision">[]);
  vi.spyOn(api, "comparisons").mockResolvedValue([comparison]);
  vi.spyOn(api, "comparison").mockResolvedValue({
    comparison,
    changes: [change],
    affected_work_packages: [{ work_package_id: "WP-200", changes: [change] }],
  });
  vi.spyOn(api, "bimSnapshot").mockResolvedValue({
    elements: [{ global_id: "gid-1", name: "AHU-01" }],
  } as DTO<"BimRevisionSnapshot">);
  const onInspect = vi.fn();
  wrap(
    <ChangeExplorer
      project="harbor-east"
      workspace={workspace}
      onModels={() => {}}
      onInspect={onInspect}
      onInvestigate={() => {}}
    />,
  );
  await screen.findByText("gid-1");
  expect(screen.getByTestId("model-selection")).toHaveTextContent("gid-1");
  fireEvent.click(screen.getByRole("button", { name: "Select change" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Work Package →" }),
  );
  expect(onInspect).toHaveBeenCalledWith("WP-200", "s1", comparison, change);
});

it("lists only blocking constraints, preserving the inspection path", () => {
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  vi.spyOn(api, "sourceStatuses").mockResolvedValue([]);
  const onResolve = vi.fn();
  const onSelectWorkPackage = vi.fn();
  wrap(
    <IssueExplorer
      project="harbor-east"
      workspace={workspace}
      onResolve={onResolve}
      onSelectWorkPackage={onSelectWorkPackage}
      perform={async () => {}}
    />,
  );
  expect(screen.getByRole("region", { name: "空间问题" })).toBeInTheDocument();
  expect(screen.getByText(/Issues \d+/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Review resolution" }));
  const issue = workspace.analysis!.constraints.find((item) => item.blocking)!;
  expect(onSelectWorkPackage).toHaveBeenCalledWith(issue.work_package_id);
  expect(onResolve).toHaveBeenCalledWith(issue.id);
});
