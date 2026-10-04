import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReactNode, Ref } from "react";
import { ThatOpenPanel } from "../ThatOpenUI";
import { Button } from "./button";

/** Radix retains application-menu dismissal, typeahead and focus restoration. */
export function AppMenu({
  label,
  children,
  align = "end",
  side = "bottom",
  className,
  trigger,
  triggerClassName = "quiet-trigger",
  triggerRef,
}: {
  label: string;
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
  trigger?: ReactNode;
  triggerClassName?: string;
  triggerRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          className={[triggerClassName, className].filter(Boolean).join(" ")}
          aria-label={label}
        >
          {trigger ?? label}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="menu-content"
          align={align}
          side={side}
          sideOffset={6}
          collisionPadding={8}
        >
          <ThatOpenPanel headerHidden>{children}</ThatOpenPanel>
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

export function AppMenuSeparator() {
  return <DropdownMenu.Separator className="menu-separator" />;
}

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
    <DropdownMenu.Item asChild disabled={disabled} onSelect={onSelect}>
      <Button
        variant="secondary"
        disabled={disabled}
        className={`menu-item${active ? " active" : ""}${danger ? " is-danger" : ""}`}
        aria-current={active ? "true" : undefined}
      >
        <span className="menu-item-label">{children}</span>
        {hint !== undefined && <span className="menu-item-hint">{hint}</span>}
      </Button>
    </DropdownMenu.Item>
  );
}
