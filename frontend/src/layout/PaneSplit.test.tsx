import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Pane, PaneDivider, PaneSplit, usePanelRef } from "./PaneSplit";

/**
 * The pane wrapper's own contract. Two things can regress here and both are
 * invisible until a user hits them: the library measures the group's *direct*
 * children for `data-panel`, and the divider is the only keyboard-reachable way
 * to resize a pane.
 */
const panelsOf = (id: string) =>
  Array.from(document.getElementById(id)!.children).filter((child) =>
    child.hasAttribute("data-panel"),
  );

function Harness() {
  const [selected, setSelected] = useState("a");
  return (
    <PaneSplit id="test-split">
      <Pane className="left" defaultSize="200px" minSize="120px">
        <button onClick={() => setSelected("b")}>select b</button>
      </Pane>
      <PaneDivider />
      <Pane className="right">
        <span>selected: {selected}</span>
      </Pane>
    </PaneSplit>
  );
}

it("hosts both panes, keeps their state, and exposes a resizable separator", () => {
  render(<Harness />);

  expect(panelsOf("test-split")).toHaveLength(2);

  fireEvent.click(screen.getByRole("button", { name: "select b" }));
  expect(screen.getByText("selected: b")).toBeInTheDocument();

  // The divider is a real separator with a name and a place in the tab order, so
  // the pane can be resized without a pointer.
  const separator = screen.getByRole("separator", { name: "调整面板宽度" });
  expect(separator).toHaveAttribute("tabindex", "0");
  expect(separator).toHaveAttribute("aria-orientation", "vertical");
});

it("renders the panes it is given, including one that declares no floor", () => {
  render(
    <PaneSplit id="floors">
      <Pane defaultSize="240px" minSize="180px">
        <button>left</button>
      </Pane>
      <PaneDivider />
      <Pane>
        <button>right</button>
      </Pane>
    </PaneSplit>,
  );
  // A pane that states no minimum still gets one from the wrapper, so it cannot
  // be dragged to zero. The floor itself is enforced by the library's layout
  // math and is checked in the browser, not here.
  expect(panelsOf("floors")).toHaveLength(2);
  expect(screen.getByRole("button", { name: "left" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "right" })).toBeInTheDocument();
});

/**
 * The shell's navigation column: a pane that can be resized and collapsed, which
 * is the pair of behaviors this pass had to reconcile. The library owns the
 * layout math, so what is asserted here is the contract around it - that a
 * collapsed pane returns to the width it had, and that the divider is a
 * keyboard-reachable control while the column is there and not one while it is not.
 */
function NavigationHarness() {
  const panel = usePanelRef();
  const [width, setWidth] = useState("unknown");
  const record = () =>
    setWidth(String(panel.current?.getSize().asPercentage ?? "none"));
  return (
    <>
      <button onClick={() => panel.current?.collapse()}>收起导航</button>
      <button onClick={() => panel.current?.expand()}>展开导航</button>
      <button onClick={record}>记录宽度</button>
      <span>宽度 {width}</span>
      <PaneSplit id="shell">
        <Pane
          id="navigation"
          panelRef={panel}
          collapsible
          collapsedSize="0px"
          defaultSize="232px"
          minSize="200px"
          maxSize="320px"
        >
          <nav aria-label="项目与工作包">work packages</nav>
        </Pane>
        <PaneDivider label="调整导航宽度" />
        <Pane className="work-plane">work plane</Pane>
      </PaneSplit>
    </>
  );
}

it("collapses the navigation pane and returns it to the width it had", () => {
  render(<NavigationHarness />);
  expect(panelsOf("shell")).toHaveLength(2);

  fireEvent.click(screen.getByText("记录宽度"));
  const chosen = screen.getByText(/宽度 /).textContent;
  expect(chosen).not.toBe("宽度 unknown");

  fireEvent.click(screen.getByText("收起导航"));
  fireEvent.click(screen.getByText("记录宽度"));
  // Collapsed is zero width, which is what hands the work plane the whole window.
  expect(screen.getByText(/宽度 /)).toHaveTextContent("宽度 0");

  fireEvent.click(screen.getByText("展开导航"));
  fireEvent.click(screen.getByText("记录宽度"));
  // Session-only restore: the library remembers the expanded width in memory, and
  // nothing is written to storage (a remembered width across launches is a
  // preference, and preferences are their own pass).
  expect(screen.getByText(/宽度 /).textContent).toBe(chosen);
});

it("exposes the navigation divider as a keyboard-reachable control", () => {
  render(<NavigationHarness />);
  const divider = screen.getByRole("separator", { name: "调整导航宽度" });
  expect(divider).toHaveAttribute("tabindex", "0");
  expect(divider).toHaveAttribute("aria-orientation", "vertical");
});

it("takes the divider out of the tab order while its pane is collapsed", () => {
  render(
    <PaneSplit id="collapsed-shell">
      <Pane id="navigation" collapsible collapsedSize="0px">
        <span>work packages</span>
      </Pane>
      <PaneDivider label="调整导航宽度" disabled />
      <Pane>work plane</Pane>
    </PaneSplit>,
  );
  // There is no pane edge to grab, so there must not be a tab stop that does
  // nothing - and the rule that hides it is on the same attribute
  // (frontend/src/styles/layout.css).
  const divider = screen.getByRole("separator", { name: "调整导航宽度" });
  expect(divider).toHaveAttribute("data-separator", "disabled");
  expect(divider).toHaveAttribute("aria-disabled", "true");
  expect(divider).not.toHaveAttribute("tabindex");
});
