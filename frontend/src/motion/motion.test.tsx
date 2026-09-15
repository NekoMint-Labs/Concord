import { render, screen } from "@testing-library/react";
import { motion } from "motion/react";
import { expect, it } from "vitest";
import { duration, easeOut, motionPresets, useMotion } from "./index";

/**
 * The motion layer's contract, without a product surface attached.
 *
 * The preset decision is pure, so both branches are checked directly. Framing it
 * that way is deliberate: the animation library resolves the user's preference
 * once per process and jsdom has no frame loop, so a rendered assertion about an
 * animation completing would be testing the harness rather than the product.
 */
function Probe() {
  const { transition, variants } = useMotion();
  return (
    <motion.div
      data-testid="probe"
      variants={variants.paneEnter}
      initial="hidden"
      animate="visible"
      transition={transition()}
    >
      content
    </motion.div>
  );
}

it("reduced motion states no animation at all", () => {
  const { transition, variants } = motionPresets(true);
  // No duration, and no transform or opacity on any variant: a state change
  // happens in place, which is the point of honouring the preference.
  expect(transition().duration).toBe(0);
  expect(variants.paneEnter.hidden).toEqual({});
  expect(variants.detailSwap.hidden).toEqual({});
  expect(variants.recordEnter.hidden).toEqual({});
  expect(variants.disclosure.hidden).toEqual({});
  expect(variants.paneEnter).toHaveProperty("exit");
});

it("the ordinary path keeps one pane offset, one fade, one settle, and one expansion", () => {
  const { transition, variants } = motionPresets(false);
  // A docked pane states which edge it belongs to and nothing more: the offset is
  // the width of a pane's own inset, not a page transition.
  expect(variants.paneEnter.hidden).toMatchObject({ opacity: 0, x: 8 });
  expect(variants.paneEnter.visible).toMatchObject({ opacity: 1, x: 0 });
  // The detail swap fades and settles by 4px - the same magnitude the record
  // settle uses. A reader who is already looking at this part of the page is being
  // told what it says has changed, and a larger offset would start to read as
  // navigation.
  expect(variants.detailSwap.hidden).toEqual({ opacity: 0, y: 4 });
  expect(variants.detailSwap.visible).toEqual({ opacity: 1, y: 0 });
  // A record whose state changed settles rather than enters: the reader is
  // already looking at it, so the offset is small and the fade does the work.
  expect(variants.recordEnter.hidden).toEqual({ opacity: 0, y: 4 });
  // A disclosure expands to its content's own height, so nothing has to measure it.
  expect(variants.disclosure.hidden).toEqual({ opacity: 0, height: 0 });
  expect(variants.disclosure.visible).toEqual({ opacity: 1, height: "auto" });
  expect(transition("instant").duration).toBe(duration.instant);
  expect(transition().ease).toBe(easeOut);
  expect(duration.instant).toBeLessThan(duration.fast);
  expect(duration.fast).toBeLessThan(duration.normal);
  expect(duration.normal).toBeLessThanOrEqual(0.2);
});

it("a reduced-motion render leaves the content readable and unshifted", () => {
  // The suite's default environment is the reduced path (see src/test-setup.ts),
  // so this is what most of the product tests exercise: no inline animation
  // state, and text that is present rather than mid-fade.
  const probe = render(<Probe />).getByTestId("probe");
  expect(screen.getByText("content")).toBeVisible();
  expect(probe.style.opacity).toBe("");
  expect(probe.style.transform).toBe("");
});
