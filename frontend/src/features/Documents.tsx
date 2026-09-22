import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Search, Upload } from "lucide-react";
import { api, isDesktop, readSource, type AgentRun } from "../api/client";
import { WorkspaceState } from "../components/WorkspaceState";
import { Button } from "../components/ui/button";
import { AppMenu, AppMenuItem } from "../components/ui/AppMenu";
import { AppTooltip } from "../components/ui/AppTooltip";
import { notify } from "../components/ui/AppToaster";
import { statusLabel } from "../components/Status";
import { icon } from "../components/ui/icon";
import { Pane, PaneDivider, PaneSplit } from "../layout/PaneSplit";
import { useMotion } from "../motion";

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
}: {
  project: string;
  perform: (fn: () => Promise<unknown>) => Promise<void>;
  condensed?: boolean;
}) {
  const [selected, setSelected] = useState("");
  const [runId, setRunId] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const cache = useQueryClient();
  const { transition, variants } = useMotion();
  const documents = useQuery({
    queryKey: ["documents", project],
    queryFn: () => api.documents(project),
  });
  const current = selected || documents.data?.[0]?.id || "";
  const meta = documents.data?.find((doc) => doc.id === current);
  const count = documents.data?.length ?? 0;
  /*
   * The subject. When the source list is a pane it also prints the filename, so
   * the reading header pairs the filename with the parser rather than repeating
   * it alone - two elements with identical text is also what makes a test's exact
   * text query ambiguous.
   *
   * Condensed, there is no list row to collide with and the header has very
   * little room, so it keeps the filename alone. The parser is not lost: it is
   * the hint on each item of the 来源 menu, and each chunk's gutter states it as
   * 解析. A header that repeats both of those is why the subject was once 47%
   * clipped at 860px.
   *
   * When a query is active the query *is* the subject, because a search result
   * can span sources.
   */
  const subject = query
    ? `搜索结果：${query}`
    : meta
      ? condensed
        ? meta.filename
        : `${meta.filename} · ${meta.parser}`
      : "文档依据";
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
  const visible = query ? results.data : chunks.data;
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
            {documents.data?.map((doc) => (
              <AppMenuItem
                key={doc.id}
                active={doc.id === current}
                onSelect={() => {
                  setSelected(doc.id);
                  setQuery("");
                }}
                hint={
                  <>
                    {doc.parser} · {doc.content_hash.slice(0, 8)}
                  </>
                }
              >
                {doc.filename}
              </AppMenuItem>
            ))}
          </AppMenu>
        )}
        <h3>{subject}</h3>
        <span className="pane-header-actions">
          {/*
           * Condensed, the header carries one action and no provenance: the
           * source hash already appears in each chunk's gutter as 来源, and the
           * action cluster does not shrink, so every item it holds comes out of
           * the subject's width.
           */}
          {meta && !condensed && (
            <span className="mono">{meta.content_hash.slice(0, 8)}</span>
          )}
          {current && (
            /*
             * The action downloads the parsed source to this machine; it adds
             * nothing to the project. The label is the product's own word for
             * that and is left alone - the tooltip states the half of it the
             * label cannot, which is the same local-versus-project distinction
             * the BIM toolbar explains the same way.
             */
            <AppTooltip label="保存来源文件到本机，不加入项目">
              <Button size="sm" variant="secondary" onClick={saveSource}>
                保存来源
              </Button>
            </AppTooltip>
          )}
        </span>
      </header>
      <div className="pane-body">
        {(chunks.error || results.error || documents.error) && (
          <WorkspaceState
            kind="error"
            compact
            title="文档依据不可用"
            description="请检查连接与能力状态后重试。"
          />
        )}
        {(documents.isLoading || (!!current && chunks.isLoading)) && !query && (
          <WorkspaceState
            kind="loading"
            compact
            title="正在读取文档依据"
            description="正在准备解析内容与来源信息。"
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
                    {chunk.location ?? "—"}
                  </span>
                </div>
                <div className="chunk-fact">
                  <span className="chunk-fact-label">来源</span>
                  <span className="chunk-fact-value mono">
                    {chunk.source_hash.slice(0, 8)}
                  </span>
                </div>
                <div className="chunk-fact">
                  {/* the chunk carries no source revision, so its parser is the
                      only provenance value it exposes; labelling it "版本" would
                      claim a fact the response does not have */}
                  <span className="chunk-fact-label">解析</span>
                  <span className="chunk-fact-value">{chunk.parser}</span>
                </div>
              </div>
              <div className="chunk-body">
                <pre>{highlightMatch(chunk.text, query)}</pre>
              </div>
            </article>
          ))}
          {visible?.length === 0 && !documents.isLoading && (
            <WorkspaceState
              kind="empty"
              compact
              title={query ? "没有匹配的文档依据" : "当前文档没有解析内容"}
              description={
                query
                  ? "调整关键词，或清除搜索返回当前文档。"
                  : "重新导入文档后，解析内容会显示在这里。"
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
      defaultSize="264px"
      minSize="150px"
      /*
       * The source list's share has a ceiling: it is the local browser for the
       * document being read, not the reading surface, so it may not grow to
       * half the window however wide the window gets.
       *
       * The ceiling is stated in pixels, and it used to be a percentage (34%
       * above 1150px, 200px below). A percentage ceiling is not a ceiling on
       * this pane: it shrinks as the window narrows, so at 900px it was binding
       * a source list the user had chosen to be 264px wide, and the split then
       * carried the *clamped* width back to the wider window. 410px is the 34%
       * of the 1440px window this layout is drawn at, expressed in the unit the
       * ceiling is actually about (`Pane` keeps a pixel width across a resize -
       * frontend/src/layout/PaneSplit.tsx). One number, no breakpoint.
       */
      maxSize="410px"
    >
      <header className="pane-header">
        <span className="pane-header-label">来源</span>
        <span className="count">{count}</span>
      </header>
      <div className="pane-body">
        {/*
          A source row is text: every row in this list is a document, so a mark on
          each one would say the same thing four times and add a column of noise to
          the list's own subject - the filename. The BIM element browser, the
          sidebar, and this list therefore all carry their objects the same way
          (frontend/src/components/ui/icon.ts states the rule).
        */}
        {documents.data?.map((doc) => (
          <button
            className={current === doc.id ? "selected" : ""}
            onClick={() => {
              setSelected(doc.id);
              setQuery("");
            }}
            key={doc.id}
          >
            <span>
              <strong>{doc.filename}</strong>
              <small>
                {doc.parser} · SHA{" "}
                <span className="mono">{doc.content_hash.slice(0, 12)}</span>
              </small>
            </span>
          </button>
        ))}
        {documents.data?.length === 0 && (
          <WorkspaceState
            kind="empty"
            compact
            title="尚未导入文档"
            description="导入工程文档后，可在本机搜索并核对依据。"
          />
        )}
      </div>
    </Pane>
  );
  return (
    <div className="documents-view">
      <div className="view-toolbar">
        <h2>文档</h2>
        <form
          className="documents-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(search);
          }}
        >
          <Search {...icon} />
          <input
            aria-label="搜索文档"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索本地文档，无需向量索引"
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
        <div className="view-toolbar-actions">
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              isDesktop ? void perform(nativeImport) : input.current?.click()
            }
          >
            <Upload {...icon} /> 导入文档
          </Button>
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
      {condensed ? (
        <PaneSplit id="documents-condensed">{reading}</PaneSplit>
      ) : (
        <PaneSplit id="documents" persist>
          {sourceList}
          <PaneDivider label="调整来源列表宽度" />
          {reading}
        </PaneSplit>
      )}
    </div>
  );
}
