import * as React from "react";
import { createPortal } from "react-dom";
import { Button as BimButton } from "@thatopen/ui";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

const variants = cva("button", {
  variants: {
    variant: {
      default: "button-primary",
      secondary: "button-secondary",
      ghost: "button-ghost",
      danger: "button-danger",
    },
    size: { default: "", sm: "button-sm" },
  },
  defaultVariants: { variant: "default", size: "default" },
});

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof variants> & { asChild?: boolean };

const childText = (value: React.ReactNode): string => {
  if (value == null || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (Array.isArray(value)) return value.map(childText).join(" ");
  if (React.isValidElement(value))
    return childText((value.props as { children?: React.ReactNode }).children);
  return "";
};

const DonorAction = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { children, className, variant, size, disabled, ...props },
    forwardedRef,
  ) => {
    // The donor constructor sets role/tabindex. Direct construction avoids the
    // createElement constructor-attribute restriction, without mocking the donor.
    const [element] = React.useState(() => new BimButton());
    const mount = React.useRef<HTMLSpanElement>(null);
    const [labelHost, setLabelHost] = React.useState<HTMLElement | null>(null);
    const simple = !React.Children.toArray(children).some(React.isValidElement);
    React.useLayoutEffect(() => {
      mount.current!.before(element);
      return () => element.remove();
    }, [element]);
    React.useImperativeHandle(
      forwardedRef,
      () => element as unknown as HTMLButtonElement,
      [element],
    );
    React.useLayoutEffect(() => {
      const text = childText(children).replace(/\s+/g, " ").trim();
      element.className = twMerge(clsx(variants({ variant, size }), className));
      element.disabled = !!disabled;
      // Donor hosts disable pointer events because their shadow button is the
      // hit target. React's supported slotted content also needs a host target.
      element.style.pointerEvents = disabled ? "none" : "auto";
      element.tabIndex = disabled ? -1 : (props.tabIndex ?? 0);
      element.ghost = variant === "ghost";
      element.active =
        props["aria-pressed"] === true ||
        props["aria-pressed"] === "true" ||
        props["aria-current"] === "page";
      // A named slot puts complex content inside the real donor hit surface
      // while keeping React/domain content in light DOM where its CSS applies.
      element.label = simple ? text : "\u200b";
      let current = true;
      void element.updateComplete.then(() => {
        if (current)
          setLabelHost(
            simple
              ? null
              : element.shadowRoot!.querySelector<HTMLElement>("bim-label"),
          );
      });
      element.labelHidden = false;
      element.setAttribute("aria-label", props["aria-label"] ?? text);
      if (disabled) element.setAttribute("aria-disabled", "true");
      else element.removeAttribute("aria-disabled");
      const cleanups: (() => void)[] = [];
      for (const [key, value] of Object.entries(props)) {
        if (/^on[A-Z]/.test(key) && typeof value === "function") {
          // React consumers (including Radix) must see keyboard activation
          // before the donor prevents its default Enter/Space behavior.
          const capture = key.endsWith("Capture") || key === "onKeyDown";
          const eventName = key.startsWith("onDoubleClick")
            ? "dblclick"
            : key
                .slice(2)
                .replace(/Capture$/, "")
                .toLowerCase();
          const listener = (event: Event) => {
            if (!disabled) value(event);
            if (event.type === "keydown" && event.defaultPrevented)
              event.stopImmediatePropagation();
          };
          element.addEventListener(eventName, listener, capture);
          cleanups.push(() =>
            element.removeEventListener(eventName, listener, capture),
          );
        } else if (key === "style" && value) {
          Object.assign(element.style, value);
          cleanups.push(() => element.removeAttribute("style"));
        } else if (
          value !== undefined &&
          key !== "aria-label" &&
          key !== "tabIndex"
        ) {
          const attribute = key;
          element.setAttribute(attribute, String(value));
          cleanups.push(() => element.removeAttribute(attribute));
        }
      }
      return () => {
        current = false;
        cleanups.forEach((cleanup) => cleanup());
      };
    }, [children, className, disabled, element, props, simple, size, variant]);
    return (
      <span ref={mount} style={{ display: "none" }}>
        {!simple &&
          labelHost &&
          createPortal(<slot name="react-content" />, labelHost)}
        {!simple &&
          labelHost &&
          createPortal(
            <span
              slot="react-content"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--bim-ui_size-2xs)",
                minWidth: 0,
                whiteSpace: "normal",
              }}
            >
              {children}
            </span>,
            element,
          )}
      </span>
    );
  },
);

/** Donor ordinary actions; native form-associated buttons retain browser semantics. */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild, type = "button", className, variant, size, ...props }, ref) => {
    const classes = twMerge(clsx(variants({ variant, size }), className));
    if (asChild) return <Slot ref={ref} className={classes} {...props} />;
    if (type !== "button" || props.form || props.name)
      return <button ref={ref} type={type} className={classes} {...props} />;
    return (
      <DonorAction
        ref={ref}
        type={type}
        className={className}
        variant={variant}
        size={size}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
