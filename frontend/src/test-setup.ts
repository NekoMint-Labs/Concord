import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { Manager } from "@thatopen/ui";

// Match production registration; assertions exercise real donor components.
Manager.init("", false);

// jsdom has no viewport. Render donor table cells without simulating layout.
if (!globalThis.IntersectionObserver) {
  globalThis.IntersectionObserver = class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) {
      this.callback(
        [{ target, isIntersecting: true } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    readonly root = null;
    readonly rootMargin = "0px";
    readonly thresholds = [0];
  };
}

/*
 * jsdom implements the `<dialog>` element but not its modal methods. The donor
 * chrome drives a native `<dialog>` (`showModal`/`close`), so reflect the open
 * state onto the element: Testing Library only sees an open dialog.
 */
if (typeof HTMLDialogElement !== "undefined") {
  if (!HTMLDialogElement.prototype.showModal)
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
    };
  if (!HTMLDialogElement.prototype.close)
    HTMLDialogElement.prototype.close = function close() {
      this.open = false;
    };
}

// The donor command menu keeps the highlighted row in view; jsdom has no layout.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}

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
