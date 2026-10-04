import { useId, useState, type ReactNode } from "react";
import { ThatOpenPanelSection } from "../ThatOpenUI";
import { Button } from "./button";

/** Donor presentation; React retains disclosure content/focus lifecycle. */
export function AppDisclosure({
  label,
  children,
  className,
  open: controlledOpen,
  onOpenChange,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;
  const bodyId = useId();
  return (
    <ThatOpenPanelSection
      className={className}
      fixed
      headerActions={
        <Button
          variant="ghost"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => {
            if (controlledOpen === undefined) setLocalOpen(!open);
            onOpenChange?.(!open);
          }}
        >
          {label}
        </Button>
      }
    >
      {open && <div id={bodyId}>{children}</div>}
    </ThatOpenPanelSection>
  );
}
