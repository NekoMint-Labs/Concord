import type { ReactNode } from "react";
import { AlertCircle, Inbox, LoaderCircle } from "lucide-react";
import { icon } from "./ui/icon";
import { ThatOpenPanel } from "./ThatOpenUI";

type StateKind = "empty" | "loading" | "error" | "info";

export function WorkspaceState({
  kind,
  title,
  description,
  action,
  compact = false,
  diagnostic,
}: {
  kind: StateKind;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  diagnostic?: string;
}) {
  const Heading = compact ? "h3" : "h2";
  const Icon =
    kind === "loading" ? LoaderCircle : kind === "error" ? AlertCircle : Inbox;
  return (
    <section
      className={`workspace-state is-${kind}${compact ? " is-compact" : ""}`}
      role={
        kind === "error"
          ? "alert"
          : kind === "loading" || kind === "info"
            ? "status"
            : undefined
      }
      aria-live={kind === "loading" ? "polite" : undefined}
    >
      <ThatOpenPanel className="workspace-state-surface" headerHidden>
        <div className="workspace-state-content">
          <Icon
            {...icon}
            className={
              kind === "loading" ? "workspace-state-spinner" : undefined
            }
          />
          <div className="workspace-state-copy">
            <Heading>{title}</Heading>
            {description && <p>{description}</p>}
            {diagnostic && (
              <details className="workspace-technical-details">
                <summary>技术详情</summary>
                <pre>{diagnostic}</pre>
              </details>
            )}
          </div>
          {action && <div className="workspace-state-action">{action}</div>}
        </div>
      </ThatOpenPanel>
    </section>
  );
}
