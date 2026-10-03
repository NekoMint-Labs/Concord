import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "../components/ui/button";
import type {
  AgentRun,
  InvestigationReport,
  ProjectSourceStatus,
  Workspace,
} from "../api/client";
import type { WorkspaceTab } from "../app/destinations";
import { buildWorkDecisions, type WorkDecision } from "./workDecisions";
import { useWorkSelection } from "./useWorkSelection";
import { WorkPeek } from "./WorkPeek";
import { useWorkSourceContext } from "./useWorkSourceContext";

/** A queue of authoritative states, not a synthetic issue lifecycle. */
export function WorkList({
  workspace,
  sources,
  report,
  onPackage,
  onModels,
  onRecheck,
  onReport,
  onProject,
  onInvestigate,
  onSource,
  run,
}: {
  workspace: Workspace;
  sources: ProjectSourceStatus[];
  report?: InvestigationReport | null;
  onPackage: (id: string) => void;
  onModels: () => void;
  onRecheck: () => void;
  onReport: () => void;
  onProject: () => void;
  onTab: (tab: WorkspaceTab) => void;
  onInvestigate?: (input: {
    sourceId: string;
    revisionId: string;
    fromRevisionId?: string;
    elementIds?: string[];
    revisionLabel?: string;
    fromRevisionLabel?: string;
  }) => void;
  run?: AgentRun | null;
  onSource?: (sourceId: string) => void;
}) {
  const [showAllDone, setShowAllDone] = useState(false);
  const [query, setQuery] = useState("");
  const sourceContexts = useWorkSourceContext(
    workspace.state.project.id,
    sources,
  );
  const { needs, waiting, completed } = buildWorkDecisions(
    workspace,
    sources,
    report,
    {
      onPackage,
      onModels,
      onRecheck,
      onReport,
      onInvestigate,
      sourceContexts,
      run,
    },
  );
  const sections = [
    ["需要处理", needs],
    ["等待中", waiting],
    ["最近完成", completed],
  ] as const;
  const tone = {
    需要处理: "attention",
    等待中: "waiting",
    最近完成: "done",
  } as const;
  const matches = (item: WorkDecision) =>
    `${item.title} ${item.reason} ${item.context}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase());
  const groups = sections.map(([label, rows]) => {
    const visible = rows.filter(matches);
    const collapsed = label === "最近完成" && !showAllDone && !query;
    return {
      label,
      visible,
      collapsed,
      shown: collapsed ? visible.slice(0, 3) : visible,
    };
  });
  const visibleItems = groups.flatMap(({ label, shown }) =>
    shown.map((item) => ({ item, key: `${label}:${item.key}` })),
  );
  const selection = useWorkSelection(visibleItems.map(({ key }) => key));
  const { activeKey, peekOpen } = selection;
  const selectedItem = visibleItems.find(({ key }) => key === activeKey)?.item;
  const renderRow = (item: WorkDecision, label: keyof typeof tone) => (
    <button
      key={item.key}
      type="button"
      className={`work-row is-${tone[label]}${activeKey === `${label}:${item.key}` ? " is-selected" : ""}`}
      data-work-key={item.key}
      data-work-state={item.state}
      {...selection.rowProps(`${label}:${item.key}`)}
    >
      <span className="work-row-content">
        <i className="work-mark" aria-hidden="true" />
        <span className="work-row-copy">
          <strong title={item.title}>{item.title}</strong>
          <small title={item.context}>{item.context}</small>
          {label !== "最近完成" && (
            <span className="work-row-reason" title={item.reason}>
              {item.reason}
            </span>
          )}
        </span>
        <span className="work-state">
          {item.state}
          <span className="work-row-open" aria-hidden="true">
            →
          </span>
        </span>
      </span>
    </button>
  );
  const total = needs.length + waiting.length + completed.length;
  return (
    <section
      className="work-list"
      aria-label="工作"
      onKeyDown={selection.onKeyDown}
    >
      <div className="work-layout">
        <div className="work-queue">
          <header className="work-queue-head">
            <h1>工作</h1>
            <p>
              {needs.length
                ? `${needs.length} 项需要你决定 · 共 ${total} 项`
                : waiting.length
                  ? `${waiting.length} 项等待检查或处理 · 共 ${total} 项`
                  : total
                    ? `当前事项已处理 · 共 ${total} 项`
                    : "工作事项来自项目资料、工作包与施工检查"}
            </p>
            <label className="work-search">
              <Search size={15} />
              <span className="sr-only">搜索工作事项</span>
              <input
                ref={selection.searchRef}
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  selection.dismiss();
                }}
                placeholder="搜索工作事项"
              />
            </label>
          </header>
          <div className="work-queue-scroll">
            {!total && (
              <div className="work-empty workspace-empty">
                <h2>还没有工作事项</h2>
                <p>
                  当前项目尚无资料版本或工作包可供检查。先到项目添加资料与工作包，真实的待处理事项会显示在这里。
                </p>
                <div className="workspace-empty-actions">
                  <Button size="sm" onClick={onProject}>
                    打开项目 →
                  </Button>
                </div>
              </div>
            )}
            {groups.map(({ label, visible, collapsed, shown }) => {
              if (!visible.length && !query) return null;
              return (
                <section
                  key={label}
                  aria-label={label}
                  className={`work-group is-${tone[label]}`}
                >
                  <h2>
                    {label} <span>{visible.length}</span>
                  </h2>
                  {shown.length ? (
                    <div className="work-rows">
                      {shown.map((item) => renderRow(item, label))}
                    </div>
                  ) : (
                    <p className="quiet-message">没有匹配的工作事项。</p>
                  )}
                  {collapsed && visible.length > 3 && (
                    <button
                      type="button"
                      className="work-more"
                      onClick={() => setShowAllDone(true)}
                    >
                      显示全部 {visible.length} 项
                    </button>
                  )}
                </section>
              );
            })}
          </div>
        </div>
        {peekOpen && selectedItem && (
          <WorkPeek
            selectedItem={selectedItem}
            workspace={workspace}
            peekRef={selection.peekRef}
            onClose={selection.close}
            onModels={onModels}
            onSource={onSource}
          />
        )}
      </div>
    </section>
  );
}
