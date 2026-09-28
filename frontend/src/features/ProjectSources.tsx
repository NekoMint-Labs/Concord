import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  api,
  type DTO,
  type InvestigationReport,
  type WorkPackage,
} from "../api/client";
import { Button } from "../components/ui/button";
import { useProjectSources } from "./useProjectSources";
import { BaselineHistory } from "./BaselineHistory";
import type { BimMappingContext } from "./BimMappingWorkspace";
import { CreateSourceDialog } from "./CreateSourceDialog";
import { RevisionImpact } from "./RevisionImpact";
import { Pane, PaneDivider, PaneSplit } from "../layout/PaneSplit";
import { demoInvestigationText } from "../ui/demo/demoPresentation";

export function revisionState(
  status: DTO<"ProjectSourceStatus">,
  revisionId: string,
): "latest" | "accepted" | "latest-accepted" | "historical" {
  const latest = status.latest_revision_id === revisionId;
  const accepted = status.accepted_revision_id === revisionId;
  if (latest && accepted) return "latest-accepted";
  if (latest) return "latest";
  if (accepted) return "accepted";
  return "historical";
}

export function freshCheckAfterImport(
  ready: boolean,
  checkedAt?: string,
  importFinishedAt?: string,
): boolean {
  return (
    !!ready &&
    !!checkedAt &&
    !!importFinishedAt &&
    new Date(checkedAt).getTime() > new Date(importFinishedAt).getTime()
  );
}

const stateLabel = {
  latest: "最新版本 · 待审核",
  accepted: "当前基线中的版本",
  "latest-accepted": "最新版本 · 当前基线",
  historical: "历史版本",
};

const sourceKindLabel: Record<string, string> = {
  BIM: "BIM 模型",
  DOCUMENT: "工程文档",
  DRAWING: "施工图纸",
  SCHEDULE: "进度计划",
};

