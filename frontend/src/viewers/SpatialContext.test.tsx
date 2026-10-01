import type { ComponentProps } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { DTO } from "../api/client";
import { SpatialContext } from "./SpatialContext";

const issue: DTO<"Constraint"> = {
  id: "issue-1",
  snapshot_id: "snapshot-1",
  work_package_id: "package-1",
  kind: "design",
  description: "Check wall clearance",
  evidence_ids: [],
  resource_id: null,
  blocking: true,
};

function props(
  context: "changes" | "issues",
): ComponentProps<typeof SpatialContext> {
  return {
    context,
    setContext: vi.fn(),
    open: true,
    setOpen: vi.fn(),
    rows: [
      {
        global_id: "wall-1",
        change_kind: "changed",
        changed_aspects: ["placement"],
      },
    ],
    issues: [issue],
    activeId: "wall-1",
    selectedIssue: issue.id,
    snapshots: [],
    elements: [
      {
        id: "wall-1",
        name: "Wall",
        type: "IfcWall",
        storey: "L1",
        space: "",
        revision: "V1",
        ifc_schema: null,
        related_ids: [],
        properties: {},
      },
    ],
    onSelect: vi.fn(),
    onIssue: vi.fn(),
  };
}

it.each(["changes", "issues"] as const)(
  "%s row cells select once and retain the keyboard name button",
  (context) => {
    const input = props(context);
    render(<SpatialContext {...input} />);
    const row = screen.getAllByRole("row")[1];
    const select = context === "changes" ? input.onSelect : input.onIssue;
    const other = context === "changes" ? input.onIssue : input.onSelect;
    const value = context === "changes" ? "wall-1" : issue;
    const cells = within(row).getAllByRole("cell");
    cells.forEach((cell, index) => {
      fireEvent.click(cell.firstElementChild ?? cell);
      expect(select).toHaveBeenCalledTimes(index + 1);
      expect(select).toHaveBeenLastCalledWith(value);
    });
    const name = within(row).getByRole("button");
    expect(name).toHaveAttribute("aria-current", "true");
    name.focus();
    expect(name).toHaveFocus();
    // Native keyboard activation dispatches a click with detail=0.
    fireEvent.click(name, { detail: 0 });
    expect(select).toHaveBeenCalledTimes(cells.length + 1);
    expect(other).not.toHaveBeenCalled();
  },
);

it.each(["changes", "issues"] as const)(
  "%s rows leave nested actions and cancelled clicks alone",
  (context) => {
    const input = props(context);
    render(<SpatialContext {...input} />);
    const cell = within(screen.getAllByRole("row")[1])
      .getAllByRole("cell")
      .at(-1)!;
    const action = vi.fn();
    for (const tag of ["button", "a"]) {
      const control = document.createElement(tag);
      control.innerHTML = "<span>Nested action</span>";
      control.addEventListener("click", action);
      cell.append(control);
      fireEvent.click(control.firstElementChild!);
      control.remove();
    }
    expect(action).toHaveBeenCalledTimes(2);
    cell.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(cell);
    expect(input.onSelect).not.toHaveBeenCalled();
    expect(input.onIssue).not.toHaveBeenCalled();
  },
);

it.each([
  [
    "changes",
    "模型变更",
    "已提供的变更记录",
    "模型版本",
    "不会自动生成版本比较",
  ],
  ["issues", "空间问题", "已提供的问题", "工作包", "不代表所有工作包均已就绪"],
] as const)(
  "empty %s dock explains what, why and next without asserting readiness",
  (context, what, why, next, caveat) => {
    render(<SpatialContext {...props(context)} rows={[]} issues={[]} />);
    const empty = document.querySelector(".context-empty")!;
    for (const text of [what, why, next, caveat])
      expect(empty).toHaveTextContent(text);
  },
);

it("does not offer an empty Inspector in reduced model context", () => {
  render(
    <SpatialContext
      {...props("changes")}
      reduced
      onExpandInspector={vi.fn()}
    />,
  );
  expect(screen.queryByRole("button", { name: "展开检查器" })).toBeNull();
  expect(screen.queryByRole("region", { name: "模型上下文" })).toBeNull();
});
