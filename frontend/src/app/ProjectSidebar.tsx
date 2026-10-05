/* The workspace tool rail.
 *
 * Donor contract: OpenTakeoff `web/src/pages/TakeoffCanvas.jsx` renders
 * `<nav data-tool-rail>` — a column of tool faces grouped by a mono caption, with
 * `aria-pressed` state. Concord binds its destinations to that rail; it does not
 * invent a second navigation system.
 *
 * The round-2 rail is tiered rather than flat. A rail that shows ten equally
 * weighted faces has told the reader nothing about where to start, so the faces
 * now carry three weights:
 *
 *   primary    the three work modes — Work, Project, Browse. These are where the
 *              job happens, and Work carries the open-judgement count, because
 *              that count is the reason someone opens this application.
 *   secondary  the object workspaces you go *into* from a mode — Model, Documents;
 *              and the impact registers — Changes, Issues.
 *   utility    one face. Operations, the site map, diagnostics, project settings,
 *              layout and the control panel are administration or diagnostics:
 *              reached deliberately, not carried permanently in first-level
 *              navigation. They live behind 更多.
 *
 * The old Concord sidebar (project / model / change / issue tree plus a
 * work-package explorer) stays gone. Destinations are work modes, not pages: the
 * object list lives in the shell's navigator and the object itself opens in the
 * central stage.
 */
import {
  Activity,
  Box,
  FileText,
  FolderTree,
  GitCompareArrows,
  Home,
  MoreHorizontal,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Map as MapIcon,
  Gauge,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { icon } from "../components/ui/icon";
import type { WorkspaceTab } from "./destinations";

type RailItem = {
  tab: WorkspaceTab;
  label: string;
  icon: LucideIcon;
  caption: string;
};

type RailGroup = {
  caption?: string;
  tier: "primary" | "secondary";
  items: RailItem[];
};

const groups: RailGroup[] = [
  {
    caption: "工作",
    tier: "primary",
    items: [
      { tab: "work", label: "工作", icon: Home, caption: "工程判断与依据" },
      {
        tab: "project",
        label: "项目",
        icon: FolderTree,
        caption: "资料、版本与基线",
      },
      {
        tab: "browse",
        label: "浏览",
        icon: Search,
        caption: "查找任意工程对象",
      },
    ],
  },
  {
    caption: "对象",
    tier: "secondary",
    items: [
      { tab: "bim", label: "模型", icon: Box, caption: "BIM 模型工作区" },
      {
        tab: "documents",
        label: "文档",
        icon: FileText,
        caption: "文档工作区",
      },
    ],
  },
  {
    caption: "影响",
    tier: "secondary",
    items: [
      {
        tab: "impact",
        label: "变更",
        icon: GitCompareArrows,
        caption: "版本变更影响",
      },
      {
        tab: "packages",
        label: "问题",
        icon: ShieldCheck,
        caption: "空间问题",
      },
    ],
  },
];

export function ProjectSidebar({
  tab = "work",
  onTab,
  onProjectSettings,
  onLayout,
  onDiagnostics,
  attention = 0,
}: {
  tab?: WorkspaceTab;
  onTab: (tab: WorkspaceTab) => void;
  onProjectSettings?: () => void;
  onLayout?: () => void;
  onDiagnostics?: () => void;
  /** Open engineering judgements. The rail is the only place this count lives now. */
  attention?: number;
}) {
  const [more, setMore] = useState(false);
  const face = (item: RailItem) => {
    const Face = item.icon;
    return (
      <button
        key={item.tab}
        type="button"
        className={`rail-tile rail-tile-${item.tab === "work" ? "primary" : "plain"}`}
        aria-pressed={tab === item.tab}
        aria-label={item.label}
        title={`${item.label} · ${item.caption}`}
        onClick={() => onTab(item.tab)}
      >
        <Face {...icon} />
        <span>{item.label}</span>
        {item.tab === "work" && attention > 0 ? (
          <em className="rail-count" aria-label={`${attention} 项待人工判断`}>
            {attention}
          </em>
        ) : null}
      </button>
    );
  };
  return (
    <>
      {groups.map((entry) => (
        <div
          key={entry.caption}
          className={`rail-group rail-group-${entry.tier}`}
        >
          <span className="t-label">{entry.caption}</span>
          {entry.items.map(face)}
        </div>
      ))}
      <div className="rail-group rail-spacer rail-group-utility">
        <button
          type="button"
          className="rail-tile rail-tile-more"
          aria-expanded={more}
          aria-label="更多工作区"
          title="更多 — 活动、现场地图、诊断、布局与项目设置"
          onClick={() => setMore((value) => !value)}
        >
          <MoreHorizontal {...icon} />
          <span>更多</span>
        </button>
      </div>
      {/*
       * The administrative tier. It is disclosed *inside* the rail rather than in a
       * portalled menu: this is the frame, and a floating panel over a docked rail is a
       * second material in the one place the material is supposed to be continuous.
       * The faces are quieter than the work modes on purpose - they are reached
       * deliberately and never carry the current position.
       */}
      {more && (
        <div className="rail-group rail-group-admin">
          <span className="t-label">管理</span>
          <button
            type="button"
            className="rail-tile"
            aria-label="活动与运行"
            title="活动与运行 — 提交、运行与后台任务"
            onClick={() => onTab("operations")}
          >
            <Activity {...icon} />
            <span>活动</span>
          </button>
          <button
            type="button"
            className="rail-tile"
            aria-label="现场地图"
            title="现场地图 — 项目位置与场地范围"
            onClick={() => onTab("gis")}
          >
            <MapIcon {...icon} />
            <span>地图</span>
          </button>
          {onDiagnostics && (
            <button
              type="button"
              className="rail-tile"
              aria-label="能力诊断"
              title="能力诊断 — 本地服务与解析能力"
              onClick={onDiagnostics}
            >
              <Gauge {...icon} />
              <span>诊断</span>
            </button>
          )}
          {onLayout && (
            <button
              type="button"
              className="rail-tile"
              aria-label="工作区布局"
              title="工作区布局 — 面板位置、尺寸与外观"
              onClick={onLayout}
            >
              <SlidersHorizontal {...icon} />
              <span>布局</span>
            </button>
          )}
          {onProjectSettings && (
            <button
              type="button"
              className="rail-tile"
              aria-label="设置"
              title="项目设置 — 名称、时区与结构"
              onClick={onProjectSettings}
            >
              <Settings2 {...icon} />
              <span>设置</span>
            </button>
          )}
        </div>
      )}
    </>
  );
}
