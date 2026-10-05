// Source: OpenTakeoff web/src/lib/focusMode.js (Apache-2.0).
// Copyright 2026 Kentucky AI and the OpenTakeoff contributors.
// Revision: 788e39bfe9c42b3260ea75e84a655e4574f9bc8c.
// Modified for Concord: the storage key and the broadcast event carry the
// Concord name, and unavailable browser storage falls back to this session's
// memory instead of silently reading false. The donor's shape — localStorage as
// the store, a window CustomEvent as the broadcast, and the compact-viewport
// breakpoint — is retained.

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

// Subscribe React state to focus changes (toggle here, or another surface).
// Returns the unsubscribe fn, so it can be a useEffect body directly.
export function onFocusModeChange(fn: (on: boolean) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<boolean>).detail);
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}

// Small-screen breakpoint for AUTOMATIC chrome compaction — no toggle needed.
// Catches 13–14" laptop viewports while big displays keep the full labeled
// toolbar. Pure; the resize listener feeds it live values.
export function isCompactViewport(w: number, h: number): boolean {
  return w < 1500 || h < 900;
}
