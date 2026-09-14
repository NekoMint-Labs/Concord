import { useId, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

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
        <ChevronRight size={13} aria-hidden="true" />
        {label}
      </button>
      {open && (
        <div className="disclosure-body" id={bodyId}>
          {children}
        </div>
      )}
    </div>
  );
}
