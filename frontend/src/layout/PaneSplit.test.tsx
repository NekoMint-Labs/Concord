import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Pane, PaneDivider, PaneSplit } from "./PaneSplit";

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
