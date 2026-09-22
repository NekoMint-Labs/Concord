import { motion } from "motion/react";
import { Ellipsis } from "lucide-react";
import { AppMenu, AppMenuItem } from "../components/ui/AppMenu";
import { icon } from "../components/ui/icon";
import { useMotion } from "../motion";

/**
 * The selected work package's primary engineering workflow. The six destinations
 * mirror the approved desktop navigation and remain visible at working widths;
 * project-wide source and site tools stay in the compact secondary menu.
 */
export const primaryTabs = [
  { id: "coordination", label: "概览" },
  { id: "bim", label: "模型" },
  { id: "impact", label: "变更" },
  { id: "packages", label: "问题" },
  { id: "documents", label: "文档" },
  { id: "operations", label: "运行检查" },
] as const;

export const secondaryTabs = [
  { id: "sources", label: "项目来源" },
  { id: "gis", label: "现场地图" },
] as const;

/** Installation diagnostics stay outside the selected work-package workflow. */
export const advancedTabs = [
  { id: "capabilities", label: "能力诊断" },
] as const;

const tabs = [...primaryTabs, ...secondaryTabs, ...advancedTabs] as const;
export type WorkspaceTab = (typeof tabs)[number]["id"];

export function WorkspaceTabs({
  tab,
  onTab,
}: {
  tab: WorkspaceTab;
  onTab: (tab: WorkspaceTab) => void;
}) {
  const { transition } = useMotion();
  const secondary = secondaryTabs.find((item) => item.id === tab);
  const advanced = advancedTabs.find((item) => item.id === tab);
  const primary = primaryTabs.some((item) => item.id === tab);

  return (
    <nav className="workspace-tabs" aria-label="工作区视图">
      {primaryTabs.map(({ id, label }) => (
        <button
          key={id}
          className={tab === id ? "active" : ""}
          aria-current={tab === id ? "page" : undefined}
          onClick={() => onTab(id)}
        >
          <span className="tab-label">{label}</span>
          {tab === id && (
            <motion.span
              className="tab-surface"
              layoutId="workspace-view-surface"
              transition={transition()}
            />
          )}
        </button>
      ))}
      <div className="more-views">
        <AppMenu
          label="更多视图"
          trigger={
            <>
              <Ellipsis {...icon} />
              <span className="more-view-label">
                {secondary?.label ?? "更多"}
              </span>
            </>
          }
        >
          {secondaryTabs.map(({ id, label }) => (
            <AppMenuItem
              key={id}
              active={tab === id}
              onSelect={() => onTab(id)}
            >
              {label}
            </AppMenuItem>
          ))}
        </AppMenu>
      </div>
      {!primary && !secondary && advanced && (
        <span className="advanced-view-chip" aria-current="page">
          <span className="advanced-view-eyebrow">高级</span>
          {advanced.label}
        </span>
      )}
    </nav>
  );
}
