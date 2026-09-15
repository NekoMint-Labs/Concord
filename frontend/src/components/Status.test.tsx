import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Status, statusLabel } from "./Status";

/**
 * The chip is the one place a domain state becomes a word, and the defect this
 * pass fixed was a chip that announced the machine value it was derived from
 * instead of the word.
 */
it("states a status in the product's language", () => {
  render(<Status value="WAITING_APPROVAL" />);

  const chip = screen.getByText("等待批准");
  expect(chip).toBeVisible();
  // The raw value stays on the element for anything that needs the state rather
  // than the word, and it is no longer the accessible name: a screen reader reads
  // the same word the eye does.
  expect(chip).toHaveAttribute("data-status", "WAITING_APPROVAL");
  expect(chip).not.toHaveAttribute("aria-label");
});

it("earns the exception surface only for states that are exceptional", () => {
  const { container: blocked } = render(<Status value="BLOCKED" />);
  expect(blocked.querySelector(".status")).toHaveClass("status-blocked");

  const { container: ready } = render(<Status value="READY" />);
  expect(ready.querySelector(".status")).toHaveClass("status-ready");

  const { container: neutral } = render(<Status value="QUEUED" />);
  expect(neutral.querySelector(".status")).toHaveClass("status-neutral");
});

it("falls back to the identifier rather than to a guess", () => {
  expect(statusLabel("READY")).toBe("就绪");
  expect(statusLabel("NO RUN")).toBe("未开始");
  expect(statusLabel("INVENTED")).toBe("INVENTED");
});
