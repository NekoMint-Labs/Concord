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
  expect(screen.getByText(/份工程来源/)).toBeVisible();
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

  expect(screen.getByRole("heading", { name: "已阻塞" })).toBeVisible();
  expect(screen.getByText(/未解决阻塞条件/)).toBeVisible();

  fireEvent.click(screen.getByRole("button", { name: /项判断依据/ }));
  expect(baseProps.onDetails).toHaveBeenCalledWith("evidence");
  fireEvent.click(screen.getByRole("button", { name: "审查处理方案" }));
  expect(baseProps.onDetails).toHaveBeenCalledWith("action");
});

it("switches the overview inspector without changing domain state", () => {
  const workspace = completed();
  render(<CoordinationWorkspace workspace={workspace} {...baseProps} />);

  fireEvent.click(screen.getByRole("button", { name: "工程来源" }));
  expect(screen.getByText("当前工程来源")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "现场资源" }));
  expect(screen.getByText("资质")).toBeVisible();
});
