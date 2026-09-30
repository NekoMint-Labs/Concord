import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { EventComposer } from "./EventComposer";
import type { WorkPackage } from "../api/client";
import fixture from "../../tests/fixtures/inspector.json";

it("records a user-confirmed engineering revision without fixed demo labels", () => {
  const wp = {
    ...fixture.waiting.state.work_packages[0],
    id: "real-wp",
    name: "机电吊顶",
    design_revision: "",
    accepted_revision: "",
  } as unknown as WorkPackage;
  const create = vi.fn();
  render(
    <EventComposer
      wp={wp}
      project="real-project"
      onCreate={create}
      onClose={() => {}}
    />,
  );
  const submit = screen.getByRole("button", { name: "提交并分析" });
  expect(submit).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "新版本" })).toHaveValue("");
  fireEvent.change(screen.getByRole("textbox", { name: "新版本" }), {
    target: { value: "MEP Model R2" },
  });
  fireEvent.change(
    screen.getByRole("textbox", { name: "来源说明（不受信任内容）" }),
    { target: { value: "现场确认：施工区域尚未核对最新资料。" } },
  );
  fireEvent.click(submit);
  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      project_id: "real-project",
      work_package_id: wp.id,
      source: "user-observation",
      kind: "design_revision",
      change: { revision: "MEP Model R2" },
    }),
  );
});
