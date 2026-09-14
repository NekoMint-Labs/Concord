import type { ReactNode } from "react";
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  type LayoutStorage,
  type PanelProps,
  type SeparatorProps,
} from "react-resizable-panels";

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
 * containing a pane that mounts and unmounts (the Inspector) does not persist,
 * so it always opens at its designed size.
 */
export function PaneSplit({
  id,
  persist = false,
  children,
}: {
  id: string;
  persist?: boolean;
  children: ReactNode;
}) {
  const saved = useDefaultLayout({ id, storage: layoutStorage });
  return (
    <Group
      id={id}
      className="pane-split"
      defaultLayout={persist ? saved.defaultLayout : undefined}
      onLayoutChanged={persist ? saved.onLayoutChanged : undefined}
    >
      {children}
    </Group>
  );
}

export function Pane({ className, children, ...rest }: PanelProps) {
  return (
    <Panel
      className={className ? `pane ${className}` : "pane"}
      /* A pane with no floor can be dragged to zero width and then looks like a
         rendering failure; 160px is the narrowest this product still reads at.
         Callers that know better state their own minimum. */
      minSize={rest.minSize ?? "160px"}
      {...rest}
    >
      {children}
    </Panel>
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
