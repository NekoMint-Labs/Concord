import { useState, type ReactNode } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { PanelImperativeHandle } from "../layout/PaneSplit";
import { SpatialContext } from "./SpatialContext";
import { SpatialInspector } from "./SpatialInspector";

// Test the panel's focus handoff with the menu's delayed return-focus behavior.
// Floating-menu positioning and dismissal are outside this focused unit test.
vi.mock("../components/ui/AppMenu", () => ({
  AppMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AppMenuItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode;
    onSelect: () => void;
  }) => (
    <button
      role="menuitem"
      onClick={(event) => {
        const item = event.currentTarget;
        onSelect();
        window.setTimeout(() => item.focus(), 0);
      }}
    >
      {children}
    </button>
  ),
}));

function Harness({
  mapping = false,
  collapse,
  resize,
}: {
  mapping?: boolean;
  collapse: () => void;
  resize: (size: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button aria-label="展开检查器">Other workspace</button>
      <section className="bim-workspace">
        {/* Unavailable controls must never receive restored focus. */}
        <button hidden aria-label="展开检查器">
          Hidden
        </button>
        <button disabled aria-label="展开检查器">
          Disabled
        </button>
        {mapping ? (
          !open && (
            <button
              className="mapping-inspector-toggle"
              onClick={() => setOpen(true)}
            >
              展开检查器
            </button>
          )
        ) : (
          <SpatialContext
            context="changes"
            setContext={vi.fn()}
            open={false}
            setOpen={vi.fn()}
            rows={[]}
            issues={[]}
            activeId=""
            selectedIssue=""
            snapshots={[]}
            onSelect={vi.fn()}
            onIssue={vi.fn()}
            onExpandInspector={open ? undefined : () => setOpen(true)}
          />
        )}
        <SpatialInspector
          mode="model"
          title="Wall"
          classification="IfcWall"
          inspectorTab="overview"
          setInspectorTab={vi.fn()}
          activeId=""
          linkedIssues={[]}
          viewFile={null}
          viewerProperties={null}
          inspectorOpen={open}
          inspectorPane={{
            current: {
              collapse: () => {
                collapse();
                setOpen(false);
              },
              resize,
            } as PanelImperativeHandle,
          }}
          select={vi.fn()}
          chooseIssue={vi.fn()}
          openChanges={vi.fn()}
        />
      </section>
    </>
  );
}

it.each([false, true])(
  "menu collapse restores focus to the visible reopen control (mapping=%s)",
  async (mapping) => {
    const collapse = vi.fn();
    render(<Harness mapping={mapping} collapse={collapse} resize={vi.fn()} />);
    const item = screen.getByRole("menuitem", { name: "收起检查器" });
    item.focus();
    fireEvent.click(item);
    expect(collapse).toHaveBeenCalledTimes(1);
    const workspace = document.querySelector(".bim-workspace") as HTMLElement;
    const reopen = within(workspace)
      .getAllByRole("button", { name: "展开检查器" })
      .find((button) => !(button as HTMLButtonElement).disabled)!;
    await waitFor(() => expect(document.activeElement === reopen).toBe(true));
    expect(reopen).toHaveFocus();
    expect(screen.getByLabelText("构件详情")).toHaveAttribute("inert");
    fireEvent.click(reopen);
    expect(screen.getByLabelText("构件详情")).not.toHaveAttribute("inert");
  },
);

it("resetting width leaves the inspector open without requesting collapse", () => {
  const collapse = vi.fn();
  const resize = vi.fn();
  render(<Harness collapse={collapse} resize={resize} />);
  fireEvent.click(screen.getByRole("menuitem", { name: "重置面板宽度" }));
  expect(resize).toHaveBeenCalledWith("320px");
  expect(collapse).not.toHaveBeenCalled();
  expect(screen.getByLabelText("构件详情")).not.toHaveAttribute("inert");
});
