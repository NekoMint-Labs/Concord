import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  Manager,
  Tab,
  Tabs,
  TextInput,
  type Grid,
  type Panel,
  type Toolbar,
} from "@thatopen/ui";
import { createRef } from "react";
import { findDonorControl } from "../../tests/donor-dom";
import { beforeAll, expect, it } from "vitest";
import {
  ThatOpenTextInput,
  ThatOpenTab,
  ThatOpenTabs,
  ThatOpenGrid,
  ThatOpenPanel,
  ThatOpenPanelSection,
  ThatOpenToolbar,
} from "./ThatOpenUI";

beforeAll(() => Manager.init("", false));

it("assigns real Lit properties and clears presentation values on rerender", async () => {
  const view = render(
    <>
      <ThatOpenPanel label="Review" headerHidden />
      <ThatOpenToolbar vertical aria-label="Actions">
        <button>Execute</button>
      </ThatOpenToolbar>
    </>,
  );
  const panel = view.container.querySelector<Panel>("bim-panel")!;
  const toolbar = view.container.querySelector<Toolbar>("bim-toolbar")!;
  await waitFor(() => expect(panel.headerHidden).toBe(true));
  expect(panel.label).toBe("Review");
  expect(toolbar.vertical).toBe(true);
  expect(toolbar.getAttribute("aria-label")).toBe("Actions");
  expect(panel.shadowRoot).not.toBeNull();
  view.rerender(
    <>
      <ThatOpenPanel />
      <ThatOpenToolbar>
        <button>Execute</button>
      </ThatOpenToolbar>
    </>,
  );
  await waitFor(() => expect(panel.headerHidden).toBe(false));
  expect(panel.label).toBe("");
  expect(toolbar.vertical).toBe(false);
});

it("lets Grid move named areas without remounting React state or losing events", async () => {
  const click = { count: 0 };
  const areas = {
    queue: <input aria-label="Queue filter" defaultValue="" />,
    context: <button onClick={() => click.count++}>Review action</button>,
  };
  const view = render(
    <ThatOpenGrid areas={areas} template={'"queue context" 1fr / 1fr 1fr'} />,
  );
  const grid = view.container.querySelector<Grid<["workspace"]>>("bim-grid")!;
  const input = await screen.findByRole("textbox", { name: "Queue filter" });
  fireEvent.change(input, { target: { value: "duct" } });
  await grid.updateComplete;
  input.focus();
  view.rerender(
    <ThatOpenGrid areas={areas} template={'"context queue" 1fr / 1fr 1fr'} />,
  );
  await grid.updateComplete;
  expect(screen.getByRole("textbox", { name: "Queue filter" })).toBe(input);
  expect(input).toHaveValue("duct");
  await waitFor(() => expect(input).toHaveFocus());
  fireEvent.click(screen.getByRole("button", { name: "Review action" }));
  expect(click.count).toBe(1);
  expect(grid.layout).toBe("workspace");
  expect(grid.style.gridTemplate).toContain("context queue");
});

it("dispatches React header actions before the donor collapse key handler", async () => {
  let selections = 0;
  const view = render(
    <ThatOpenPanelSection
      label="Sources"
      collapsed={false}
      headerActions={
        <button
          onKeyDown={(event) => {
            if (event.key === "Enter") selections++;
          }}
        >
          Source actions
        </button>
      }
    />,
  );
  const section = view.container.querySelector(
    "bim-panel-section",
  ) as HTMLElement & { collapsed: boolean; updateComplete: Promise<boolean> };
  await section.updateComplete;
  fireEvent.keyDown(screen.getByRole("button", { name: "Source actions" }), {
    key: "Enter",
  });
  expect(selections).toBe(1);
  expect(section.collapsed).toBe(false);
  const header = section.shadowRoot!.querySelector(".header")!;
  fireEvent.keyDown(header, { key: "Enter" });
  expect(section.collapsed).toBe(true);
});

it("keeps the live donor input controlled when consent resets before Lit commits", async () => {
  const ref = createRef<HTMLElement>();
  const inputs: string[] = [];
  const props = {
    ref,
    "aria-label": "Strong consent",
    value: "",
    maxLength: 500,
    onChange: (event: { target: { value: string } }) =>
      inputs.push(event.target.value),
  };
  const view = render(<ThatOpenTextInput {...props} />);
  const host = view.container.querySelector<TextInput>("bim-text-input")!;
  const input = await findDonorControl("textbox", "Strong consent");
  expect(host).toBeInstanceOf(TextInput);
  expect(ref.current).toBe(host);
  expect(host).not.toHaveAttribute("aria-label");
  await waitFor(() => expect(input).toHaveAttribute("maxlength", "500"));
  act(() => {
    fireEvent.input(input, { target: { value: "APPROVE R4" } });
    view.rerender(<ThatOpenTextInput {...props} />);
  });
  expect(inputs).toEqual(["APPROVE R4"]);
  await waitFor(() => expect(input).toHaveValue(""));
  view.rerender(<ThatOpenTextInput {...props} disabled readOnly />);
  await waitFor(() => expect(input).toBeDisabled());
  expect(input).toHaveAttribute("readonly");
  view.unmount();
  expect(ref.current).toBeNull();
});

it("keeps real tab instances, portal events and keyboard selection across label updates", async () => {
  const changes: (string | undefined)[] = [];
  let clicks = 0;
  const content = (label: string, tab: string) => (
    <ThatOpenTabs
      label="Work filter"
      tab={tab}
      onTabChange={(value) => changes.push(value)}
    >
      <ThatOpenTab name="all" label={label}>
        <button onClick={() => clicks++}>Portal action</button>
      </ThatOpenTab>
      <ThatOpenTab name="needs" label="Needs review" />
    </ThatOpenTabs>
  );
  const view = render(content("All", "all"));
  const host = view.container.querySelector<Tabs>("bim-tabs")!;
  await waitFor(() =>
    expect(host.shadowRoot?.querySelector('[role="tab"]')).not.toBeNull(),
  );
  const first = host.querySelector<Tab>("bim-tab")!;
  expect(host).toBeInstanceOf(Tabs);
  expect(first).toBeInstanceOf(Tab);
  fireEvent.click(screen.getByRole("button", { name: "Portal action" }));
  expect(clicks).toBe(1);
  const shadow = within(host.shadowRoot as unknown as HTMLElement);
  fireEvent.keyDown(shadow.getByRole("tab", { name: "All" }), {
    key: "ArrowRight",
  });
  await waitFor(() => expect(changes).toContain("needs"));
  view.rerender(content("All · 2", "needs"));
  await host.updateComplete;
  expect(host.querySelector("bim-tab")).toBe(first);
  expect(shadow.getByRole("tab", { name: "All · 2" })).toHaveAttribute(
    "aria-selected",
    "false",
  );
  expect(shadow.getByRole("tab", { name: "Needs review" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(first.hidden).toBe(true);
  view.unmount();
  expect(host.isConnected).toBe(false);
});
