import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import fixture from "../../tests/fixtures/inspector.json";
import type { Workspace } from "../api/client";
import { CoordinationWorkspace } from "./CoordinationWorkspace";

const props = {
  selected: "WP-200",
  busy: false,
  onRecheck: vi.fn(),
  onDetails: vi.fn(),
  onImpact: vi.fn(),
};

const completed = () => {
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  workspace.run = { ...workspace.run!, status: "COMPLETED" };
  workspace.analysis_run = { ...workspace.analysis_run!, status: "COMPLETED" };
  return workspace;
};

const asDesignChange = (workspace: Workspace) => {
  workspace.events[0] = {
    ...workspace.events[0],
    kind: "design_revision",
    title: "风管路径修订 / V17",
    change: { ...workspace.events[0].change, revision: "V17" },
  };
  return workspace;
};

it("keeps the ready workspace quiet and free of dormant change context", () => {
  const workspace = asDesignChange(completed());
  workspace.analysis!.readiness = workspace.analysis!.readiness.map((item) =>
    item.work_package_id === "WP-200" ? { ...item, status: "READY" } : item,
  );
  render(<CoordinationWorkspace workspace={workspace} {...props} />);

  expect(screen.getByText("东翼风管安装")).toBeVisible();
  expect(screen.getByText("WP-200 · L02 东翼")).toBeVisible();
  expect(screen.getByText("当前没有阻塞施工的条件")).toBeVisible();
  expect(screen.getByText(/上次检查：/)).toBeVisible();
  expect(screen.getByText("就绪")).toBeVisible();
  // One re-check, no blocker/recommendation narration, no carried-over event.
  expect(screen.getAllByRole("button", { name: /重新检查/ })).toHaveLength(1);
  expect(screen.queryByText("风管路径修订 / V17")).not.toBeInTheDocument();
  expect(screen.queryByText(/查看依据/)).not.toBeInTheDocument();
  expect(screen.queryByText("建议")).not.toBeInTheDocument();
});

it("separates the previous work-package state from the current activity while analyzing", () => {
  const workspace = asDesignChange(
    structuredClone(fixture.waiting) as unknown as Workspace,
  );
  workspace.run = { ...workspace.run!, status: "RUNNING" };
  workspace.analysis_run = { ...workspace.analysis_run!, status: "RUNNING" };
  workspace.stale = true;
  render(<CoordinationWorkspace workspace={workspace} {...props} />);

  // Work-package state and activity are not competing peers.
  expect(screen.getByText("上次状态：已阻塞")).toBeVisible();
  expect(screen.getByText("正在重新检查")).toBeVisible();
  expect(screen.getByText("根据 V17 重新评估施工条件。")).toBeVisible();
  // The recorded judgement is not presented as the current state, in the state
  // slot or in the activity note.
  expect(screen.queryByText("已阻塞")).not.toBeInTheDocument();
  expect(screen.getByText("上次判断为阻塞，分析完成后更新。")).toBeVisible();
  expect(
    screen.queryByText("工作包处于阻塞状态，分析完成后更新。"),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("分析中")).not.toBeInTheDocument();
  // The in-flight re-check is stated by the activity, not by a second badge.
  expect(screen.queryByText("需要重新检查")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /重新检查/ }),
  ).not.toBeInTheDocument();
});

it("never presents a previous READY as the current state while re-checking", () => {
  const workspace = asDesignChange(
    structuredClone(fixture.waiting) as unknown as Workspace,
  );
  workspace.run = { ...workspace.run!, status: "RUNNING" };
  workspace.analysis_run = { ...workspace.analysis_run!, status: "RUNNING" };
  workspace.stale = true;
  workspace.analysis!.readiness = workspace.analysis!.readiness.map((item) =>
    item.work_package_id === "WP-200" ? { ...item, status: "READY" } : item,
  );
  render(<CoordinationWorkspace workspace={workspace} {...props} />);

  expect(screen.getByText("上次状态：就绪")).toBeVisible();
  expect(screen.queryByText("就绪")).not.toBeInTheDocument();
  expect(screen.getByText("正在重新检查")).toBeVisible();
});

it("reads a blocked work item top to bottom without storyboard labels", () => {
  // The competition scenario: V16 to V17 design change blocking the package.
  const workspace = asDesignChange(
    structuredClone(fixture.waiting) as unknown as Workspace,
  );
  const design = "Drawing V17 is current; workface acknowledged V16.";
  workspace.analysis!.constraints[0] = {
    ...workspace.analysis!.constraints[0],
    kind: "design",
    description: design,
  };
  workspace.analysis!.evidence[0] = {
    ...workspace.analysis!.evidence[0],
    source_id: "drawing/WP-200",
    fact: design,
  };
  workspace.analysis!.constraints.push({
    ...workspace.analysis!.constraints[0],
    id: "informational-constraint",
    blocking: false,
    description: "Informational coordination note",
  });
  render(<CoordinationWorkspace workspace={workspace} {...props} />);

  const rendered =
    document.querySelector(".coordination-body")?.textContent ?? "";
  const positions = [
    "V16",
    "个构件需要协调",
    "图纸已更新至 V17，但当前施工面仍基于 V16。",
    "项判断依据",
    "建议",
    "需批准后执行",
    "批准并继续",
  ].map((needle) => rendered.indexOf(needle));
  expect(positions.every((position) => position >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));

  // Labels that only restate the obvious are gone.
  for (const label of [
    "发生变化",
    "图纸已更新",
    "当前工作包受到影响",
    "阻塞原因",
    "建议处理",
  ]) {
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  }
  expect(
    screen.queryByText("Informational coordination note"),
  ).not.toBeInTheDocument();
});

it("keeps an active design change scoped to its own work package", () => {
  const workspace = asDesignChange(
    structuredClone(fixture.waiting) as unknown as Workspace,
  );
  const { rerender } = render(
    <CoordinationWorkspace workspace={workspace} {...props} />,
  );
  expect(screen.getByText("已阻塞")).toBeVisible();
  expect(screen.getByText("V17")).toBeVisible();

  // Switching packages must not leak the previous package's event context.
  rerender(
    <CoordinationWorkspace
      workspace={workspace}
      {...props}
      selected="WP-300"
    />,
  );
  expect(screen.getByText("03 层电气粗装")).toBeVisible();
  expect(screen.getByText("就绪")).toBeVisible();
  expect(screen.queryByText("V17")).not.toBeInTheDocument();
  expect(screen.queryByText("风管路径修订 / V17")).not.toBeInTheDocument();
});

it("reports a stale judgement beside the work package, not as a global banner", () => {
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  workspace.stale = true;
  render(<CoordinationWorkspace workspace={workspace} {...props} />);

  expect(
    screen.getByText("判断基于过期快照，重新检查后再处理。"),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "重新检查" })).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("opens the impact graph contextually instead of as a primary tab", () => {
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  const onImpact = vi.fn();
  render(
    <CoordinationWorkspace
      workspace={workspace}
      {...props}
      onImpact={onImpact}
    />,
  );
  screen.getByRole("button", { name: /查看影响/ }).click();
  expect(onImpact).toHaveBeenCalledTimes(1);
});
