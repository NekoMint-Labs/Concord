import { useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { useMotion } from "../../motion";
import { icon } from "./icon";

/**
 * A quiet disclosure: a control that opens a block of supporting values.
 *
 * It replaces the native `<details>` element where this product uses one, and it
 * exists for two reasons. The first is the visual language: an operating system
 * triangle, with the platform's own inset and stroke weight, is the last piece of
 * a different control language showing through a designed surface. The second is
 * restraint - a disclosure is the mechanism this product uses to keep a summary
 * quiet while leaving the full condition set one action away, so it has to be a
 * first-class object rather than an element whose behaviour happens to be built
 * into the browser.
 *
 * The opening is one gesture in two halves: the chevron pivots in CSS over the same
 * `--motion-fast` step, and the body expands to its own height through the shared
 * motion vocabulary (frontend/src/motion). `AnimatePresence` is what makes the
 * closing half exist at all - without it the block would vanish in a single frame
 * while the chevron was still turning - and the height is `auto` so nothing has to
 * measure the content in JavaScript. The body's own spacing is inside the animated
 * box, which is what stops a 12px gap arriving a frame before the content does
 * (frontend/src/styles/components.css states the layout).
 *
 * Nothing disclosed anywhere in this product holds a focusable control, which is
 * why the expanding box can clip its own content safely. A disclosed *form* would
 * have to be reconsidered before it is added here.
 *
 * The open state is local by design: a disclosure holds a reading preference, and
 * nothing outside this component needs to know it.
 */
export function AppDisclosure({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const { transition, variants } = useMotion();
  const classes = ["disclosure-block", className].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      <button
        type="button"
        className="disclosure"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronRight {...icon} size={13} />
        {label}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="disclosure-body"
            id={bodyId}
            variants={variants.disclosure}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={transition("fast")}
          >
            <div className="disclosure-inner">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
