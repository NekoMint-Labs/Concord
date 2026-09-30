import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../../tests/fixtures/inspector.json";
import { api, type ProjectSourceStatus, type Workspace } from "../api/client";
import { demoAreaName, demoDiscipline } from "../ui/demo/demoPresentation";
import { statusLabel } from "../ui/labels";
import { ProjectHome } from "./ProjectHome";

afterEach(() => vi.restoreAllMocks());

function home(workspace: Workspace) {
  vi.spyOn(api, "baselines").mockResolvedValue([]);
  vi.spyOn(api, "documents").mockResolvedValue([]);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const onPackage = vi.fn();
  const onTab = vi.fn();
  const content = () => (
    <QueryClientProvider client={client}>
      <ProjectHome
        workspace={workspace}
        sources={[]}
        selected="WP-200"
        onPackage={onPackage}
        onTab={onTab}
      />
    </QueryClientProvider>
  );
  const view = render(content());
  return { onPackage, onTab, refresh: () => view.rerender(content()) };
}

it("keeps every package's facts in a lane and opens the real package with one click", () => {
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  const { onPackage, onTab } = home(workspace);
  const ledger = screen.getByRole("region", { name: "工作包状态" });
  expect(within(ledger).getAllByRole("listitem")).toHaveLength(
    workspace.state.work_packages.length,
  );
  expect(within(ledger).queryByRole("table")).toBeNull();

  for (const wp of workspace.state.work_packages) {
    const lane = within(ledger).getByRole("button", {
      name: new RegExp(wp.id),
    });
    const area = workspace.state.areas.find((item) => item.id === wp.area_id);
    expect(lane).toHaveTextContent(
      `${demoAreaName(wp.area_id, area?.name ?? wp.area_id)} · ${demoDiscipline(wp.discipline)}`,
    );
    expect(lane).toHaveTextContent(`${wp.element_ids.length} 个构件`);
    expect(lane).toHaveAttribute("aria-pressed", String(wp.id === "WP-200"));
    const status =
      workspace.analysis?.readiness.find(
        (item) => item.work_package_id === wp.id,
      )?.status ?? "UNCHECKED";
    expect(lane).toHaveTextContent(statusLabel(status));
    lane.focus();
    expect(lane).toHaveFocus();
    fireEvent.click(lane);
    expect(onPackage).toHaveBeenLastCalledWith(wp.id);
  }
  expect(onPackage).toHaveBeenCalledTimes(workspace.state.work_packages.length);
  fireEvent.click(within(ledger).getByRole("button", { name: "查看全部 →" }));
  expect(onTab).toHaveBeenLastCalledWith("work-packages");
  fireEvent.click(screen.getByRole("button", { name: "项目设置" }));
  expect(onTab).toHaveBeenLastCalledWith("settings");
  expect(
    screen.getByRole("complementary", { name: "项目上下文" }),
  ).toBeVisible();
});

it("does not present stale, unchecked, or empty packages as ready", () => {
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  workspace.stale = true;
  const { refresh } = home(workspace);
  const state = screen.getByRole("region", { name: "当前状态" });
  expect(state).toHaveTextContent("当前判断待复核");
  expect(state).toHaveTextContent("检查当前施工条件");

  workspace.stale = false;
  workspace.analysis = null;
  refresh();
  expect(state).toHaveTextContent("尚未检查施工条件");
  expect(state).not.toHaveTextContent("可施工");
  const ledger = screen.getByRole("region", { name: "工作包状态" });
  expect(within(ledger).getAllByText("未检查")).toHaveLength(
    workspace.state.work_packages.length,
  );

  workspace.state.work_packages = [];
  refresh();
  expect(state).toHaveTextContent("还没有工作包");
  expect(state).not.toHaveTextContent("可施工");
  expect(within(ledger).getByText("还没有工作包。")).toBeVisible();
});

it("keeps full long package names and distinct model-versus-source context actions", () => {
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  const wp = workspace.state.work_packages[0];
  wp.id = "custom-package";
  wp.name =
    "Level 02 east-wing coordinated mechanical installation with a deliberately long real object name";
  const source: ProjectSourceStatus = {
    source: {
      id: "model",
      project_id: workspace.state.project.id,
      name: "MEP",
      kind: "BIM",
      created_at: "2026-01-01T00:00:00Z",
    },
    latest_revision_id: "r2",
    accepted_revision_id: "r1",
    baseline_id: "b1",
    has_pending_revision: true,
  };
  const project = workspace.state.project.id;
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, gcTime: 0 } },
  });
  client.setQueryData(["baselines", project], []);
  client.setQueryData(["documents", project], []);
  client.setQueryData(
    ["source-revisions", project, "model"],
    [
      { id: "r1", sequence: 1, imported_at: "2026-01-01T00:00:00Z" },
      { id: "r2", sequence: 2, imported_at: "2026-01-02T00:00:00Z" },
    ],
  );
  const onTab = vi.fn();
  const onPackage = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ProjectHome
        workspace={workspace}
        sources={[source]}
        selected={wp.id}
        onTab={onTab}
        onPackage={onPackage}
      />
    </QueryClientProvider>,
  );
  const lane = within(
    screen.getByRole("region", { name: "工作包状态" }),
  ).getByRole("button", { name: new RegExp(wp.id) });
  expect(within(lane).getByTitle(wp.name)).toHaveTextContent(wp.name);
  expect(lane).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(lane);
  expect(onPackage).toHaveBeenCalledWith(wp.id);
  const models = within(screen.getByRole("region", { name: "模型与版本" }));
  expect(models.getByText("R2")).toBeVisible();
  expect(models.getByText("R1")).toBeVisible();
  expect(models.getByText("新版本待审核")).toBeVisible();
  fireEvent.click(models.getByRole("button", { name: "MEP" }));
  expect(onTab).toHaveBeenLastCalledWith("bim");
  fireEvent.click(models.getByRole("button", { name: "管理 →" }));
  expect(onTab).toHaveBeenLastCalledWith("sources");
});
