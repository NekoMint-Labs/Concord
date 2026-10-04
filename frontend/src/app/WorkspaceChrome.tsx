/* Ported from OpenTakeoff WorkspaceChrome.jsx, revision 60c82e34b389384401a083cefeb9389f89fbaae1.
 * Copyright 2026 Kentucky AI and the OpenTakeoff contributors. Apache-2.0.
 * Modified for Concord: typed action slots, Chinese copy, Lucide, Concord primitives/tokens.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Focus, Search, SlidersHorizontal } from "lucide-react";
import { AppDialog } from "../components/ui/AppDialog";
import { Button } from "../components/ui/button";
import { icon } from "../components/ui/icon";
import { ThatOpenToolbar } from "../components/ThatOpenUI";

// Upstream chrome owns disclosure only; every product action is supplied by the application.
export function WorkspaceChrome({
  title,
  onSearch,
  onFocus,
  onLayout,
  context,
  children,
}: {
  title: string;
  onSearch: () => void;
  onFocus: () => void;
  onLayout: () => void;
  context: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <header className="calm-header">
        <div className="calm-project" title={title}>
          <span>{title}</span>
          <small>工程协调工作台</small>
        </div>
        <ThatOpenToolbar className="calm-header-actions">
          {children}
          <Button
            variant="ghost"
            size="sm"
            onClick={onSearch}
            className="calm-search-trigger"
            aria-label="查找对象或操作"
          >
            <Search {...icon} />
            <span>查找对象或操作</span>
            <kbd>Ctrl / ⌘ K</kbd>
          </Button>
          <Button variant="ghost" size="sm" onClick={onLayout}>
            <SlidersHorizontal {...icon} />
            布局
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onFocus}
            title="专注模式：隐藏 chrome，保留当前工程对象（F）"
          >
            <Focus {...icon} />
            专注
          </Button>
        </ThatOpenToolbar>
      </header>
      <div className="calm-context">{context}</div>
    </>
  );
}

export type WorkspaceCommand = {
  id: string;
  label: string;
  group?: string;
  shortcut?: string;
  disabled?: boolean;
  run: () => void;
};

// Upstream filtering, capped results, active-descendant and keyboard execution are retained.
export function WorkspaceCommandMenu({
  open,
  onClose,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  actions: WorkspaceCommand[];
}) {
  const resultsRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const rows = actions
    .filter((a) =>
      `${a.label} ${a.group || ""} ${a.shortcut || ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    )
    .slice(0, 50);
  useEffect(() => {
    if (!open) return;
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setQuery("");
    setIndex(0);
    return () => {
      returnFocus.current?.focus({ preventScroll: true });
    };
  }, [open]);
  useEffect(() => {
    resultsRef.current
      ?.querySelector(".is-highlighted")
      ?.scrollIntoView?.({ block: "nearest" });
  }, [index]);
  const run = (row?: WorkspaceCommand) => {
    if (row && !row.disabled) {
      onClose();
      row.run();
    }
  };
  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="查找对象或操作"
      description="搜索当前项目对象与工作台命令。"
      className="calm-command-menu"
    >
      <label className="calm-command-search">
        <Search {...icon} />
        <input
          name="workspace-action-search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={true}
          aria-controls="workspace-action-results"
          aria-activedescendant={
            rows[index] ? `workspace-action-${rows[index].id}` : undefined
          }
          aria-label="搜索对象或操作"
          autoFocus
          value={query}
          placeholder="资料、工作包、Finding 或操作…"
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) =>
                Math.max(
                  0,
                  Math.min(
                    rows.length - 1,
                    i + (e.key === "ArrowDown" ? 1 : -1),
                  ),
                ),
              );
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(rows[index]);
            }
          }}
        />
      </label>
      <div
        ref={resultsRef}
        className="calm-command-results"
        id="workspace-action-results"
        role="listbox"
        aria-label="对象与操作"
      >
        {rows.map((row, i) => (
          <button
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected={i === index}
            id={`workspace-action-${row.id}`}
            key={row.id}
            className={i === index ? "is-highlighted" : ""}
            disabled={row.disabled}
            onMouseEnter={() => setIndex(i)}
            onClick={() => run(row)}
          >
            <span>
              {row.label}
              <small>{row.group}</small>
            </span>
            {row.shortcut && <kbd>{row.shortcut}</kbd>}
          </button>
        ))}
        {!rows.length && <p>没有匹配项，请尝试资料名称或“布局”。</p>}
      </div>
      <footer>↑ ↓ 选择 · Enter 打开 · Esc 关闭</footer>
    </AppDialog>
  );
}
