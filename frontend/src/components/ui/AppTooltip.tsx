import * as Tooltip from "@radix-ui/react-tooltip";
import type { ReactElement } from "react";

/**
 * Radix tooltip, wrapped once. Product code imports `AppTooltip` and never the
 * library, so swapping the primitive later is an edit here rather than an edit
 * in every view.
 *
 * A tooltip is allowed to repeat a control's accessible name and nothing else.
 * It is never the only place a piece of information exists: anything carrying
 * product meaning keeps a visible label, because a tooltip is unreachable by
 * touch and invisible in a screenshot.
 */

export function AppTooltip({
  label,
  side = "bottom",
  children,
}: {
  label: string;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactElement;
}) {
  return (
    /* The provider lives here rather than at the app root: a tooltip that only
       works when some ancestor remembered to provide for it is a trap for the
       next component that wants one. */
    <Tooltip.Provider delayDuration={450} skipDelayDuration={400}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="tooltip"
            side={side}
            sideOffset={6}
            collisionPadding={8}
          >
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
