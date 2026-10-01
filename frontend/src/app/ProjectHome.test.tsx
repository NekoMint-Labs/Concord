import type { ComponentProps } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../../tests/fixtures/inspector.json";
import {
  api,
  type DTO,
  type ProjectSourceStatus,
  type Workspace,
} from "../api/client";
import { demoAreaName, demoDiscipline } from "../ui/demo/demoPresentation";
import { statusLabel } from "../ui/labels";
import { ProjectHome } from "./ProjectHome";

afterEach(() => vi.restoreAllMocks());

const model: ProjectSourceStatus = {
  source: {
    id: "model",
    project_id: fixture.waiting.state.project.id,
    name: "MEP",
    kind: "BIM",
    created_at: "2026-01-01T00:00:00Z",
  },
  latest_revision_id: "r2",
  accepted_revision_id: "r1",
  baseline_id: "b1",
  has_pending_revision: true,
};

function home(
  workspace: Workspace,
  props: Partial<ComponentProps<typeof ProjectHome>> = {},
  documents: DTO<"DocumentMetadata">[] = [],
) {
  vi.spyOn(api, "baselines").mockResolvedValue([]);
  vi.spyOn(api, "documents").mockResolvedValue(documents);
  vi.spyOn(api, "sourceStatuses").mockResolvedValue([]);
  vi.spyOn(api, "sourceRevisions").mockResolvedValue([]);
  vi.spyOn(api, "bimBindings").mockResolvedValue([]);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const onPackage = vi.fn();
  const onTab = vi.fn();
  const onStructure = vi.fn();
  const onDocument = vi.fn();
  const onSource = vi.fn();
  const onModel = vi.fn();
  const content = (
    overrides: Partial<ComponentProps<typeof ProjectHome>> = {},
  ) => (
    <QueryClientProvider client={client}>
      <ProjectHome
        workspace={workspace}
        sources={[]}
        selected="WP-200"
        onPackage={onPackage}
        onTab={onTab}
        onStructure={onStructure}
        onDocument={onDocument}
        onSource={onSource}
        onModel={onModel}
        {...props}
        {...overrides}
      />
    </QueryClientProvider>
  );
  const view = render(content());
  return {
    onPackage,
    onTab,
    onStructure,
    onDocument,
    onSource,
    onModel,
    refresh: (overrides: Partial<ComponentProps<typeof ProjectHome>> = {}) =>
      view.rerender(content(overrides)),
  };
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
  expect(
    screen.getByRole("complementary", { name: "项目上下文" }),
  ).toBeVisible();
});

it("does not present stale, unchecked, or empty packages as ready", () => {
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  workspace.stale = true;
  const { refresh, onStructure } = home(workspace, {
    sources: [{ ...model, has_pending_revision: false }],
  });
  const state = screen.getByRole("region", { name: "当前状态" });
  expect(state).toHaveTextContent("当前判断待复核");
  expect(state).toHaveTextContent("工程事实已更新，现有施工判断需要重新检查。");
  expect(
    within(state).getByRole("button", { name: "检查当前施工条件 →" }),
  ).toBeVisible();
  const ledger = screen.getByRole("region", { name: "工作包状态" });
  expect(within(ledger).getAllByText("需复核")).toHaveLength(
    workspace.state.work_packages.length,
  );
  expect(within(ledger).queryByText("可施工")).toBeNull();

  workspace.stale = false;
  workspace.analysis = null;
  refresh();
  expect(state).toHaveTextContent("尚未检查施工条件");
  expect(within(state).getByRole("heading")).not.toHaveTextContent("可施工");
  expect(within(ledger).queryByText("可施工")).toBeNull();
  expect(state).toHaveTextContent("尚未运行施工检查，当前没有可施工结论。");
  expect(within(ledger).getAllByText("未检查")).toHaveLength(
    workspace.state.work_packages.length,
  );

  workspace.state.work_packages = [];
  refresh();
  expect(state).toHaveTextContent("还没有工作包");
  expect(within(state).getByRole("heading")).not.toHaveTextContent("可施工");
  expect(screen.queryByRole("region", { name: "工作包状态" })).toBeNull();
  fireEvent.click(within(state).getByRole("button", { name: "添加工作包 →" }));
  expect(onStructure).toHaveBeenCalledOnce();
});