export function ProjectSources({
  project,
  workPackages = [],
  report,
  onContext,
  onRun,
  onInvestigate,
  onInspectImpact,
  onOpenInvestigation,
  readyForNewBaseline = false,
  lastCheckAt,
  checkFailed = false,
  onRecheck,
  onWorkPackage,
  onChanges,
}: {
  project: string;
  workPackages?: WorkPackage[];
  report?: InvestigationReport | null;
  onContext: (
    sourceId: string,
    revisionId?: string,
    revisionLabel?: string,
    fromRevisionId?: string,
    fromRevisionLabel?: string,
  ) => void;
  onRun: (run: DTO<"AgentRun">) => void;
  onInvestigate: (
    sourceId: string,
    revisionId: string,
    fromRevisionId?: string,
    elementIds?: string[],
    revisionLabel?: string,
    fromRevisionLabel?: string,
  ) => void;
  onInspectImpact: (workPackageId: string, context: BimMappingContext) => void;
  onOpenInvestigation: () => void;
  readyForNewBaseline?: boolean;
  lastCheckAt?: string;
  checkFailed?: boolean;
  onRecheck?: () => void;
  onWorkPackage?: () => void;
  onChanges?: () => void;
}) {
  const [sourceId, setSourceId] = useState(() => {
    try {
      return sessionStorage.getItem(`concord:model:${project}`) ?? "";
    } catch {
      return "";
    }
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [uploadNotice, setUploadNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const sourceData = useProjectSources(project, sourceId);
  const notices = useQuery({
    queryKey: ["agent-notices", project],
    queryFn: () => api.agentNotices(project),
  });
  const statuses = sourceData.sources.data ?? [];
  const current = statuses.find((item) => item.source.id === sourceId);
  const latestImport = useQuery({
    queryKey: [
      "revision-import",
      project,
      sourceId,
      current?.latest_revision_id,
    ],
    queryFn: () =>
      api.revisionImport(project, sourceId, current!.latest_revision_id!),
    enabled: !!current?.latest_revision_id && current.source.kind === "BIM",
    refetchInterval: (query) =>
      ["QUEUED", "RUNNING"].includes(query.state.data?.status ?? "")
        ? 1500
        : false,
  });
  const baseline = sourceData.baselines.data?.at(-1);
  const reviewed = (sourceData.comparisons.data ?? []).some(
    (comparison) =>
      comparison.from_revision_id === current?.accepted_revision_id &&
      comparison.to_revision_id === current?.latest_revision_id,
  );
  const pendingReview =
    !!current?.accepted_revision_id && current.has_pending_revision;
  const otherSources = statuses.filter(
    (item) => item.latest_revision_id && item.source.id !== sourceId,
  );
  const pendingOtherModels = otherSources.filter(
    (item) =>
      item.source.kind === "BIM" &&
      item.has_pending_revision &&
      !!item.accepted_revision_id,
  );
  const otherImports = useQueries({
    queries: otherSources
      .filter((item) => item.source.kind === "BIM")
      .map((item) => ({
        queryKey: [
          "revision-import",
          project,
          item.source.id,
          item.latest_revision_id,
        ],
        queryFn: () =>
          api.revisionImport(project, item.source.id, item.latest_revision_id!),
        refetchInterval: (query: {
          state: { data?: { status?: string } | null };
        }) =>
          ["QUEUED", "RUNNING"].includes(query.state.data?.status ?? "")
            ? 1500
            : false,
      })),
  });
  const otherModelsReady = otherImports.every(
    (item) => item.data?.status === "COMPLETED",
  );
  const otherModelsReviewed = pendingOtherModels.length === 0;
  const canAccept =
    !!current?.latest_revision_id &&
    (current.source.kind !== "BIM" ||
      (latestImport.data?.status === "COMPLETED" &&
        (!current.accepted_revision_id || reviewed)));
  const freshReady =
    readyForNewBaseline &&
    !checkFailed &&
    (!current?.accepted_revision_id ||
      freshCheckAfterImport(true, lastCheckAt, latestImport.data?.updated_at));
  const revisions = useMemo(
    () => sourceData.revisions.data ?? [],
    [sourceData.revisions.data],
  );

  useEffect(() => {
    if (!sourceData.sources.data) return;
    if (!statuses.length) setSourceId("");
    else if (!statuses.some((item) => item.source.id === sourceId))
      setSourceId(statuses[0].source.id);
  }, [sourceId, sourceData.sources.data]);
  useEffect(() => {
    if (!sourceId) return;
    try {
      sessionStorage.setItem(`concord:model:${project}`, sourceId);
    } catch {
      /* Selection remains usable without storage. */
    }
  }, [project, sourceId]);
  async function upload(file?: File) {
    if (!file || !sourceId) return;
    setUploadNotice("");
    try {
      const result = await sourceData.upload.mutateAsync({
        source: sourceId,
        file,
        label: "",
      });
      setUploadNotice(
        result.duplicate
          ? `这个文件已在项目中，仍是 R${result.revision.sequence}。`
          : `R${result.revision.sequence} 已上传。下一步：处理模型。当前基线不会自动改变。`,
      );
    } catch {
      // The mutation error is shown beside the model actions.
    }
  }

  return (
    <section className="sources-workspace">
      <div className="view-toolbar">
        <h2>模型与版本</h2>
        <span className="viewer-toolbar-note">
          上传模型 → 处理模型 → 查看变化 → 确认基线
        </span>
        <div className="viewer-toolbar-actions">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setCreateOpen(true)}
          >
            添加模型
          </Button>
        </div>
      </div>
      {(sourceData.sources.error ||
        sourceData.acceptBaseline.error ||
        sourceData.upload.error ||
        sourceData.importRevision.error) && (
        <div className="alert" role="alert">
          {sourceData.upload.error
            ? "上传失败，请检查文件后重试。"
            : sourceData.importRevision.error
              ? "无法开始处理模型，请重试。"
              : sourceData.acceptBaseline.error
                ? "暂时无法确认基线，请重试。"
                : "无法读取项目模型，请重试。"}
        </div>
      )}
      <div className="sources-layout">
        <PaneSplit id="project-sources" persist>
          <Pane
            className="source-register pane-stack"
            defaultSize="256px"
            minSize="200px"
            maxSize="360px"
          >
            <header>
              <span className="pane-header-label">项目模型</span>
              <span className="count">{statuses.length}</span>
            </header>
            {statuses.map((item) => (
              <button
                type="button"
                key={item.source.id}
                className={item.source.id === sourceId ? "selected" : ""}
                onClick={() => {
                  setSourceId(item.source.id);
                  onContext(
                    item.source.id,
                    item.latest_revision_id ?? undefined,
                    undefined,
                  );
                }}
              >
                <strong>{item.source.name}</strong>
                <span>
                  {sourceKindLabel[item.source.kind] ?? item.source.kind}
                </span>
                <small>
                  {item.latest_revision_id
                    ? item.has_pending_revision && item.accepted_revision_id
                      ? "新版本待审核 · 基线未变"
                      : item.accepted_revision_id
                        ? "当前基线"
                        : "尚未确认基线"
                    : "尚未上传模型"}
                </small>
              </button>
            ))}
            {!statuses.length && (
              <p className="quiet-message pane-empty">
                还没有项目模型。点击「添加模型」，上传第一个 IFC。
              </p>
            )}
          </Pane>
          <PaneDivider label="调整模型列表宽度" />
          <Pane className="source-detail">
            {current ? (
              <>
                <header className="source-detail-heading">
                  <div>
                    <span className="eyebrow">
                      {sourceKindLabel[current.source.kind] ??
                        current.source.kind}
                    </span>
                    <h3>{current.source.name}</h3>
                  </div>
                  <div className="source-heading-actions">
                    {(current.has_pending_revision ||
                      (current.latest_revision_id &&
                        !current.accepted_revision_id)) && (
                      <Button
                        size="sm"
                        disabled={
                          sourceData.acceptBaseline.isPending ||
                          !canAccept ||
                          !otherModelsReady ||
                          !otherModelsReviewed ||
                          (!!current.accepted_revision_id && !freshReady)
                        }
                        onClick={() => sourceData.acceptBaseline.mutate()}
                      >
                        设为当前基线 B
                        {(sourceData.baselines.data?.length ?? 0) + 1}
                      </Button>
                    )}
                    <input
                      ref={fileInput}
                      hidden
                      type="file"
                      accept={
                        current.source.kind === "BIM" ? ".ifc" : undefined
                      }
                      onChange={(event) => {
                        void upload(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={sourceData.upload.isPending}
                      onClick={() => fileInput.current?.click()}
                    >
                      {current.latest_revision_id
                        ? "上传新版本"
                        : "上传第一个模型版本"}
                    </Button>
                  </div>
                </header>
                {uploadNotice && (
                  <p className="viewer-status">{uploadNotice}</p>
                )}
                {otherSources.length > 0 && canAccept && (
                  <p className="viewer-status">
                    确认基线时，项目中其他已上传的版本也会一同确认。
                  </p>
                )}
                {pendingOtherModels.length > 0 && (
                  <p className="viewer-status" role="status">
                    其他模型也有待审核的新版本，请逐一查看变化后再确认基线。
                  </p>
                )}
                {otherSources.length > 0 && !otherModelsReady && (
                  <p className="viewer-status" role="status">
                    项目中还有模型版本未处理完成，暂不能确认基线。
                  </p>
                )}
                {current.has_pending_revision && baseline && (
                  <div className="viewer-status" role="status">
                    当前基线 B{baseline.sequence} 保持不变。
                    {!canAccept
                      ? "先处理新版本并查看变化。"
                      : freshReady
                        ? "变化已查看、工作包已重新检查，可以决定是否建立新基线。"
                        : "变化已查看；工作包达到可施工状态后才能建立新基线。"}
                    {pendingReview &&
                      latestImport.data?.status === "COMPLETED" &&
                      !reviewed &&
                      onChanges && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={onChanges}
                        >
                          查看变化
                        </Button>
                      )}
                    {canAccept && !freshReady && onRecheck && (
                      <Button size="sm" variant="secondary" onClick={onRecheck}>
                        重新检查
                      </Button>
                    )}
                    {canAccept && !freshReady && onWorkPackage && (
                      <Button size="sm" variant="ghost" onClick={onWorkPackage}>
                        查看工作包
                      </Button>
                    )}
                  </div>
                )}
                <div className="revision-register">
                  {!!revisions.length && (
                    <div className="revision-table-header" aria-hidden="true">
                      <span>版本</span>
                      <span>基线状态</span>
                      <span>文件</span>
                      <span>操作</span>
                    </div>
                  )}
                  {revisions.map((revision) => {
                    const state = revisionState(current, revision.id);
                    const notice = notices.data?.find(
                      (item) => item.revision_id === revision.id,
                    );
                    const fromRevisionId =
                      notice?.from_revision_id ??
                      (current.has_pending_revision &&
                      revision.id === current.latest_revision_id &&
                      current.accepted_revision_id !== revision.id
                        ? (current.accepted_revision_id ?? undefined)
                        : undefined);
                    return (
                      <article key={revision.id} className="revision-row">
                        <div className="revision-identity">
                          <strong>
                            R{revision.sequence}
                            {(sourceData.baselines.data ?? [])
                              .filter((baseline) =>
                                baseline.entries.some(
                                  (entry) =>
                                    entry.source_id === sourceId &&
                                    entry.revision_id === revision.id,
                                ),
                              )
                              .map((baseline) => ` · B${baseline.sequence}`)
                              .join("")}
                          </strong>
                          <span>
                            {revision.external_label ||
                              revision.original_filename}
                          </span>
                        </div>
                        <span className={`revision-state is-${state}`}>
                          {state === "latest" && !current.accepted_revision_id
                            ? "最新版本 · 尚未确认基线"
                            : stateLabel[state]}
                        </span>
                        <span className="revision-storage">
                          文件已上传 · {Math.ceil(revision.size_bytes / 1024)}{" "}
                          KiB
                        </span>
                        <div className="revision-actions">
                          {current.source.kind === "BIM" && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={
                                sourceData.importRevision.isPending ||
                                (revision.id === current.latest_revision_id &&
                                  ["QUEUED", "RUNNING"].includes(
                                    latestImport.data?.status ?? "",
                                  ))
                              }
                              onClick={() => {
                                sourceData.importRevision.mutate(
                                  { source: sourceId, revision: revision.id },
                                  {
                                    onSuccess: onRun,
                                  },
                                );
                              }}
                            >
                              处理模型
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              onInvestigate(
                                sourceId,
                                revision.id,
                                fromRevisionId,
                                undefined,
                                `R${revision.sequence}`,
                                fromRevisionId
                                  ? `R${revisions.find((item) => item.id === fromRevisionId)?.sequence ?? fromRevisionId.slice(0, 8)}`
                                  : undefined,
                              )
                            }
                          >
                            查看原因
                          </Button>
                        </div>
                        {revision.id === current.latest_revision_id &&
                          current.source.kind === "BIM" && (
                            <p className="viewer-status" role="status">
                              {latestImport.data?.status === "COMPLETED"
                                ? `R${revision.sequence} 已处理，可在模型中查看。${current.has_pending_revision ? "当前基线未变，请查看变化。" : "下一步：关联工作包。"}`
                                : latestImport.data?.status === "FAILED"
                                  ? `R${revision.sequence} 处理失败。请确认 IFC 文件有效，然后重试「处理模型」。`
                                  : latestImport.data &&
                                      ["QUEUED", "RUNNING"].includes(
                                        latestImport.data.status,
                                      )
                                    ? `正在处理 R${revision.sequence}，完成前不能关联或比较。`
                                    : `R${revision.sequence} 已上传，尚未处理。`}
                            </p>
                          )}
                        {notice && current.has_pending_revision && (
                          <p className="source-suggestion">
                            新版本尚未纳入当前基线。先查看变化，再决定是否更新。
                            <button
                              type="button"
                              onClick={() =>
                                onInvestigate(
                                  sourceId,
                                  revision.id,
                                  fromRevisionId,
                                  undefined,
                                  `R${revision.sequence}`,
                                  fromRevisionId
                                    ? `R${revisions.find((item) => item.id === fromRevisionId)?.sequence ?? fromRevisionId.slice(0, 8)}`
                                    : undefined,
                                )
                              }
                            >
                              查看原因
                            </button>
                          </p>
                        )}
                      </article>
                    );
                  })}
                  {!revisions.length && (
                    <div className="impact-empty">
                      <strong>尚无版本</strong>
                      <span>上传第一个模型版本，再处理模型和关联工作包。</span>
                    </div>
                  )}
                </div>
                {current.source.kind === "BIM" && (
                  <RevisionImpact
                    project={project}
                    workPackages={workPackages}
                    source={sourceId}
                    revisions={revisions}
                    comparisons={sourceData.comparisons.data ?? []}
                    comparing={sourceData.compare.isPending}
                    error={sourceData.compare.error}
                    imported={latestImport.data?.status === "COMPLETED"}
                    acceptedRevisionId={current.accepted_revision_id}
                    onCompare={(from_revision_id, to_revision_id) =>
                      sourceData.compare.mutate({
                        from_revision_id,
                        to_revision_id,
                      })
                    }
                    onSelectComparison={(comparison) => {
                      const from = revisions.find(
                        (item) => item.id === comparison.from_revision_id,
                      );
                      const to = revisions.find(
                        (item) => item.id === comparison.to_revision_id,
                      );
                      onContext(
                        sourceId,
                        comparison.to_revision_id,
                        to ? `R${to.sequence}` : undefined,
                        comparison.from_revision_id,
                        from ? `R${from.sequence}` : undefined,
                      );
                    }}
                    onInvestigate={(comparison, elementIds) =>
                      onInvestigate(
                        sourceId,
                        comparison.to_revision_id,
                        comparison.from_revision_id,
                        elementIds,
                        `R${revisions.find((item) => item.id === comparison.to_revision_id)?.sequence ?? comparison.to_revision_id.slice(0, 8)}`,
                        `R${revisions.find((item) => item.id === comparison.from_revision_id)?.sequence ?? comparison.from_revision_id.slice(0, 8)}`,
                      )
                    }
                    onInspect={({
                      workPackageId,
                      fromRevisionId,
                      toRevisionId,
                      changes,
                    }) => {
                      const from = revisions.find(
                        (item) => item.id === fromRevisionId,
                      );
                      const to = revisions.find(
                        (item) => item.id === toRevisionId,
                      );
                      onInspectImpact(workPackageId, {
                        sourceId,
                        fromRevisionId,
                        fromRevisionLabel: from
                          ? `R${from.sequence}`
                          : undefined,
                        revisionId: toRevisionId,
                        revisionLabel: to ? `R${to.sequence}` : undefined,
                        highlightIds: changes.map((change) => change.global_id),
                        changes,
                      });
                    }}
                  />
                )}
                {report?.scope.source_id === sourceId && (
                  <section className="context-agent-result">
                    <span className="eyebrow">
                      {report.scope.to_revision_id !==
                      current.latest_revision_id
                        ? "旧版本的调查结果 · 新版本需要重新调查"
                        : "当前版本的调查结果"}
                    </span>
                    <p>{demoInvestigationText(report.answer.summary)}</p>
                    <div className="context-agent-result-footer">
                      <small>{report.evidence.length} 条判断依据</small>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={onOpenInvestigation}
                      >
                        查看调查结果
                      </Button>
                    </div>
                  </section>
                )}
              </>
            ) : (
              <div className="empty-pane">
                <span>
                  <strong>添加第一个项目模型</strong>
                  <small>以后上传的新 IFC 会出现在同一模型的版本记录中。</small>
                </span>
              </div>
            )}
          </Pane>
        </PaneSplit>
      </div>
      {!!sourceData.baselines.data?.length && (
        <details className="source-history">
          <summary>历史基线</summary>
          <BaselineHistory
            baselines={sourceData.baselines.data}
            statuses={statuses}
            revisions={sourceData.revisionCatalog}
          />
        </details>
      )}
      <CreateSourceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={(input) => sourceData.createSource.mutateAsync(input)}
      />
    </section>
  );
}
