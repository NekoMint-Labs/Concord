import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type DTO, type InvestigationReport } from "../api/client";
import { Button } from "../components/ui/button";
import { useProjectSources } from "./useProjectSources";
import { BaselineHistory } from "./BaselineHistory";
import type { BimMappingContext } from "./BimMappingWorkspace";
import { CreateSourceDialog } from "./CreateSourceDialog";
import { RevisionImpact } from "./RevisionImpact";
import { Pane, PaneDivider, PaneSplit } from "../layout/PaneSplit";

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

const stateLabel = {
  latest: "最新 · 待接受",
  accepted: "已接受基线",
  "latest-accepted": "最新 · 已接受",
  historical: "历史版本",
};

export function ProjectSources({
  project,
  report,
  onContext,
  onRun,
  onInvestigate,
  onInspectImpact,
  onOpenInvestigation,
}: {
  project: string;
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
}) {
  const [sourceId, setSourceId] = useState("");
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
  const revisions = useMemo(
    () => sourceData.revisions.data ?? [],
    [sourceData.revisions.data],
  );

  useEffect(() => {
    if (!statuses.length) setSourceId("");
    else if (!statuses.some((item) => item.source.id === sourceId))
      setSourceId(statuses[0].source.id);
  }, [sourceId, statuses]);
  useEffect(() => {
    if (sourceId) {
      const revision = revisions.find(
        (item) => item.id === current?.latest_revision_id,
      );
      onContext(
        sourceId,
        current?.latest_revision_id ?? undefined,
        revision ? `R${revision.sequence}` : undefined,
      );
    }
  }, [current?.latest_revision_id, onContext, revisions, sourceId]);

  async function upload(file?: File) {
    if (!file || !sourceId) return;
    setUploadNotice("");
    const result = await sourceData.upload.mutateAsync({
      source: sourceId,
      file,
      label: "",
    });
    setUploadNotice(
      result.duplicate
        ? "相同内容已存在，未创建误导性的重复版本。"
        : `R${result.revision.sequence} 原始文件已保存。尚未完成解析或比较。`,
    );
  }

  return (
    <section className="sources-workspace">
      <div className="view-toolbar">
        <h2>项目来源</h2>
        <span className="viewer-toolbar-note">
          逻辑来源、不可变版本与工程基线
        </span>
        <div className="viewer-toolbar-actions">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setCreateOpen(true)}
          >
            新建来源
          </Button>
          <Button
            size="sm"
            disabled={!statuses.some((item) => item.latest_revision_id)}
            onClick={() => void sourceData.acceptBaseline.mutateAsync()}
          >
            接受为 B{(sourceData.baselines.data?.length ?? 0) + 1}
          </Button>
        </div>
      </div>
      {(sourceData.sources.error || sourceData.acceptBaseline.error) && (
        <div className="alert" role="alert">
          {sourceData.sources.error?.message ??
            sourceData.acceptBaseline.error?.message}
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
              <span className="pane-header-label">来源</span>
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
                <span>{item.source.kind}</span>
                <small>
                  {item.latest_revision_id
                    ? item.has_pending_revision
                      ? "有待接受的新版本"
                      : "与接受基线一致"
                    : "尚无版本"}
                </small>
              </button>
            ))}
            {!statuses.length && (
              <p className="quiet-message pane-empty">
                尚无工程来源。创建逻辑来源后可持续上传 R1、R2…
              </p>
            )}
          </Pane>
          <PaneDivider label="调整来源列表宽度" />
          <Pane className="source-detail">
            {current ? (
              <>
                <header className="source-detail-heading">
                  <div>
                    <span className="eyebrow">{current.source.kind}</span>
                    <h3>{current.source.name}</h3>
                  </div>
                  <div>
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
                      上传新版本
                    </Button>
                  </div>
                </header>
                {uploadNotice && (
                  <p className="viewer-status">{uploadNotice}</p>
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
                          <strong>R{revision.sequence}</strong>
                          <span>
                            {revision.external_label ||
                              revision.original_filename}
                          </span>
                          <small className="mono">
                            {revision.sha256.slice(0, 12)}
                          </small>
                        </div>
                        <span className={`revision-state is-${state}`}>
                          {stateLabel[state]}
                        </span>
                        <span className="revision-storage">
                          原始文件已保存 ·{" "}
                          {Math.ceil(revision.size_bytes / 1024)} KiB
                        </span>
                        <div className="revision-actions">
                          {current.source.kind === "BIM" && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={sourceData.importRevision.isPending}
                              onClick={async () => {
                                const run =
                                  await sourceData.importRevision.mutateAsync({
                                    source: sourceId,
                                    revision: revision.id,
                                  });
                                onRun(run);
                              }}
                            >
                              导入 / 查看运行
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
                            让 Concord 调查
                          </Button>
                        </div>
                        {notice && current.has_pending_revision && (
                          <p className="source-suggestion">
                            Concord 检测到比当前基线更新的版本。
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
                              调查此版本
                            </button>
                          </p>
                        )}
                      </article>
                    );
                  })}
                  {!revisions.length && (
                    <div className="impact-empty">
                      <strong>尚无版本</strong>
                      <span>上传文件会创建不可变的 R1，不会自动接受基线。</span>
                    </div>
                  )}
                </div>
                {current.source.kind === "BIM" && (
                  <RevisionImpact
                    project={project}
                    source={sourceId}
                    revisions={revisions}
                    comparisons={sourceData.comparisons.data ?? []}
                    comparing={sourceData.compare.isPending}
                    error={sourceData.compare.error}
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
                    <span className="eyebrow">Concord 调查结果</span>
                    <p>{report.answer.summary}</p>
                    <div className="context-agent-result-footer">
                      <small>
                        已持久化 · {report.evidence.length} 条 Evidence · 运行{" "}
                        {report.run_id.slice(0, 8)}
                      </small>
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
                  <strong>选择或创建一个来源</strong>
                  <small>来源名称保持稳定，文件名只属于各个版本。</small>
                </span>
              </div>
            )}
          </Pane>
        </PaneSplit>
      </div>
      <BaselineHistory
        baselines={sourceData.baselines.data ?? []}
        statuses={statuses}
        revisions={sourceData.revisionCatalog}
      />
      <CreateSourceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={(input) => sourceData.createSource.mutateAsync(input)}
      />
    </section>
  );
}
