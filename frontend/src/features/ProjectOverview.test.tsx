import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../../tests/fixtures/inspector.json";
import { api, type ProjectSourceStatus, type Workspace } from "../api/client";
import { ProjectHome } from "../app/ProjectHome";
import type { ProjectContext } from "../app/useProjectContext";
import { ProjectContextPane } from "./ProjectContextPane";

// These tests own disclosure placement and destinations; Radix popup mechanics are primitive/browser-covered.
vi.mock("../components/ui/AppMenu", () => ({
  AppMenu: function Menu({
    label,
    children,
  }: {
    label: string;
    children: ReactNode;
  }) {
    const [open, setOpen] = useState(false);
    return (
      <div>
        <button aria-expanded={open} onClick={() => setOpen(!open)}>
          {label}
        </button>
        {open && <div role="menu">{children}</div>}
      </div>
    );
  },
  AppMenuItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode;
    onSelect: () => void;
  }) => (
    <button role="menuitem" onClick={onSelect}>
      {children}
    </button>
  ),
}));

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

afterEach(() => vi.restoreAllMocks());

function mount(workspace: Workspace, sources: ProjectSourceStatus[] = []) {
  vi.spyOn(api, "capabilities").mockResolvedValue({ capabilities: [] });
  vi.spyOn(api, "baselines").mockResolvedValue([]);
  vi.spyOn(api, "documents").mockResolvedValue([]);
  vi.spyOn(api, "sourceStatuses").mockResolvedValue(sources);
  vi.spyOn(api, "sourceRevisions").mockResolvedValue([]);
  vi.spyOn(api, "bimBindings").mockResolvedValue([]);
  vi.spyOn(api, "comparisons").mockResolvedValue([]);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const onTab = vi.fn();
  const onPackage = vi.fn();
  const onStructure = vi.fn();
  const view = render(
    <QueryClientProvider client={cache}>
      <ProjectHome
        workspace={workspace}
        sources={sources}
        onTab={onTab}
        onPackage={onPackage}
        onStructure={onStructure}
      />
    </QueryClientProvider>,
  );
  return { ...view, onTab, onPackage, onStructure };
}

it("keeps the current-state, baseline, sources and package sequence without duplicate inventories", async () => {
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  const { container, onTab, onPackage } = mount(workspace, [model]);
  const state = screen.getByRole("region", { name: "当前状态" });
  expect(within(state).getAllByRole("button")).toHaveLength(1);
  expect(state).toHaveTextContent("有新版本待检查");
  expect(state).toHaveTextContent(
    "施工判断仍依据当前基线，不代表新版本已经可施工",
  );
  fireEvent.click(
    within(state).getByRole("button", { name: "核对待审核模型 →" }),
  );
  expect(onTab).toHaveBeenLastCalledWith("sources");
  const baseline = await screen.findByRole("region", { name: "当前基线" });
  const sourcesHeading = screen.getByRole("heading", { name: "资料" });
  const ledger = screen.getByRole("region", { name: "工作包状态" });
  expect(
    state.compareDocumentPosition(baseline) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    baseline.compareDocumentPosition(sourcesHeading) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    sourcesHeading.compareDocumentPosition(ledger) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    container.querySelector(".project-state-footer"),
  ).not.toHaveTextContent("项目文件");
  expect(screen.queryByRole("region", { name: "模型与版本" })).toBeNull();
  expect(screen.queryByRole("region", { name: "版本记录" })).toBeNull();
  expect(screen.queryByRole("region", { name: "最近活动" })).toBeNull();
  expect(screen.queryByRole("menuitem", { name: "项目设置" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "项目操作" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "项目设置" }));
  expect(onTab).toHaveBeenLastCalledWith("settings");
  expect(within(ledger).getAllByRole("listitem")).toHaveLength(
    workspace.state.work_packages.length,
  );
  const wp = workspace.state.work_packages[0];
  fireEvent.click(
    within(ledger).getByRole("button", { name: new RegExp(wp.id) }),
  );
  expect(onPackage).toHaveBeenCalledExactlyOnceWith(wp.id);
  const records = screen.getByRole("navigation", { name: "项目内容" });
  fireEvent.click(within(records).getByRole("button", { name: /文档/ }));
  expect(onTab).toHaveBeenLastCalledWith("documents");
  fireEvent.click(within(records).getByRole("button", { name: /历史/ }));
  expect(onTab).toHaveBeenLastCalledWith("history");
  fireEvent.click(await screen.findByRole("button", { name: /MEP.*最新/ }));
  expect(
    await screen.findByRole("complementary", { name: "资料上下文" }),
  ).toBeVisible();
});

it("does not render an empty sidebar inventory or a ready conclusion for an empty project", () => {
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  workspace.state.work_packages = [];
  workspace.events = [];
  workspace.analysis = null;
  const { onStructure, container } = mount(workspace);
  expect(
    screen.queryByRole("complementary", { name: "项目上下文" }),
  ).toBeNull();
  expect(screen.queryByRole("region", { name: "项目文件" })).toBeNull();
  expect(screen.queryByRole("region", { name: "工作包状态" })).toBeNull();
  expect(screen.queryByRole("region", { name: "当前基线" })).toBeNull();
  expect(screen.getByRole("navigation", { name: "项目内容" })).toBeVisible();
  expect(screen.queryByRole("region", { name: "基线记录" })).toBeNull();
  const state = screen.getByRole("region", { name: "当前状态" });
  expect(state).toHaveTextContent("还没有工作包");
  expect(within(state).getByRole("heading")).not.toHaveTextContent("可施工");
  expect(state).toHaveTextContent("当前缺少工程检查范围，尚不能判断施工条件");
  expect(within(state).getAllByRole("button")).toHaveLength(1);
  fireEvent.click(within(state).getByRole("button", { name: "添加工作包 →" }));
  expect(onStructure).toHaveBeenCalledOnce();
  expect(container.querySelector(".project-workspace > aside")).toBeNull();
});

it("keeps document previews behind disclosure without changing exact-document navigation or fallback", async () => {
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  workspace.events = [];
  const context: ProjectContext = {
    baseline: undefined,
    baselines: [],
    models: [],
    pendingModels: [],
    documents: [
      {
        id: "drawing",
        project_id: workspace.state.project.id,
        filename: "Drawing.pdf",
        content_hash: "hash",
        parser: "Docling",
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    revisionsFor: () => [],
    revisionNo: () => "—",
    recordsError: null,
    recordsPending: false,
    retryRecords: vi.fn(),
  };
  const onTab = vi.fn();
  const onDocument = vi.fn();
  const view = render(
    <ProjectContextPane
      workspace={workspace}
      context={context}
      onTab={onTab}
      onPackage={vi.fn()}
      onDocument={onDocument}
    />,
  );
  expect(screen.queryByText("Drawing.pdf")).toBeNull();
  expect(screen.queryByRole("region", { name: "基线记录" })).toBeNull();
  expect(screen.queryByRole("region", { name: "最近活动" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "项目记录详情" }));
  fireEvent.click(await screen.findByRole("button", { name: /Drawing.pdf/ }));
  expect(onDocument).toHaveBeenCalledExactlyOnceWith("drawing");
  expect(onTab).not.toHaveBeenCalled();
  view.rerender(
    <ProjectContextPane
      workspace={workspace}
      context={context}
      onTab={onTab}
      onPackage={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Drawing.pdf/ }));
  expect(onTab).toHaveBeenCalledExactlyOnceWith("documents");
  expect(onDocument).toHaveBeenCalledOnce();
});
