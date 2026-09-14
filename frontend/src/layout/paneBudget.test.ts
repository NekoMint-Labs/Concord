import { expect, it } from "vitest";
import {
  FOUR_COLUMN_FLOOR,
  condensedFor,
  inspectorWidthFor,
  paneTierFor,
} from "./paneBudget";

/**
 * The pane budget is the one piece of this product's visual language that cannot
 * be seen at a fixed screenshot size: it only exists at the widths where a
 * four-column arrangement stops being readable. It is pure, so it is asserted
 * rather than eyeballed.
 */
it("yields the nested list to the Inspector below the floor", () => {
  // 1280 is the owner's boundary, and it is also a common laptop width and the
  // browser test viewport - which is exactly why it has to be asserted: a change
  // here silently changes what the primary workspace shows on the narrowest
  // "wide" window.
  expect(condensedFor(1279, true)).toBe(true);
  expect(condensedFor(1100, true)).toBe(true);
  expect(condensedFor(860, true)).toBe(true);
  expect(condensedFor(FOUR_COLUMN_FLOOR, true)).toBe(false);
  expect(condensedFor(1920, true)).toBe(false);
});

it("never yields anything the Inspector is not competing with", () => {
  // Without the Inspector the nested split *is* the primary workspace, so a
  // two-pane view is always allowed - including at 860, where the owner asked for
  // exactly that.
  for (const width of [860, 960, 1100, 1280, 1440, 1920]) {
    expect(condensedFor(width, false)).toBe(false);
  }
});

it("gives the Inspector its designed width only when there is room", () => {
  // The Inspector is the pane that never yields, so it is also the pane that has
  // to shrink first on a constrained window rather than taking 336px out of the
  // reading surface.
  expect(inspectorWidthFor(1920)).toBe("336px");
  expect(inspectorWidthFor(1280)).toBe("336px");
  expect(inspectorWidthFor(1279)).toBe("300px");
  expect(inspectorWidthFor(860)).toBe("300px");
});

it("the tier still reports the shell's own breakpoints", () => {
  // A separate question from the pane budget: the tier decides which register a
  // window is in, and it shares the numbers the shell uses for its own widths.
  expect(paneTierFor(1920)).toBe("wide");
  expect(paneTierFor(1280)).toBe("wide");
  expect(paneTierFor(1279)).toBe("medium");
  expect(paneTierFor(960)).toBe("medium");
  expect(paneTierFor(959)).toBe("compact");
});