it("keeps full long package names without duplicate model or version panes", () => {
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  const wp = workspace.state.work_packages[0];
  wp.id = "custom-package";
  wp.name =
    "Level 02 east-wing coordinated mechanical installation with a deliberately long real object name";
  const source = model;
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
  const onModel = vi.fn();
  const onSource = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ProjectHome
        workspace={workspace}
        sources={[source]}
        selected={wp.id}
        onTab={onTab}
        onPackage={onPackage}
        onModel={onModel}
        onSource={onSource}
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
  expect(screen.queryByRole("region", { name: "模型与版本" })).toBeNull();
  expect(screen.queryByRole("region", { name: "版本记录" })).toBeNull();
  expect(onModel).not.toHaveBeenCalled();
  expect(onSource).not.toHaveBeenCalled();
  expect(onTab).not.toHaveBeenCalled();
});

it("prioritizes pending model review over stale or unchecked construction judgments", () => {
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  workspace.stale = true;
  workspace.analysis = null;
  const { onTab, onModel } = home(workspace, { sources: [model] });
  const state = within(screen.getByRole("region", { name: "当前状态" }));

  expect(state.getByRole("heading", { name: "有新版本待检查" })).toBeVisible();
  expect(
    state.getByText(
      "有 1 份模型的新版本尚未确认；施工判断仍依据当前基线，不代表新版本已经可施工。",
    ),
  ).toBeVisible();
  fireEvent.click(state.getByRole("button", { name: "核对待审核模型 →" }));
  expect(onTab).toHaveBeenCalledExactlyOnceWith("sources");
  expect(onModel).not.toHaveBeenCalled();
});

it("makes adding a project model the next step when there is no model, not checking a local preview", () => {
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  workspace.stale = true;
  workspace.analysis = null;
  const { onTab, onModel } = home(workspace);
  const state = within(screen.getByRole("region", { name: "当前状态" }));

  expect(
    state.getByText("尚未上传项目 IFC；本地预览不会成为项目工程依据。"),
  ).toBeVisible();
  expect(
    state.queryByRole("button", { name: "检查当前施工条件 →" }),
  ).toBeNull();
  fireEvent.click(state.getByRole("button", { name: "添加项目模型 →" }));
  expect(onTab).toHaveBeenLastCalledWith("sources");
  expect(screen.queryByRole("region", { name: "模型与版本" })).toBeNull();
  expect(onTab).toHaveBeenCalledOnce();
  expect(onModel).not.toHaveBeenCalled();
});

it("opens the specific project document rather than just the document destination", async () => {
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  const documents: DTO<"DocumentMetadata">[] = [
    {
      id: "drawing-1",
      project_id: workspace.state.project.id,
      filename: "East-wing drawing.pdf",
      content_hash: "drawing-hash",
      parser: "Docling",
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "method-2",
      project_id: workspace.state.project.id,
      filename: "Installation method.pdf",
      content_hash: "method-hash",
      parser: "Docling",
      created_at: "2026-01-02T00:00:00Z",
    },
  ];
  const { onDocument, onTab, refresh } = home(workspace, {}, documents);
  expect(screen.queryByRole("region", { name: "项目文件" })).toBeNull();
  fireEvent.click(await screen.findByRole("button", { name: "项目记录详情" }));
  const files = within(await screen.findByRole("region", { name: "项目文件" }));
  fireEvent.click(
    await files.findByRole("button", { name: /Installation method.pdf/ }),
  );
  expect(onDocument).toHaveBeenCalledExactlyOnceWith("method-2");
  expect(onTab).not.toHaveBeenCalled();
  refresh({ onDocument: undefined });
  fireEvent.click(files.getByRole("button", { name: /East-wing drawing.pdf/ }));
  expect(onTab).toHaveBeenCalledExactlyOnceWith("documents");
  expect(onDocument).toHaveBeenCalledOnce();
});
