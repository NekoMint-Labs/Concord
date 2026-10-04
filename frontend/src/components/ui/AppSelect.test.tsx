import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { Dropdown } from "@thatopen/ui";
import { vi } from "vitest";
import { expect, it } from "vitest";
import { AppSelect } from "./AppSelect";

const options = [
  { value: "design_revision", label: "设计修订" },
  { value: "workforce", label: "班组人员不足" },
  { value: "material", label: "材料不可用" },
];

it("maps the selected value and accessible name to the actual closed donor trigger", async () => {
  render(
    <AppSelect
      label="变更类型"
      value="design_revision"
      onChange={() => {}}
      options={options}
    />,
  );

  const host = document.querySelector<Dropdown>("bim-dropdown")!;
  expect(host).toBeInstanceOf(Dropdown);
  await host.updateComplete;
  const trigger = within(host.shadowRoot as unknown as HTMLElement).getByRole(
    "combobox",
    { name: "变更类型" },
  );
  await waitFor(() => expect(trigger).toHaveTextContent("设计修订"));
  expect(host).not.toHaveAttribute("role");
});

it("prevents disabled donor interaction and restores the trigger tab order when enabled", async () => {
  const change = vi.fn();
  const view = render(
    <AppSelect
      label="变更类型"
      value="design_revision"
      onChange={change}
      options={options}
      disabled
    />,
  );
  const host = document.querySelector<Dropdown>("bim-dropdown")!;
  await host.updateComplete;
  const trigger = within(host.shadowRoot as unknown as HTMLElement).getByRole(
    "combobox",
    { name: "变更类型" },
  );
  await waitFor(() => expect(trigger).toHaveAttribute("aria-disabled", "true"));
  expect(trigger.tabIndex).toBe(-1);
  fireEvent.click(trigger);
  fireEvent.keyDown(trigger, { key: "Enter" });
  expect(host.visible).toBe(false);
  host.value = ["material"];
  fireEvent.change(host);
  expect(change).not.toHaveBeenCalled();
  view.rerender(
    <AppSelect
      label="变更类型"
      value="design_revision"
      onChange={change}
      options={options}
    />,
  );
  await host.updateComplete;
  await waitFor(() => expect(trigger.tabIndex).toBe(0));
  host.value = ["material"];
  fireEvent.change(host);
  expect(change).toHaveBeenCalledWith("material");
});

it("keeps the controlled value when asynchronously supplied options are replaced", async () => {
  const change = vi.fn();
  const view = render(
    <AppSelect label="Area" value="east" options={[]} onChange={change} />,
  );
  const host = view.container.querySelector<Dropdown>("bim-dropdown")!;
  view.rerender(
    <AppSelect
      label="Area"
      value="east"
      options={[{ value: "east", label: "East wing" }]}
      onChange={change}
    />,
  );
  await waitFor(() => expect(host.value).toEqual(["east"]));
  await host.updateComplete;
  expect(host.shadowRoot!.querySelector('[role="combobox"]')).toHaveTextContent(
    "East wing",
  );
  view.rerender(
    <AppSelect
      label="Area"
      value="east"
      options={[
        { value: "west", label: "West wing" },
        { value: "east", label: "East wing" },
      ]}
      onChange={change}
    />,
  );
  await waitFor(() => expect(host.value).toEqual(["east"]));
  expect(change).not.toHaveBeenCalled();
});

it("restores the controlled selection when the real donor option toggles off on a repeated click", async () => {
  const change = vi.fn();
  const view = render(
    <AppSelect
      label="变更类型"
      value="design_revision"
      onChange={change}
      options={options}
    />,
  );
  const host = view.container.querySelector<Dropdown>("bim-dropdown")!;
  await waitFor(() => expect(host.value).toEqual(["design_revision"]));
  await host.updateComplete;
  const option =
    host.shadowRoot!.querySelector<HTMLElement>('[role="option"]')!;
  fireEvent.click(option);
  await host.updateComplete;
  expect(host.value).toEqual(["design_revision"]);
  expect(host.shadowRoot!.querySelector('[role="combobox"]')).toHaveTextContent(
    "设计修订",
  );
  expect(change).not.toHaveBeenCalled();
});
