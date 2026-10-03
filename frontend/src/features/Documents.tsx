import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { FileText, Search, Upload } from "lucide-react";
import { api, isDesktop, readSource, type AgentRun } from "../api/client";
import { WorkspaceState } from "../components/WorkspaceState";
import { AppDisclosure } from "../components/ui/AppDisclosure";
import { Button } from "../components/ui/button";
import { AppMenu, AppMenuItem } from "../components/ui/AppMenu";
import { AppTooltip } from "../components/ui/AppTooltip";
import { notify } from "../components/ui/AppToaster";
import { statusLabel } from "../components/Status";
import { icon } from "../components/ui/icon";
import { Pane, PaneDivider, PaneSplit } from "../layout/PaneSplit";
import { useMotion } from "../motion";
import { documentLocation } from "../ui/labels";

/**
 * Mark every literal occurrence of the search term inside a chunk.
 *
 * Built with `indexOf` over the raw string rather than a RegExp, because the
 * query is user input: a term like `a.b` or `C++` would otherwise be read as a
 * pattern, throwing or matching the wrong span. The match is rendered from the
 * chunk's own text, so the highlight can only ever agree with what is shown.
 */
function highlightMatch(text: string, term: string): ReactNode {
  const needle = term.trim().toLowerCase();
  if (!needle) return text;
  const haystack = text.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  for (;;) {
    const at = haystack.indexOf(needle, cursor);
    if (at === -1) break;
    if (at > cursor) parts.push(text.slice(cursor, at));
    parts.push(
      <mark className="evidence-match" key={key++}>
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    cursor = at + needle.length;
  }
  if (!parts.length) return text;
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

/**
 * An evidence workspace: the source list owns one pane and the selected
 * document's parsed chunks own the reading surface. The two panes are
 * adjustable and remember their sizes locally.
 *
 * The reading surface is not a document reader, it is a surface for scanning
 * evidence, so each chunk is composed as a drafting-sheet row - a metadata
 * gutter, a rule, and a body column held at a decided measure. When the
 * Inspector has taken the column a third pane would need (`condensed`), the
 * source list stops being a pane and is reached from the reading header as a
 * menu instead. The column changed, not the pane.
 */
export function Documents({
  project,
  perform,
  condensed = false,
  initialDocumentId = "",
}: {
  project: string;
  perform: (fn: () => Promise<unknown>) => Promise<void>;
  condensed?: boolean;
  initialDocumentId?: string;
}) {
  const [selected, setSelected] = useState(initialDocumentId);
  const [runId, setRunId] = useState("");
  const [search, setSearch] = useState("");
  const [fileType, setFileType] = useState<"all" | "text" | "pdf">("all");
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const cache = useQueryClient();
  const { transition, variants } = useMotion();
  const documents = useQuery({
    queryKey: ["documents", project],
    queryFn: () => api.documents(project),
  });
  const count = documents.data?.length ?? 0;
  const emptyWorkspace = documents.isSuccess && count === 0 && !query;
  const listed = documents.data?.filter(
    (doc) =>
      fileType === "all" ||
      (fileType === "pdf"
        ? doc.filename.toLowerCase().endsWith(".pdf")
        : !doc.filename.toLowerCase().endsWith(".pdf")),
  );
  const current =
    listed?.find((doc) => doc.id === selected)?.id ?? listed?.[0]?.id ?? "";
  const meta = listed?.find((doc) => doc.id === current);
  const subject = query ? `搜索结果：${query}` : (meta?.filename ?? "文档依据");
  const chunks = useQuery({
    queryKey: ["chunks", current],
    queryFn: () => api.chunks(current),
    enabled: !!current,
  });
  const results = useQuery({
    queryKey: ["search", project, query],
    queryFn: () => api.search(project, query),
    enabled: !!query,
  });
  const run = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.run(runId),
    enabled: !!runId,
    refetchInterval: (q) =>
      ["QUEUED", "RUNNING"].includes(q.state.data?.status ?? "") ? 1000 : false,
  });
  useEffect(() => {
    if (run.data?.status === "COMPLETED") {
      void cache.invalidateQueries({ queryKey: ["documents", project] });
      void cache.invalidateQueries({ queryKey: ["search", project] });
      // The import notice stays in the pane's own chrome; the toast only tells
      // the user the job they started has finished.
      notify.success("文档导入完成");
    }
    if (run.data?.status === "FAILED") {
      notify.error("文档导入失败", run.data.error ?? undefined);
    }
  }, [run.data?.id, run.data?.status, run.data?.error, project, cache]);
  const readingQuery = query ? results : chunks;
  const visible = readingQuery.data;
  const readingError =
    documents.error || ((query || current) && readingQuery.error);
  const readingLoading = query
    ? results.isFetching
    : documents.isLoading || (!!current && chunks.isLoading);
  const importDocument = () =>
    isDesktop ? void perform(nativeImport) : input.current?.click();
  async function nativeImport() {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<AgentRun | { cancelled: true }>(
      "import_document",
      { projectId: project },
    );
    if ("id" in result) setRunId(result.id);
    await cache.invalidateQueries({ queryKey: ["documents"] });
  }
  function saveSource() {
    void perform(async () => {
      const name = meta?.filename ?? "source";
      const blob = await readSource(`/api/documents/${current}/content`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify.success("来源已保存", name);
    });
  }
  const reading = (
    <Pane className="document-content pane-stack">
      <header className="pane-header">
        {/*
          Condensed: the source list has yielded its column, so the same
          objects are reached from the reading header as a menu. The list
          changed shape, not the pane.
        */}
        {condensed && (
          <AppMenu
            label="来源"
            triggerClassName="pane-header-picker"
            trigger={
              <>
                来源 <span className="count">{count}</span>
              </>
            }
          >
            {listed?.map((doc) => (
              <AppMenuItem
                key={doc.id}
                active={doc.id === current}
                onSelect={() => {
                  setSelected(doc.id);
                  setQuery("");
                }}
              >
                {doc.filename}
              </AppMenuItem>
            ))}
          </AppMenu>
        )}
        <h3>
          <FileText size={14} /> {subject}
        </h3>
      </header>
      <div className="pane-body">
        {meta && !query && (
          <AppDisclosure label="来源详情" className="document-source-details">
            <p>解析器：{meta.parser}</p>
            <p className="mono">SHA {meta.content_hash}</p>
            <AppTooltip label="保存来源文件到本机，不加入项目">
              <Button size="sm" variant="secondary" onClick={saveSource}>
                保存来源
              </Button>
            </AppTooltip>
          </AppDisclosure>
        )}
        {!query && !current && !!documents.data?.length && (
          <WorkspaceState
            kind="empty"
            compact
            title="当前文件类型没有文档"
            description="此筛选下没有项目文档。切换到全部文件以读取已有依据。"
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setFileType("all")}
              >
                显示全部文件
              </Button>
            }
          />
        )}
        {!!readingError && (
          <WorkspaceState
            kind="error"
            compact
            title="文档依据不可用"
            description="未能读取文档或解析内容。请重试；如仍失败，可检查连接与能力状态。"
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  if (documents.error) void documents.refetch();
                  if ((query || current) && readingQuery.error)
                    void readingQuery.refetch();
                }}
              >
                重试
              </Button>
            }
          />
        )}
        {readingLoading && (
          <WorkspaceState
            kind="loading"
            compact
            title={query ? "正在搜索文档依据" : "正在读取文档依据"}
            description={
              query
                ? "正在查找匹配的解析内容，请稍候。"
                : "正在准备解析内容与来源信息。"
            }
          />
        )}
        {/*
          Keyed by the reading subject, so switching source mounts a new reading
          surface instead of rewriting the old one in place. The fade belongs to
          that change of subject, not to each chunk.
        */}
        <motion.div
          key={query ? `search:${query}` : current}
          variants={variants.detailSwap}
          initial="hidden"
          animate="visible"
          transition={transition("fast")}
        >
          {visible?.map((chunk, index) => (
            <article className="document-chunk evidence-sheet" key={chunk.id}>
              <div className="chunk-gutter">
                <span className="chunk-ordinal">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="chunk-fact">
                  <span className="chunk-fact-label">页码</span>
                  <span className="chunk-fact-value">{chunk.page ?? "—"}</span>
                </div>
                <div className="chunk-fact">
                  <span className="chunk-fact-label">位置</span>
                  <span className="chunk-fact-value">
                    {documentLocation(chunk.location)}
                  </span>
                </div>
                {query && (
                  <AppDisclosure label="来源详情">
                    <p>
                      {documents.data?.find(
                        (doc) => doc.content_hash === chunk.source_hash,
                      )?.filename ?? "文档来源"}
                    </p>
                    <p>解析器：{chunk.parser}</p>
                    <p className="mono">SHA {chunk.source_hash}</p>
                  </AppDisclosure>
                )}
              </div>
              <div className="chunk-body">
                <pre>
                  {highlightMatch(chunk.text.replace(/^#{1,6} /gm, ""), query)}
                </pre>
              </div>
            </article>
          ))}
          {visible?.length === 0 &&
            !readingLoading &&
            !readingError &&
            (query || current) && (
              <WorkspaceState
                kind="empty"
                compact
                title={query ? "没有匹配的文档依据" : "当前文档没有解析内容"}
                description={
                  query
                    ? "调整关键词，或清除搜索返回当前文档。"
                    : "重新导入文档后，解析内容会显示在这里。"
                }
                action={
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={
                      query
                        ? () => {
                            setQuery("");
                            setSearch("");
                          }
                        : importDocument
                    }
                  >
                    {query ? "清除搜索" : "导入文档"}
                  </Button>
                }
              />
            )}
        </motion.div>
      </div>
    </Pane>
  );
  const sourceList = (
    <Pane
      className="document-list pane-stack"
      defaultSize="320px"
      minSize="220px"
      maxSize="340px"
    >
      <header className="pane-header">
        <span className="pane-header-label">项目文档</span>
        <span className="count">{count}</span>
      </header>
      <div className="document-filters" aria-label="文档类型">
        {(["all", "text", "pdf"] as const).map((type) => (
          <button
            type="button"
            key={type}
            aria-pressed={fileType === type}
            onClick={() => setFileType(type)}
          >
            {type === "all" ? "全部文件" : type === "pdf" ? "PDF" : "文本"}
          </button>
        ))}
      </div>
      <div className="pane-body">
        {/*
          A source row is text: every row in this list is a document, so a mark on
          each one would say the same thing four times and add a column of noise to
          the list's own subject - the filename. The BIM element browser, the
          sidebar, and this list therefore all carry their objects the same way
          (frontend/src/components/ui/icon.ts states the rule).
        */}
        {listed?.map((doc) => (
          <button
            className={current === doc.id ? "selected" : ""}
            onClick={() => {
              setSelected(doc.id);
              setQuery("");
            }}
            key={doc.id}
          >
            <span>
              <strong className="object-identity">{doc.filename}</strong>
              <small>
                {new Date(doc.created_at).toLocaleDateString("zh-CN")}
              </small>
            </span>
          </button>
        ))}
        {!!documents.data?.length && !listed?.length && (
          <p className="quiet-message">
            当前项目没有{fileType === "pdf" ? "PDF" : "文本"}文件。
          </p>
        )}
      </div>
    </Pane>
  );
  return (
    <div
      className={`documents-view${emptyWorkspace ? " documents-view-empty" : ""}`}
    >
      <div className="view-toolbar">
        <h2>文档</h2>
        {!emptyWorkspace && (
          <form
            className="documents-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              setQuery(search.trim());
            }}
          >
            <Search {...icon} />
            <input
              aria-label="搜索文档"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索文档与解析内容"
            />
            <Button type="submit" variant="secondary" size="sm">
              搜索
            </Button>
            {query && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setQuery("");
                  setSearch("");
                }}
              >
                清除
              </Button>
            )}
          </form>
        )}
        <div className="view-toolbar-actions">
          {!emptyWorkspace && (
            <Button variant="secondary" size="sm" onClick={importDocument}>
              <Upload {...icon} /> 导入文档
            </Button>
          )}
          <input
            ref={input}
            type="file"
            hidden
            accept=".md,.txt,.csv,.log,.pdf,.docx,.pptx,.html"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file)
                void perform(async () => {
                  const run = await api.upload(project, file);
                  setRunId(run.id);
                  await cache.invalidateQueries({ queryKey: ["documents"] });
                });
            }}
          />
        </div>
      </div>
      {run.data && (
        <div className="upload-status" role="status">
          {`导入 ${statusLabel(run.data.status)} / ${
            run.data.error ?? run.data.id.slice(0, 8)
          }。详情见「运行」。`}
        </div>
      )}
      {emptyWorkspace ? (
        <section
          className="documents-empty-workspace"
          aria-labelledby="documents-empty-title"
        >
          <div className="workspace-empty">
            <span className="object-kind">项目文档</span>
            <h2 id="documents-empty-title">尚未导入文档</h2>
            <p>
              项目还没有工程文档，因此没有可读取的依据。导入文档后，可在本机搜索并核对来源。
            </p>
            <div className="workspace-empty-actions">
              <Button size="sm" onClick={importDocument}>
                <Upload {...icon} /> 导入文档
              </Button>
            </div>
          </div>
        </section>
      ) : condensed ? (
        <PaneSplit id="documents-condensed">{reading}</PaneSplit>
      ) : (
        <PaneSplit id="documents-library" persist>
          {sourceList}
          <PaneDivider label="调整来源列表宽度" />
          {reading}
        </PaneSplit>
      )}
    </div>
  );
}
