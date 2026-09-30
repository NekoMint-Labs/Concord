import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EmptyWorkPackages, WorkspaceViews } from "./WorkspaceViews";
import fixture from "../../tests/fixtures/inspector.json";
import { api, type InvestigationReport, type Workspace } from "../api/client";
import type { WorkspaceInspectorView } from "../features/InvestigationInspector";

afterEach(() => vi.restoreAllMocks());

it("offers the existing work-package creation flow from a fresh workspace", () => {
  const onCreate = vi.fn();
  render(<EmptyWorkPackages onCreate={onCreate} />);

  expect(screen.getByText("还没有工作包")).toBeVisible();
  expect(screen.getByText(/关联模型、跟踪变更并运行协调检查/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "新建工作包" }));
  expect(onCreate).toHaveBeenCalledOnce();
});

it("keeps the requested Action inspector open after reviewing a report's proposal", async () => {
  vi.spyOn(api, "sourceStatuses").mockResolvedValue([]);
  vi.spyOn(api, "documents").mockResolvedValue([]);
  vi.spyOn(api, "baselines").mockResolvedValue([]);
  const data = structuredClone(fixture.waiting) as unknown as Workspace;
  const report: InvestigationReport = {
    run_id: "investigation",
    analysis_id: "analysis",
    generation: 1,
    persisted: true,
    answer: {
      summary: "Review the linked work-package proposal.",
      evidence_ids: [],
      limitations: [],
    },
    scope: {
      source_id: "model",
      from_revision_id: "r1",
      to_revision_id: "r2",
      work_package_ids: ["WP-200"],
      area_ids: [],
      element_ids: [],
    },
    tools: [],
    evidence: [],
  };
  const proposal = data.proposals.find(
    (item) => item.work_package_id === "WP-200",
  )!;
  proposal.run_id = report.run_id;
  proposal.generation = report.generation;
  data.analysis!.id = report.analysis_id;
  data.analysis_run!.id = report.run_id;
  data.analysis_run!.generation = report.generation;
  data.analysis_run!.analysis_id = report.analysis_id;
  // Source-only reports must find their own proposal, not rely on requested WP selectors.
  report.scope.work_package_ids = [];
  const noop = () => {};
  function Host() {
    const [selected, setSelected] = useState("WP-100");
    const [detailsOpen, setDetailsOpen] = useState(true);
    const [view, setView] = useState<WorkspaceInspectorView>("investigation");
    return (
      <WorkspaceViews
        project={data.state.project.id}
        data={data}
        selected={selected}
        selectedConstraint=""
        selectedElement=""
        selectedSpatialIssue=""
        onElementSelected={noop}
        onSpatialIssueSelected={noop}
        tab="work"
        busy={false}
        detailsOpen={detailsOpen}
        inspectorView={view}
        perform={async () => {}}
        onTab={noop}
        onSelected={(id) => {
          setSelected(id);
          setDetailsOpen(false);
        }}
        onConstraint={noop}
        onDetailsOpen={setDetailsOpen}
        onInspectorView={setView}
        onRecheck={noop}
        onStructure={noop}
        report={report}
        investigationContext={{
          projectName: "Project",
          workPackageId: "WP-200",
          elementIds: [],
        }}
        onSourceContext={noop}
        onBimContext={noop}
        onAgentRun={noop}
        onInvestigateSource={noop}
        onInvestigateBim={noop}
        onInspectImpact={noop}
      />
    );
  }
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: 0 } },
        })
      }
    >
      <Host />
    </QueryClientProvider>,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "审查处理方案 →" }),
  );
  const action = await screen.findByRole("complementary", {
    name: "判断依据与处理详情",
  });
  expect(action).toHaveTextContent("东翼风管安装");
  expect(
    within(action).getByRole("button", { name: "建议处理" }),
  ).toHaveAttribute("aria-current", "true");
});
