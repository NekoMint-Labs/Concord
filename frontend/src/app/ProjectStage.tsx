/* The Project destination: a workspace context mode, not a dashboard.
 *
 * The shell owns navigation, the tool rail and the one contextual inspector.
 * This surface owns only the project's engineering state in the same shell:
 * a StageBand that names the project and its facts, and — inside one scrolling
 * body — the project's objects as section cards. It never owns navigation, a page
 * header, a tab strip, a KPI grid or a dashboard grid. Donor vocabulary only:
 * tokens, hairline rules and mono metadata labels.
 */
import { type JSX } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  api,
  type DTO,
  type ProjectSourceStatus,
  type Workspace,
} from "../api/client";
import { ProjectSourceRegister } from "../features/ProjectSourceRegister";
import { SourceDetailRevisionHistory } from "../features/SourceDetailRevisionHistory";
import { useEngineeringFindings } from "../features/useEngineeringFindings";
import { useProjectSources } from "../features/useProjectSources";
import { useSourceProcessing } from "../features/useSourceProcessing";
import { findingStateLabels } from "../features/WorkPanel";
import {
  demoAreaName,
  demoDiscipline,
  demoProjectName,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";
import { shortDate, statusLabel } from "../ui/labels";
import {
  stageKey,
  type StageNavigatorItem,
  type StageObject,
} from "./stageContracts";
import type { WorkspaceTab } from "./destinations";
import { StageBand, StageFact } from "./StageBand";
import "../styles/features/project-stage.css";

type ChipTone = "neutral" | "positive" | "warning" | "danger";

const sourceKindLabel = (
  kind: ProjectSourceStatus["source"]["kind"],
): string => {
  switch (kind) {
    case "BIM":
      return "IFC 模型";
    case "DRAWING":
      return "图纸";
    case "SCHEDULE":
      return "计划";
    default:
      return "工程文档";
  }
};

/** A source's own engineering state, from live status only — never invented. */
const sourceStateText = (item: ProjectSourceStatus): string => {
  if (!item.latest_revision_id) return "尚未上传";
  if (item.has_pending_revision) return "待确认";
  if (item.accepted_revision_id) return "基线已确认";
  return "尚未确认基线";
};

const sourceStateTone = (item: ProjectSourceStatus): ChipTone =>
  !item.latest_revision_id
    ? "neutral"
    : item.has_pending_revision
      ? "warning"
      : item.accepted_revision_id
        ? "positive"
        : "warning";

const isOpenFinding = (finding: DTO<"Finding">): boolean =>
  finding.state === "PROPOSED" || finding.state === "CONFIRMED";

/**
 * The project's own engineering state as a grouped navigator list: its sources,
 * the revisions actually present in the loaded workspace state, and its work
 * packages. Only real ids from live data; an empty group produces no items.
 */
export function projectNavigatorItems({
  data,
  sources,
}: {
  data: Workspace;
  sources: ProjectSourceStatus[];
}): StageNavigatorItem[] {
  const items: StageNavigatorItem[] = [];
  for (const item of sources) {
    items.push({
      key: stageKey({ kind: "source", id: item.source.id }),
      kind: "source",
      label: item.source.name,
      file: `${sourceKindLabel(item.source.kind)} · ${
        item.latest_revision_id ? "最新版本" : "无版本"
      } · ${sourceStateText(item)}`,
      group: "资料",
    });
  }

  /* `data.state.sources` holds the legacy internal revision tokens
   * (`drawing`/`r1`), not project revisions. They are not engineering objects
   * and must never appear in the navigator: a source row opens the stage, and
   * the stage lists that source's real revision register. */
  for (const workPackage of data.state.work_packages) {
    const area = data.state.areas.find(
      (item) => item.id === workPackage.area_id,
    );
    items.push({
      key: stageKey({ kind: "work-package", id: workPackage.id }),
      kind: "work-package",
      label: demoWorkPackageName(workPackage.id, workPackage.name),
      file: `${demoAreaName(
        workPackage.area_id,
        area?.name ?? workPackage.area_id,
      )} · ${demoDiscipline(workPackage.discipline)}`,
      group: "工作包",
    });
  }

  return items;
}

export function ProjectStage({
  project,
  data,
  sources,
  object,
  onOpen,
  onSource,
  onWorkPackage,
  onTab,
  onRecheck,
  onStructure,
  onOpenFinding,
  busy,
}: {
  project: string;
  data: Workspace;
  sources: ProjectSourceStatus[];
  perform: (operation: () => Promise<unknown>) => Promise<void>;
  object: StageObject | null;
  onOpen: (object: StageObject) => void;
  onSource: (sourceId: string) => void;
  onWorkPackage: (id: string) => void;
  onTab: (tab: WorkspaceTab) => void;
  onRecheck: () => void;
  onStructure: () => void;
  onOpenFinding: (id: string, evidenceId?: string) => void;
  busy?: boolean;
}): JSX.Element {
  const baselines = useQuery({
    queryKey: ["baselines", project],
    queryFn: () => api.baselines(project),
  });
  const baseline = baselines.data?.at(-1);
  const findings = useEngineeringFindings(project);
  const findingsList: DTO<"Finding">[] = findings.data ?? [];
  const modelSources = sources.filter(
    (item) => item.source.kind === "BIM" && item.latest_revision_id,
  );
  const pendingModels = modelSources.filter(
    (item) => item.has_pending_revision,
  );
  const stateLabel = data.stale
    ? "需要重新检查"
    : data.analysis
      ? "已检查"
      : "尚未检查";
  const attention = data.stale || !data.analysis;
  const modelMeta = !modelSources.length
    ? "无项目模型"
    : pendingModels.length
      ? `${pendingModels.length} 份模型待确认`
      : `${modelSources.length} 份模型已同步`;

  const sourceId =
    object?.kind === "source"
      ? object.id
      : object?.kind === "revision"
        ? object.sourceId
        : "";
  const focusRevisionId = object?.kind === "revision" ? object.id : undefined;

  return (
    <main className="workspace-stage-surface" aria-label="项目">
      <StageBand
        kind="项目"
        title={demoProjectName(project, data.state.project.name)}
        meta={
          <>
            <StageFact label="当前基线">
              {baseline ? `B${baseline.sequence}` : "尚未确认"}
            </StageFact>
            <StageFact label="模型">{modelMeta}</StageFact>
            <StageFact label="状态" tone={attention ? "attention" : undefined}>
              {stateLabel}
            </StageFact>
          </>
        }
        actions={
          <>
            <button type="button" disabled={busy} onClick={onRecheck}>
              重新检查
            </button>
            <button type="button" disabled={busy} onClick={onStructure}>
              项目结构
            </button>
            <button type="button" onClick={() => onTab("sources")}>
              添加资料
            </button>
          </>
        }
      />

      <div className="workspace-stage-body stage-body">
        <div className="stage-canvas">
          {object === null ? (
            <ProjectStateList
              data={data}
              sources={sources}
              baseline={baseline}
              findings={findingsList}
              onSource={onSource}
              onWorkPackage={onWorkPackage}
              onOpenFinding={onOpenFinding}
              onTab={onTab}
            />
          ) : object.kind === "source" || object.kind === "revision" ? (
            <SourceStage
              project={project}
              sourceId={sourceId}
              focusRevisionId={focusRevisionId}
              sources={sources}
              onSource={onSource}
            />
          ) : object.kind === "work-package" ? (
            <WorkPackageStage
              data={data}
              sources={sources}
              id={object.id}
              findings={findingsList}
              onOpen={onOpen}
              onOpenFinding={onOpenFinding}
            />
          ) : (
            <p className="stage-empty">
              在导航器中选择一份资料、一个版本或一个工作包；该对象的完整来源与依据在检查器中查看。
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

/** The project at a glance: the current revision, then its objects as cards. */
function ProjectStateList({
  data,
  sources,
  baseline,
  findings,
  onSource,
  onWorkPackage,
  onOpenFinding,
  onTab,
}: {
  data: Workspace;
  sources: ProjectSourceStatus[];
  baseline: DTO<"Baseline"> | undefined;
  findings: DTO<"Finding">[];
  onSource: (sourceId: string) => void;
  onWorkPackage: (id: string) => void;
  onOpenFinding: (id: string, evidenceId?: string) => void;
  onTab: (tab: WorkspaceTab) => void;
}): JSX.Element {
  const packages = data.state.work_packages;
  const openFindings = findings.filter(isOpenFinding);
  const packageName = (id: string) => {
    const workPackage = packages.find((item) => item.id === id);
    return workPackage
      ? demoWorkPackageName(workPackage.id, workPackage.name)
      : id;
  };
  const readinessText = (id: string) => {
    if (data.stale) return "需要重新检查";
    const readiness = data.analysis?.readiness.find(
      (item) => item.work_package_id === id,
    );
    return statusLabel(readiness?.status ?? "UNCHECKED");
  };
  const readinessTone = (id: string): ChipTone => {
    if (data.stale) return "warning";
    const status = data.analysis?.readiness.find(
      (item) => item.work_package_id === id,
    )?.status;
    if (status === "READY") return "positive";
    if (status === "BLOCKED") return "danger";
    return "neutral";
  };

  return (
    <section className="stage-overview" aria-label="项目工程状态">
      <section className="stage-card" aria-label="当前基线">
        <header className="stage-card-head">
          <span className="t-label">工程基线</span>
          <span className="stage-card-count">
            {baseline ? `B${baseline.sequence}` : "未确认"}
          </span>
        </header>
        <div className="stage-rows">
          <button
            type="button"
            className="stage-row"
            onClick={() => onTab("history")}
          >
            <span className="stage-row-main">
              <strong className="stage-row-title">
                当前基线 {baseline ? `B${baseline.sequence}` : "尚未确认"}
              </strong>
              <span className="stage-row-meta">
                {baseline
                  ? `${baseline.accepted_by || "未记录确认人"} · ${shortDate(
                      baseline.created_at,
                    )}`
                  : "尚未人工确认资料版本集合"}
              </span>
            </span>
            <span
              className="concord-chip"
              data-tone={baseline ? "positive" : "warning"}
            >
              {baseline ? "已确认" : "待确认"}
            </span>
          </button>
        </div>
      </section>

      <div className="stage-split">
        <section className="stage-card" aria-label="资料">
          <header className="stage-card-head">
            <span className="t-label">资料</span>
            <span className="stage-card-count">{sources.length}</span>
          </header>
          <div className="stage-rows">
            {sources.map((item) => (
              <button
                key={item.source.id}
                type="button"
                className="stage-row"
                onClick={() => onSource(item.source.id)}
              >
                <span className="stage-row-main">
                  <strong className="stage-row-title">
                    {item.source.name}
                  </strong>
                  <span className="stage-row-meta">
                    {sourceKindLabel(item.source.kind)} ·{" "}
                    {item.latest_revision_id ? "最新版本" : "无版本"}
                  </span>
                </span>
                <span
                  className="concord-chip"
                  data-tone={sourceStateTone(item)}
                >
                  {sourceStateText(item)}
                </span>
              </button>
            ))}
            {!sources.length && (
              <p className="stage-empty-note">
                还没有资料。添加 IFC 或当前服务支持的工程文档。
              </p>
            )}
          </div>
        </section>

        <section className="stage-card" aria-label="工作包">
          <header className="stage-card-head">
            <span className="t-label">工作包</span>
            <span className="stage-card-count">{packages.length}</span>
          </header>
          <div className="stage-rows">
            {packages.map((workPackage) => {
              const area = data.state.areas.find(
                (item) => item.id === workPackage.area_id,
              );
              return (
                <button
                  key={workPackage.id}
                  type="button"
                  className="stage-row"
                  onClick={() => onWorkPackage(workPackage.id)}
                >
                  <span className="stage-row-main">
                    <strong className="stage-row-title">
                      {demoWorkPackageName(workPackage.id, workPackage.name)}
                    </strong>
                    <span className="stage-row-meta">
                      {demoAreaName(
                        workPackage.area_id,
                        area?.name ?? workPackage.area_id,
                      )}{" "}
                      · {demoDiscipline(workPackage.discipline)} ·{" "}
                      {workPackage.element_ids.length} 构件
                    </span>
                  </span>
                  <span
                    className="concord-chip"
                    data-tone={readinessTone(workPackage.id)}
                  >
                    {readinessText(workPackage.id)}
                  </span>
                </button>
              );
            })}
            {!packages.length && (
              <p className="stage-empty-note">还没有工作包。</p>
            )}
          </div>
        </section>
      </div>

      {!!openFindings.length && (
        <section className="stage-card" aria-label="未解决事项">
          <header className="stage-card-head">
            <span className="t-label">未解决事项</span>
            <span className="stage-card-count">{openFindings.length}</span>
          </header>
          <div className="stage-rows">
            {openFindings.map((finding) => (
              <button
                key={finding.id}
                type="button"
                className="stage-row"
                onClick={() =>
                  onOpenFinding(finding.id, finding.evidence_ids[0])
                }
              >
                <span className="stage-row-main">
                  <strong className="stage-row-title">{finding.title}</strong>
                  <span className="stage-row-meta">
                    {packageName(finding.work_package_id)} ·{" "}
                    {findingStateLabels[finding.state]}
                  </span>
                </span>
                <span
                  className="concord-chip"
                  data-tone={
                    finding.state === "CONFIRMED" ? "positive" : "warning"
                  }
                >
                  {finding.state === "CONFIRMED" ? "已确认" : "待判断"}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

/** A source (or one of its revisions): its register and revision history. */
function SourceStage({
  project,
  sourceId,
  focusRevisionId,
  sources,
  onSource,
}: {
  project: string;
  sourceId: string;
  focusRevisionId?: string;
  sources: ProjectSourceStatus[];
  onSource: (sourceId: string) => void;
}): JSX.Element {
  const data = useProjectSources(project, sourceId);
  const revisions = data.revisions.data ?? [];
  const processing = useSourceProcessing(project, revisions);
  const baselines = data.baselines.data ?? [];
  const current =
    sources.find((item) => item.source.id === sourceId) ??
    data.sources.data?.find((item) => item.source.id === sourceId);

  return (
    <div className="stage-stack">
      <section className="stage-card" aria-label="资料登记">
        <div className="stage-card-body is-flush">
          <ProjectSourceRegister
            project={project}
            sourceId={sourceId}
            onSelectSource={onSource}
          />
        </div>
      </section>
      {current && (
        <section className="stage-card" aria-label="版本历史">
          <div className="stage-card-body">
            <SourceDetailRevisionHistory
              project={project}
              current={current}
              revisions={revisions}
              baselines={baselines}
              loading={data.revisions.isPending}
              processing={processing}
              focusRevisionId={focusRevisionId}
            />
          </div>
        </section>
      )}
    </div>
  );
}

/** A work package's context: area, discipline, readiness, sources, findings. */
function WorkPackageStage({
  data,
  sources,
  id,
  findings,
  onOpen,
  onOpenFinding,
}: {
  data: Workspace;
  sources: ProjectSourceStatus[];
  id: string;
  findings: DTO<"Finding">[];
  onOpen: (object: StageObject) => void;
  onOpenFinding: (id: string, evidenceId?: string) => void;
}): JSX.Element {
  const workPackage = data.state.work_packages.find((item) => item.id === id);
  if (!workPackage)
    return (
      <p className="stage-empty">该工作包不在当前工程状态中，可能已被移除。</p>
    );
  const area = data.state.areas.find((item) => item.id === workPackage.area_id);
  const readiness = data.analysis?.readiness.find(
    (item) => item.work_package_id === id,
  );
  const constraints = (data.analysis?.constraints ?? []).filter(
    (item) => item.work_package_id === id && item.blocking,
  );
  const relatedFindings = findings.filter(
    (item) => item.work_package_id === id,
  );
  const relatedSourceIds = [
    ...new Set(
      (data.analysis?.evidence ?? [])
        .filter((item) => item.work_package_id === id)
        .map((item) => item.source_id),
    ),
  ];
  const relatedSources = relatedSourceIds
    .map((sourceId) => sources.find((item) => item.source.id === sourceId))
    .filter((item): item is ProjectSourceStatus => !!item);
  const readinessText = data.stale
    ? "需要重新检查"
    : statusLabel(readiness?.status ?? "UNCHECKED");

  return (
    <div className="stage-stack">
      <section className="stage-card" aria-label="工作包">
        <header className="stage-card-head">
          <span className="t-label">工作包</span>
          <span className="stage-card-count">{workPackage.id}</span>
        </header>
        <dl className="stage-facts">
          <div>
            <dt className="t-label">区域</dt>
            <dd>
              {demoAreaName(
                workPackage.area_id,
                area?.name ?? workPackage.area_id,
              )}
            </dd>
          </div>
          <div>
            <dt className="t-label">专业</dt>
            <dd>{demoDiscipline(workPackage.discipline)}</dd>
          </div>
          <div>
            <dt className="t-label">负责人</dt>
            <dd>{workPackage.owner || "未指定"}</dd>
          </div>
          <div>
            <dt className="t-label">构件</dt>
            <dd className="t-mono-data">{workPackage.element_ids.length}</dd>
          </div>
          <div>
            <dt className="t-label">当前判断</dt>
            <dd data-tone={data.stale ? "attention" : undefined}>
              {readinessText}
            </dd>
          </div>
        </dl>
        {!!constraints.length && (
          <p className="stage-empty-note">
            {constraints.length} 个未解决的阻塞条件：
            {constraints.map((item) => item.description).join("；")}
          </p>
        )}
      </section>

      <div className="stage-split">
        <section className="stage-card" aria-label="相关资料">
          <header className="stage-card-head">
            <span className="t-label">相关资料</span>
            <span className="stage-card-count">{relatedSources.length}</span>
          </header>
          <div className="stage-rows">
            {relatedSources.map((item) => (
              <button
                key={item.source.id}
                type="button"
                className="stage-row"
                onClick={() => onOpen({ kind: "source", id: item.source.id })}
              >
                <span className="stage-row-main">
                  <strong className="stage-row-title">
                    {item.source.name}
                  </strong>
                  <span className="stage-row-meta">
                    {sourceKindLabel(item.source.kind)}
                  </span>
                </span>
                <span
                  className="concord-chip"
                  data-tone={item.latest_revision_id ? "positive" : "neutral"}
                >
                  {item.latest_revision_id ? "已导入版本" : "尚无版本"}
                </span>
              </button>
            ))}
            {!relatedSources.length && (
              <p className="stage-empty-note">暂无与本工作包直接关联的资料。</p>
            )}
          </div>
        </section>

        <section className="stage-card" aria-label="相关工程判断">
          <header className="stage-card-head">
            <span className="t-label">相关工程判断</span>
            <span className="stage-card-count">{relatedFindings.length}</span>
          </header>
          <div className="stage-rows">
            {relatedFindings.map((finding) => (
              <button
                key={finding.id}
                type="button"
                className="stage-row"
                onClick={() =>
                  onOpenFinding(finding.id, finding.evidence_ids[0])
                }
              >
                <span className="stage-row-main">
                  <strong className="stage-row-title">{finding.title}</strong>
                  <span className="stage-row-meta">
                    {findingStateLabels[finding.state]}
                  </span>
                </span>
                <span
                  className="concord-chip"
                  data-tone={
                    finding.state === "CONFIRMED" ? "positive" : "warning"
                  }
                >
                  {finding.state === "CONFIRMED" ? "已确认" : "待判断"}
                </span>
              </button>
            ))}
            {!relatedFindings.length && (
              <p className="stage-empty-note">没有与该工作包相关的工程判断。</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
