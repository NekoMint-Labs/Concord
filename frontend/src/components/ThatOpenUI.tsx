import {
  createElement,
  forwardRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  Children,
  isValidElement,
  type ReactElement,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { Tab as BimTab, type Grid } from "@thatopen/ui";

// Thin React bindings: the Lit custom elements remain the owner of their
// structure, focus behavior, and tonal surfaces. React only supplies content
// and assigns the donor's property-based APIs.
type DonorElement = HTMLElement & Record<string, unknown>;

type CommonProps = {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
};

type InputProps = CommonProps & {
  value?: string;
  defaultValue?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onInput?: (event: ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  rows?: number;
};

function setNativeInputState(host: DonorElement, props: InputProps) {
  const input = host.shadowRoot?.querySelector<
    HTMLInputElement | HTMLTextAreaElement
  >("input, textarea");
  if (!input) return;
  // Lit caches its last rendered value. A typed value can be reset before that
  // render commits, so enforce React's controlled value on the live input too.
  if (props.value !== undefined && input.value !== props.value)
    input.value = props.value;
  if (props.min !== undefined && "min" in input) input.min = String(props.min);
  if (props.max !== undefined && "max" in input) input.max = String(props.max);
  if (props.step !== undefined && "step" in input)
    input.step = String(props.step);
  if (props.maxLength !== undefined) input.maxLength = props.maxLength;
  input.readOnly = !!props.readOnly;
  input.required = !!props.required;
  input.disabled = !!props.disabled;
  if (props.autoFocus) input.focus();
}

/** Controlled donor inputs for non-form UI. Form-associated fields stay native. */
export const ThatOpenTextInput = forwardRef<HTMLElement, InputProps>(
  function ThatOpenTextInput(props, forwardedRef: Ref<HTMLElement>) {
    const ref = useRef<DonorElement>(null);
    const type = props.type === "number" ? "number" : (props.type ?? "text");
    const tag = type === "number" ? "bim-number-input" : "bim-text-input";
    const value = props.value ?? props.defaultValue ?? "";
    const properties = useMemo(
      () => ({
        value: type === "number" ? Number(value || 0) : value,
        type: type === "number" ? undefined : type,
        label: props["aria-label"] ?? "",
        placeholder: props.placeholder,
        disabled: props.disabled ?? false,
        rows: props.rows,
        min: props.min === undefined ? undefined : Number(props.min),
        max: props.max === undefined ? undefined : Number(props.max),
        step: props.step === undefined ? undefined : Number(props.step),
      }),
      [props, type, value],
    );
    useDonorProperties(ref, properties);
    useEffect(() => {
      const host = ref.current;
      if (!host) return;
      let current = true;
      const applyNativeState = () => {
        if (current) setNativeInputState(host, props);
      };
      const updateComplete = (host as { updateComplete?: Promise<unknown> })
        .updateComplete;
      if (updateComplete) void updateComplete.then(applyNativeState);
      else applyNativeState();
      if (typeof forwardedRef === "function") forwardedRef(host);
      else if (forwardedRef) forwardedRef.current = host;
      return () => {
        current = false;
        if (typeof forwardedRef === "function") forwardedRef(null);
        else if (forwardedRef) forwardedRef.current = null;
      };
    }, [forwardedRef, props]);
    useEffect(() => {
      const host = ref.current;
      if (!host) return;
      const eventForReact = (event: Event) =>
        ({
          ...event,
          target: { value: String((host as { value?: unknown }).value ?? "") },
          currentTarget: host,
        }) as unknown as ChangeEvent<HTMLInputElement>;
      const handleInput = (event: Event) => {
        const compatible = eventForReact(event);
        props.onInput?.(compatible);
        props.onChange?.(compatible);
      };
      const handleChange = (event: Event) =>
        props.onChange?.(eventForReact(event));
      host.addEventListener("input", handleInput);
      host.addEventListener("change", handleChange);
      return () => {
        host.removeEventListener("input", handleInput);
        host.removeEventListener("change", handleChange);
      };
    }, [props.onChange, props.onInput]);
    return (
      <span className={props.className} style={props.style}>
        {createElement(tag, {
          ref,
          className: "donor-input",
          "aria-disabled": props.disabled || undefined,
        })}
      </span>
    );
  },
);
ThatOpenTextInput.displayName = "ThatOpenTextInput";

export type ThatOpenTabProps = CommonProps & {
  name: string;
  label?: string;
  icon?: string;
  hidden?: boolean;
};

export function ThatOpenTab(props: ThatOpenTabProps) {
  // Declaration consumed by ThatOpenTabs; the parent constructs the real donor.
  return createElement("bim-tab", props, props.children);
}

export function ThatOpenTabs({
  children,
  className,
  style,
  tab,
  onTabChange,
  label,
  bottom,
  floating,
  switchersHidden,
}: CommonProps & {
  tab?: string;
  onTabChange?: (tab: string | undefined) => void;
  label?: string;
  bottom?: boolean;
  floating?: boolean;
  switchersHidden?: boolean;
}) {
  const ref = useRef<DonorElement>(null);
  const registry = useRef(new Map<string, BimTab>());
  const declarations = Children.toArray(children).filter(
    isValidElement,
  ) as ReactElement<ThatOpenTabProps>[];
  const tabs = declarations.map(({ props }) => {
    let element = registry.current.get(props.name);
    if (!element) {
      element = new BimTab();
      registry.current.set(props.name, element);
    }
    return { element, props };
  });
  useLayoutEffect(() => {
    const host = ref.current!;
    for (const element of [...host.children]) {
      if (!tabs.some((item) => item.element === element)) element.remove();
    }
    for (const { element, props } of tabs) {
      element.name = props.name;
      element.label = props.label;
      element.icon = props.icon;
      element.className = props.className ?? "";
      if (props.style) Object.assign(element.style, props.style);
      if (element.parentElement !== host) host.append(element);
    }
  }, [tabs]);
  useDonorProperties(ref, { tab, label, bottom, floating, switchersHidden });
  useEffect(() => {
    const notify = () =>
      queueMicrotask(() =>
        onTabChange?.((ref.current as { tab?: string } | null)?.tab),
      );
    for (const { element } of tabs)
      element.addEventListener("hiddenchange", notify);
    return () => {
      for (const { element } of tabs)
        element.removeEventListener("hiddenchange", notify);
    };
  }, [tabs, onTabChange]);
  return (
    <>
      {createElement("bim-tabs", {
        ref,
        className,
        style,
        "aria-label": label,
      })}
      {tabs.map(({ element, props }) =>
        createPortal(props.children, element, props.name),
      )}
    </>
  );
}

function useDonorProperties<T extends DonorElement>(
  ref: React.RefObject<T | null>,
  properties: Record<string, unknown>,
) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    for (const [key, value] of Object.entries(properties)) {
      if (value !== undefined)
        (element as Record<string, unknown>)[key] = value;
    }
  }, [properties, ref]);
}

