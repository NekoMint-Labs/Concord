import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { PanelLeftOpen } from "lucide-react";
import { api, type WorkPackage, type Workspace } from "../api/client";
import { AppTooltip } from "../components/ui/AppTooltip";
import { icon } from "../components/ui/icon";
import {
  demoAreaName,
  demoProjectName,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";
import type { WorkspaceTab } from "./destinations";

export function WorkspaceHeader({
  data,
  wp,
  modelElementId,
  tab,
  navCollapsed = false,
  onToggleNav,
  onNavigate,
  children,
}: {
  data: Workspace;
  wp?: WorkPackage;
  modelElementId?: string;
  tab?: WorkspaceTab;
  navCollapsed?: boolean;
  onToggleNav?: () => void;
  onNavigate?: (tab: WorkspaceTab) => void;
  children?: ReactNode;
}) {
  const project = data.state.project.id;
  const contextPackage =
    modelElementId !== undefined
      ? data.state.work_packages.find((item) =>
          item.element_ids.includes(modelElementId),
        )
      : wp;
  const sources = useQuery({
    queryKey: ["sources", project],
    queryFn: () => api.sourceStatuses(project),
  });
  const models =
    sources.data?.filter(
      (item) => item.source.kind === "BIM" && item.latest_revision_id,
    ) ?? [];
  const source = models.length === 1 ? models[0] : undefined;
  const revisions = useQuery({
    queryKey: ["source-revisions", project, source?.source.id],
    queryFn: () => api.sourceRevisions(project, source!.source.id),
    enabled: !!source,
  });
  const latest = revisions.data?.find(
    (item) => item.id === source?.latest_revision_id,
  );
  const baselines = useQuery({
    queryKey: ["baselines", project],
    queryFn: () => api.baselines(project),
    enabled: !!source,
  });
  const baseline = baselines.data?.at(-1);
  return (
    <header className="app-header">
      <div className="context-bar">
        {navCollapsed && (
          <AppTooltip label="展开侧栏">
            <button
              type="button"
              className="icon-button"
              aria-label="展开侧栏"
              onClick={onToggleNav}
            >
              <PanelLeftOpen {...icon} />
            </button>
          </AppTooltip>
        )}
        <nav className="breadcrumb" aria-label="当前位置">
          <button type="button" onClick={() => onNavigate?.("project")}>
            {demoProjectName(project, data.state.project.name)}
          </button>
          {contextPackage && (tab === "coordination" || tab === "bim") && (
            <>
              <span className="crumb-sep">/</span>
              <span>
                {demoAreaName(
                  contextPackage.area_id,
                  data.state.areas.find(
                    (area) => area.id === contextPackage.area_id,
                  )?.name ?? contextPackage.area_id,
                )}
              </span>
              <span className="crumb-sep">/</span>
              {tab === "coordination" ? (
                <strong>
                  {demoWorkPackageName(contextPackage.id, contextPackage.name)}
                </strong>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate?.("coordination")}
                >
                  {demoWorkPackageName(contextPackage.id, contextPackage.name)}
                </button>
              )}
            </>
          )}
          {tab && tab !== "coordination" && (
            <span className="workspace-location">
              {
                (
                  {
                    work: "工作",
                    browse: "浏览",
                    project: "项目",
                    coordination: "工作包详情",
                    history: "历史",
                    settings: "项目设置",
                    "work-packages": "工作包",
                    sources: "模型与版本",
                    bim: "模型",
                    impact: "变更",
                    packages: "问题",
                    documents: "文档",
                    operations: "活动与运行",
                    gis: "现场地图",
                    capabilities: "能力诊断",
                  } as Record<string, string>
                )[tab]
              }
            </span>
          )}
        </nav>
        {(tab === "bim" || tab === "sources" || tab === "history") &&
          (models.length > 1 ? (
            <div className="header-versions">
              <span>多个项目模型</span>
            </div>
          ) : (
            latest && (
              <div className="header-versions">
                <span className="version-current">
                  <i />
                  最新版本 <strong>R{latest.sequence}</strong>
                </span>
                {baseline ? (
                  <span>
                    当前基线 <strong>B{baseline.sequence}</strong>
                  </span>
                ) : (
                  <span>尚未确认基线</span>
                )}
                {source?.accepted_revision_id &&
                  source.has_pending_revision && (
                    <span className="version-pending">新版本待审核</span>
                  )}
              </div>
            )
          ))}
      </div>
      <div className="local-actions" aria-label="当前工作区操作">
        {children}
      </div>
    </header>
  );
}
