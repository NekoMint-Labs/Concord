import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NewProjectDialog } from "./ProjectDialogs";

vi.mock("../components/ui/AppDialog", () => ({
  AppDialog: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title: string;
    children: ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
  DialogClose: ({ children }: { children: ReactNode }) => children,
}));

it("keeps timezone in advanced settings and submits the existing project contract", async () => {
  const onCreate = vi.fn().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  render(
    <NewProjectDialog open onOpenChange={onOpenChange} onCreate={onCreate} />,
  );

  expect(screen.getByLabelText("项目名称")).toBeVisible();
  expect(screen.getByLabelText(/说明/)).toBeVisible();
  expect(screen.queryByLabelText("时区")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "高级设置" }));
  const timezone = screen.getByLabelText("时区");
  expect(timezone).toHaveValue(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );

  fireEvent.change(screen.getByLabelText("项目名称"), {
    target: { value: "  Campus East  " },
  });
  fireEvent.change(screen.getByLabelText(/说明/), {
    target: { value: "  Coordination workspace  " },
  });
  fireEvent.click(screen.getByRole("button", { name: "创建项目" }));

  await waitFor(() =>
    expect(onCreate).toHaveBeenCalledWith({
      name: "Campus East",
      description: "Coordination workspace",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    }),
  );
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it("disables duplicate submission while project creation is pending", async () => {
  let resolveCreate: () => void = () => {};
  const onCreate = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        resolveCreate = resolve;
      }),
  );
  render(<NewProjectDialog open onOpenChange={() => {}} onCreate={onCreate} />);

  fireEvent.change(screen.getByLabelText("项目名称"), {
    target: { value: "Campus East" },
  });
  fireEvent.click(screen.getByRole("button", { name: "创建项目" }));

  expect(
    await screen.findByRole("button", { name: "正在创建…" }),
  ).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "正在创建…" }));
  expect(onCreate).toHaveBeenCalledOnce();
  resolveCreate();
});
