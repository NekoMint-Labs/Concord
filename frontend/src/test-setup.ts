import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/*
 * jsdom has no `matchMedia`, no `ResizeObserver`, and no rendering: an
 * animation there never completes, so a test that asserted a fade would be
 * asserting the environment rather than the product.
 *
 * The stub therefore reports `prefers-reduced-motion: reduce` for that one
 * query, which puts the whole suite on the path a reduced-motion user gets:
 * every state change happens immediately, and every existing assertion about
 * visible content keeps testing content rather than timing. The ordinary path is
 * covered deliberately in src/motion/motion.test.tsx, where the motion layer's
 * own contract lives.
 */
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: /prefers-reduced-motion/.test(query),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const jsdomWindow = window as Window & {
  ResizeObserver?: typeof ResizeObserver;
};
if (!jsdomWindow.ResizeObserver) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  jsdomWindow.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

afterEach(cleanup);
