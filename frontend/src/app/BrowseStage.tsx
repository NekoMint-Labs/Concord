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
import { Button } from "../components/ui/button";
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
import { documentLocation, shortDate, sourceKindLabel, statusLabel } from "../ui/labels";
import "../styles/features/browse.css";

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
  const {
    data,
    sources,
    findings = [],
    revisions,
    documents = [],
  } = input;
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
      items.push({
        key: stageKey({
          kind: "revision",
          sourceId: status.source.id,
          id: revisionId,
        }),
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
      label: document.filename,
      file: `${document.parser} · ${shortDate(document.created_at)}`,
      group: "文档",
    });
  }

  for (const workPackage of data.state.work_packages) {
    const area = data.state.areas.find((item) => item.id === workPackage.area_id);
    const count = findings.filter(
      (finding) => finding.work_package_id === workPackage.id,
    ).length;
    items.push({
      key: stageKey({ kind: "work-package", id: workPackage.id }),
      label: demoWorkPackageName(workPackage.id, workPackage.name),
      file: `${demoAreaName(workPackage.area_id, area?.name ?? workPackage.area_id)} · ${demoDiscipline(workPackage.discipline)}`,
      count: count || undefined,
      group: "工作包",
    });
  }

  for (const finding of findings) {
    items.push({
      key: stageKey({ kind: "finding", id: finding.id }),
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

/** Identity line of the selected object. Not a page header, the object's own. */
function StageHead({
  kind,
  title,
  meta,
  actions,
}: {
  kind: string;
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="browse-stage-head">
      <div className="browse-identity">
        <span className="t-label browse-kind">{kind}</span>
        <h2>{title}</h2>
        {meta && <p className="browse-head-meta">{meta}</p>}
      </div>
      {actions && <div className="browse-head-actions">{actions}</div>}
    </header>
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
      <div className="browse-stage-body">
        <WorkspaceInlineState title="正在读取资料…">
          正在准备该资料的版本、基线与处理状态。
        </WorkspaceInlineState>
      </div>
    );

  const latestRevisionId = current.latest_revision_id;
  const baseline = baselines.at(-1);
  return (
    <>
      <StageHead
        kind="资料"
        title={current.source.name}
        meta={`${sourceKindLabel(current.source.kind)} · ${sourceStateText(current)}`}
        actions={
          latestRevisionId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                onOpen({
                  kind: "revision",
                  sourceId,
                  id: latestRevisionId,
                })
              }
            >
              查看最新版本
            </Button>
          )
        }
      />
      <div className="browse-stage-body">
        <dl className="browse-meta">
          <div>
            <dt className="t-label">最新版本</dt>
            <dd className="t-mono-data">
              {sourceRevisionLabel(revisions, sourceId, current.latest_revision_id)}
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
            <dd className="browse-value">{processingLabel(latestProcessing)}</dd>
          </div>
        </dl>

        {current.source.kind === "BIM" && (
          <section className="browse-section" aria-label="版本比较">
            <h3 className="t-label">版本比较</h3>
            <RevisionImpact
              project={project}
              source={sourceId}
              revisions={revisions}
              comparisons={sourceData.comparisons.data ?? []}
              comparing={sourceData.compare.isPending}
              imported={
                latestRevision
                  ? processing.states.get(latestRevision.id)?.run?.status ===
                    "COMPLETED"
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
          </section>
        )}

        <section className="browse-section" aria-label="版本历史与处理">
          <SourceDetailRevisionHistory
            project={project}
            current={current}
            revisions={revisions}
            baselines={baselines}
            loading={sourceData.revisions.isPending}
            processing={processing}
            focusRevisionId={focusRevisionId}
            onInvestigate={(sid, revisionId, fromRevisionId, elementIds) =>
              onInvestigate({
                sourceId: sid,
                revisionId,
                fromRevisionId,
                elementIds,
              })
            }
          />
        </section>
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
      <StageHead
        kind="文档"
        title={meta?.filename ?? "文档"}
        meta={meta ? `${meta.parser} · ${shortDate(meta.created_at)}` : undefined}
        actions={
          <Button variant="ghost" size="sm" onClick={() => onTab("documents")}>
            在文档工作区打开
          </Button>
        }
      />
      <div className="browse-stage-body">
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
      <div className="browse-stage-body">
        <WorkspaceInlineState title="未找到该工作包">
          当前项目状态里没有这个工作包的记录。
        </WorkspaceInlineState>
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

  return (
    <>
      <StageHead
        kind="工作包"
        title={demoWorkPackageName(workPackage.id, workPackage.name)}
        meta={`${demoAreaName(workPackage.area_id, area?.name ?? workPackage.area_id)} · ${demoDiscipline(workPackage.discipline)}`}
        actions={
          <Button variant="ghost" size="sm" onClick={() => onTab("work-packages")}>
            打开工作包目录
          </Button>
        }
      />
      <div className="browse-stage-body">
        <dl className="browse-meta">
          <div>
            <dt className="t-label">就绪状态</dt>
            <dd className="browse-value">
              {data.stale
                ? statusLabel("STALE")
                : statusLabel(readiness?.status ?? "UNCHECKED")}
            </dd>
          </div>
          <div>
            <dt className="t-label">关联构件</dt>
            <dd className="t-mono-data">{elements.length}</dd>
          </div>
          <div>
            <dt className="t-label">相关判断</dt>
            <dd className="t-mono-data">{relatedFindings.length}</dd>
          </div>
          <div>
            <dt className="t-label">相关资料</dt>
            <dd className="t-mono-data">{relatedSources.length}</dd>
          </div>
        </dl>

        <section className="browse-section" aria-label="关联构件">
          <h3 className="t-label">关联构件</h3>
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
        </section>

        <section className="browse-section" aria-label="相关工程判断">
          <h3 className="t-label">相关工程判断</h3>
          {findings.isError ? (
            <p className="browse-quiet">无法读取工程判断，请稍后重试。</p>
          ) : findings.isPending ? (
            <p className="browse-quiet" role="status">
              正在读取工程判断…
            </p>
          ) : relatedFindings.length ? (
            <ul className="browse-links">
              {relatedFindings.map((finding) => (
                <li key={finding.id}>
                  <button
                    type="button"
                    className="row browse-row"
                    onClick={() => onOpen({ kind: "finding", id: finding.id })}
                  >
                    <span className="browse-link-copy">
                      <strong>{finding.title}</strong>
                      <small>
                        {findingStateLabels[finding.state]}
                        {finding.suggested_discipline
                          ? ` · ${demoDiscipline(finding.suggested_discipline)}`
                          : ""}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="browse-quiet">暂无与工程判断关联的记录。</p>
          )}
        </section>

        <section className="browse-section" aria-label="相关资料">
          <h3 className="t-label">相关资料</h3>
          {relatedSources.length ? (
            <ul className="browse-links">
              {relatedSources.map((status) => (
                <li key={status.source.id}>
                  <button
                    type="button"
                    className="row browse-row"
                    onClick={() => onSource(status.source.id)}
                  >
                    <span className="browse-link-copy">
                      <strong>{status.source.name}</strong>
                      <small>
                        {sourceKindLabel(status.source.kind)} ·{" "}
                        {sourceStateText(status)}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="browse-quiet">尚无与工作包关联的资料依据。</p>
          )}
        </section>
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
      <div className="browse-stage-body">
        <WorkspaceInlineState title="无法读取该工程判断" alert>
          未能读取这条工程判断；可在「工作」中重试。
        </WorkspaceInlineState>
      </div>
    );

  if (finding.isPending || !finding.data)
    return (
      <div className="browse-stage-body">
        <WorkspaceInlineState title="正在读取工程判断…">
          正在准备这条判断的内容。
        </WorkspaceInlineState>
      </div>
    );

  const item = finding.data;
  return (
    <>
      <StageHead
        kind="工程判断"
        title={item.title}
        meta={`${findingStateLabels[item.state]}${
          item.suggested_discipline
            ? ` · ${demoDiscipline(item.suggested_discipline)}`
            : ""
        }`}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenFinding(item.id)}
          >
            在「工作」中打开
          </Button>
        }
      />
      <div className="browse-stage-body">
        <section className="browse-section" aria-label="工程判断摘要">
          <h3 className="t-label">变化</h3>
          <p className="browse-copy">{item.what_changed || "未记录变更描述。"}</p>
          <h3 className="t-label">影响</h3>
          <p className="browse-copy">{item.why_it_matters || "未记录影响描述。"}</p>
          <p className="browse-quiet">
            {item.evidence_ids.length} 条依据 · 判断与编辑在「工作」中进行。
          </p>
        </section>
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
          <div className="browse-stage-body browse-stage-empty">
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
          <div className="browse-stage-body">
            <WorkspaceInlineState title="在模型工作区中查看">
              这个对象没有可在此显示的工程上下文。
            </WorkspaceInlineState>
          </div>
        )}
      </div>
    </main>
  );
}
