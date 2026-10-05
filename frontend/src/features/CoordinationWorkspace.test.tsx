import type { ComponentProps } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../../tests/fixtures/inspector.json";
import { api, type ProjectSourceStatus, type Workspace } from "../api/client";
import { ContextInspector } from "../app/ContextInspector";
import { WorkPanel } from "./WorkPanel";

// CoordinationWorkspace was retired; Work owns decisions, the inspector owns context.
afterEach(() => vi.restoreAllMocks());

function completed() {
  const data = structuredClone(fixture.waiting) as unknown as Workspace;
  data.run = { ...data.run!, status: "COMPLETED" };
  data.analysis_run = { ...data.analysis_run!, status: "COMPLETED" };
  return data;
}

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

function mountWork(
  workspace: Workspace,
  overrides: Partial<ComponentProps<typeof WorkPanel>> = {},
) {
  vi.spyOn(api, "engineeringFindings").mockResolvedValue([]);
  vi.spyOn(api, "sourceRevisions").mockResolvedValue([]);
  vi.spyOn(api, "comparisons").mockResolvedValue([]);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const props = {
    workspace,
    sources: [],
    onPackage: vi.fn(),
    onModels: vi.fn(),
    onRecheck: vi.fn(),
    onReport: vi.fn(),
    onProject: vi.fn(),
    ...overrides,
  } satisfies ComponentProps<typeof WorkPanel>;
  const content = () => (
    <QueryClientProvider client={client}>
      <WorkPanel {...props} />
    </QueryClientProvider>
  );
  const view = render(content());
  return { props, refresh: () => view.rerender(content()) };
}

function ready(data: Workspace) {
  data.analysis!.readiness = data.analysis!.readiness.map((item) =>
    item.work_package_id === "WP-200" ? { ...item, status: "READY" } : item,
  );
}

it("shows current readiness and opens the exact work package only when its receipt action is activated", () => {
  const data = completed();
  ready(data);
  const { props } = mountWork(data);
  fireEvent.click(screen.getByRole("button", { name: /^东翼风管安装 可施工/ }));
  const receipt = within(screen.getByRole("region", { name: "所选工作事项" }));
  expect(receipt.getByRole("heading", { name: "东翼风管安装" })).toBeVisible();
  expect(receipt.getByText("当前检查没有未解决的阻塞条件。")).toBeVisible();
  expect(receipt.getAllByText("就绪")).toHaveLength(2);
  expect(receipt.getByText(/当前判断不替代工程验证/)).toBeVisible();
  expect(props.onPackage).not.toHaveBeenCalled();
  fireEvent.click(receipt.getByRole("button", { name: "查看详情" }));
  expect(props.onPackage).toHaveBeenCalledExactlyOnceWith("WP-200");
});

it("does not label an unchecked work package ready", () => {
  const data = completed();
  data.analysis = null;
  const { props } = mountWork(data);
  const row = screen.getByRole("button", { name: /^东翼风管安装 尚未检查/ });
  expect(row).toHaveTextContent("待检查");
  expect(row).not.toHaveTextContent("可施工");
  fireEvent.click(row);
  const receipt = screen.getByRole("region", { name: "所选工作事项" });
  expect(receipt).toHaveTextContent("未检查");
  expect(within(receipt).queryByText("就绪")).toBeNull();
  fireEvent.click(within(receipt).getByRole("button", { name: "查看工作包" }));
  expect(props.onPackage).toHaveBeenCalledExactlyOnceWith("WP-200");
});

it.each(["stale", "failed"] as const)(
  "requires an explicit recheck for a %s judgment instead of treating run completion as readiness",
  (state) => {
    const data = completed();
    if (state === "stale") {
      ready(data);
      data.stale = true;
    } else {
      data.run!.status = "FAILED";
      data.analysis_run!.status = "FAILED";
    }
    const { props } = mountWork(data);
    const row = screen.getByRole("button", {
      name: /^东翼风管安装 需要重新检查/,
    });
    expect(row).toHaveTextContent("需复核");
    expect(row).not.toHaveTextContent("可施工");
    fireEvent.click(row);
    const receipt = screen.getByRole("region", { name: "所选工作事项" });
    expect(receipt).toHaveTextContent(
      "当前施工判断不是最新结果，不能据此继续施工。",
    );
    expect(within(receipt).queryByText("就绪")).toBeNull();
    expect(props.onRecheck).not.toHaveBeenCalled();
    fireEvent.click(within(receipt).getByRole("button", { name: "重新检查" }));
    expect(props.onRecheck).toHaveBeenCalledOnce();
    expect(props.onPackage).not.toHaveBeenCalled();
  },
);

