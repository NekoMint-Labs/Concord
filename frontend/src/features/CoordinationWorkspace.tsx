import { useState, type ReactNode } from "react";
import {
  Box,
  CircleAlert,
  CircleCheck,
  ClipboardCheck,
  LoaderCircle,
  Package,
  Users,
  Wrench,
} from "lucide-react";
import {
  PropertyGroup,
  PropertyRow,
  PropertyTable,
} from "../components/PropertyTable";
import type { Workspace } from "../api/client";
import { Button } from "../components/ui/button";
import { AppDisclosure } from "../components/ui/AppDisclosure";
import { icon } from "../components/ui/icon";
import {
  activeCoordinationEvent,
  activeCoordinationRun,
} from "../app/coordination";
import type { InspectorView } from "./Inspector";
import {
  demoAreaName,
  demoConstraintText,
  demoDiscipline,
  demoOwner,
  demoProposalExplanation,
  demoSourceLabel,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";

function checkedAt(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function CoordinationWorkspace({
  workspace,
  selected,
  busy,
  onRecheck,
  onDetails,
  onImpact,
  onModel,
  modelContext,
}: {
  workspace: Workspace;
  selected: string;
  busy: boolean;
  onRecheck: () => void;
  onDetails: (view: InspectorView) => void;
  onImpact: () => void;
  onModel?: () => void;
  modelContext?: ReactNode;
}) {
  const [inspectorTab, setInspectorTab] = useState<
    "properties" | "sources" | "resources"
  >("properties");
  const wp = workspace.state.work_packages.find(
    (item) => item.id === selected,
  )!;
  const area = workspace.state.areas.find((item) => item.id === wp.area_id);
  const readiness = workspace.analysis?.readiness.find(
    (item) => item.work_package_id === selected,
  );
  const activeRun = activeCoordinationRun(workspace);
  const activeEvent = activeCoordinationEvent(workspace, selected);
  const constraints = (workspace.analysis?.constraints ?? []).filter(
    (item) => item.work_package_id === selected && item.blocking,
  );
  const proposal = workspace.proposals.find(
    (item) => item.work_package_id === selected,
  );
  const analyzing =
    !!activeEvent &&
    !!activeRun &&
    ["QUEUED", "RUNNING"].includes(activeRun.status);
  const blocked =
    readiness?.status === "BLOCKED" ||
    (!!activeEvent && activeRun?.status === "WAITING_APPROVAL");
  const stale = workspace.stale && !analyzing;
  const snapshot = workspace.analysis?.snapshot;
  const impactedIds = workspace.analysis?.impact.element_ids ?? [];
  const impactCount = wp.element_ids.filter((id) =>
    impactedIds.includes(id),
  ).length;
  const sourceCount = workspace.state.sources.length;
  const missingQualifications = (wp.required_qualifications ?? []).filter(
    (item) => !(wp.qualifications ?? []).includes(item),
  );
  const available = (values?: Record<string, boolean>) =>
    Object.values(values ?? {}).filter(Boolean).length;
  const defined = (values?: Record<string, boolean>) =>
    Object.keys(values ?? {}).length;
  const state = analyzing
    ? {
        label: "检查中",
        title: "正在重新核对施工条件",
        description: activeEvent?.change.revision
          ? `正在根据 ${activeEvent.change.revision} 评估最新工程事实。`
          : "正在汇集最新工程事实并重新判断。",
        icon: LoaderCircle,
        tone: "running",
      }
    : blocked
      ? {
          label: "已阻塞",
          title: `${constraints.length || 1} 个未解决阻塞条件`,
          description: constraints[0]
            ? demoConstraintText(
                constraints[0].kind,
                constraints[0].description,
              )
            : "存在尚未解决的施工约束。",
          icon: CircleAlert,
          tone: "blocked",
        }
      : stale
        ? {
            label: "需复核",
            title: activeEvent
              ? "工程变化可能影响当前工作包"
              : "工程事实已变化，需要重新检查",
            description: "当前判断基于较早快照，复核后再继续施工。",
            icon: CircleAlert,
            tone: "stale",
          }
        : {
            label: "可施工",
            title: "当前没有未解决的阻塞条件",
            description: "图纸、班组或现场条件变化时，记录变更并重新检查。",
            icon: CircleCheck,
            tone: "ready",
          };
  const StateIcon = state.icon;
  const openModel = () => (onModel ?? onImpact)();
  const metrics = [
    {
      label: "班组",
      value: `${wp.available_workers} / ${wp.required_workers} 人`,
      status:
        wp.available_workers >= wp.required_workers ? "已就绪" : "人员不足",
      ready: wp.available_workers >= wp.required_workers,
      icon: Users,
    },
    {
      label: "材料",
      value: `${available(wp.materials)} / ${defined(wp.materials)} 可用`,
      status: defined(wp.materials)
        ? available(wp.materials) === defined(wp.materials)
          ? "已就绪"
          : "待补充"
        : "未配置",
      ready:
        defined(wp.materials) > 0 &&
        available(wp.materials) === defined(wp.materials),
      icon: Package,
    },
    {
      label: "设备",
      value: `${available(wp.equipment)} / ${defined(wp.equipment)} 可用`,
      status: defined(wp.equipment)
        ? available(wp.equipment) === defined(wp.equipment)
          ? "已就绪"
          : "待补充"
        : "未配置",
      ready:
        defined(wp.equipment) > 0 &&
        available(wp.equipment) === defined(wp.equipment),
      icon: Wrench,
    },
    {
      label: "验收",
      value: wp.inspection_passed ? "已通过" : "未通过",
      status: wp.inspection_passed ? "检查有效" : "需要处理",
      ready: wp.inspection_passed,
      icon: ClipboardCheck,
    },
  ];

  return (
    <section className="coordination-workspace" aria-label="工作包概览">
      <div className="overview-layout">
        <main className="overview-main">
          <header className="work-object-header">
            <div>
              <span className="object-kicker">{wp.id}</span>
              <h1>{demoWorkPackageName(wp.id, wp.name)}</h1>
              <p>
                {demoAreaName(wp.area_id, area?.name ?? wp.area_id)} ·{" "}
                {demoDiscipline(wp.discipline)} · 负责人{" "}
                {demoOwner(wp.id, wp.owner)}
              </p>
            </div>
          </header>
          <section className={`readiness-summary is-${state.tone}`}>
            <StateIcon
              {...icon}
              className={analyzing ? "is-spinning" : undefined}
              aria-hidden="true"
            />
            <div className="readiness-copy">
              <div className="readiness-title-row">
                <h2>{state.label}</h2>
                {analyzing && <span>正在运行</span>}
              </div>
              <h3>{state.title}</h3>
              <p>{state.description}</p>
              <div className="readiness-meta">
                <span>上次检查 {checkedAt(snapshot?.captured_at)}</span>
                <span>快照 {snapshot ? `v${snapshot.version}` : "—"}</span>
                <span>{sourceCount} 份工程来源</span>
              </div>
            </div>
            <div className="readiness-actions">
              {!analyzing && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={onRecheck}
                >
                  重新检查
                </Button>
              )}
              {(blocked || impactCount > 0 || analyzing) && (
                <Button variant="ghost" size="sm" onClick={onImpact}>
                  查看影响
                </Button>
              )}
            </div>
          </section>

          {blocked && !analyzing && (
            <section className="overview-decision">
              <div className="decision-copy">
                <span className="section-label">建议处理</span>
                <h3>
                  {proposal
                    ? demoProposalExplanation(proposal.resolution.explanation)
                    : "等待协调方案"}
                </h3>
                <p>
                  {proposal
                    ? `R${proposal.risk} · 批准后执行并重新检查`
                    : "处理方案准备后会显示在详情中。"}
                </p>
              </div>
              <div className="decision-actions">
                {constraints[0] && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDetails("evidence")}
                  >
                    {constraints[0].evidence_ids.length} 项判断依据
                  </Button>
                )}
                <Button
                  size="sm"
                  disabled={busy || !proposal}
                  onClick={() => onDetails("action")}
                >
                  审查处理方案
                </Button>
              </div>
            </section>
          )}

          {modelContext ?? (
            <section className="model-context model-context-fallback">
              <header className="overview-section-header">
                <div>
                  <span className="section-label">模型上下文</span>
                  <h2>{wp.element_ids.length} 个关联构件</h2>
                </div>
                <Button variant="ghost" size="sm" onClick={openModel}>
                  打开模型
                </Button>
              </header>
              <div className="model-stage-state">
                <Box {...icon} aria-hidden="true" />
                <div>
                  <strong>模型上下文将在项目工作区中加载</strong>
                  <p>打开模型可查看关联构件、属性与变化范围。</p>
                </div>
              </div>
            </section>
          )}

          <section className="relevant-change-strip">
            <div>
              <span className="section-label">最近相关变化</span>
              <h3>
                {activeEvent?.title ??
                  (impactCount
                    ? `${impactCount} 个关联构件进入当前影响范围`
                    : "当前没有影响本工作包的模型变化")}
              </h3>
              <p>
                {activeEvent?.change.revision
                  ? `${wp.accepted_revision} → ${activeEvent.change.revision}`
                  : `${wp.accepted_revision} / ${wp.design_revision}`}
              </p>
            </div>
            {(activeEvent || impactCount > 0) && (
              <Button variant="ghost" size="sm" onClick={onImpact}>
                查看变化
              </Button>
            )}
          </section>

          <section className="construction-conditions">
            <header className="overview-section-header">
              <div>
                <span className="section-label">施工条件</span>
                <h2>现场准备状态</h2>
              </div>
            </header>
            <div className="condition-metrics">
              {metrics.map((metric) => {
                const MetricIcon = metric.icon;
                return (
                  <article key={metric.label}>
                    <MetricIcon {...icon} aria-hidden="true" />
                    <div>
                      <span>{metric.label}</span>
                      <strong>{metric.value}</strong>
                      <small className={metric.ready ? "is-ready" : ""}>
                        {metric.status}
                      </small>
                    </div>
                  </article>
                );
              })}
            </div>
            <AppDisclosure label="其他施工条件">
              <PropertyTable columns={2}>
                <PropertyRow
                  label="前置工作包"
                  value={
                    wp.predecessors?.length ? wp.predecessors.join("、") : "无"
                  }
                />
                <PropertyRow
                  label="资质"
                  value={
                    missingQualifications.length
                      ? `缺少 ${missingQualifications.join("、")}`
                      : "齐备"
                  }
                  attention={missingQualifications.length > 0}
                />
                <PropertyRow
                  label="工作包"
                  value={wp.complete ? "已完成" : "进行中"}
                />
              </PropertyTable>
            </AppDisclosure>
          </section>

          <PropertyGroup
            className="overview-basis"
            title={
              <div className="overview-section-header">
                <div>
                  <span className="section-label">版本与依据</span>
                  <h2>当前协调基准</h2>
                </div>
              </div>
            }
          >
            <PropertyTable columns={2}>
              <PropertyRow label="施工版本" value={wp.accepted_revision} />
              <PropertyRow label="设计版本" value={wp.design_revision} />
              <PropertyRow
                label="分析快照"
                value={snapshot ? `v${snapshot.version}` : "—"}
              />
              <PropertyRow label="工程来源" value={`${sourceCount} 份`} />
            </PropertyTable>
          </PropertyGroup>
        </main>

        <aside className="overview-inspector" aria-label="工作包检查器">
          <header className="overview-inspector-header">
            <div>
              <span className="section-label">检查器</span>
              <h2>工作包详情</h2>
            </div>
            <span className={`readiness-label is-${state.tone}`}>
              <span aria-hidden="true" />
              {state.label}
            </span>
          </header>
          <nav className="overview-inspector-tabs" aria-label="检查器内容">
            {[
              ["properties", "基本信息"],
              ["sources", "工程来源"],
              ["resources", "现场资源"],
            ].map(([id, label]) => (
              <button
                type="button"
                key={id}
                className={inspectorTab === id ? "active" : ""}
                onClick={() => setInspectorTab(id as typeof inspectorTab)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="overview-inspector-body">
            {inspectorTab === "properties" && (
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
                    <PropertyRow
                      label="关联构件"
                      value={`${wp.element_ids.length} 个`}
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
            {inspectorTab === "sources" && (
              <PropertyGroup
                title={<span className="section-label">当前工程来源</span>}
              >
                <div className="overview-source-list">
                  {workspace.state.sources.map((source) => (
                    <div key={`${source.source}-${source.revision}`}>
                      <span>{demoSourceLabel(source.source)}</span>
                      <code>{source.revision}</code>
                    </div>
                  ))}
                  {!workspace.state.sources.length && (
                    <p className="quiet-message">当前项目尚未记录工程来源。</p>
                  )}
                </div>
              </PropertyGroup>
            )}
            {inspectorTab === "resources" && (
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
                    value={`${available(wp.materials)} / ${defined(wp.materials)} 可用`}
                  />
                  <PropertyRow
                    label="设备"
                    value={`${available(wp.equipment)} / ${defined(wp.equipment)} 可用`}
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
      </div>
    </section>
  );
}
