import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../../tests/fixtures/inspector.json";
import { api, type Workspace } from "../api/client";
import { WorkList } from "./WorkList";

afterEach(() => vi.restoreAllMocks());

/** The inbox's context region reads the same project queries the header does. */
function cache() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

it("routes authoritative approval and stale states to one next action", () => {
  vi.spyOn(api, "baselines").mockResolvedValue([]);
  vi.spyOn(api, "documents").mockResolvedValue([]);
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  const onPackage = vi.fn();
  const onRecheck = vi.fn();
  const props = {
    workspace,
    sources: [],
    onPackage,
    onRecheck,
    onModels: vi.fn(),
    onReport: vi.fn(),
    onProject: vi.fn(),
    onTab: vi.fn(),
  };
  const view = render(
    <QueryClientProvider client={cache()}>
      <WorkList {...props} />
    </QueryClientProvider>,
  );
  const needs = screen.getByRole("region", { name: "需要处理" });
  expect(within(needs).getByText(/需要决定/)).toBeVisible();
  expect(
    screen.queryByRole("complementary", { name: "所选工作事项" }),
  ).not.toBeInTheDocument();
  fireEvent.click(within(needs).getByRole("button", { name: /需要决定/ }));
  fireEvent.click(
    within(
      screen.getByRole("complementary", { name: "所选工作事项" }),
    ).getByRole("button", { name: "处理" }),
  );
  expect(onPackage).toHaveBeenCalledWith("WP-200");

  workspace.proposals = [];
  workspace.stale = true;
  workspace.analysis_run = { ...workspace.analysis_run!, status: "FAILED" };
  view.rerender(
    <QueryClientProvider client={cache()}>
      <WorkList {...props} />
    </QueryClientProvider>,
  );
  fireEvent.click(
    within(
      screen.getByRole("complementary", { name: "所选工作事项" }),
    ).getByRole("button", { name: "重新检查" }),
  );
  expect(onRecheck).toHaveBeenCalledOnce();
});

it("shows a pending model as work without claiming a newer baseline", () => {
  vi.spyOn(api, "baselines").mockResolvedValue([]);
  vi.spyOn(api, "documents").mockResolvedValue([]);
  vi.spyOn(api, "sourceRevisions").mockResolvedValue([]);
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  workspace.proposals = [];
  workspace.stale = false;
  workspace.analysis!.readiness = workspace.analysis!.readiness.map((row) => ({
    ...row,
    status: "READY",
  }));
  const onModels = vi.fn();
  render(
    <QueryClientProvider client={cache()}>
      <WorkList
        workspace={workspace}
        sources={[
          {
            source: {
              id: "model",
              project_id: "harbor-east",
              name: "MEP",
              kind: "BIM",
              created_at: "2026-01-01T00:00:00Z",
            },
            latest_revision_id: "r2",
            accepted_revision_id: "r1",
            baseline_id: "b1",
            has_pending_revision: true,
          },
        ]}
        onPackage={vi.fn()}
        onModels={onModels}
        onRecheck={vi.fn()}
        onReport={vi.fn()}
        onProject={vi.fn()}
        onTab={vi.fn()}
      />
    </QueryClientProvider>,
  );
  const needs = screen.getByRole("region", { name: "需要处理" });
  expect(within(needs).getByText("MEP 有新版本")).toBeVisible();
  fireEvent.click(within(needs).getByRole("button", { name: /MEP 有新版本/ }));
  fireEvent.click(
    within(
      screen.getByRole("complementary", { name: "所选工作事项" }),
    ).getByRole("button", { name: "处理新版本" }),
  );
  expect(onModels).toHaveBeenCalledOnce();
  const completed = screen.getByRole("region", { name: "最近完成" });
  expect(completed.querySelector(".work-row-reason")).toBeNull();
  expect(within(completed).getByText("东翼风管安装")).toBeVisible();
  const packageRow = within(completed).getByRole("button", {
    name: /东翼风管安装/,
  });
  expect(packageRow.querySelector("small")).not.toHaveTextContent(
    "东翼风管安装",
  );
  fireEvent.click(packageRow);
  const packagePeek = screen.getByRole("complementary", {
    name: "所选工作事项",
  });
  expect(
    within(packagePeek).getByRole("region", { name: "为什么需要处理" }),
  ).toHaveTextContent("基于当前基线");
});

