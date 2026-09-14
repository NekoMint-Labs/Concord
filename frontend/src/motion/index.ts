import { useMemo } from "react";
import { useReducedMotion, type Transition, type Variants } from "motion/react";

/**
 * The one motion vocabulary. Durations and easing mirror the CSS steps declared
 * in `frontend/src/styles/base.css`, so React-driven motion and CSS-driven
 * motion are the same rhythm rather than two systems that happen to be adjacent.
 *
 * There is no spring, no bounce, and no entrance choreography: motion here says
 * *what changed* and *where it came from*. It is spent on state changes rather
 * than on pointer feedback - a control answering the pointer is CSS, and it
 * needs no help from a timeline - and the state changes worth spending it on are
 * the ones this product is actually about:
 *
 * - `paneEnter`  a region arriving from the edge it lives on (the Inspector)
 * - `detailSwap` content whose *subject* changed, so the change of subject is
 *                legible rather than instant (a document, a BIM element, an
 *                Inspector detail)
 * - `recordEnter` a record settling when its own state changed (the coordination
 *                body after a re-check concludes), which is the product's central
 *                loop: the user waited for this, and it should arrive rather than
 *                appear.
 */
export const duration = { instant: 0.1, fast: 0.12, normal: 0.16 } as const;
export type MotionStep = keyof typeof duration;

/** easeOutQuad, matching `--ease`. */
export const easeOut: [number, number, number, number] = [
  0.25, 0.46, 0.45, 0.94,
];

export function transition(step: MotionStep = "normal"): Transition {
  return { duration: duration[step], ease: easeOut };
}

/** A region arriving from the edge it lives on: a right-hand pane slides in. */
export const paneEnter: Variants = {
  hidden: { opacity: 0, x: 14 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 14 },
};

/**
 * Detail content whose subject changed. Entry only: a keyed swap mounts new
 * content, and holding the previous content on screen while it fades would leave
 * stale values readable next to the new ones.
 */
export const detailSwap: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

/**
 * A record settling after its state changed. The offset is 4px - a settle, not
 * an entrance - because the reader is already looking at this part of the page
 * and is being told that what it says has changed.
 */
export const recordEnter: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0 },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

/**
 * The reduced-motion path: the same variant keys, so every call site keeps
 * working, with nothing to animate and no duration. State changes still happen -
 * only their timing is removed, which is the same contract the global CSS
 * `prefers-reduced-motion` rule keeps for the CSS side.
 */
const still: Record<
  "paneEnter" | "detailSwap" | "recordEnter" | "fade",
  Variants
> = {
  paneEnter: { hidden: {}, visible: {}, exit: {} },
  detailSwap: { hidden: {}, visible: {} },
  recordEnter: { hidden: {}, visible: {} },
  fade: { hidden: {}, visible: {}, exit: {} },
};

/**
 * The whole vocabulary, resolved for a motion preference. Pure, so the two
 * branches can be checked without a browser or a media query - which is what
 * `motion.test.tsx` does, because a reduced-motion regression is otherwise only
 * visible to the people who need it most.
 */
export function motionPresets(reduce: boolean) {
  return reduce
    ? { transition: () => ({ duration: 0 }) as Transition, variants: still }
    : {
        transition,
        variants: { paneEnter, detailSwap, recordEnter, fade },
      };
}

/**
 * Product components call this instead of reading `useReducedMotion` themselves,
 * so the reduced-motion decision is made in one place. Usage:
 *
 * ```tsx
 * const { transition, variants } = useMotion();
 * <motion.div variants={variants.detailSwap} initial="hidden" animate="visible"
 *   transition={transition()} />
 * ```
 */
export function useMotion() {
  const reduce = useReducedMotion();
  return useMemo(() => motionPresets(Boolean(reduce)), [reduce]);
}
