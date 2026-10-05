import { fireEvent, render, waitFor } from "@testing-library/react";
import { Button as DonorButton } from "@thatopen/ui";
import { expect, it, vi } from "vitest";
import { Button } from "./button";

it("uses the registered donor button and its real keyboard activation", async () => {
  const click = vi.fn();
  const view = render(<Button onClick={click}>Open receipt</Button>);
  const button = view.container.querySelector<DonorButton>("bim-button")!;
  expect(button).toBeInstanceOf(DonorButton);
  await button.updateComplete;
  expect(button.shadowRoot?.textContent).toContain("Open receipt");
  expect(button).toHaveAttribute("role", "button");
  fireEvent.keyDown(button, { key: "Enter" });
  expect(click).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(button, { key: " " });
  expect(click).toHaveBeenCalledTimes(2);
  view.rerender(
    <Button disabled onClick={click}>
      Open receipt
    </Button>,
  );
  await waitFor(() => expect(button.disabled).toBe(true));
  expect(button).toHaveAttribute("aria-disabled", "true");
  fireEvent.keyDown(button, { key: "Enter" });
  fireEvent.click(button);
  expect(click).toHaveBeenCalledTimes(2);
});

it("retains the native form submitter and validation instead of emulating requestSubmit", () => {
  const submit = vi.fn((event: React.FormEvent<HTMLFormElement>) =>
    event.preventDefault(),
  );
  const view = render(
    <form onSubmit={submit}>
      <label>
        Project name
        <input name="project" required />
      </label>
      <Button type="submit" name="action" value="create">
        Create project
      </Button>
    </form>,
  );
  const button = view.container.querySelector<HTMLButtonElement>(
    "button[type=submit]",
  )!;
  expect(button).toBeInstanceOf(HTMLButtonElement);
  expect(button.form).toBe(view.container.querySelector("form"));
  fireEvent.click(button);
  expect(submit).not.toHaveBeenCalled();
  fireEvent.input(view.container.querySelector("input")!, {
    target: { value: "Harbor" },
  });
  fireEvent.click(button);
  expect(submit).toHaveBeenCalledTimes(1);
  expect((submit.mock.calls[0][0].nativeEvent as SubmitEvent).submitter).toBe(
    button,
  );
});

it("keeps slotted React content clickable and disabled actions outside the tab order", async () => {
  const click = vi.fn();
  const doubleClick = vi.fn();
  const view = render(
    <Button onClick={click} onDoubleClick={doubleClick} tabIndex={2}>
      <span>Open</span>
      <span>receipt</span>
    </Button>,
  );
  const button = view.container.querySelector<DonorButton>("bim-button")!;
  await waitFor(() =>
    expect(button.querySelector('[slot="react-content"]')).not.toBeNull(),
  );
  const content = button.querySelector('[slot="react-content"]')!;
  const slot = button.shadowRoot!.querySelector<HTMLSlotElement>(
    'bim-label slot[name="react-content"]',
  )!;
  expect(slot.assignedElements()).toEqual([content]);
  expect(button).toHaveAccessibleName("Open receipt");
  expect(button.childNodes).toHaveLength(1);
  expect(button.shadowRoot!.querySelector(".button")).not.toBeNull();
  expect(button.style.pointerEvents).toBe("auto");
  fireEvent.click(content);
  expect(click).toHaveBeenCalledTimes(1);
  fireEvent.doubleClick(button);
  expect(doubleClick).toHaveBeenCalledTimes(1);
  view.rerender(
    <Button disabled onClick={click} tabIndex={2}>
      <span>Open</span>
      <span>receipt</span>
    </Button>,
  );
  expect(button.tabIndex).toBe(-1);
  expect(button.style.pointerEvents).toBe("none");
  fireEvent.click(content);
  expect(click).toHaveBeenCalledTimes(1);
});

it("renders compound text through the donor label rather than an empty shadow action", async () => {
  const view = render(<Button>显示更多 · {12} 项</Button>);
  const button = view.container.querySelector<DonorButton>("bim-button")!;
  await button.updateComplete;
  expect(button.label).toBe("显示更多 · 12 项");
  expect(button.shadowRoot?.textContent).toContain("显示更多 · 12 项");
  expect(button.childNodes).toHaveLength(0);
});

it("lets React consumers prevent donor keyboard activation before it fires", async () => {
  const click = vi.fn();
  const key = vi.fn((event: React.KeyboardEvent<HTMLButtonElement>) =>
    event.preventDefault(),
  );
  const view = render(
    <Button onKeyDown={key} onClick={click}>
      Open menu
    </Button>,
  );
  const button = view.container.querySelector<DonorButton>("bim-button")!;
  await button.updateComplete;
  fireEvent.keyDown(button, { key: "Enter" });
  expect(key).toHaveBeenCalledTimes(1);
  expect(click).not.toHaveBeenCalled();
});

it("resets donor label nowrap inheritance for complex, multiline React content", async () => {
  const view = render(
    <Button>
      <span>
        First line
        <br />
        Second line
      </span>
    </Button>,
  );
  const button = view.container.querySelector<DonorButton>("bim-button")!;
  await waitFor(() =>
    expect(button.querySelector('[slot="react-content"]')).not.toBeNull(),
  );
  const content = button.querySelector<HTMLElement>('[slot="react-content"]')!;
  expect(content.style.whiteSpace).toBe("normal");
  expect(content.querySelector("br")).not.toBeNull();
  expect(button).toHaveAccessibleName("First line Second line");
});
