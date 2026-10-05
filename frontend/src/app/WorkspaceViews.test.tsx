import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EmptyWorkPackages } from "./WorkspaceViews";
import { App } from "../App";
import fixture from "../../tests/fixtures/inspector.json";
import { api, type InvestigationReport, type Workspace } from "../api/client";

// Only the transport is isolated; App, Work and destination composition are real.
vi.mock("../api/stream", () => ({ useRunStream: () => ({ events: [] }) }));

const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
  localStorage.clear();
});

it("offers the existing work-package creation flow from a fresh workspace", () => {
  const onCreate = vi.fn();
  render(<EmptyWorkPackages onCreate={onCreate} />);

  expect(screen.getByText("还没有工作包")).toBeVisible();
  expect(screen.getByText(/关联模型、跟踪变更并运行协调检查/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "新建工作包" }));
  expect(onCreate).toHaveBeenCalledOnce();
});

it("keeps the requested Action inspector open after reviewing a report's proposal from the real Work/App entry", async () => {
  const data = structuredClone(fixture.waiting) as unknown as Workspace;
  const project = data.state.project.id;
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
      // Source-only reports must find their own proposal, not the selected WP.
      work_package_ids: [],
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
  const unrelatedTitle = "Unrelated previous report proposal";
  data.proposals.unshift({
    ...proposal,
    id: "previous-proposal",
    run_id: "previous-investigation",
    title: unrelatedTitle,
  });
  data.analysis!.id = report.analysis_id;
  const run = {
    ...data.analysis_run!,
    id: report.run_id,
    project_id: project,
    category: "investigation" as const,
    generation: report.generation,
    analysis_id: report.analysis_id,
  };
  data.analysis_run = run;
  vi.spyOn(api, "projects").mockResolvedValue([data.state.project]);
  vi.spyOn(api, "workspace").mockResolvedValue(data);
  vi.spyOn(api, "profile").mockResolvedValue(
    {} as Awaited<ReturnType<typeof api.profile>>,
  );
  vi.spyOn(api, "sourceStatuses").mockResolvedValue([]);
  vi.spyOn(api, "documents").mockResolvedValue([]);
  vi.spyOn(api, "baselines").mockResolvedValue([]);
  vi.spyOn(api, "sourceRevisions").mockResolvedValue([]);
  vi.spyOn(api, "capabilities").mockResolvedValue({ capabilities: [] });
  vi.spyOn(api, "engineeringFindings").mockResolvedValue([]);
  vi.spyOn(api, "runs").mockResolvedValue([run]);
  vi.spyOn(api, "run").mockResolvedValue(run);
  vi.spyOn(api, "investigation").mockResolvedValue(report);
  const approve = vi.spyOn(api, "approve");
  const reject = vi.spyOn(api, "reject");
  const execute = vi.spyOn(api, "execute");
  localStorage.setItem("concord:last-project", project);
  localStorage.setItem(`concord:package:${project}`, "WP-100");
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
  const work = await screen.findByRole("complementary", { name: "工作与审核" });
  expect(work).toBeVisible();
  await waitFor(() => {
    expect(api.investigation).toHaveBeenCalledWith(project, report.run_id);
    expect(
      client.getQueryData([
        "investigation-report",
        project,
        run.id,
        run.generation,
        run.analysis_id,
      ]),
    ).toEqual(report);
  });
  fireEvent.click(within(work).getByRole("button", { name: "打开报告 →" }));
  const investigation = await screen.findByRole("complementary", {
    name: "工程调查详情",
  });
  expect(investigation).toHaveTextContent(report.answer.summary);
  expect(investigation).not.toHaveTextContent(unrelatedTitle);
  // Follow the real inspector action, not a test-only navigation Host.
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
  expect(action).not.toHaveTextContent(unrelatedTitle);
  expect(screen.getByRole("combobox", { name: "工作包" })).toHaveValue(
    "WP-200",
  );
  expect(
    within(action).getByRole("button", { name: "批准 R4" }),
  ).toHaveAttribute("aria-disabled", "true");
  expect(
    within(action).getByRole("button", { name: "执行并重新检查" }),
  ).toHaveAttribute("aria-disabled", "true");
  expect(approve).not.toHaveBeenCalled();
  expect(reject).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});
