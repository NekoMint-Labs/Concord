import { useEffect, useRef, useState } from "react";
import { Box, MoreHorizontal } from "lucide-react";
import type { DTO, Workspace } from "../api/client";
import { AppMenu, AppMenuItem } from "../components/ui/AppMenu";
import { notify } from "../components/ui/AppToaster";
import { SpatialInspectorDetails } from "./SpatialInspectorDetails";
import type { PanelImperativeHandle } from "../layout/PaneSplit";
import {
  demoConstraintKind,
  demoConstraintText,
} from "../ui/demo/demoPresentation";

export type SpatialInspectorProps = {
  mode: "model" | "changes" | "issues";
  issue?: DTO<"Constraint">;
  title: string;
  classification: string;
  inspectorTab: "overview" | "changes" | "issues";
  setInspectorTab: (tab: "overview" | "changes" | "issues") => void;
  activeId: string;
  change?: Pick<
    DTO<"BimElementChange">,
    "global_id" | "change_kind" | "changed_aspects"
  >;
  linkedIssues: DTO<"Constraint">[];
  item?: DTO<"BIMElement">;
  snapshot?: DTO<"BimElementSnapshot">;
  geometryAvailable?: boolean;
  workPackage?: DTO<"WorkPackage">;
  revisionLabel?: string;
  fromRevisionLabel?: string;
  sourceName?: string;
  viewFile: File | null;
  viewerProperties: unknown;
  elements?: DTO<"BIMElement">[];
  workspace?: Workspace;
  inspectorOpen: boolean;
  inspectorPane: React.RefObject<PanelImperativeHandle | null>;
  select: (id: string) => void;
  chooseIssue: (issue: DTO<"Constraint">) => void;
  onIssueResolution?: (id: string) => void;
  onInvestigate?: (id: string) => void;
  openChanges: () => void;
};

export function SpatialInspector({
  mode,
  issue,
  title,
  classification,
  inspectorTab,
  setInspectorTab,
  activeId,
  change,
  linkedIssues,
  item,
  snapshot,
  geometryAvailable,
  workPackage,
  revisionLabel,
  fromRevisionLabel,
  sourceName,
  viewFile,
  viewerProperties,
  elements,
  workspace,
  inspectorOpen,
  inspectorPane,
  select,
  chooseIssue,
  onIssueResolution,
  onInvestigate,
  openChanges,
}: SpatialInspectorProps) {
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const inspector = useRef<HTMLElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (inspectorOpen || !restoreFocus.current) return;
    restoreFocus.current = false;
    const workspace = inspector.current?.closest(".bim-workspace");
    // Wait for the reopen control to render and the menu's return-focus to finish.
    const frame = window.requestAnimationFrame(() => {
      const buttons = workspace?.querySelectorAll<HTMLButtonElement>(
        'button[aria-label="展开检查器"], button.mapping-inspector-toggle',
      );
      const reopen = Array.from(buttons ?? []).find(
        (button) =>
          button.isConnected &&
          !button.disabled &&
          !button.closest("[hidden], [inert]") &&
          getComputedStyle(button).display !== "none" &&
          getComputedStyle(button).visibility !== "hidden",
      );
      reopen?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [inspectorOpen]);
  return (
    <aside
      ref={inspector}
      className="spatial-inspector"
      aria-label="构件详情"
      inert={!inspectorOpen}
    >
      <header className="spatial-inspector-head">
        <Box size={18} strokeWidth={1.6} />
        <div>
          <h2>
            {mode === "issues" && issue
              ? "问题 · " + demoConstraintKind(issue.kind)
              : title}
          </h2>
          <span>
            {mode === "issues" && issue
              ? demoConstraintText(issue.kind, issue.description)
              : classification}
          </span>
        </div>
        <AppMenu
          label="检查器选项"
          trigger={<MoreHorizontal size={16} />}
          triggerClassName="spatial-inspector-menu"
        >
          <AppMenuItem
            onSelect={() => {
              if (!inspectorPane.current) return;
              restoreFocus.current = true;
              inspectorPane.current.collapse();
            }}
          >
            收起检查器
          </AppMenuItem>
          <AppMenuItem onSelect={() => inspectorPane.current?.resize("320px")}>
            重置面板宽度
          </AppMenuItem>
          {activeId && mode !== "issues" && (
            <AppMenuItem
              onSelect={() => {
                setInspectorTab("overview");
                setTechnicalOpen(true);
              }}
            >
              技术详情
            </AppMenuItem>
          )}
          {activeId &&
            typeof navigator !== "undefined" &&
            navigator.clipboard?.writeText && (
              <AppMenuItem
                onSelect={() => {
                  void navigator.clipboard
                    .writeText(
                      `${title} · ${classification} · GlobalId ${activeId}`,
                    )
                    .then(
                      () => notify.success("构件信息已复制"),
                      () => notify.error("无法复制构件信息，请检查剪贴板权限"),
                    );
                }}
              >
                复制构件信息
              </AppMenuItem>
            )}
        </AppMenu>
      </header>
      {mode !== "issues" && (
        <div
          className="spatial-inspector-tabs"
          role="tablist"
          aria-label="构件上下文"
          onKeyDown={(event) => {
            const tabs = ["overview", "changes", "issues"] as const;
            const at = tabs.indexOf(inspectorTab);
            const next =
              event.key === "ArrowRight"
                ? tabs[(at + 1) % tabs.length]
                : event.key === "ArrowLeft"
                  ? tabs[(at + tabs.length - 1) % tabs.length]
                  : event.key === "Home"
                    ? tabs[0]
                    : event.key === "End"
                      ? tabs.at(-1)
                      : undefined;
            if (!next) return;
            event.preventDefault();
            setInspectorTab(next);
            event.currentTarget
              .querySelectorAll<HTMLButtonElement>('[role="tab"]')
              [tabs.indexOf(next)]?.focus();
          }}
        >
          {(["overview", "changes", "issues"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={inspectorTab === tab}
              tabIndex={inspectorTab === tab ? 0 : -1}
              onClick={() => setInspectorTab(tab)}
            >
              {
                {
                  overview: "概览",
                  changes: "变更",
                  issues: "问题",
                }[tab]
              }
              {tab === "changes" && change ? (
                <small>1</small>
              ) : tab === "issues" && linkedIssues.length > 0 ? (
                <small>{linkedIssues.length}</small>
              ) : null}
            </button>
          ))}
        </div>
      )}
      <SpatialInspectorDetails
        mode={mode}
        issue={issue}
        title={title}
        classification={classification}
        inspectorTab={inspectorTab}
        activeId={activeId}
        change={change}
        linkedIssues={linkedIssues}
        item={item}
        snapshot={snapshot}
        geometryAvailable={geometryAvailable}
        workPackage={workPackage}
        revisionLabel={revisionLabel}
        fromRevisionLabel={fromRevisionLabel}
        sourceName={sourceName}
        viewFile={viewFile}
        viewerProperties={viewerProperties}
        elements={elements}
        workspace={workspace}
        select={select}
        chooseIssue={chooseIssue}
        onIssueResolution={onIssueResolution}
        onInvestigate={onInvestigate}
        openChanges={openChanges}
        technicalOpen={technicalOpen}
        setTechnicalOpen={setTechnicalOpen}
      />
    </aside>
  );
}
