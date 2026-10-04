// Source: OpenTakeoff web/src/lib/focusMode.js (Apache-2.0).
// Copyright 2026 Kentucky AI and OpenTakeoff contributors.
// Revision: 60c82e34b389384401a083cefeb9389f89fbaae1.
// Modified for Concord (TS/localization/primitives/product-only docks).

// Personal canvas chrome: localStorage is the store, a window CustomEvent is
// the broadcast. Unavailable storage falls back to this session's memory.
const KEY = "concord_canvas_focus";
const EVT = "concord:canvas-focus";
let sessionValue = false;
let sessionOnly = false;

export function getFocusMode(): boolean {
  if (!sessionOnly) {
    try {
      sessionValue = localStorage.getItem(KEY) === "1";
    } catch {
      sessionOnly = true;
    }
  }
  return sessionValue;
}

export function setFocusMode(on: boolean): void {
  sessionValue = !!on;
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    sessionOnly = true;
  }
  window.dispatchEvent(new CustomEvent<boolean>(EVT, { detail: sessionValue }));
}

export function toggleFocusMode(): boolean {
  const next = !getFocusMode();
  setFocusMode(next);
  return next;
}

// Returns the unsubscribe function so it can be a useEffect body directly.
export function onFocusModeChange(fn: (on: boolean) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<boolean>).detail);
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}
