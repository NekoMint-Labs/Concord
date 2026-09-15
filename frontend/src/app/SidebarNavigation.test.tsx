import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import fixture from "../../tests/fixtures/inspector.json";
import type { DTO, Workspace } from "../api/client";
import { ProjectSidebar } from "./ProjectSidebar";
import { WorkspaceHeader } from "./WorkspaceHeader";

/**
 * The navigation chrome of the desktop pass.
 *
 * Almost everything this pass changed is composition, and composition is judged
 * in a browser rather than here. What is asserted is the part a screenshot cannot
 * check: that a collapsed column is genuinely out of reach, that exactly one
 * sidebar control is on screen at a time, and that the project switcher is still
 * the picker it was - the pass restyled it and must not have changed what it does.
 */
const data = structuredClone(fixture.waiting) as unknown as Workspace;
const wp = data.state.work_packages.find((item) => item.id === "WP-200")!;
const projects = [
  { id: "harbor-east", name: "Harbor East / Building A" },
] as unknown as DTO<"Project">[];

function sidebar({ collapsed = false, onCollapse = vi.fn() } = {}) {
  render(
    <ProjectSidebar
      data={data}
      project="harbor-east"
      projects={projects}
      selected="WP-200"
      collapsed={collapsed}
      onCollapse={onCollapse}
      onProject={() => {}}
      onSelect={() => {}}
    />,
  );
  return onCollapse;
}

it("carries the collapse control and the current project in its own header", () => {
  const onCollapse = sidebar();
  const current = screen.getByRole("button", { name: "项目" });
  expect(within(current).getByText("Harbor East / Building A")).toBeVisible();
  expect(document.querySelector(".sidebar")).not.toHaveAttribute("inert");

  fireEvent.click(screen.getByRole("button", { name: "收起侧栏" }));
  expect(onCollapse).toHaveBeenCalledTimes(1);
});

it("takes a collapsed column out of reach instead of unmounting it", () => {
  sidebar({ collapsed: true });
  /* Off the window's edge is not the same as gone: the column keeps its layout so
     the slide has something to move, and `inert` is what stops Tab reaching a
     region that is not on screen. */
  expect(document.querySelector(".sidebar")).toHaveAttribute("inert");
});

it("offers the way back only while the column is gone", () => {
  const onToggleNav = vi.fn();
  const view = render(
    <WorkspaceHeader data={data} wp={wp} onToggleNav={onToggleNav} />,
  );
  expect(screen.queryByRole("button", { name: "展开侧栏" })).toBeNull();

  view.rerender(
    <WorkspaceHeader
      data={data}
      wp={wp}
      navCollapsed
      onToggleNav={onToggleNav}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "展开侧栏" }));
  expect(onToggleNav).toHaveBeenCalledTimes(1);
});
