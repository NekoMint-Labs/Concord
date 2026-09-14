import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A modal dialog. It replaces the hand-written one in the event composer, which
 * had to implement its own focus trap, had no dismiss-on-outside-click, and left
 * the page behind it scrollable.
 *
 * Radix owns the focus trap, the initial focus, the Escape handling, the scroll
 * lock, and the aria wiring; the surface class and the header are Concord's, so a
 * dialog still looks like the application rather than like a library demo.
 *
 * The header is one owner for the whole surface: what it is, what it is about,
 * and the way out. The close control used to be absent entirely, which left
 * Escape and the backdrop as the only ways to leave a modal.
 */
export function AppDialog({
  open,
  onOpenChange,
  eyebrow,
  title,
  description,
  children,
  className,
  closeLabel = "关闭",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* the overlay is the scrim *and* the centring grid, so the dialog is a
            child of it rather than a second fixed layer guessing at the same
            centre */}
        <Dialog.Overlay className="modal-backdrop">
          <Dialog.Content
            className={
              className ? `dialog-surface ${className}` : "dialog-surface"
            }
          >
            <header className="dialog-header">
              <div className="dialog-heading">
                {eyebrow}
                <Dialog.Title>{title}</Dialog.Title>
                {description && (
                  <Dialog.Description>{description}</Dialog.Description>
                )}
              </div>
              <Dialog.Close className="icon-button" aria-label={closeLabel}>
                <X size={16} />
              </Dialog.Close>
            </header>
            {children}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The dismiss control, for a surface that wants one of its own. */
export const DialogClose = Dialog.Close;
