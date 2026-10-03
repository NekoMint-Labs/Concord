import type { Workspace } from "../api/client";
import {
  PropertyGroup,
  PropertyRow,
  PropertyTable,
} from "../components/PropertyTable";
import { Button } from "../components/ui/button";
import {
  demoAreaName,
  demoDiscipline,
  demoOwner,
  demoSourceLabel,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";
import { availableResources, definedResources } from "./CoordinationConditions";
import type { CoordinationProjection } from "./coordinationProjection";
import type { InspectorView } from "./Inspector";

export type CoordinationInspectorTab = "properties" | "sources" | "resources";

export function CoordinationInspector({
  projection,
  sources,
  surface,
  tab,
  onTab,
  missingQualifications,
  onDetails,
}: {
  projection: CoordinationProjection;
  sources: Workspace["state"]["sources"];
  surface: "coordination" | "work-packages";
  tab: CoordinationInspectorTab;
  onTab: (tab: CoordinationInspectorTab) => void;
  missingQualifications: string[];
  onDetails: (view: InspectorView) => void;
}) {
  const { wp, area, state, constraints } = projection;
  return (
    <aside className="overview-inspector" aria-label="工作包检查器">
      <header className="overview-inspector-header">
        <div>
          <span className="section-label">检查器</span>
          <h2>{surface === "coordination" ? "协调详情" : "工作包详情"}</h2>
        </div>
        <span className={`readiness-label is-${state.tone}`}>
          <span aria-hidden="true" />
          {state.label}
        </span>
      </header>
      <nav className="overview-inspector-tabs" aria-label="检查器内容">
        {[
          ["properties", "基本信息"],
          ["sources", "工程记录"],
          ["resources", "现场资源"],
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => onTab(id as CoordinationInspectorTab)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="overview-inspector-body">
        {tab === "properties" && (
          <>
            <PropertyGroup
              title={<span className="section-label">工作包</span>}
            >
              <PropertyTable>
                <PropertyRow label="工作包编号" value={wp.id} mono />
                <PropertyRow
                  label="名称"
                  value={demoWorkPackageName(wp.id, wp.name)}
                />
                <PropertyRow
                  label="区域"
                  value={demoAreaName(wp.area_id, area?.name ?? wp.area_id)}
                />
                <PropertyRow
                  label="专业"
                  value={demoDiscipline(wp.discipline)}
                />
                <PropertyRow
                  label="负责人"
                  value={demoOwner(wp.id, wp.owner)}
                />
                <PropertyRow
                  label="完成状态"
                  value={wp.complete ? "已完成" : "进行中"}
                />
              </PropertyTable>
            </PropertyGroup>
            <PropertyGroup
              title={<span className="section-label">协调状态</span>}
            >
              <PropertyTable>
                <PropertyRow label="施工判断" value={state.label} />
                <PropertyRow
                  label="阻塞条件"
                  value={`${constraints.length} 项`}
                  attention={constraints.length > 0}
                />
              </PropertyTable>
              {constraints.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDetails("blocker")}
                >
                  查看阻塞详情
                </Button>
              )}
            </PropertyGroup>
          </>
        )}
        {tab === "sources" && (
          <PropertyGroup
            title={<span className="section-label">其他工程记录</span>}
          >
            <div className="overview-source-list">
              {sources.map((source) => (
                <div key={`${source.source}-${source.revision}`}>
                  <span>{demoSourceLabel(source.source)}</span>
                  <code>{source.revision}</code>
                </div>
              ))}
              {!sources.length && (
                <p className="quiet-message">
                  暂无其他工程记录。项目模型与基线请到「模型版本」查看。
                </p>
              )}
            </div>
          </PropertyGroup>
        )}
        {tab === "resources" && (
          <PropertyGroup
            title={<span className="section-label">现场资源</span>}
          >
            <PropertyTable>
              <PropertyRow
                label="班组"
                value={`${wp.available_workers} / ${wp.required_workers} 人`}
                attention={wp.available_workers < wp.required_workers}
              />
              <PropertyRow
                label="材料"
                value={`${availableResources(wp.materials)} / ${definedResources(wp.materials)} 可用`}
              />
              <PropertyRow
                label="设备"
                value={`${availableResources(wp.equipment)} / ${definedResources(wp.equipment)} 可用`}
              />
              <PropertyRow
                label="验收"
                value={wp.inspection_passed ? "已通过" : "未通过"}
                attention={!wp.inspection_passed}
              />
              <PropertyRow
                label="资质"
                value={missingQualifications.length ? "不齐备" : "齐备"}
                attention={missingQualifications.length > 0}
              />
            </PropertyTable>
          </PropertyGroup>
        )}
      </div>
    </aside>
  );
}
