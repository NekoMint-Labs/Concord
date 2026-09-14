import { Check, TriangleAlert, Info } from "lucide-react";
import { Toaster, toast } from "sonner";

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
      offset={16}
      duration={4000}
      icons={{
        success: <Check size={14} aria-hidden="true" />,
        error: <TriangleAlert size={14} aria-hidden="true" />,
        info: <Info size={14} aria-hidden="true" />,
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
