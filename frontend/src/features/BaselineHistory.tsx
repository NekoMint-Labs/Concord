import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { readSource } from "../api/client";
import { Button } from "../components/ui/button";
import { revisionState } from "./useProjectSources";
import { processingLabel, useSourceProcessing } from "./useSourceProcessing";
import type { SourceContextPaneProps } from "./SourceContextPane";
import type {
  Baseline,
  ProjectSourceRevision,
  ProjectSourceStatus,
} from "../api/client";
import { AppDisclosure } from "../components/ui/AppDisclosure";

export function baselineEntryLabel(
  entry: Baseline["entries"][number],
  statuses: readonly ProjectSourceStatus[],
  revisions: readonly ProjectSourceRevision[],
): string {
  const source = statuses.find((item) => item.source.id === entry.source_id);
  const revision = revisions.find(
    (item) =>
      item.source_id === entry.source_id && item.id === entry.revision_id,
  );
  return `${source?.source.name ?? entry.source_id}：R${revision?.sequence ?? entry.revision_id.slice(0, 8)}`;
}

export function BaselineHistory({
  baselines,
  statuses,
  revisions,
  focusBaselineId,
  onProject,
}: {
  focusBaselineId?: string;
  onProject?: () => void;
  baselines: readonly Baseline[];
  statuses: readonly ProjectSourceStatus[];
  revisions: readonly ProjectSourceRevision[];
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const register = useRef<HTMLElement>(null);
  useEffect(() => {
    register.current
      ?.querySelector(".baseline-entry.is-focused")
      ?.scrollIntoView?.({ block: "nearest" });
  }, [focusBaselineId, baselines.length]);
  return (
    <section ref={register} className="baseline-register">
      <div className="baseline-list">
        {baselines.map((baseline) => (
          <article
            key={baseline.id}
            className={`baseline-entry${baseline.id === focusBaselineId ? " is-focused" : ""}`}
          >
            <header className="baseline-identity">
              <div>
                <span className="object-kind">基线</span>
                <strong className="object-identity">
                  B{baseline.sequence}
                </strong>
              </div>
              <span className="baseline-state">
                {baseline.sequence ===
                Math.max(...baselines.map((item) => item.sequence))
                  ? "当前基线"
                  : "保留的历史基线"}
              </span>
            </header>
            {baseline.name !== `B${baseline.sequence}` && (
              <p className="baseline-name">{baseline.name}</p>
            )}
            <p className="baseline-metadata">
              <time dateTime={baseline.created_at}>
                {new Date(baseline.created_at).toLocaleString("zh-CN")}
              </time>
              <span>确认人 {baseline.accepted_by}</span>
            </p>
            <AppDisclosure
              className="baseline-versions"
              open={expanded[baseline.id] ?? focusBaselineId === baseline.id}
              onOpenChange={(open) =>
                setExpanded((current) => ({ ...current, [baseline.id]: open }))
              }
              label={`B${baseline.sequence} · ${baseline.entries.length} 个资料版本`}
            >
              <div className="baseline-entries">
                {baseline.entries.map((entry) => (
                  <code key={`${entry.source_id}:${entry.revision_id}`}>
                    {baselineEntryLabel(entry, statuses, revisions)}
                  </code>
                ))}
              </div>
            </AppDisclosure>
          </article>
        ))}
        {!baselines.length && (
          <div className="workspace-empty baseline-empty">
            <span className="object-kind">基线</span>
            <h2>尚未确认项目基线</h2>
            <p>在项目核对资料版本后，人工确认基线。</p>
            {onProject && (
              <div className="workspace-empty-actions">
                <Button onClick={onProject}>打开项目 →</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** Original-file history is shared by the source detail surface, not a second uploader. */
export function SourceRevisionHistory({
  project,
  current,
  revisions,
  baselines,
  loading,
  processing,
  onInvestigate,
  onOpenModel,
  focusRevisionId,
}: {
  project: string;
  current: ProjectSourceStatus;
  revisions: readonly ProjectSourceRevision[];
  baselines: readonly Baseline[];
  loading: boolean;
  processing: ReturnType<typeof useSourceProcessing>;
  onContext?: SourceContextPaneProps["onContext"];
  onInvestigate?: SourceContextPaneProps["onInvestigate"];
  onOpenModel?: SourceContextPaneProps["onOpenModel"];
  focusRevisionId?: string;
}) {
  const sourceId = current.source.id;
  const focusedRevision = useRef<HTMLElement>(null);
  useEffect(() => {
    focusedRevision.current?.scrollIntoView?.({ block: "nearest" });
  }, [focusRevisionId, revisions.length]);
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>(
    {},
  );
  const download = useMutation({
    mutationFn: async (revision: ProjectSourceRevision) => {
      const blob = await readSource(
        `/api/projects/${encodeURIComponent(project)}/sources/${encodeURIComponent(sourceId)}/revisions/${encodeURIComponent(revision.id)}/content`,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = revision.original_filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    onMutate: (revision) =>
      setDownloadErrors((errors) => ({ ...errors, [revision.id]: "" })),
    onError: (error, revision) =>
      setDownloadErrors((errors) => ({
        ...errors,
        [revision.id]: error.message,
      })),
  });
  return (
    <section className="sources-context-history" aria-label="资料版本历史">
      <h3>版本历史</h3>
      {loading && <p role="status">正在读取版本…</p>}
      {[...revisions]
        .sort((a, b) => b.sequence - a.sequence)
        .map((revision) => {
          const state = processing.states.get(revision.id);
          const error = state?.error || state?.readError || state?.run?.error;
          const revisionBaselines = baselines.filter((entry) =>
            entry.entries.some(
              (item) =>
                item.source_id === sourceId && item.revision_id === revision.id,
            ),
          );
          const retryable =
            state &&
            !state.loading &&
            !state.readError &&
            !state.starting &&
            (!!state.error ||
              !state.run ||
              ["FAILED", "CANCELLED", "EXPIRED"].includes(state.run.status));
          const meaning = revisionState(current, revision.id);
          return (
            <article
              ref={
                focusRevisionId === revision.id ? focusedRevision : undefined
              }
              className={`sources-context-revision${focusRevisionId === revision.id ? " is-focused" : ""}`}
              key={revision.id}
            >
              <header>
                <strong className="mono">
                  R{revision.sequence}
                  {revisionBaselines
                    .map((item) => ` · B${item.sequence}`)
                    .join("")}
                </strong>
                <span>
                  {meaning === "latest-accepted"
                    ? "最新 · 当前基线"
                    : meaning === "latest"
                      ? "最新 · 待确认"
                      : meaning === "accepted"
                        ? "当前基线"
                        : "历史版本"}
                </span>
              </header>
              <p className="sources-original-filename">
                {revision.original_filename}
              </p>
              {revision.external_label && (
                <p className="quiet-message">
                  外部版本标记：{revision.external_label}
                </p>
              )}
              <small>
                {Math.ceil(revision.size_bytes / 1024)} KiB ·{" "}
                {new Date(revision.imported_at).toLocaleString("zh-CN")}
              </small>
              <p role="status">{processingLabel(state)}</p>
              {error && (
                <p role="alert" className="sources-error">
                  {error}
                </p>
              )}
              {state?.run && (
                <details>
                  <summary>处理记录</summary>
                  <code>{state.run.id}</code>
                  <p>
                    {state.run.status} ·{" "}
                    {new Date(state.run.updated_at).toLocaleString("zh-CN")}
                  </p>
                  {state.run.error && <p>{state.run.error}</p>}
                </details>
              )}
              <div className="sources-context-actions">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={download.isPending}
                  onClick={() => download.mutate(revision)}
                >
                  {download.isPending && download.variables?.id === revision.id
                    ? "正在下载…"
                    : downloadErrors[revision.id]
                      ? "重试下载原文件"
                      : "下载原文件"}
                </Button>
                {state?.readError && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void processing.refetch(revision.id)}
                  >
                    重新读取处理状态
                  </Button>
                )}
                {retryable && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      processing.retry.mutate({
                        source: sourceId,
                        revision: revision.id,
                      })
                    }
                  >
                    {state.error || state.run ? "重试处理" : "开始处理"}
                  </Button>
                )}
                {current.source.kind === "BIM" &&
                  state?.run?.status === "COMPLETED" &&
                  onOpenModel && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onOpenModel(sourceId, revision.id)}
                    >
                      查看模型
                    </Button>
                  )}
                {state?.run?.status === "COMPLETED" && onInvestigate && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      onInvestigate(
                        sourceId,
                        revision.id,
                        undefined,
                        undefined,
                        `R${revision.sequence}`,
                      )
                    }
                  >
                    调查此版本
                  </Button>
                )}
              </div>
              {downloadErrors[revision.id] && (
                <p role="alert" className="sources-error">
                  {downloadErrors[revision.id]}
                </p>
              )}
            </article>
          );
        })}
      {!loading && !revisions.length && (
        <p className="quiet-message">
          资料已登记但尚未上传原文件；使用「添加版本」上传，版本与原文件会保留在这里。
        </p>
      )}
    </section>
  );
}
