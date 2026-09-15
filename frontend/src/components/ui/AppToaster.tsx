import { Check, TriangleAlert, Info } from "lucide-react";
import { Toaster, toast } from "sonner";
import { icon } from "./icon";

/**
 * The one toast mount point and the one place the application talks to it.
 *
 * A toast is ephemeral feedback for an action the user just took: a document
 * imported, a source saved, a re-check completed, an operation rejected. It is
 * never the authoritative record of anything. Run state, readiness, BLOCKED, and
 * STALE stay visible in the workspace itself, where they can be read again -
 * a toast has already gone by the time someone looks for it.
 *
 * Product code imports `notify` from here rather than `toast` from `sonner`, so
 * the library is a detail of this module.
 */
export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      gap={8}
      /*
       * The toast clears the analysis footer instead of landing on it. They occupy
       * the same corner of the window - both are transient, both are bottom-right -
       * and at the footer's own height the toast used to cover the run status the
       * footer exists to report, so the *less* authoritative of the two was hiding
       * the more authoritative one.
       *
       * The offset reads `--status-bar-h`, which is already the single number the
       * footer's minimum height and every scroll region's bottom reserve are built
       * from (frontend/src/styles/base.css). Sonner applies an object offset as the
       * raw CSS value it is given, so the token survives into a library that only
       * asked for pixels and the three cannot drift apart.
       */
      offset={{ bottom: "calc(var(--status-bar-h) + 8px)", right: 16 }}
      duration={4000}
      icons={{
        success: <Check {...icon} />,
        error: <TriangleAlert {...icon} />,
        info: <Info {...icon} />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "toast",
          title: "toast-title",
          description: "toast-description",
          icon: "toast-icon",
          success: "toast-success",
          error: "toast-error",
          info: "toast-info",
          content: "toast-content",
        },
      }}
    />
  );
}

export const notify = {
  success(message: string, description?: string) {
    toast.success(message, { description });
  },
  error(message: string, description?: string) {
    toast.error(message, { description });
  },
  info(message: string, description?: string) {
    toast.info(message, { description });
  },
};
