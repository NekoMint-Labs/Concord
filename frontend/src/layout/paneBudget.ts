import { useEffect, useState } from "react";

/**
 * The pane budget.
 *
 * A four-column layout that technically does not overflow is still a broken
 * layout if what remains is unreadable, so the workspace states how many panes it
 * is willing to show and something has to yield:
 *
 * - the Inspector is what the user just opened, so it always wins the column;
 * - below 1280px the nested list (a source list, an element list) yields that
 *   column and is reached as a menu in the reading pane's own header instead;
 * - the app sidebar is never collapsed, because navigating between work packages
 *   is the one thing every screen needs.
 *
 * 1280 is the owner's boundary, and it is kept: above it the workspace is
 * sidebar + primary workspace + optional Inspector, below it the nested list
 * yields rather than producing a fourth column. What the boundary does *not* do
 * is guarantee that the pane which survives is wide enough for its own
 * composition - at 1280 the reading surface is roughly 430px, and a 156px
 * metadata gutter inside a 430px pane would be a caption that had eaten its
 * subject. That is a question about the reading surface, not about pane policy,
 * so it is answered there: the evidence sheet collapses its gutter with a
 * container query on its own width (styles/features/documents.css). Pane policy
 * decides how many panes; each surface decides how it degrades once it has one.
 *
 * Layout policy only: nothing here is persisted, and nothing leaves the client.
 */
export type PaneTier = "wide" | "medium" | "compact";

/**
 * The narrowest window that keeps the sidebar, the nested list, and the Inspector
 * at once. At or above it no pane yields; below it the nested list does.
 */
export const FOUR_COLUMN_FLOOR = 1280;

/** The Inspector's designed width, and the width it opens at when space is tight. */
export const INSPECTOR_WIDTH = 336;
export const INSPECTOR_WIDTH_TIGHT = 300;

export function paneTierFor(width: number): PaneTier {
  if (width >= FOUR_COLUMN_FLOOR) return "wide";
  if (width >= 960) return "medium";
  return "compact";
}

export function usePaneWidth(): number {
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? FOUR_COLUMN_FLOOR : window.innerWidth,
  );
  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return width;
}

/**
 * Whether a workspace should show its secondary list as a pane or hand that
 * column to the Inspector. Exported as a rule rather than inlined at the call
 * site so the two workspaces cannot answer it differently.
 */
export function condensedFor(width: number, inspectorOpen: boolean): boolean {
  return inspectorOpen && width < FOUR_COLUMN_FLOOR;
}

/** The Inspector's opening width for a given window. */
export function inspectorWidthFor(width: number): string {
  return width >= FOUR_COLUMN_FLOOR
    ? `${INSPECTOR_WIDTH}px`
    : `${INSPECTOR_WIDTH_TIGHT}px`;
}
