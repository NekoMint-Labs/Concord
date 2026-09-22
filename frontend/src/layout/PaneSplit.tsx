import type { ReactNode } from "react";
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  usePanelRef,
  type LayoutStorage,
  type PanelImperativeHandle,
  type PanelProps,
  type SeparatorProps,
} from "react-resizable-panels";

/**
 * The handle that lets a product view drive one pane - today only the shell's
 * navigation column, which is collapsed and expanded from a button in its own
 * header rather than by dragging the divider.
 *
 * It is re-exported here rather than imported by the view so that this file
 * stays the product's only dependency on the layout library: the next migration
 * is then one file, not five call sites.
 */
export { usePanelRef, type PanelImperativeHandle };

/**
 * The one place Concord touches react-resizable-panels. Product views compose
 * `PaneSplit` / `Pane` / `PaneDivider` and never import the library, so defaults,
 * the separator's styling, keyboard behavior, and any future migration live here
 * instead of being re-decided three times.
 *
 * Two policies are set here rather than per view:
 *
 * - **Pixel floors.** Panes are declared in pixels (`defaultSize="264px"`,
 *   `minSize="200px"`) because the widths that matter are reading widths, not
 *   fractions. Percentages are still accepted; the pixel floor is the default
 *   for a pane that forgot to state one.
 *
 * Layout is never persisted to the backend. `persist` is opt-in, local-storage
 * only, and used for the splits that stay mounted (Documents, BIM); a split
 * containing a pane that mounts and unmounts (the Inspector) does not persist, so
 * it always opens at its designed size. A persisted layout records only what the
 * user set by hand (see the note on the save callback below).
 */
export function PaneSplit({
  id,
  persist = false,
  orientation = "horizontal",
  children,
}: {
  id: string;
  persist?: boolean;
  orientation?: "horizontal" | "vertical";
  children: ReactNode;
}) {
  /*
   * Only a layout the *user* set is remembered.
   *
   * The library stores a layout as percentages. When the window is made smaller,
   * the pixel floors in the layout (a 264px source list, a 240px Inspector) can no
   * longer be satisfied by the stored percentages, so the library re-normalizes
   * them for the narrower group - and persisting that re-normalized layout means
   * the next widening restores the *clamped* ratio rather than the width the user
   * chose. Each shrink/widen cycle therefore moved the source pane a little wider:
   * the ratchet reported from Windows.
   *
   * Ignoring every layout the library changed on its own (constraint recompute,
   * window resize, initial mount) is the fix, and it is the one the library's own
   * documentation points at. A stored-away value can still be re-constrained while
   * it is being restored; it simply cannot be written back as if the user had
   * asked for it.
   */
  const saved = useDefaultLayout({
    id,
    storage: layoutStorage,
    onlySaveAfterUserInteractions: true,
  });
  return (
    <Group
      id={id}
      className="pane-split"
      orientation={orientation}
      defaultLayout={persist ? saved.defaultLayout : undefined}
      onLayoutChanged={persist ? saved.onLayoutChanged : undefined}
    >
      {children}
    </Group>
  );
}

export function Pane({
  className,
  defaultSize,
  children,
  groupResizeBehavior,
  ...rest
}: PanelProps) {
  return (
    <Panel
      className={className ? `pane ${className}` : "pane"}
      /* A pane with no floor can be dragged to zero width and then looks like a
         rendering failure; 160px is the narrowest this product still reads at.
         Callers that know better state their own minimum. */
      minSize={rest.minSize ?? "160px"}
      defaultSize={defaultSize}
      /*
       * Pixels in, pixels out. A pane whose width was declared in pixels was
       * declared that way because the width *is* the value - a 264px object
       * browser, a 232px navigation column - so it keeps those pixels when the
       * window changes size instead of keeping its share of the window.
       *
       * That is the whole of the ratchet fix. The library's default,
       * `preserve-relative-size`, carries a *percentage* across a resize, and a
       * percentage is not what the user chose: at a narrow window the pane's
       * pixel floor and ceiling bind, the library re-normalizes the layout for
       * the narrower group, and the widened window then restores the clamped
       * ratio. Repeated width changes therefore walked the column wider - the
       * shell's navigation column ended up parked at its 320px ceiling. With
       * `preserve-pixel-size` the library recomputes the percentage that keeps
       * the pane's own pixel width, which is the user's intent restated at the
       * new group size.
       *
       * A pane that declared no pixel size stays relative, and that is required
       * rather than incidental: the group needs at least one relative pane to
       * absorb the difference, and "the work plane takes whatever is left" is
       * exactly the behaviour that pane should have.
       *
       * ponytail: the library recomputes the remembered pixel from the layout it
       * currently holds, so the one width it cannot bring back is one a real
       * constraint took away - a user who drags both the navigation column and a
       * local browser to their ceilings inside a window narrower than the shell
       * supports (measured: 760px window, 320px column, 410px browser -> the
       * browser settles at 278px and stays there). That window is below the floor
       * the shell itself declares, and at every supported size the pixel ceilings
       * never bind, so the intent is always restored. Upgrade path if that ever
       * matters: keep the last user-chosen pixel per panel from the Group's
       * `onLayoutChanged(layout, { isUserInteraction })` and re-apply it through
       * `groupRef.setLayout` once the group is wide enough again - one correction
       * per group size, guarded by the intent comparison so it cannot oscillate.
       */
      groupResizeBehavior={
        groupResizeBehavior ??
        (isPixelSize(defaultSize) ? "preserve-pixel-size" : undefined)
      }
      {...rest}
    >
      {children}
    </Panel>
  );
}

/**
 * Whether a panel size prop asks for a fixed number of pixels. The library reads
 * a number as pixels and a string with no unit as a percentage, so both spellings
 * have to be recognised here or the rule above would apply to only one of them.
 */
function isPixelSize(size: PanelProps["defaultSize"]) {
  return (
    typeof size === "number" ||
    (typeof size === "string" && size.trim().endsWith("px"))
  );
}

/** The pane edge, and the control that moves it. */
export function PaneDivider({
  label = "调整面板宽度",
  ...rest
}: SeparatorProps & { label?: string }) {
  return <Separator aria-label={label} className="pane-divider" {...rest} />;
}

/**
 * localStorage, and an in-memory equivalent when the WebView has storage
 * disabled. A thrown exception here would take the whole workspace down for a
 * remembered pane width, which is not a trade worth making.
 */
const memory = new Map<string, string>();
const layoutStorage: LayoutStorage = {
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return memory.get(key) ?? null;
    }
  },
  setItem(key, value) {
    memory.set(key, value);
    try {
      localStorage.setItem(key, value);
    } catch {
      /* memory already holds it for this session */
    }
  },
};
