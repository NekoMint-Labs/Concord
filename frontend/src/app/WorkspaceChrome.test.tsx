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

it("carries the current project, surface and navigation toggle in its own header", () => {
  const onNavigate = vi.fn();
  const onWork = vi.fn();
  render(
    <WorkspaceChrome
      title="A 栋项目"
      subtitle="模型 · 东翼风管安装"
      onOpen={() => {}}
      onNavigate={onNavigate}
      navigationOpen
      onWork={onWork}
      workOpen={false}
      pending={2}
      running={false}
      onReport={() => {}}
      onFocus={() => {}}
      onControls={() => {}}
      controlsOpen={false}
      onSearch={() => {}}
      conditionControl={<span>东翼风管安装</span>}
    />,
  );

  const header = screen.getByRole("banner");
  expect(within(header).getByText("A 栋项目")).toBeVisible();
  expect(within(header).getByText("模型 · 东翼风管安装")).toBeVisible();

  // The navigation toggle replaces the old sidebar collapse control.
  const navigate = within(header).getByRole("button", { name: "资料" });
  expect(navigate).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(navigate);
  expect(onNavigate).toHaveBeenCalledOnce();

  // Work stays in the header, expanded state and pending count are its own.
  const work = within(header).getByRole("button", { name: /工作/ });
  expect(work).toHaveAttribute("aria-expanded", "false");
  expect(work).toHaveTextContent("2");
  fireEvent.click(work);
  expect(onWork).toHaveBeenCalledOnce();

  // The current location and work package live in the context band.
  expect(screen.getByText("东翼风管安装")).toBeVisible();
});
