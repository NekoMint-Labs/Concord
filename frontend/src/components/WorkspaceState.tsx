import type { ReactNode } from "react";
import { AlertCircle, Inbox, LoaderCircle } from "lucide-react";
import { icon } from "./ui/icon";

type StateKind = "empty" | "loading" | "error";

export function WorkspaceState({
  kind,
  title,
  description,
  action,
  compact = false,
}: {
  kind: StateKind;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  const Icon =
    kind === "loading" ? LoaderCircle : kind === "error" ? AlertCircle : Inbox;
  return (
    <section
      className={`workspace-state is-${kind}${compact ? " is-compact" : ""}`}
      role={
        kind === "error" ? "alert" : kind === "loading" ? "status" : undefined
      }
      aria-live={kind === "loading" ? "polite" : undefined}
    >
      <Icon
        {...icon}
        className={kind === "loading" ? "workspace-state-spinner" : undefined}
      />
      <div className="workspace-state-copy">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="workspace-state-action">{action}</div>}
    </section>
  );
}
