import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  readSource,
  type Baseline,
  type ProjectSourceRevision,
  type ProjectSourceStatus,
} from "../api/client";
import { shortDate } from "../ui/labels";
import { AppDisclosure } from "../components/ui/AppDisclosure";
import { Button } from "../components/ui/button";
import { revisionState } from "./useProjectSources";
import {
  processingLabel,
  type useSourceProcessing,
} from "./useSourceProcessing";
import type { SourceContextPaneProps } from "./SourceContextPane";

/** Source-detail presentation; baseline history keeps its own shared surface. */
export function SourceDetailRevisionHistory({
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
                <strong className="mono">R{revision.sequence}</strong>
                <span
                  className={meaning === "latest" ? "is-pending" : undefined}
                >
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
              <div className="sources-revision-metadata">
                {!!revisionBaselines.length && (
                  <span className="mono">
                    {revisionBaselines
                      .map((item) => `B${item.sequence}`)
                      .join(" · ")}
                  </span>
                )}
                {revision.external_label && (
                  <span>外部版本标记：{revision.external_label}</span>
                )}
                <span>{Math.ceil(revision.size_bytes / 1024)} KiB</span>
                <time
                  dateTime={revision.imported_at}
                  title={new Date(revision.imported_at).toLocaleString("zh-CN")}
                >
                  {shortDate(revision.imported_at)}
                </time>
              </div>
              {(state?.run?.status !== "COMPLETED" || error) && (
                <p role="status" className="sources-revision-availability">
                  {processingLabel(state)}
                </p>
              )}
              {error && (
                <p role="alert" className="sources-error">
                  {error}
                </p>
              )}
              <div className="sources-context-actions">
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
                      variant="secondary"
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
              <AppDisclosure
                label="原文件与处理记录"
                className="sources-revision-support"
              >
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
                {state?.run && (
                  <div className="sources-processing-log">
                    <span>处理记录</span>
                    <code>{state.run.id}</code>
                    <p>
                      {state.run.status} ·{" "}
                      {new Date(state.run.updated_at).toLocaleString("zh-CN")}
                    </p>
                    {state.run.error && <p>{state.run.error}</p>}
                  </div>
                )}
              </AppDisclosure>
              {downloadErrors[revision.id] && (
                <p role="alert" className="sources-error">
                  {downloadErrors[revision.id]}
                </p>
              )}
            </article>
          );
        })}
      {!loading && !revisions.length && (
        <p className="quiet-message workspace-empty">
          资料已登记但尚未上传原文件；使用「添加版本」上传，版本与原文件会保留在这里。
        </p>
      )}
    </section>
  );
}
