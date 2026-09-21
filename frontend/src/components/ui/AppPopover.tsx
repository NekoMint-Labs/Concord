import * as Popover from "@radix-ui/react-popover";
import type { ReactElement, ReactNode } from "react";

/**
 * A floating surface anchored to the control that opened it, for content that is
 * too large for a tooltip and too transient for a pane - the run trace, for
 * example. Dismissal, focus return, and collision handling come from Radix; the
 * surface and its entry/exit animation come from `styles/ui.css`.
 */
export function AppPopover({
  trigger,
  label,
  children,
  align = "end",
  side = "top",
}: {
  trigger: ReactElement;
  label: string;
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="popover"
          aria-label={label}
          align={align}
          side={side}
          sideOffset={8}
          collisionPadding={10}
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function AppPopoverClose({ children }: { children: ReactElement }) {
  return <Popover.Close asChild>{children}</Popover.Close>;
}
