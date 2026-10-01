import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import fixture from "../../tests/fixtures/inspector.json";
import type { Workspace } from "../api/client";
import { CoordinationWorkspace } from "./CoordinationWorkspace";

const baseProps = {
  selected: "WP-200",
  busy: false,
  onRecheck: vi.fn(),
  onDetails: vi.fn(),
  onImpact: vi.fn(),
  onModel: vi.fn(),
};

function completed() {
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  workspace.run = { ...workspace.run!, status: "COMPLETED" };
  workspace.analysis_run = { ...workspace.analysis_run!, status: "COMPLETED" };
  return workspace;
}

it("makes readiness the primary work-package conclusion", () => {
  const workspace = completed();
  workspace.analysis!.readiness = workspace.analysis!.readiness.map((item) =>
    item.work_package_id === "WP-200" ? { ...item, status: "READY" } : item,
  );

  render(<CoordinationWorkspace workspace={workspace} {...baseProps} />);

  expect(
    screen.getByRole("heading", { name: "东翼风管安装", level: 1 }),
  ).toBeVisible();
  expect(screen.getByRole("heading", { name: "可施工" })).toBeVisible();
  expect(screen.getByText("当前没有未解决的阻塞条件")).toBeVisible();
  expect(screen.getByText(/上次检查/)).toBeVisible();
  expect(screen.queryByText(/快照 v\d+/)).not.toBeInTheDocument();
});

it("does not call an unchecked new work package READY", () => {
  const workspace = completed();
  workspace.analysis = null;
  render(<CoordinationWorkspace workspace={workspace} {...baseProps} />);
  expect(screen.getByRole("heading", { name: "待检查" })).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "可施工" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "重新检查" })).toBeVisible();
});

it("does not show READY after a failed re-check", () => {
  const workspace = completed();
  workspace.run = { ...workspace.run!, status: "FAILED" };
  workspace.analysis_run = { ...workspace.analysis_run!, status: "FAILED" };
  render(<CoordinationWorkspace workspace={workspace} {...baseProps} />);
  expect(screen.getByRole("heading", { name: "检查失败" })).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "可施工" }),
  ).not.toBeInTheDocument();
});

it("flags a pending model revision instead of presenting an old READY judgement as current", () => {
  const workspace = completed();
  workspace.stale = true;
  workspace.analysis!.readiness = workspace.analysis!.readiness.map((item) =>
    item.work_package_id === "WP-200" ? { ...item, status: "READY" } : item,
  );
  render(
    <CoordinationWorkspace workspace={workspace} {...baseProps} pendingModel />,
  );
  expect(screen.getByRole("heading", { name: "待审核" })).toBeVisible();
  expect(screen.getByRole("button", { name: "查看影响" })).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "可施工" }),
  ).not.toBeInTheDocument();
});

it("keeps real work-package BIM identity in the model context", () => {
  const workspace = completed();
  render(<CoordinationWorkspace workspace={workspace} {...baseProps} />);

  expect(screen.getByText("模型上下文")).toBeVisible();
  const selected = workspace.state.work_packages.find(
    (item) => item.id === "WP-200",
  )!;
  expect(
    screen.getByText(`${selected.element_ids.length} 个关联构件`),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "打开模型" }));
  expect(baseProps.onModel).toHaveBeenCalled();
});

it("presents a stale judgement as requiring review", () => {
  const workspace = completed();
  workspace.stale = true;
  workspace.analysis!.readiness = workspace.analysis!.readiness.map((item) =>
    item.work_package_id === "WP-200" ? { ...item, status: "READY" } : item,
  );

  render(<CoordinationWorkspace workspace={workspace} {...baseProps} />);

  expect(screen.getByRole("heading", { name: "需复核" })).toBeVisible();
  expect(screen.getByText(/较早快照/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "重新检查" }));
  expect(baseProps.onRecheck).toHaveBeenCalled();
});

