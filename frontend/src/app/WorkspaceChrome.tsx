/* Source: OpenTakeoff web/src/components/WorkspaceChrome.jsx (Apache-2.0).
 * Copyright 2026 Kentucky AI and the OpenTakeoff contributors.
 * Revision: 788e39bfe9c42b3260ea75e84a655e4574f9bc8c.
 * Modified for Concord: Chinese copy and Concord data binding. The donor
 * structure, class names, keyboard behavior and slot contract are unchanged —
 * every product action is still supplied by the application as a slot, exactly
 * as the donor does. The donor's Quantities/Takeoffs and Request-Premium
 * entries have no Concord counterpart and are not rendered.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "../vendor/opentakeoff/brand/icons";
import { keyText } from "../vendor/opentakeoff/lib/keys";

// Workspace chrome. All actions are supplied by the application; this component
// owns only navigation, search and disclosure state.
export function WorkspaceChrome({
  title,
  subtitle,
  onOpen,
  onNavigate,
  navigationOpen,
  onWork,
  workOpen,
  workButtonRef,
  pending,
  running,
  onReport,
  onFocus,
  onControls,
  controlsOpen,
  onSearch,
  pinControl,
  panelTools,
  layoutMenu,
  fileMenu,
  conditionControl,
  history,
  aids,
  action,
  scaleMenu,
}: {
  title: string;
  subtitle: string;
  onOpen: () => void;
  onNavigate: () => void;
  navigationOpen: boolean;
  onWork: () => void;
  workOpen: boolean;
  workButtonRef?: React.Ref<HTMLButtonElement>;
  pending: number;
  running: boolean;
  onReport: () => void;
  onFocus: () => void;
  onControls: () => void;
  controlsOpen: boolean;
  onSearch: () => void;
  pinControl?: ReactNode;
  panelTools?: ReactNode;
  layoutMenu?: ReactNode;
  fileMenu?: ReactNode;
  conditionControl?: ReactNode;
  history?: ReactNode;
  aids?: ReactNode;
  action?: ReactNode;
  scaleMenu?: ReactNode;
}) {
  return (
    <>
      <header className="calm-header">
        <strong className="calm-brand">
          conc<span>ord</span>
        </strong>
        <div className="calm-project" title={title}>
          <span>{title || "未命名工作区"}</span>
          <small>{subtitle}</small>
        </div>
        <div className="calm-header-actions">
          <button type="button" onClick={onOpen} title="打开项目">
            <Icon name="plus" size={16} />
            <span>打开</span>
          </button>
          {fileMenu}
          <button
            type="button"
            aria-pressed={navigationOpen}
            onClick={onNavigate}
            title="资料导航 — 项目资料与工作包"
          >
            <Icon name="sheets" size={16} />
            资料
          </button>
          {pinControl}
          <button
            type="button"
            onClick={onSearch}
            className="calm-search-trigger"
            title="查找对象或操作"
          >
            <Icon name="search" size={16} />
            <span>查找对象或操作</span>
            <kbd>{keyText("⌘K")}</kbd>
          </button>
          <button
            type="button"
            ref={workButtonRef}
            aria-expanded={workOpen}
            onClick={onWork}
            className="calm-work"
            title="工作与审核 — 工程判断、依据与人工复核"
          >
            工作
            {running ? (
              <span className="calm-badge">运行中</span>
            ) : pending > 0 ? (
              <span className="calm-badge">{pending}</span>
            ) : null}
          </button>
          {panelTools}
          <button type="button" onClick={onReport} className="calm-report">
            <Icon name="document" size={16} />
            报告
          </button>
          {layoutMenu}
        </div>
      </header>
      <div className="calm-context" aria-label="当前位置与当前工作包">
        <div className="calm-context-scroll">
          {conditionControl}
          {history ? (
            <>
              <span className="calm-separator" />
              {history}
            </>
          ) : null}
          {aids ? (
            <>
              <span className="calm-separator" />
              {aids}
            </>
          ) : null}
        </div>
        <div className="calm-context-pinned">
          {action}
          {scaleMenu}
          <button
            type="button"
            onClick={onFocus}
            title="专注模式 — 隐藏 chrome，保留当前工作区（F）"
          >
            <Icon name="focus" size={16} />
            <span className="calm-focus-label">专注</span>
          </button>
          <button
            type="button"
            onClick={onControls}
            aria-expanded={controlsOpen}
            title="所有工作区控件与设置"
          >
            {controlsOpen ? "关闭控件" : "所有控件"}
          </button>
        </div>
      </div>
    </>
  );
}

export type NavigatorItem = {
  key: string;
  label: string;
  file: string;
  count?: number;
};

export function WorkspaceNavigator({
  open,
  title,
  label,
  placeholder,
  empty,
  emptySearch,
  footerLabel,
  items,
  current,
  onSelect,
  onClose,
  onFooter,
  dockSide,
  width,
  dockHandle,
}: {
  open: boolean;
  title: string;
  label: string;
  placeholder: string;
  empty: string;
  emptySearch: string;
  footerLabel: string;
  items: NavigatorItem[];
  current?: string;
  onSelect: (key: string) => void;
  onClose: () => void;
  onFooter: () => void;
  dockSide?: "left" | "right";
  width?: number;
  dockHandle?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const matches = useMemo(
    () =>
      items.filter((s) =>
        `${s.label} ${s.file}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [items, query],
  );
  return (
    <aside
      className="calm-navigator"
      data-dock-side={dockSide}
      style={{
        width,
        order: dockSide === "right" ? 20 : -20,
      }}
      hidden={!open}
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        {dockHandle}
        <strong>
          {title} <small>{items.length}</small>
        </strong>
        <button type="button" aria-label={`关闭${label}`} onClick={onClose}>
          ×
        </button>
      </header>
      <label>
        <Icon name="search" size={15} />
        <input
          name="workspace-navigator-search"
          aria-label={label}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
        />
      </label>
      <div className="calm-sheet-list">
        {matches.map((s) => (
          <button
            type="button"
            key={s.key}
            aria-current={s.key === current ? "page" : undefined}
            onClick={() => onSelect(s.key)}
            title={`${s.label} · ${s.file}`}
          >
            <Icon name="document" size={19} />
            <span>
              <strong>{s.label}</strong>
              <small>{s.file}</small>
            </span>
            {!!s.count && <em>{s.count}</em>}
          </button>
        ))}
        {!matches.length && <p>{items.length ? emptySearch : empty}</p>}
      </div>
      <footer>
        <button type="button" onClick={onFooter}>
          <Icon name="sheets" size={16} />
          {footerLabel}
        </button>
      </footer>
    </aside>
  );
}

export type WorkspaceAction = {
  id: string;
  label: string;
  group?: string;
  shortcut?: string;
  disabled?: boolean;
  run: () => void;
};

export function WorkspaceCommandMenu({
  open,
  onClose,
  actions,
  onOpenChange,
}: {
  open: boolean;
  onClose: () => void;
  actions: WorkspaceAction[];
  onOpenChange?: (open: boolean) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
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
    setQuery("");
    setIndex(0);
    const dialog = dialogRef.current;
    dialog?.showModal();
    onOpenChange?.(true);
    return () => {
      dialog?.close();
      onOpenChange?.(false);
    };
  }, [open, onOpenChange]);
  useEffect(() => {
    dialogRef.current
      ?.querySelector(".is-highlighted")
      ?.scrollIntoView({ block: "nearest" });
  }, [index]);
  const run = (row?: WorkspaceAction) => {
    if (row && !row.disabled) {
      onClose();
      row.run();
    }
  };
  return (
    <dialog
      ref={dialogRef}
      className="calm-command-menu"
      onKeyDown={(e) => e.stopPropagation()}
      aria-label="查找对象或操作"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <header>
        <Icon name="search" size={18} />
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
          placeholder="查找对象、资料或操作…"
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
        <button type="button" aria-label="关闭查找" onClick={onClose}>
          Esc
        </button>
      </header>
      <div
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
            {row.shortcut && <kbd>{keyText(row.shortcut)}</kbd>}
          </button>
        ))}
        {!rows.length && <p>没有匹配项，请尝试资料名称或“工作包”。</p>}
      </div>
      <footer>↑ ↓ 选择 · Enter 打开 · Esc 关闭</footer>
    </dialog>
  );
}
