import { createElement, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { Dropdown } from "@thatopen/ui";

const optionText = (value: ReactNode): string => {
  if (value == null || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (Array.isArray(value)) return value.map(optionText).join("");
  if (typeof value === "object" && "props" in value)
    return optionText(
      (value as { props?: { children?: ReactNode } }).props?.children,
    );
  return "";
};

/** A single-value adapter over the donor dropdown's array-valued API. */
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
  const ref = useRef<Dropdown>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    const handleChange = () => {
      const next = host.value?.[0];
      // Donor options toggle off on a second click; this adapter has no empty state.
      if (next === undefined) {
        host.value = [value];
        return;
      }
      if (!disabled && String(next) !== value) onChange(String(next));
    };
    host.addEventListener("change", handleChange);
    return () => host.removeEventListener("change", handleChange);
  }, [onChange, value, disabled]);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    if (disabled) host.visible = false;
    let current = true;
    // New options must finish reflecting before the donor syncs selection.
    void Promise.all(
      Array.from(
        host.children,
        (option) =>
          (option as HTMLElement & { updateComplete: Promise<boolean> })
            .updateComplete,
      ),
    ).then(async () => {
      if (!current) return;
      host.value = [value];
      await host.updateComplete;
      if (!current) return;
      const trigger =
        host.shadowRoot?.querySelector<HTMLElement>('[role="combobox"]');
      trigger?.setAttribute("aria-disabled", String(!!disabled));
      if (trigger) trigger.tabIndex = disabled ? -1 : 0;
    });
    const suppress = (event: Event) => {
      if (!disabled) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    for (const name of ["click", "pointerdown", "keydown"])
      host.addEventListener(name, suppress, true);
    return () => {
      current = false;
      for (const name of ["click", "pointerdown", "keydown"])
        host.removeEventListener(name, suppress, true);
    };
  }, [value, disabled, options]);
  return createElement(
    "bim-dropdown",
    {
      ref,
      label,

      className,
    },
    [
      ...options.map((option) =>
        createElement("bim-option", {
          key: option.value,
          value: option.value,
          label: `${optionText(option.label)}${option.hint === undefined ? "" : ` · ${optionText(option.hint)}`}`,
        }),
      ),
    ],
  );
}
