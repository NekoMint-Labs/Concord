import { useState } from "react";
import type { DTO } from "../api/client";
import { AppMenu, AppMenuItem, AppMenuLabel } from "../components/ui/AppMenu";
import { AppDialog } from "../components/ui/AppDialog";
import { Button } from "../components/ui/button";

/** The single demo entry point. There is no second "演示" affordance elsewhere. */
export function DemoControls({
  project,
  busy,
  createEvent,
  onReset,
}: {
  project: string;
  busy: boolean;
  createEvent: (event: DTO<"ProjectEvent-Input">) => void;
  onReset: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <AppMenu label="演示选项">
        <AppMenuLabel>确定性演示</AppMenuLabel>
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
      </AppMenu>
      {/*
        Resetting the demo fixture is irreversible, so it is confirmed in the
        application's own dialog rather than by `window.confirm`: the platform
        modal is unstyleable, it blocks the WebView, and it is the one surface in
        the demo flow that would still look like a browser rather than a product.
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
