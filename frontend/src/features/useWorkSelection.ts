import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

/** Work-only selection and nonmodal Peek lifecycle; no CSS or ancestor-order dependency. */
export function useWorkSelection(visibleKeys: readonly string[]) {
  const [selectedKey, setSelectedKey] = useState("");
  const [peekOpen, setPeekOpen] = useState(false);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const selectedRow = useRef<HTMLButtonElement>(null);
  const peekRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const activeKey = visibleKeys.includes(selectedKey) ? selectedKey : undefined;
  const dismiss = () => setPeekOpen(false);
  const close = () => {
    dismiss();
    (selectedRow.current?.isConnected
      ? selectedRow.current
      : searchRef.current
    )?.focus();
  };

  useEffect(() => {
    if (!peekOpen) return;
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const inDecision = [...buttons.current.values()].some((button) =>
        button.contains(target),
      );
      if (!peekRef.current?.contains(target) && !inDecision) setPeekOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [peekOpen]);

  useEffect(() => {
    if (peekOpen && !activeKey) {
      setPeekOpen(false);
      setSelectedKey("");
      if (document.activeElement === document.body) searchRef.current?.focus();
    }
  }, [peekOpen, activeKey]);

  const rowProps = (key: string) => ({
    ref: (button: HTMLButtonElement | null) => {
      if (button) buttons.current.set(key, button);
      else buttons.current.delete(key);
    },
    "aria-pressed": activeKey === key,
    "aria-expanded": peekOpen && activeKey === key,
    "aria-controls": peekOpen && activeKey ? "work-peek" : undefined,
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      selectedRow.current = event.currentTarget;
      setSelectedKey(key);
      setPeekOpen(true);
    },
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      const at = visibleKeys.indexOf(key);
      const next =
        event.key === "ArrowDown"
          ? at + 1
          : event.key === "ArrowUp"
            ? at - 1
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? visibleKeys.length - 1
                : -1;
      if (next < 0 || next >= visibleKeys.length) return;
      event.preventDefault();
      const button = buttons.current.get(visibleKeys[next]);
      button?.focus();
      if (peekOpen && button) {
        selectedRow.current = button;
        setSelectedKey(visibleKeys[next]);
      }
    },
  });

  return {
    activeKey,
    peekOpen,
    peekRef,
    searchRef,
    rowProps,
    close,
    dismiss,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (peekOpen && event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        close();
      }
    },
  };
}