it("selects a work item in place before taking its real action", async () => {
  vi.spyOn(api, "baselines").mockResolvedValue([]);
  vi.spyOn(api, "documents").mockResolvedValue([]);
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  const onPackage = vi.fn();
  render(
    <QueryClientProvider client={cache()}>
      <WorkList
        workspace={workspace}
        sources={[]}
        onPackage={onPackage}
        onRecheck={vi.fn()}
        onModels={vi.fn()}
        onReport={vi.fn()}
        onProject={vi.fn()}
        onTab={vi.fn()}
      />
    </QueryClientProvider>,
  );
  const row = screen.getByRole("button", { name: /需要决定/ });
  fireEvent.click(row);
  expect(row).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.getByRole("complementary", { name: "所选工作事项" }),
  ).toHaveTextContent("WP-200");
  expect(onPackage).not.toHaveBeenCalled();
  const peek = screen.getByRole("complementary", { name: "所选工作事项" });
  expect(
    within(peek).getByRole("region", { name: "当前判断" }),
  ).toHaveTextContent("已阻塞");
  expect(within(peek).getAllByRole("button")).toHaveLength(2);
  expect(within(peek).queryByRole("region", { name: "项目状态" })).toBeNull();
  expect(within(peek).queryByRole("region", { name: "模型上下文" })).toBeNull();
  expect(
    within(peek).getByRole("region", { name: "下一步" }),
  ).toHaveTextContent("处理");
  fireEvent.click(within(peek).getByRole("button", { name: "关闭详情" }));
  expect(
    screen.queryByRole("complementary", { name: "所选工作事项" }),
  ).not.toBeInTheDocument();
  expect(row).toHaveAttribute("aria-pressed", "true");
  await waitFor(() => expect(row).toHaveFocus());
  fireEvent.click(row);
  fireEvent.keyDown(row, { key: "ArrowDown" });
  const next = screen.getByRole("button", { name: /结构交接.*可施工/ });
  expect(next).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.getByRole("complementary", { name: "所选工作事项" }),
  ).toHaveTextContent("WP-100");
  fireEvent.keyDown(next, { key: "Escape" });
  expect(
    screen.queryByRole("complementary", { name: "所选工作事项" }),
  ).not.toBeInTheDocument();
  fireEvent.click(row);
  fireEvent.click(
    within(
      screen.getByRole("complementary", { name: "所选工作事项" }),
    ).getByRole("button", { name: "处理" }),
  );
  expect(onPackage).toHaveBeenCalledWith("WP-200");
  const search = screen.getByRole("searchbox", { name: "搜索工作事项" });
  search.focus();
  fireEvent.change(search, { target: { value: "结构交接" } });
  expect(
    screen.queryByRole("complementary", { name: "所选工作事项" }),
  ).not.toBeInTheDocument();
  await waitFor(() => expect(search).toHaveFocus());
  fireEvent.change(search, { target: { value: "" } });
  expect(
    screen.queryByRole("complementary", { name: "所选工作事项" }),
  ).not.toBeInTheDocument();
});

it("closes a disappearing selection without reopening it after a refresh", () => {
  vi.spyOn(api, "baselines").mockResolvedValue([]);
  vi.spyOn(api, "documents").mockResolvedValue([]);
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  const client = cache();
  const content = () => (
    <QueryClientProvider client={client}>
      <WorkList
        workspace={workspace}
        sources={[]}
        onPackage={vi.fn()}
        onModels={vi.fn()}
        onRecheck={vi.fn()}
        onReport={vi.fn()}
        onProject={vi.fn()}
        onTab={vi.fn()}
      />
    </QueryClientProvider>
  );
  const view = render(content());
  const row = screen.getByRole("button", { name: /结构交接.*可施工/ });
  row.focus();
  fireEvent.click(row);
  expect(
    screen.getByRole("complementary", { name: "所选工作事项" }),
  ).toHaveTextContent("WP-100");
  workspace.stale = true;
  view.rerender(content());
  expect(
    screen.queryByRole("complementary", { name: "所选工作事项" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "搜索工作事项" })).toHaveFocus();
  workspace.stale = false;
  view.rerender(content());
  expect(
    screen.getByRole("button", { name: /结构交接.*可施工/ }),
  ).toHaveAttribute("aria-pressed", "false");
  expect(
    screen.queryByRole("complementary", { name: "所选工作事项" }),
  ).not.toBeInTheDocument();
});