function DonorElement<T extends DonorElement>({
  tag,
  properties,
  children,
  className,
  style,
  "aria-label": ariaLabel,
  headerActions,
}: CommonProps & {
  tag: string;
  properties?: Record<string, unknown>;
  headerActions?: ReactNode;
}) {
  const ref = useRef<T>(null);
  useDonorProperties(ref, properties ?? {});
  // Fixed donor headers are not actions. Leave the slotted action accessible,
  // rather than exposing a second, inert button with the same accessible name.
  useEffect(() => {
    const host = ref.current;
    if (!host || tag !== "bim-panel-section" || !properties?.fixed) return;
    let current = true;
    void (host.updateComplete as Promise<unknown> | undefined)?.then(() => {
      if (!current) return;
      const header = host.shadowRoot?.querySelector(".header");
      header?.setAttribute("role", "presentation");
      header?.removeAttribute("aria-expanded");
    });
    return () => {
      current = false;
    };
  }, [properties, tag]);
  const hasHeaderActions = !!headerActions;
  const header = useMemo(() => {
    if (!hasHeaderActions) return null;
    const element = document.createElement("div");
    element.slot = "header-end";
    return element;
  }, [hasHeaderActions]);
  useLayoutEffect(() => {
    if (!header) return;
    ref.current?.append(header);
    return () => header.remove();
  }, [header]);
  return (
    <>
      {createElement(
        tag,
        { ref, className, style, "aria-label": ariaLabel },
        children,
      )}
      {header &&
        createPortal(
          <div
            className="donor-header-actions"
            onKeyDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            {headerActions}
          </div>,
          header,
        )}
    </>
  );
}

