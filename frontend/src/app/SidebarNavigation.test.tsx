import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ProjectSidebar } from "./ProjectSidebar";

/**
 * The workspace tool rail.
 *
 * The rail is tiered now: the three work modes, then the object and impact
 * workspaces, then one utility face whose menu carries the administrative and
 * diagnostic destinations (operations, the site map, diagnostics, layout, project
 * settings). Composition is judged in a browser; what is asserted here is what a
 * screenshot cannot check.
 */
const workModes = ["工作", "项目", "浏览"];
const workspaces = ["模型", "文档", "变更", "问题"];

it("marks exactly the active destination on the tool rail with aria-pressed", () => {
  render(<ProjectSidebar tab="browse" onTab={vi.fn()} />);

  expect(screen.getByRole("button", { name: "浏览" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  for (const name of [...workModes, ...workspaces].filter(
    (item) => item !== "浏览",
  ))
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
  expect(onTab).toHaveBeenCalledTimes(2);

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

it("carries the open-judgement count on the Work face and nowhere else", () => {
  render(<ProjectSidebar tab="work" attention={3} onTab={vi.fn()} />);
  const work = screen.getByRole("button", { name: "工作" });
  expect(work).toHaveTextContent("3");
  expect(work).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.getByLabelText("3 项待人工判断", { exact: false }),
  ).toBeVisible();
});

it("moves the administrative destinations behind one utility face", () => {
  const onTab = vi.fn();
  const onProjectSettings = vi.fn();
  render(
    <ProjectSidebar
      onTab={onTab}
      onProjectSettings={onProjectSettings}
      onLayout={vi.fn()}
      onDiagnostics={vi.fn()}
    />,
  );

  // Operations and the site map are no longer first-level faces.
  expect(screen.queryByRole("button", { name: "活动与运行" })).toBeNull();
  expect(screen.queryByRole("button", { name: "现场地图" })).toBeNull();

  // The administrative tier is disclosed inside the rail, so the frame keeps one
  // material and nothing floats over a docked column.
  const more = screen.getByRole("button", { name: "更多工作区" });
  expect(more).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(more);
  expect(more).toHaveAttribute("aria-expanded", "true");

  fireEvent.click(screen.getByRole("button", { name: "活动与运行" }));
  expect(onTab).toHaveBeenLastCalledWith("operations");

  fireEvent.click(screen.getByRole("button", { name: "设置" }));
  expect(onProjectSettings).toHaveBeenCalledOnce();
});