it("navigates displayed decisions while closed and dismisses without stealing outside focus", () => {
  vi.spyOn(api, "baselines").mockResolvedValue([]);
  vi.spyOn(api, "documents").mockResolvedValue([]);
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  render(
    <QueryClientProvider client={cache()}>
      <button type="button">Outside action</button>
      <WorkList
        workspace={workspace}
        sources={[]}
        onPackage={vi.fn()}
        onModels={vi.fn()}
        onRecheck={vi.fn()}
        onReport={vi.fn()}
        onProject={vi.fn()}
        onTab={vi.fn()}
      />
    </QueryClientProvider>,
  );
  const needs = within(
    screen.getByRole("region", { name: "需要处理" }),
  ).getByRole("button");
  const done = within(
    screen.getByRole("region", { name: "最近完成" }),
  ).getAllByRole("button");
  needs.focus();
  fireEvent.keyDown(needs, { key: "End" });
  expect(done.at(-1)).toHaveFocus();
  expect(
    screen.queryByRole("complementary", { name: "所选工作事项" }),
  ).toBeNull();
  fireEvent.keyDown(done.at(-1)!, { key: "Home" });
  expect(needs).toHaveFocus();
  fireEvent.click(needs);
  const target = done[0];
  fireEvent.keyDown(needs, { key: "ArrowDown" });
  expect(target).toHaveFocus();
  expect(target).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.getByRole("complementary", { name: "所选工作事项" }),
  ).toHaveTextContent("WP-100");
  const outside = screen.getByRole("button", { name: "Outside action" });
  outside.focus();
  fireEvent.pointerDown(outside);
  expect(outside).toHaveFocus();
  expect(
    screen.queryByRole("complementary", { name: "所选工作事项" }),
  ).toBeNull();
  expect(target).toHaveAttribute("aria-pressed", "true");
});

it("keeps a pending source Peek on its real comparison and at most one secondary destination", async () => {
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  const source = {
    source: {
      id: "model",
      project_id: "harbor-east",
      name: "MEP",
      kind: "BIM" as const,
      created_at: "2026-01-01",
    },
    latest_revision_id: "r2",
    accepted_revision_id: "r1",
    baseline_id: "b1",
    has_pending_revision: true,
  };
  vi.spyOn(api, "sourceRevisions").mockResolvedValue([]);
  const comparison = {
    id: "comparison",
    project_id: "harbor-east",
    source_id: "model",
    from_revision_id: "r1",
    to_revision_id: "r2",
    summary: { warnings: ["continuity warning"] },
  } as Awaited<ReturnType<typeof api.comparisons>>[number];
  vi.spyOn(api, "comparisons").mockResolvedValue([comparison]);
  vi.spyOn(api, "comparison").mockResolvedValue({
    comparison,
    changes: [
      {
        comparison_id: comparison.id,
        global_id: "wall-1",
        change_kind: "changed",
        changed_aspects: ["placement"],
      },
    ],
    affected_work_packages: [],
  } as Awaited<ReturnType<typeof api.comparison>>);
  const onSource = vi.fn();
  render(
    <QueryClientProvider client={cache()}>
      <WorkList
        workspace={workspace}
        sources={[source]}
        onPackage={vi.fn()}
        onModels={vi.fn()}
        onRecheck={vi.fn()}
        onReport={vi.fn()}
        onProject={vi.fn()}
        onTab={vi.fn()}
        onSource={onSource}
      />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(api.comparison).toHaveBeenCalledWith(
      "harbor-east",
      "model",
      "comparison",
    ),
  );
  const sourceRow = within(
    screen.getByRole("region", { name: "需要处理" }),
  ).getByRole("button", { name: /MEP 有新版本/ });
  expect(sourceRow.querySelector("small")).not.toHaveTextContent("MEP");
  fireEvent.click(sourceRow);
  const peek = screen.getByRole("complementary", { name: "所选工作事项" });
  expect(
    await within(peek).findByText("1 个构件变化 · 0 个受影响工作包"),
  ).toBeVisible();
  expect(within(peek).getByRole("status")).toHaveTextContent("结果可能不完整");
  expect(within(peek).getAllByRole("button")).toHaveLength(3);
  fireEvent.click(
    within(peek).getByRole("button", { name: "在项目中查看版本 →" }),
  );
  expect(onSource).toHaveBeenCalledWith("model");
});
