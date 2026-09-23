import { Ellipsis } from "lucide-react";
import { useState } from "react";
import type { DTO } from "../api/client";
import {
  AppMenu,
  AppMenuItem,
  AppMenuLabel,
  AppMenuSeparator,
} from "../components/ui/AppMenu";
import { AppDialog } from "../components/ui/AppDialog";
import { Button } from "../components/ui/button";
import { icon } from "../components/ui/icon";
import { advancedTabs, type WorkspaceTab } from "./destinations";

/**
 * 高级: the one door to everything that is not the workflow.
 *
 * Capability diagnostics used to sit in the window chrome as a workflow peer.
 * Run checks now have an explicit primary destination; capability health remains
 * behind this separated entry because it diagnoses the installation rather than
 * the selected work package.
 *
 * Demo tools are additionally gated on the profile the backend is actually
 * running under: `api.profile()` is the one honest signal, and it reports `local`
 * for the browser/development host the demo runs on and `desktop` for the
 * packaged application, whose sidecar never seeds a demo. So a shipped
 * application does not carry fixture controls at all, and a development or
 * judging session still has them.
 *
 * That gate is positive, and only positive: the tools appear when the profile
 * has arrived and says `local`, and stay hidden while the query is in flight or
 * has failed. Inferring local mode from an absent answer - the obvious
 * `!profile` - made the packaged application flash 演示工具 during startup,
 * because the desktop sidecar's response is seconds behind the window it just
 * launched, and a product that opens by showing fixture controls reads as a
 * demonstration build no matter what it becomes a moment later. A missing
 * answer is not an answer.
 */
export function AdvancedMenu({
  tab,
  onTab,
  project,
  busy,
  profile,
  createEvent,
  onReset,
}: {
  tab: WorkspaceTab;
  onTab: (tab: WorkspaceTab) => void;
  project: string;
  busy: boolean;
  /** The answer to `api.profile()`, or `undefined` until it arrives. */
  profile?: DTO<"ProfileResponse">;
  createEvent: (event: DTO<"ProjectEvent-Input">) => void;
  onReset: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const demo = profile?.profile === "local";
  return (
    <>
      <AppMenu
        label="高级"
        trigger={<Ellipsis {...icon} />}
        triggerClassName="icon-button advanced-menu-trigger"
      >
        <AppMenuLabel>其他工具</AppMenuLabel>
        {advancedTabs.map(({ id, label }) => (
          <AppMenuItem key={id} active={tab === id} onSelect={() => onTab(id)}>
            {label}
          </AppMenuItem>
        ))}
        {demo && (
          <>
            <AppMenuSeparator />
            <AppMenuLabel>演示工具</AppMenuLabel>
            <AppMenuItem
              disabled={busy}
              onSelect={() =>
                createEvent({
                  project_id: project,
                  work_package_id: "WP-200",
                  kind: "design_revision",
                  title: "风管路径修订 / V17",
                  change: { revision: "V17" },
                })
              }
            >
              图纸 V16 → V17
            </AppMenuItem>
            <AppMenuItem
              disabled={busy}
              onSelect={() =>
                createEvent({
                  project_id: project,
                  work_package_id: "WP-300",
                  kind: "workforce",
                  title: "电气班组人员不足",
                  change: { available_workers: 1 },
                })
              }
            >
              电气班组不足
            </AppMenuItem>
            <AppMenuItem danger onSelect={() => setConfirming(true)}>
              重置演示
            </AppMenuItem>
          </>
        )}
      </AppMenu>
      {/*
        Resetting the demo fixture is irreversible, so it is confirmed in the
        application's own dialog rather than by `window.confirm`: the platform
        modal is unstyleable, it blocks the WebView, and it is the one surface in
        the demo flow that would still look like a browser rather than a product.

        The dialog is a sibling of the menu rather than an item inside it, because
        a closed menu unmounts its content and would take the dialog with it.
      */}
      {confirming && (
        <AppDialog
          open
          onOpenChange={(next) => {
            if (!next) setConfirming(false);
          }}
          eyebrow={<span className="eyebrow">演示</span>}
          title="重置演示项目？"
          description="审计记录会保留。"
          className="is-compact"
        >
          <div className="dialog-actions">
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                setConfirming(false);
                onReset();
              }}
            >
              重置
            </Button>
          </div>
        </AppDialog>
      )}
    </>
  );
}