it("keeps pending source review separate from an authoritative blocker and a fresh ready result", () => {
  const data = completed();
  data.proposals = [];
  const { props, refresh } = mountWork(data, { sources: [model] });
  expect(
    screen.getByRole("button", { name: /^MEP 有新版本/ }),
  ).toHaveTextContent("待审核");
  const blocker = screen.getByRole("button", {
    name: /^东翼风管安装 暂不能施工/,
  });
  expect(blocker).toHaveTextContent("已阻塞");
  fireEvent.click(blocker);
  fireEvent.click(screen.getByRole("button", { name: "查看原因" }));
  expect(props.onPackage).toHaveBeenCalledExactlyOnceWith("WP-200");

  ready(data);
  data.analysis!.constraints = [];
  refresh();
  const row = screen.getByRole("button", { name: /^东翼风管安装 可施工/ });
  fireEvent.click(row);
  expect(
    screen.getByRole("region", { name: "所选工作事项" }),
  ).toHaveTextContent("基于当前基线的判断；新版本仍待审核。");
  expect(
    screen.getByRole("button", { name: /^MEP 有新版本/ }),
  ).toHaveTextContent("待审核");
});

it("opens the package approval context without approving a proposal from the work list", () => {
  const data = structuredClone(fixture.waiting) as unknown as Workspace;
  const before = structuredClone(data);
  const { props } = mountWork(data);
  const row = screen.getByRole("button", { name: /^东翼风管安装 需要决定/ });
  expect(row).toHaveTextContent("待批准");
  fireEvent.click(row);
  fireEvent.click(screen.getByRole("button", { name: "处理" }));
  expect(props.onPackage).toHaveBeenCalledExactlyOnceWith("WP-200");
  expect(data).toEqual(before);
});

it("keeps work-package BIM identity and versions in the real contextual inspector without inventing schedule dates", () => {
  vi.spyOn(api, "engineeringFindings").mockResolvedValue([]);
  const data = completed();
  const before = structuredClone(data);
  const wp = data.state.work_packages.find((item) => item.id === "WP-200")!;
  const onOpen = vi.fn();
  const onClose = vi.fn();
  const onTab = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const content = () => (
    <QueryClientProvider client={client}>
      <ContextInspector
        project={data.state.project.id}
        data={data}
        sources={[]}
        object={{ kind: "work-package", id: wp.id }}
        onClose={onClose}
        onOpen={onOpen}
        onWorkPackage={vi.fn()}
        onTab={onTab}
      />
    </QueryClientProvider>
  );
  const view = render(content());
  const inspector = screen.getByRole("complementary", { name: "检查器" });
  const field = (label: string) =>
    within(inspector).getByText(label).nextElementSibling!;
  expect(field("工作包编号")).toHaveTextContent(wp.id);
  expect(field("构件")).toHaveTextContent(`${wp.element_ids.length} 个`);
  expect(field("设计版本")).toHaveTextContent(wp.design_revision);
  expect(field("已接受版本")).toHaveTextContent(wp.accepted_revision);
  expect(inspector).not.toHaveTextContent(/\d{4}-\d{2}-\d{2}/);
  fireEvent.click(screen.getByRole("button", { name: "查看工作包上下文 →" }));
  expect(onOpen).toHaveBeenCalledExactlyOnceWith({
    kind: "work-package",
    id: wp.id,
  });
  fireEvent.click(screen.getByRole("button", { name: "打开工作面板 →" }));
  expect(onTab).toHaveBeenCalledExactlyOnceWith("work");
  fireEvent.click(screen.getByRole("button", { name: "关闭检查器" }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(data).toEqual(before);

  data.stale = true;
  ready(data);
  view.rerender(content());
  expect(field("当前判断")).toHaveTextContent("需要重新检查");
  expect(inspector).toHaveTextContent("资料已更新，当前工程判断需要重新检查。");
  expect(within(inspector).queryByText("就绪")).toBeNull();
});
