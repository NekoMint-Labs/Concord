import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import {
  WorkspaceTabs,
  advancedTabs,
  primaryTabs,
  secondaryTabs,
} from "./WorkspaceTabs";

/* Navigation state is the unit contract; Radix popup interaction is browser-covered. */
vi.mock("../components/ui/AppMenu", () => ({
  AppMenu: ({
    children,
    label,
    trigger,
  }: {
    children: ReactNode;
    label: string;
    trigger?: ReactNode;
  }) => (
    <div>
      <button aria-label={label}>{trigger ?? label}</button>
      <div role="menu">{children}</div>
    </div>
  ),
  AppMenuItem: ({
    children,
    onSelect,
    active = false,
  }: {
    children: ReactNode;
    onSelect: () => void;
    active?: boolean;
  }) => (
    <button
      aria-current={active ? "page" : undefined}
      onClick={onSelect}
      role="menuitem"
    >
      {children}
    </button>
  ),
}));

/**
 * What the view strip is allowed to offer.
 *
 * The defect this pass answers is a strip that listed two engineering diagnostics
 * as peers of 协调 and BIM. The destinations are asserted from the exported lists
 * as well as from the rendered strip, because the lists are the statement: a
 * screen that reports whether the OR-Tools extra is installed is not one of the
 * places this product's work happens.
 */
it("names navigation as workflow, secondary, and advanced", () => {
  expect(primaryTabs.map((tab) => tab.label)).toEqual([
    "协调",
    "项目来源",
    "BIM",
    "文档",
  ]);
  expect(secondaryTabs.map((tab) => tab.label)).toEqual([
    "影响关系",
    "工作包",
    "现场地图",
  ]);
  // 现场地图 rather than 现场: the destination opens a map, and a user should be
  // able to tell what opens before clicking it.
  expect(secondaryTabs.find((tab) => tab.id === "gis")?.label).toBe("现场地图");
  expect(advancedTabs.map((tab) => tab.label)).toEqual([
    "运行记录",
    "能力诊断",
  ]);
});

it("offers the workflow destinations in the strip and nothing else", () => {
  render(<WorkspaceTabs tab="coordination" onTab={() => {}} />);

  const strip = screen.getByRole("navigation", { name: "工作区视图" });
  for (const label of ["协调", "BIM", "文档", "更多"])
    expect(strip).toHaveTextContent(label);
  // The diagnostics are not destinations in the strip, and neither is the word a
  // user would have clicked to find them there.
  for (const label of ["运行记录", "能力诊断", "能力"])
    expect(strip).not.toHaveTextContent(label);
});

it("states an advanced view as the current destination without offering it", () => {
  render(<WorkspaceTabs tab="operations" onTab={() => {}} />);

  const strip = screen.getByRole("navigation", { name: "工作区视图" });
  const chip = strip.querySelector(".advanced-view-chip");
  expect(chip).toHaveTextContent("运行记录");
  expect(chip).toHaveAttribute("aria-current", "page");
  // The workflow tabs stay on offer and none of them claims to be current.
  expect(strip.querySelectorAll("button[aria-current='page']")).toHaveLength(0);
});

it("lists exactly the secondary destinations and selects one", () => {
  const onTab = vi.fn();
  render(<WorkspaceTabs tab="gis" onTab={onTab} />);

  const items = screen.getAllByRole("menuitem");
  expect(items.map((item) => item.textContent)).toEqual([
    "影响关系",
    "工作包",
    "现场地图",
  ]);
  // The current destination is stated in the menu as well as in the strip.
  const current = screen.getByRole("menuitem", { name: "现场地图" });
  expect(current).toHaveAttribute("aria-current", "page");

  fireEvent.click(current);
  expect(onTab).toHaveBeenCalledWith("gis");
});
