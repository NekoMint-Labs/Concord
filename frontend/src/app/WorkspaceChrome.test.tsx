import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { WorkspaceCommandMenu } from "./WorkspaceChrome";

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
