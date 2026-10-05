/* The Browse destination: one central engineering-object stage.
 *
 * Browse is a donor composition (vendor/opentakeoff/). The shell owns the
 * navigator, the tool rail and the contextual inspector; this surface renders
 * exactly one selected object and never owns navigation, a page header, a tab
 * strip, KPI cards or a workspace-wide table. `stageContracts.ts` is the seam.
 *
 * The navigator rows are built by `browseNavigatorItems`, a pure function the
 * shell feeds to its donor `WorkspaceNavigator`; every row key is a `stageKey`
 * so selection round-trips through `stageObject`.
 */
import { useQuery } from "@tanstack/react-query";
import type { JSX, ReactNode } from "react";
import {
  api,
  type DTO,
  type ProjectSourceStatus,
  type Workspace,
} from "../api/client";
import type { StageNavigatorItem, StageObject } from "./stageContracts";
import { stageKey } from "./stageContracts";
import type { WorkspaceTab } from "./destinations";
import { WorkspaceState } from "../components/WorkspaceState";
import { WorkspaceInlineState } from "../components/WorkspaceInlineState";
import { SourceDetailRevisionHistory } from "../features/SourceDetailRevisionHistory";
import { RevisionImpact } from "../features/RevisionImpact";
import {
  revisionState,
  sourceRevisionLabel,
  useProjectSources,
} from "../features/useProjectSources";
import {
  processingLabel,
  useSourceProcessing,
} from "../features/useSourceProcessing";
import { findingStateLabels } from "../features/WorkPanel";
import {
  demoAreaName,
  demoDiscipline,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";
import {
  documentLocation,
  shortDate,
  sourceKindLabel,
  statusLabel,
} from "../ui/labels";
import { StageBand, StageFact } from "./StageBand";
import "../styles/features/browse.css";

type ChipTone = "neutral" | "positive" | "warning" | "danger";

/** A state chip inside a band or a row: the product's one informational badge. */
function StateChip({
  tone,
  children,
}: {
  tone: ChipTone;
  children: ReactNode;
}) {
  return (
    <span className="concord-chip" data-tone={tone}>
      {children}
    </span>
  );
}

/** Object kinds in a source's own words are named by `sourceKindLabel` (ui/labels). */
const revisionRoles = {
  "latest-accepted": "最新 · 当前基线",
  latest: "最新版本",
  accepted: "当前基线",
  historical: "历史版本",
} as const;

/** Processing state a source carries on its own record (not a run query). */
const sourceStateText = (status: ProjectSourceStatus): string =>
  !status.latest_revision_id
    ? "尚未上传"
    : !status.accepted_revision_id
      ? "待确认基线"
      : status.has_pending_revision
        ? "新版本待检查"
        : "当前基线";

const sourceStateTone = (status: ProjectSourceStatus): ChipTone =>
  !status.latest_revision_id
    ? "neutral"
    : status.has_pending_revision || !status.accepted_revision_id
      ? "warning"
      : "positive";

/**
 * A revision sequence is shown as `R{n}` only when a loaded catalog or the
 * workspace state actually carries one. The `版本` group never invents a
 * revision or a number that is not backed by loaded data.
 */
const sequenceOf = (
  data: Workspace,
  revisions: DTO<"ProjectSourceRevision">[] | undefined,
  revisionId: string,
): number | null => {
  const fromCatalog = revisions?.find((item) => item.id === revisionId);
  if (fromCatalog) return fromCatalog.sequence;
  const entry = data.state.sources.find((item) => item.revision === revisionId);
  const match = entry?.revision.match(/^r(\d+)$/i);
  return match ? Number(match[1]) : null;
};

const revisionTag = (
  sequence: number | null,
  role: keyof typeof revisionRoles,
): string => (sequence !== null ? `R${sequence}` : revisionRoles[role]);

/** One flat, ordered navigator list: real objects from the loaded workspace. */
export function browseNavigatorItems(input: {
  data: Workspace;
  sources: ProjectSourceStatus[];
  findings?: DTO<"Finding">[];
  /** Revision catalog for `R{n}` labels; otherwise the state's own numbers. */
  revisions?: DTO<"ProjectSourceRevision">[];
  /** Project documents live behind `api.documents`, not on `Workspace`. */
  documents?: DTO<"DocumentMetadata">[];
}): StageNavigatorItem[] {
  const { data, sources, findings = [], revisions, documents = [] } = input;
  const items: StageNavigatorItem[] = [];

  for (const status of sources) {
    const latest = status.latest_revision_id;
    const tag = latest
      ? revisionTag(
          sequenceOf(data, revisions, latest),
          revisionState(status, latest),
        )
      : null;
    items.push({
      key: stageKey({ kind: "source", id: status.source.id }),
      kind: "source",
      label: status.source.name,
      file: `${sourceKindLabel(status.source.kind)} · ${tag ?? "尚未上传"} · ${sourceStateText(status)}`,
      group: "资料",
    });
  }

  for (const status of sources) {
    const seen = new Set<string>();
    const stateRevisions = data.state.sources
      .filter((item) => item.source === status.source.id)
      .map((item) => item.revision);
    for (const revisionId of [
      status.latest_revision_id,
      status.accepted_revision_id,
      ...stateRevisions,
    ]) {
      if (!revisionId || seen.has(revisionId)) continue;
      seen.add(revisionId);
      const role = revisionState(status, revisionId);
      /* A revision is a child of its source, not a peer of it. The row states its
       * own class (`kind` becomes `data-kind` on the DOM row) and the navigator
       * draws it indented, one tier quieter - so the source stays the parent and
       * the revision reads as the thing that came out of it, instead of two equal
       * rows carrying the same name. */
      items.push({
        key: stageKey({
          kind: "revision",
          sourceId: status.source.id,
          id: revisionId,
        }),
        kind: "revision",
        label: `${status.source.name} · ${revisionTag(
          sequenceOf(data, revisions, revisionId),
          role,
        )}`,
        file: `${sourceKindLabel(status.source.kind)} · ${revisionRoles[role]}`,
        group: "版本",
      });
    }
  }

  for (const document of documents) {
    items.push({
      key: stageKey({ kind: "document", id: document.id }),
      kind: "document",
      label: document.filename,
      file: `${document.parser} · ${shortDate(document.created_at)}`,
      group: "文档",
    });
  }

  for (const workPackage of data.state.work_packages) {
    const area = data.state.areas.find(
      (item) => item.id === workPackage.area_id,
    );
    const count = findings.filter(
      (finding) => finding.work_package_id === workPackage.id,
    ).length;
    items.push({
      key: stageKey({ kind: "work-package", id: workPackage.id }),
      kind: "work-package",
      label: demoWorkPackageName(workPackage.id, workPackage.name),
      file: `${demoAreaName(workPackage.area_id, area?.name ?? workPackage.area_id)} · ${demoDiscipline(workPackage.discipline)}`,
      count: count || undefined,
      group: "工作包",
    });
  }

  for (const finding of findings) {
    items.push({
      key: stageKey({ kind: "finding", id: finding.id }),
      kind: "finding",
      label: finding.title,
      file: `${findingStateLabels[finding.state]} · ${
        finding.suggested_discipline
          ? demoDiscipline(finding.suggested_discipline)
          : "专业未标注"
      }`,
      group: "工程判断",
    });
  }

  return items;
}

type InvestigateInput = {
  sourceId: string;
  revisionId: string;
  fromRevisionId?: string;
  elementIds?: string[];
};

/** A section card: an object on the work plane with its own head, on the width. */
function StageSection({
  label,
  count,
  children,
}: {
  label: string;
  count?: number | string;
  children: ReactNode;
}) {
  return (
    <section className="stage-card" aria-label={label}>
      <header className="stage-card-head">
        <span className="t-label">{label}</span>
        {count !== undefined && (
          <span className="stage-card-count">{count}</span>
        )}
      </header>
      <div className="stage-card-body">{children}</div>
    </section>
  );
}

function SourceStage({
  project,
  data,
  sources,
  sourceId,
  focusRevisionId,
  onOpen,
  onInvestigate,
  onWorkPackage,
}: {
  project: string;
  data: Workspace;
  sources: ProjectSourceStatus[];
  sourceId: string;
  focusRevisionId?: string;
  onOpen: (object: StageObject) => void;
  onInvestigate: (input: InvestigateInput) => void;
  onWorkPackage: (id: string) => void;
}) {
  const sourceData = useProjectSources(project, sourceId);
  const revisions = sourceData.revisions.data ?? [];
  const baselines = sourceData.baselines.data ?? [];
  const processing = useSourceProcessing(project, revisions);
  const current =
    sources.find((item) => item.source.id === sourceId) ??
    sourceData.sources.data?.find((item) => item.source.id === sourceId);
  const latestRevision = revisions.at(-1);
  const latestProcessing = current?.latest_revision_id
    ? processing.states.get(current.latest_revision_id)
    : undefined;

  if (!current)
    return (
      <div className="workspace-stage-body stage-body">
        <div className="stage-canvas">
          <WorkspaceInlineState title="正在读取资料…">
            正在准备该资料的版本、基线与处理状态。
          </WorkspaceInlineState>
        </div>
      </div>
    );

  const latestRevisionId = current.latest_revision_id;
  const baseline = baselines.at(-1);
  return (
    <>
      <StageBand
        kind="资料"
        title={current.source.name}
        meta={
          <>
            <StageFact label="类型">
              {sourceKindLabel(current.source.kind)}
            </StageFact>
            <StageFact label="最新版本">
              {sourceRevisionLabel(
                revisions,
                sourceId,
                current.latest_revision_id,
              )}
            </StageFact>
            <StateChip tone={sourceStateTone(current)}>
              {sourceStateText(current)}
            </StateChip>
          </>
        }
        actions={
          latestRevisionId && (
            <button
              type="button"
              onClick={() =>
                onOpen({
                  kind: "revision",
                  sourceId,
                  id: latestRevisionId,
                })
              }
            >
              查看最新版本
            </button>
          )
        }
      />
      <div className="workspace-stage-body stage-body">
        <div className="stage-canvas">
          <div className="stage-split is-aside">
            <StageSection label="版本状态">
              <dl className="stage-facts is-spec">
                <div>
                  <dt className="t-label">最新版本</dt>
                  <dd className="t-mono-data">
                    {sourceRevisionLabel(
                      revisions,
                      sourceId,
                      current.latest_revision_id,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="t-label">当前基线</dt>
                  <dd className="t-mono-data">
                    {baseline ? `B${baseline.sequence}` : "尚未确认"}
                  </dd>
                </div>
                <div>
                  <dt className="t-label">基线版本</dt>
                  <dd className="t-mono-data">
                    {sourceRevisionLabel(
                      revisions,
                      sourceId,
                      current.accepted_revision_id,
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="t-label">处理状态</dt>
                  <dd>{processingLabel(latestProcessing)}</dd>
                </div>
              </dl>
            </StageSection>

            <div className="stage-stack">
              {current.source.kind === "BIM" && (
                <StageSection label="版本比较">
                  <RevisionImpact
                    project={project}
                    source={sourceId}
                    revisions={revisions}
                    comparisons={sourceData.comparisons.data ?? []}
                    comparing={sourceData.compare.isPending}
                    imported={
                      latestRevision
                        ? processing.states.get(latestRevision.id)?.run
                            ?.status === "COMPLETED"
                        : false
                    }
                    acceptedRevisionId={current.accepted_revision_id}
                    error={sourceData.comparisons.error}
                    onCompare={(from, to) =>
                      sourceData.compare.mutate({
                        from_revision_id: from,
                        to_revision_id: to,
                      })
                    }
                    onSelectComparison={() => {}}
                    onInvestigate={(comparison, elementIds) =>
                      onInvestigate({
                        sourceId,
                        revisionId: comparison.to_revision_id,
                        fromRevisionId: comparison.from_revision_id,
                        elementIds,
                      })
                    }
                    onInspect={(input) => onWorkPackage(input.workPackageId)}
                    workPackages={data.state.work_packages}
                  />
                </StageSection>
              )}

              <StageSection label="版本历史与处理">
                <SourceDetailRevisionHistory
                  project={project}
                  current={current}
                  revisions={revisions}
                  baselines={baselines}
                  loading={sourceData.revisions.isPending}
                  processing={processing}
                  focusRevisionId={focusRevisionId}
                  onInvestigate={(
                    sid,
                    revisionId,
                    fromRevisionId,
                    elementIds,
                  ) =>
                    onInvestigate({
                      sourceId: sid,
                      revisionId,
                      fromRevisionId,
                      elementIds,
                    })
                  }
                />
              </StageSection>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function DocumentStage({
  project,
  documentId,
  onTab,
}: {
  project: string;
  documentId: string;
  onTab: (tab: WorkspaceTab) => void;
}) {
  const documents = useQuery({
    queryKey: ["documents", project],
    queryFn: () => api.documents(project),
  });
  const meta = documents.data?.find((document) => document.id === documentId);
  const chunks = useQuery({
    queryKey: ["chunks", documentId],
    queryFn: () => api.chunks(documentId),
  });
  return (
    <>
      <StageBand
        kind="文档"
        title={meta?.filename ?? "文档"}
        meta={
          meta && (
            <StageFact label="解析">
              {`${meta.parser} · ${shortDate(meta.created_at)}`}
            </StageFact>
          )
        }
        actions={
          <button type="button" onClick={() => onTab("documents")}>
            在文档工作区打开
          </button>
        }
      />
      <div className="workspace-stage-body stage-body">
        <div className="stage-canvas is-reading">
          {documents.isError || chunks.isError ? (
            <WorkspaceInlineState title="文档依据不可用" alert>
              未能读取该文档或它的解析内容。
            </WorkspaceInlineState>
          ) : documents.isPending || chunks.isPending ? (
            <WorkspaceInlineState title="正在读取文档依据…">
              正在准备解析内容。
            </WorkspaceInlineState>
          ) : !chunks.data?.length ? (
            <WorkspaceState
              kind="empty"
              title="当前文档没有解析内容"
              description="导入或重新解析文档后，抽取内容会显示在这里。"
            />
          ) : (
            chunks.data.map((chunk) => (
              <article className="browse-chunk" key={chunk.id}>
                <header className="browse-chunk-head">
                  <span className="t-label">页码</span>
                  <span className="t-mono-data">{chunk.page ?? "—"}</span>
                  <span className="t-label">位置</span>
                  <span className="t-mono-data">
                    {documentLocation(chunk.location)}
                  </span>
                </header>
                <div className="browse-chunk-body">
                  <pre>{chunk.text.replace(/^#{1,6} /gm, "")}</pre>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function WorkPackageStage({
  project,
  data,
  sources,
  packageId,
  onOpen,
  onSource,
  onTab,
}: {
  project: string;
  data: Workspace;
  sources: ProjectSourceStatus[];
  packageId: string;
  onOpen: (object: StageObject) => void;
  onSource: (sourceId: string) => void;
  onTab: (tab: WorkspaceTab) => void;
}) {
  const workPackage = data.state.work_packages.find(
    (item) => item.id === packageId,
  );
  const findings = useQuery({
    queryKey: ["engineering-findings", project],
    queryFn: () => api.engineeringFindings(project),
  });

  if (!workPackage)
    return (
      <div className="workspace-stage-body stage-body">
        <div className="stage-canvas">
          <WorkspaceInlineState title="未找到该工作包">
            当前项目状态里没有这个工作包的记录。
          </WorkspaceInlineState>
        </div>
      </div>
    );

  const readiness = data.analysis?.readiness.find(
    (item) => item.work_package_id === packageId,
  );
  const relatedFindings = (findings.data ?? []).filter(
    (finding) => finding.work_package_id === packageId,
  );
  const evidenceSourceIds = new Set(
    (data.analysis?.evidence ?? [])
      .filter((item) => item.work_package_id === packageId)
      .map((item) => item.source_id),
  );
  const relatedSources = sources.filter((status) =>
    evidenceSourceIds.has(status.source.id),
  );
  const area = data.state.areas.find((item) => item.id === workPackage.area_id);
  const elements = workPackage.element_ids;
  const readinessLabel = data.stale
    ? statusLabel("STALE")
    : statusLabel(readiness?.status ?? "UNCHECKED");
  const readinessTone: ChipTone = data.stale
    ? "warning"
    : readiness?.status === "READY"
      ? "positive"
      : readiness?.status === "BLOCKED"
        ? "danger"
        : "neutral";

  return (
    <>
      <StageBand
        kind="工作包"
        title={demoWorkPackageName(workPackage.id, workPackage.name)}
        meta={
          <>
            <StageFact label="区域">
              {demoAreaName(
                workPackage.area_id,
                area?.name ?? workPackage.area_id,
              )}
            </StageFact>
            <StageFact label="专业">
              {demoDiscipline(workPackage.discipline)}
            </StageFact>
            <StageFact
              label="就绪状态"
              tone={
                readinessTone === "positive"
                  ? "positive"
                  : readinessTone === "neutral"
                    ? undefined
                    : "attention"
              }
            >
              {readinessLabel}
            </StageFact>
            <StageFact label="关联构件">{elements.length}</StageFact>
          </>
        }
        actions={
          <button type="button" onClick={() => onTab("work-packages")}>
            打开工作包目录
          </button>
        }
      />
      <div className="workspace-stage-body stage-body">
        <div className="stage-canvas">
          <div className="stage-split">
            <StageSection label="关联构件" count={elements.length}>
              {elements.length ? (
                <ul className="browse-chips">
                  {elements.slice(0, 24).map((elementId) => (
                    <li className="browse-chip t-mono-data" key={elementId}>
                      {elementId}
                    </li>
                  ))}
                  {elements.length > 24 && (
                    <li className="browse-chip browse-chip-more t-mono-data">
                      +{elements.length - 24}
                    </li>
                  )}
                </ul>
              ) : (
                <p className="browse-quiet">尚未关联构件。</p>
              )}
            </StageSection>

            <div className="stage-stack">
              <StageSection label="相关工程判断" count={relatedFindings.length}>
                {findings.isError ? (
                  <p className="browse-quiet">无法读取工程判断，请稍后重试。</p>
                ) : findings.isPending ? (
                  <p className="browse-quiet" role="status">
                    正在读取工程判断…
                  </p>
                ) : relatedFindings.length ? (
                  <div className="stage-rows">
                    {relatedFindings.map((finding) => (
                      <button
                        type="button"
                        key={finding.id}
                        className="stage-row"
                        onClick={() =>
                          onOpen({ kind: "finding", id: finding.id })
                        }
                      >
                        <span className="stage-row-main">
                          <strong className="stage-row-title">
                            {finding.title}
                          </strong>
                          <span className="stage-row-meta">
                            {finding.suggested_discipline
                              ? demoDiscipline(finding.suggested_discipline)
                              : "专业未标注"}
                          </span>
                        </span>
                        <StateChip
                          tone={
                            finding.state === "CONFIRMED"
                              ? "positive"
                              : "warning"
                          }
                        >
                          {findingStateLabels[finding.state]}
                        </StateChip>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="browse-quiet">暂无与工程判断关联的记录。</p>
                )}
              </StageSection>

              <StageSection label="相关资料" count={relatedSources.length}>
                {relatedSources.length ? (
                  <div className="stage-rows">
                    {relatedSources.map((status) => (
                      <button
                        type="button"
                        key={status.source.id}
                        className="stage-row"
                        onClick={() => onSource(status.source.id)}
                      >
                        <span className="stage-row-main">
                          <strong className="stage-row-title">
                            {status.source.name}
                          </strong>
                          <span className="stage-row-meta">
                            {sourceKindLabel(status.source.kind)}
                          </span>
                        </span>
                        <StateChip tone={sourceStateTone(status)}>
                          {sourceStateText(status)}
                        </StateChip>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="browse-quiet">尚无与工作包关联的资料依据。</p>
                )}
              </StageSection>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function FindingStage({
  project,
  findingId,
  onOpenFinding,
}: {
  project: string;
  findingId: string;
  onOpenFinding: (id: string, evidenceId?: string) => void;
}) {
  const finding = useQuery({
    queryKey: ["engineering-finding", project, findingId],
    queryFn: () => api.engineeringFinding(project, findingId),
  });

  if (finding.isError)
    return (
      <div className="workspace-stage-body stage-body">
        <div className="stage-canvas">
          <WorkspaceInlineState title="无法读取该工程判断" alert>
            未能读取这条工程判断；可在「工作」中重试。
          </WorkspaceInlineState>
        </div>
      </div>
    );

  if (finding.isPending || !finding.data)
    return (
      <div className="workspace-stage-body stage-body">
        <div className="stage-canvas">
          <WorkspaceInlineState title="正在读取工程判断…">
            正在准备这条判断的内容。
          </WorkspaceInlineState>
        </div>
      </div>
    );

  const item = finding.data;
  return (
    <>
      <StageBand
        kind="工程判断"
        title={item.title}
        meta={
          <>
            <StateChip
              tone={item.state === "CONFIRMED" ? "positive" : "warning"}
            >
              {findingStateLabels[item.state]}
            </StateChip>
            {item.suggested_discipline && (
              <StageFact label="建议专业">
                {demoDiscipline(item.suggested_discipline)}
              </StageFact>
            )}
          </>
        }
        actions={
          <button type="button" onClick={() => onOpenFinding(item.id)}>
            在「工作」中打开
          </button>
        }
      />
      <div className="workspace-stage-body stage-body">
        <div className="stage-canvas is-reading">
          <StageSection label="工程判断摘要">
            <h4>变化</h4>
            <p className="stage-copy">
              {item.what_changed || "未记录变更描述。"}
            </p>
            <h4>影响</h4>
            <p className="stage-copy">
              {item.why_it_matters || "未记录影响描述。"}
            </p>
            <p className="stage-quiet">
              {item.evidence_ids.length} 条依据 · 判断与编辑在「工作」中进行。
            </p>
          </StageSection>
        </div>
      </div>
    </>
  );
}

/** The Browse work surface. `object` is the already-decoded selection. */
export function BrowseStage(props: {
  project: string;
  data: Workspace;
  sources: ProjectSourceStatus[];
  perform: (operation: () => Promise<unknown>) => Promise<void>;
  object: StageObject | null;
  onOpen: (object: StageObject) => void;
  onTab: (tab: WorkspaceTab) => void;
  onWorkPackage: (id: string) => void;
  onOpenFinding: (id: string, evidenceId?: string) => void;
  onSource: (sourceId: string) => void;
  onInvestigate: (input: InvestigateInput) => void;
  localIfcFile?: File | null;
  onLocalIfcFile?: (file: File | null) => void;
  busy?: boolean;
}): JSX.Element {
  const {
    project,
    data,
    sources,
    object,
    onOpen,
    onTab,
    onWorkPackage,
    onOpenFinding,
    onSource,
    onInvestigate,
  } = props;

  return (
    <main className="workspace-stage-surface" aria-busy={props.busy}>
      <div className="browse-stage">
        {object === null ? (
          <div className="workspace-stage-body stage-body browse-stage-empty">
            <WorkspaceState
              kind="empty"
              title="在导航中选择对象"
              description="从资料、版本、文档、工作包或工程判断中选择一个对象，这里显示它的工程上下文。"
            />
          </div>
        ) : object.kind === "source" ? (
          <SourceStage
            project={project}
            data={data}
            sources={sources}
            sourceId={object.id}
            onOpen={onOpen}
            onInvestigate={onInvestigate}
            onWorkPackage={onWorkPackage}
          />
        ) : object.kind === "revision" ? (
          <SourceStage
            project={project}
            data={data}
            sources={sources}
            sourceId={object.sourceId}
            focusRevisionId={object.id}
            onOpen={onOpen}
            onInvestigate={onInvestigate}
            onWorkPackage={onWorkPackage}
          />
        ) : object.kind === "document" ? (
          <DocumentStage
            project={project}
            documentId={object.id}
            onTab={onTab}
          />
        ) : object.kind === "work-package" ? (
          <WorkPackageStage
            project={project}
            data={data}
            sources={sources}
            packageId={object.id}
            onOpen={onOpen}
            onSource={onSource}
            onTab={onTab}
          />
        ) : object.kind === "finding" ? (
          <FindingStage
            project={project}
            findingId={object.id}
            onOpenFinding={onOpenFinding}
          />
        ) : (
          <div className="workspace-stage-body stage-body">
            <div className="stage-canvas">
              <WorkspaceInlineState title="在模型工作区中查看">
                这个对象没有可在此显示的工程上下文。
              </WorkspaceInlineState>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