export function ThatOpenToolbar(props: CommonProps & { vertical?: boolean }) {
  return (
    <DonorElement
      tag="bim-toolbar"
      properties={{ vertical: props.vertical ?? false }}
      className={props.className}
      style={props.style}
      aria-label={props["aria-label"]}
    >
      <div className="donor-toolbar-content">{props.children}</div>
    </DonorElement>
  );
}

export function ThatOpenPanel(
  props: CommonProps & {
    label?: string;
    icon?: string;
    headerHidden?: boolean;
  },
) {
  return (
    <DonorElement
      tag="bim-panel"
      properties={{
        label: props.label ?? "",
        icon: props.icon ?? "",
        headerHidden: props.headerHidden ?? false,
      }}
      className={props.className}
      style={props.style}
      aria-label={props["aria-label"]}
    >
      {props.children}
    </DonorElement>
  );
}

export function ThatOpenPanelSection(
  props: CommonProps & {
    label?: string;
    icon?: string;
    fixed?: boolean;
    scrollable?: boolean;
    collapsed?: boolean;
    /** Portal dispatches React actions before the donor collapse-header handler. */
    headerActions?: ReactNode;
  },
) {
  return (
    <DonorElement
      tag="bim-panel-section"
      headerActions={props.headerActions}
      properties={{
        label: props.label ?? "",
        icon: props.icon ?? "",
        fixed: props.fixed ?? false,
        scrollable: props.scrollable,
        collapsed: props.collapsed,
      }}
      className={props.className}
      style={props.style}
      aria-label={props["aria-label"]}
    >
      {props.children}
    </DonorElement>
  );
}

export function ThatOpenViewport(props: CommonProps) {
  return (
    <DonorElement
      tag="bim-viewport"
      className={props.className}
      style={props.style}
      aria-label={props["aria-label"]}
    >
      {props.children}
    </DonorElement>
  );
}

/** Stable React portal roots; Grid owns their named areas, not domain state. */
export function ThatOpenGrid({
  areas,
  template,
  className,
}: {
  areas: Record<string, ReactNode>;
  template: string;
  className?: string;
}) {
  const ref = useRef<Grid<["workspace"]>>(null);
  const areaKeys = Object.keys(areas).join(" ");
  const elements = useMemo(
    () =>
      Object.fromEntries(
        areaKeys
          .split(" ")
          .map((name) => [name, document.createElement("div")]),
      ),
    [areaKeys],
  );
  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid) return;
    const focused = document.activeElement;
    const restoreFocus =
      focused instanceof HTMLElement && grid.contains(focused) ? focused : null;
    let current = true;
    grid.append(...Object.values(elements));
    grid.elements = elements;
    grid.layouts = { workspace: { template } };
    grid.layout = "workspace";
    grid.requestUpdate(); // layouts/elements are non-reactive donor setters.
    void grid.updateComplete.then(() => {
      if (
        current &&
        restoreFocus?.isConnected &&
        document.activeElement === document.body
      )
        restoreFocus.focus({ preventScroll: true });
    });
    return () => {
      current = false;
    };
  }, [elements, template]);
  return (
    <>
      {createElement("bim-grid", { ref, className })}
      {Object.entries(elements).map(([name, element]) =>
        createPortal(areas[name], element, name),
      )}
    </>
  );
}
