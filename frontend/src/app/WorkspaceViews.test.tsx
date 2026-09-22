import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { EmptyWorkPackages } from "./WorkspaceViews";

it("offers the existing work-package creation flow from a fresh workspace", () => {
  const onCreate = vi.fn();
  render(<EmptyWorkPackages onCreate={onCreate} />);

  expect(screen.getByText("还没有工作包")).toBeVisible();
  expect(screen.getByText(/关联模型、跟踪变更并运行协调检查/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "新建工作包" }));
  expect(onCreate).toHaveBeenCalledOnce();
});
