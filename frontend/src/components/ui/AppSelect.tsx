import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { icon } from "./icon";

/**
 * A Concord select. It replaces the native `<select>` wherever the platform's
 * own popup would leave the designed surface and open a full-window operating
 * system list instead - on desktop that popup is the single largest piece of a
 * different control language showing through the product, and it cannot be
 * styled at all.
 *
 * Radix supplies every part of the behaviour this control needs and none of the
 * parts that would have to be guessed at: the roving focus, the type-ahead, the
 * focus restoration on close, the dismissal, the Escape handling, and the
 * `aria` listbox wiring. This wrapper owns only the two things Radix does not:
 * the Concord trigger, which takes the shared control metrics so it sits beside
 * a text field as the same object, and the floating surface, which reuses the
 * menu's surface grammar so a dropdown and a menu are one family
 * (frontend/src/styles/ui.css).
 *
 * `label` is the control's accessible name, not a rendered caption: the owning
 * form draws its own visible label, and a control that announces a second copy
 * of it is a control with two names. `options` carry the submitted `value`, the
 * visible `label`, and an optional right-aligned `hint` - the support column a
 * list row would have carried (a run's short id beside its category and status).
 */
export function AppSelect({
  label,
  value,
  onChange,
  options,
  disabled,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: ReactNode; hint?: ReactNode }[];
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select.Root value={value} onValueChange={onChange} disabled={disabled}>
      <Select.Trigger
        className={
          className ? `app-select-trigger ${className}` : "app-select-trigger"
        }
        aria-label={label}
      >
        <Select.Value className="app-select-value" />
        <Select.Icon className="app-select-chevron">
          <ChevronDown {...icon} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="app-select-content"
          position="popper"
          align="start"
          side="bottom"
          sideOffset={6}
          collisionPadding={8}
        >
          <Select.Viewport className="app-select-viewport">
            {options.map((option) => (
              <Select.Item
                key={option.value}
                value={option.value}
                className="app-select-item"
              >
                {/* the indicator renders only when the item is checked, so the
                    gutter is a fixed-width slot rather than the mark itself -
                    otherwise every label would shift when the selection moves */}
                <span className="app-select-check">
                  <Select.ItemIndicator>
                    <Check {...icon} />
                  </Select.ItemIndicator>
                </span>
                <Select.ItemText className="app-select-item-label">
                  {option.label}
                </Select.ItemText>
                {option.hint !== undefined && (
                  <span className="app-select-item-hint">{option.hint}</span>
                )}
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
