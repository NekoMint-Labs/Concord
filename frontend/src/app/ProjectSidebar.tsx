/* The workspace tool rail.
 *
 * Donor contract: OpenTakeoff `web/src/pages/TakeoffCanvas.jsx` renders
 * `<nav data-tool-rail>` — a column of square tool faces grouped by a mono
 * caption, with `aria-pressed` state, styled by the vendored
 * `premiumWorkspace.css` (`--workspace-face`, `--workspace-active-face`,
 * `--glow`) and `tokens.css` (`.t-label`, `--ctl-l`). Concord binds its
 * destinations to that rail; it does not invent a second navigation system.
 *
 * The old Concord sidebar (project / model / change / issue tree plus a
 * work-package explorer) is gone. Destinations are work modes, not pages: the
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
  Map,
  Search,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { icon } from "../components/ui/icon";
import type { WorkspaceTab } from "./destinations";

// The donor's rail face (TakeoffCanvas.jsx `railTile`), kept verbatim.
const face: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
  width: 34,
  minHeight: 34,
  padding: "5px 0 4px",
  border: "1px solid var(--ink-faint)",
  background: "var(--paper-bright)",
  color: "var(--ink)",
  cursor: "pointer",
  fontWeight: 600,
  lineHeight: 1,
};

const group: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "var(--sp-1)",
  width: "100%",
};

type RailItem = { tab: WorkspaceTab; label: string; icon: LucideIcon };

const groups: { caption: string; items: RailItem[] }[] = [
  {
    caption: "工作",
    items: [
      { tab: "work", label: "工作", icon: Home },
      { tab: "project", label: "项目", icon: FolderTree },
      { tab: "browse", label: "浏览", icon: Search },
    ],
  },
  {
    caption: "对象",
    items: [
      { tab: "bim", label: "模型", icon: Box },
      { tab: "documents", label: "文档", icon: FileText },
    ],
  },
  {
    caption: "影响",
    items: [
      { tab: "impact", label: "变更", icon: GitCompareArrows },
      { tab: "packages", label: "问题", icon: ShieldCheck },
    ],
  },
];

export function ProjectSidebar({
  tab = "work",
  onTab,
  onProjectSettings,
}: {
  tab?: WorkspaceTab;
  onTab: (tab: WorkspaceTab) => void;
  onProjectSettings?: () => void;
}) {
  const button = (item: RailItem) => {
    const Face = item.icon;
    return (
      <button
        key={item.tab}
        type="button"
        aria-pressed={tab === item.tab}
        aria-label={item.label}
        title={item.label}
        style={face}
        onClick={() => onTab(item.tab)}
      >
        <Face {...icon} />
        <span style={{ fontSize: "var(--fs-2xs)" }}>{item.label}</span>
      </button>
    );
  };
  return (
    <>
      {groups.map((entry) => (
        <div key={entry.caption} style={group}>
          <span className="t-label">{entry.caption}</span>
          {entry.items.map(button)}
        </div>
      ))}
      <div style={{ ...group, marginTop: "auto" }}>
        <button
          type="button"
          aria-label="活动与运行"
          title="活动与运行"
          aria-pressed={tab === "operations"}
          style={face}
          onClick={() => onTab("operations")}
        >
          <Activity {...icon} />
        </button>
        <button
          type="button"
          aria-label="现场地图"
          title="现场地图"
          aria-pressed={tab === "gis"}
          style={face}
          onClick={() => onTab("gis")}
        >
          <Map {...icon} />
        </button>
        <button
          type="button"
          aria-label="设置"
          title="项目设置"
          style={face}
          onClick={() => onProjectSettings?.()}
        >
          <Settings2 {...icon} />
        </button>
      </div>
    </>
  );
}
