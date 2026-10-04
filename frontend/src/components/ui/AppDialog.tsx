import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  useRef,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { icon } from "./icon";
import { ThatOpenToolbar } from "../ThatOpenUI";
import { Button } from "./button";

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
  trigger,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
  /** Keep native Radix trigger/focus restoration for locally opened dialogs. */
  trigger?: ReactElement;
  /** A menu-launched modal returns to the persistent menu trigger. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        {/* the overlay is the scrim *and* the centring grid, so the dialog is a
            child of it rather than a second fixed layer guessing at the same
            centre */}
        <Dialog.Overlay className="modal-backdrop">
          <Dialog.Content
            onEscapeKeyDown={(event) => {
              // Escape first dismisses an open donor popup, not its parent modal.
              if (
                event
                  .composedPath()
                  .some(
                    (node) =>
                      node instanceof HTMLElement &&
                      node.tagName === "BIM-DROPDOWN" &&
                      (node as HTMLElement & { visible: boolean }).visible,
                  )
              )
                event.preventDefault();
            }}
            onOpenAutoFocus={() => {
              if (!trigger) {
                const active = document.activeElement;
                const menu = active?.closest('[role="menu"]');
                const triggerId = menu?.getAttribute("aria-labelledby");
                // A menu-launched modal must return to the persistent trigger,
                // never to a menu item that disappears as the dialog opens.
                returnFocus.current =
                  returnFocusRef?.current ??
                  (triggerId
                    ? document.getElementById(triggerId)
                    : active instanceof HTMLElement
                      ? active
                      : null);
              }
            }}
            onCloseAutoFocus={(event) => {
              if (!trigger && returnFocus.current?.isConnected) {
                event.preventDefault();
                returnFocus.current.focus();
              }
            }}
            className={
              className ? `dialog-surface ${className}` : "dialog-surface"
            }
          >
            <ThatOpenToolbar className="dialog-header" aria-label={title}>
              <div className="dialog-heading">
                {eyebrow}
                <Dialog.Title>{title}</Dialog.Title>
                {description && (
                  <Dialog.Description>{description}</Dialog.Description>
                )}
              </div>
              <Dialog.Close asChild>
                <Button
                  variant="ghost"
                  className="icon-button"
                  aria-label={closeLabel}
                >
                  <X {...icon} />
                </Button>
              </Dialog.Close>
            </ThatOpenToolbar>
            {children}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The dismiss control, for a surface that wants one of its own. */
export const DialogClose = Dialog.Close;
