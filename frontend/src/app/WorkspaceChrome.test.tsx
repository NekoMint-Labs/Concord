import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { WorkspaceChrome, WorkspaceCommandMenu } from "./WorkspaceChrome";

it("retains donor command filtering, active-descendant navigation and disabled action fencing", () => {
  const run = vi.fn();
  const onClose = vi.fn();
  render(
    <WorkspaceCommandMenu
      open
      onClose={onClose}
      actions={[
        { id: "model", label: "结构模型", group: "资料", run },
        { id: "disabled", label: "确认基线", disabled: true, run },
        { id: "finding", label: "Finding 示例", group: "交互预览", run },
      ]}
    />,
  );
  const search = screen.getByRole("combobox", { name: "搜索对象或操作" });
  expect(search).toHaveAttribute(
    "aria-activedescendant",
    "workspace-action-model",
  );
  fireEvent.keyDown(search, { key: "ArrowDown" });
  fireEvent.keyDown(search, { key: "Enter" });
  expect(run).not.toHaveBeenCalled();
  fireEvent.change(search, { target: { value: "finding" } });
  expect(screen.getAllByRole("option")).toHaveLength(1);
  expect(search).toHaveAttribute(
    "aria-activedescendant",
    "workspace-action-finding",
  );
  fireEvent.keyDown(search, { key: "Enter" });
  expect(onClose).toHaveBeenCalledOnce();
  expect(run).toHaveBeenCalledOnce();
  fireEvent.change(search, { target: { value: "不存在的资料" } });
  fireEvent.keyDown(search, { key: "ArrowDown" });
  expect(search).not.toHaveAttribute("aria-activedescendant");
  expect(screen.getByText(/没有匹配项/)).toBeVisible();
});

it("carries project identity, one search entry, scope and the mode action in one bar", () => {
  const onNavigate = vi.fn();
  const onSearch = vi.fn();
  render(
    <WorkspaceChrome
      title="A 栋项目"
      subtitle="模型 · 东翼风管安装"
      onOpen={() => {}}
      onNavigate={onNavigate}
      navigationOpen
      onSearch={onSearch}
      fileMenu={<button type="button">项目菜单</button>}
      scope={<span>东翼风管安装</span>}
      assistant={<button type="button">询问 Concord</button>}
      action={<button type="button">记录变更</button>}
      overflow={<button type="button">更多</button>}
    />,
  );

  const header = screen.getByRole("banner");
  expect(within(header).getByText("A 栋项目")).toBeVisible();
  expect(within(header).getByText("模型 · 东翼风管安装")).toBeVisible();

  // One search entry for every object and action.
  const search = within(header).getByRole("button", {
    name: /查找对象、判断、资料或操作/,
  });
  fireEvent.click(search);
  expect(onSearch).toHaveBeenCalledOnce();

  // The navigation toggle is the only second navigation affordance in the bar.
  const navigate = within(header).getByRole("button", { name: "对象导航" });
  expect(navigate).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(navigate);
  expect(onNavigate).toHaveBeenCalledOnce();

  // Scope, the assistant, the committed action and the overflow all live in the bar,
  // and the bar carries no second mode switcher: mode belongs to the rail.
  expect(within(header).getByText("东翼风管安装")).toBeVisible();
  expect(
    within(header).getByRole("button", { name: "询问 Concord" }),
  ).toBeVisible();
  expect(
    within(header).getByRole("button", { name: "记录变更" }),
  ).toBeVisible();
  expect(within(header).getByRole("button", { name: "更多" })).toBeVisible();
  expect(
    within(header).getByRole("button", { name: "项目菜单" }),
  ).toBeVisible();
});
