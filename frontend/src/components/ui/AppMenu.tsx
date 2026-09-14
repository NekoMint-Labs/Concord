import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";

/**
 * The application menu. It replaces the `<details>` disclosures the shell used
 * to open: those dismissed on a second click of their own summary and on nothing
 * else, so a menu stayed open behind a click on the workspace, Escape did
 * nothing, and arrow keys did not move through the items.
 *
 * Radix supplies the dismissal, the roving focus, the type-ahead, and the
 * aria-menu wiring; the classes in `frontend/src/styles/ui.css` supply Concord's
 * surface, and the entry/exit animation is CSS keyed off `data-state` so the
 * library can hold the element until its exit finishes.
 *
 * The trigger is the quiet chrome object by default, and a caller that needs a
 * wider control (the project picker) passes its own `trigger` content and class.
 * The label stays the accessible name in both cases, so a menu whose visible
 * text is a project name is still announced as the project picker.
 */
export function AppMenu({
  label,
  children,
  align = "end",
  side = "bottom",
  className,
  trigger,
  triggerClassName = "quiet-trigger",
}: {
  label: string;
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
  trigger?: ReactNode;
  triggerClassName?: string;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={
          className ? `${triggerClassName} ${className}` : triggerClassName
        }
        aria-label={label}
      >
        {trigger ?? label}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="menu-content"
          align={align}
          side={side}
          sideOffset={6}
          collisionPadding={8}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function AppMenuLabel({ children }: { children: ReactNode }) {
  return (
    <DropdownMenu.Label className="menu-label">{children}</DropdownMenu.Label>
  );
}

/**
 * A group boundary. A menu that lists one kind of thing needs no grouping; a
 * menu that lists destinations plus a destructive reset does, and a rule is the
 * one place in this product where a line is still the right answer, because it
 * separates two sets rather than two regions.
 */
export function AppMenuSeparator() {
  return <DropdownMenu.Separator className="menu-separator" />;
}

/**
 * Items use `onSelect` rather than `onClick` so a keyboard selection and a
 * pointer selection are the same event.
 *
 * `active` marks the current view or the current object and states that to
 * assistive technology as well as to the eye, so a secondary view carries the
 * same "where am I" answer the primary tab strip gives with `aria-current`.
 *
 * `hint` is the right-aligned support column: the second line of a list row
 * (a BIM element's type and storey, a source's parser) when the same objects are
 * reached as a menu instead of as a pane.
 *
 * `danger` marks an item whose effect cannot be undone from the menu itself.
 * The colour is the exception colour and not decoration: it is the only signal
 * in a list of otherwise equal items.
 */
export function AppMenuItem({
  children,
  onSelect,
  disabled,
  active = false,
  hint,
  danger = false,
}: {
  children: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  active?: boolean;
  hint?: ReactNode;
  danger?: boolean;
}) {
  return (
    <DropdownMenu.Item
      className={`menu-item${active ? " active" : ""}${danger ? " is-danger" : ""}`}
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      onSelect={onSelect}
    >
      <span className="menu-item-label">{children}</span>
      {hint !== undefined && <span className="menu-item-hint">{hint}</span>}
    </DropdownMenu.Item>
  );
}