it("opens evidence and action detail from a blocked work package", () => {
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  render(<CoordinationWorkspace workspace={workspace} {...baseProps} />);

  expect(screen.getByRole("heading", { name: "待批准" })).toBeVisible();
  expect(screen.getByText(/处理建议需要明确批准/)).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: /项判断依据/ }));
  expect(baseProps.onDetails).toHaveBeenCalledWith("evidence");
  fireEvent.click(screen.getByRole("button", { name: "审查处理方案" }));
  expect(baseProps.onDetails).toHaveBeenCalledWith("action");
});

it("switches the overview inspector without changing domain state", () => {
  const workspace = completed();
  render(<CoordinationWorkspace workspace={workspace} {...baseProps} />);

  fireEvent.click(screen.getByRole("button", { name: "工程记录" }));
  expect(screen.getByText("其他工程记录")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "现场资源" }));
  expect(screen.getByText("资质")).toBeVisible();
});

it("opens real issue context and does not invent schedule dates", () => {
  const onDocuments = vi.fn();
  render(
    <CoordinationWorkspace
      workspace={completed()}
      {...baseProps}
      onDocuments={onDocuments}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "进度" }));
  expect(screen.getByText("此工作包尚未记录日期。")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /问题 \d+/ }));
  expect(screen.getByRole("heading", { name: /未解决问题/ })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "文档 →" }));
  expect(onDocuments).toHaveBeenCalledOnce();
});

it("distinguishes current coordination from the package record without changing its facts", () => {
  const workspace = completed();
  const view = render(
    <CoordinationWorkspace workspace={workspace} {...baseProps} />,
  );
  expect(screen.getByText("工作包概览")).toBeVisible();
  expect(screen.getByRole("heading", { name: "协调详情" })).toBeVisible();
  view.rerender(
    <CoordinationWorkspace
      workspace={workspace}
      surface="work-packages"
      {...baseProps}
    />,
  );
  expect(screen.getByRole("heading", { name: "工作包详情" })).toBeVisible();
  expect(screen.getByRole("button", { name: "工作包" })).toBeVisible();
});

it("does not let a pending baseline hide an authoritative blocker or a fresh recheck result", () => {
  const workspace = completed();
  workspace.state.project.id = "real-project";
  workspace.proposals = [];
  const wp = workspace.state.work_packages.find(
    (item) => item.id === "WP-200",
  )!;
  wp.required_workers = 0;
  wp.available_workers = 0;
  wp.inspection_passed = true;
  workspace.events = [];
  const view = render(
    <CoordinationWorkspace workspace={workspace} {...baseProps} pendingModel />,
  );
  expect(screen.getByRole("heading", { name: "已阻塞" })).toBeVisible();
  workspace.analysis!.readiness = workspace.analysis!.readiness.map((item) =>
    item.work_package_id === "WP-200" ? { ...item, status: "READY" } : item,
  );
  workspace.analysis!.constraints = [];
  view.rerender(
    <CoordinationWorkspace workspace={workspace} {...baseProps} pendingModel />,
  );
  expect(screen.getByRole("heading", { name: "可施工" })).toBeVisible();
  expect(screen.getByText(/不代替现场核验或安全确认/)).toBeVisible();
  expect(screen.getByText("未记录要求")).toBeVisible();
  expect(screen.getByText("需要现场核验")).toBeVisible();
  expect(screen.queryByText("检查有效")).toBeNull();
});

it("selects the clicked constraint before opening blocker details", () => {
  const workspace = completed();
  const first = workspace.analysis!.constraints.find(
    (item) => item.work_package_id === baseProps.selected && item.blocking,
  )!;
  workspace.analysis!.constraints = [
    first,
    { ...first, id: "second-constraint", description: "Second blocker" },
  ];
  const calls: string[] = [];
  render(
    <CoordinationWorkspace
      workspace={workspace}
      {...baseProps}
      onConstraint={(id) => calls.push(id)}
      onDetails={(view) => calls.push(view)}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "问题 2" }));
  fireEvent.click(
    screen.getAllByRole("button", { name: /项判断依据 · 查看问题/ })[1],
  );
  expect(calls).toEqual(["second-constraint", "blocker"]);
});
