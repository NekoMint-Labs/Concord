import type { LucideProps } from "lucide-react";

/**
 * The one Concord icon grammar, spread onto every functional icon:
 *
 *     <Search {...icon} />
 *
 * **Icons represent functions. Text represents content.** An icon marks a thing
 * the user can *do* - search, import, open, collapse, close, disclose, record -
 * and never a thing the user is *reading*. A work package, an area, a BIM
 * element, a document and an engineering value are all reached by their own text
 * and get no icon at all, because an icon repeated down every row of a list is
 * decoration: it adds a column of marks that says the same thing in every row and
 * competes with the one row the user is actually looking for.
 *
 * The stroke is lighter than the library's own 2 because these icons sit beside
 * 13px text on a light plane, where a 2px stroke is the heaviest mark in the row.
 * At 1.6 an icon occupies no more visual weight than the label next to it, which
 * is the point: it is a navigation cue, not an illustration.
 *
 * Two values, one owner. A third size (or a per-feature stroke) is how an icon
 * set turns back into decoration, so the single documented exception is a
 * chevron or arrow that sits *inside* a line of text, which takes the same
 * stroke at 13px: `{...icon, size: 13}`. Everything else is 15.
 *
 * The colour is not set here: every icon inherits `currentColor`, so the control
 * that owns it decides. Functional chrome rests in the secondary ink and moves to
 * the stronger foreground on hover and while open.
 *
 * `aria-hidden` is part of the grammar rather than a prop at each call site,
 * because it follows from the rule at the top of this file: an icon never carries
 * meaning on its own. The control it sits in carries the name - a visible label
 * where there is room for one, an `aria-label` plus a tooltip where there is not.
 * An icon that is announced separately from its own label is a second name for
 * the same action.
 */
export const icon: Pick<LucideProps, "size" | "strokeWidth" | "aria-hidden"> = {
  size: 15,
  strokeWidth: 1.6,
  "aria-hidden": true,
};
