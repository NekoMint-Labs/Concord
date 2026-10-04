import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ProjectSidebar } from "./ProjectSidebar";

/**
 * The workspace tool rail.
 *
 * The rail is faces only now: each face is a destination (or the project
 * settings), the active one is pressed, and nothing hides a package or model
 * tree behind it. Composition is judged in a browser; what is asserted here is
 * what a screenshot cannot check.
 */
const destinations = ["工作", "项目", "浏览", "模型", "文档", "变更", "问题"];

it("marks exactly the active destination on the tool rail with aria-pressed", () => {
  render(<ProjectSidebar tab="browse" onTab={vi.fn()} />);

  expect(screen.getByRole("button", { name: "浏览" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  for (const name of destinations.filter((item) => item !== "浏览"))
    expect(screen.getByRole("button", { name })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
});

it("routes every rail face to its destination without a hidden package or model tree", () => {
  const onTab = vi.fn();
  const onProjectSettings = vi.fn();
  render(
    <ProjectSidebar onTab={onTab} onProjectSettings={onProjectSettings} />,
  );

  fireEvent.click(screen.getByRole("button", { name: "浏览" }));
  expect(onTab).toHaveBeenLastCalledWith("browse");
  fireEvent.click(screen.getByRole("button", { name: "模型" }));
  expect(onTab).toHaveBeenLastCalledWith("bim");
  fireEvent.click(screen.getByRole("button", { name: "活动与运行" }));
  expect(onTab).toHaveBeenLastCalledWith("operations");
  expect(onTab).toHaveBeenCalledTimes(3);

  fireEvent.click(screen.getByRole("button", { name: "设置" }));
  expect(onProjectSettings).toHaveBeenCalledOnce();
  expect(onTab).toHaveBeenCalledTimes(3);

  // The rail is faces only: it never hides a package or model tree behind it.
  expect(screen.queryByRole("searchbox", { hidden: true })).toBeNull();
  expect(
    screen.queryByRole("navigation", { name: "工作包", hidden: true }),
  ).toBeNull();
  expect(
    screen.queryByRole("navigation", { name: "项目模型", hidden: true }),
  ).toBeNull();
  expect(screen.queryByText("东翼风管安装")).toBeNull();
});
