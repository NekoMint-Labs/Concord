// Source: OpenTakeoff web/src/components/WorkspaceLayout.jsx (Apache-2.0).
// Copyright 2026 Kentucky AI and the OpenTakeoff contributors.
// Revision: 788e39bfe9c42b3260ea75e84a655e4574f9bc8c.
// Modified for Concord: Chinese copy, the Concord dock set, and native dialog /
// select / range controls kept exactly as the donor ships them. The donor's
// quantity-counter, floating-readout and pinned-palette toggles belong to the
// takeoff canvas and have no Concord counterpart.

import { useCallback, useEffect, useRef, useState } from "react";
import { Z } from "../vendor/opentakeoff/lib/ui";
import {
  DEFAULT_LAYOUT,
  WORKSPACE_LAYOUT_KEY,
  moveDock,
  normalizeLayout,
  readWorkspacePreferences,
  type DockId,
  type DockSide,
  type Layout,
  type WorkspacePreferences,
} from "./workspaceLayoutState";

// Personal preferences survive project-keyed remounts even without storage.
let sessionPreferences: WorkspacePreferences | null = null;
let sessionOnly = false;

export function useWorkspaceLayout() {
  const [prefs, setPrefs] = useState(() => {
    if (sessionOnly && sessionPreferences) return sessionPreferences;
    let raw = null;
    try {
      raw = localStorage.getItem(WORKSPACE_LAYOUT_KEY);
    } catch {
      return sessionPreferences ?? readWorkspacePreferences(null);
    }
    const pref = readWorkspacePreferences(raw);
    if (
      ["calm", "premium"].includes(
        new URLSearchParams(window.location.search).get("workspace") ?? "",
      )
    )
      pref.enabled = true;
    return pref;
  });
  const [storageFailed, setStorageFailed] = useState(false);
  useEffect(() => {
    sessionPreferences = prefs;
    try {
      localStorage.setItem(WORKSPACE_LAYOUT_KEY, JSON.stringify(prefs));
      sessionOnly = false;
      setStorageFailed(false);
    } catch {
      sessionOnly = true;
      setStorageFailed(true);
    }
  }, [prefs]);
  const update = useCallback(
    (patch: Partial<Layout>) =>
      setPrefs((p) => ({
        ...p,
        layout: normalizeLayout({ ...p.layout, ...patch }),
      })),
    [],
  );
  const move = useCallback(
    (dock: DockId, side: DockSide) =>
      setPrefs((p) => ({
        ...p,
        layout: moveDock(p.layout, dock, side),
      })),
    [],
  );
  const save = (name: string) =>
    setPrefs((p) => {
      const clean = name.trim().slice(0, 40);
      if (!clean) return p;
      return {
        ...p,
        saved: [
          ...p.saved.filter((s) => s.name !== clean),
          { name: clean, layout: { ...p.layout } },
        ].slice(-8),
      };
    });
  const remove = (name: string) =>
    setPrefs((p) => ({
      ...p,
      saved: p.saved.filter((s) => s.name !== name),
    }));
  return {
    layout: prefs.layout,
    update,
    move,
    save,
    remove,
    saved: prefs.saved,
    storageFailed,
  };
}

export type WorkspaceLayoutState = ReturnType<typeof useWorkspaceLayout>;

export function DockHandle({
  dock,
  label,
  locked,
  onDrag,
  onMove,
}: {
  dock: DockId;
  label: string;
  locked: boolean;
  onDrag: (dock: DockId | null) => void;
  onMove: (dock: DockId, side: DockSide) => void;
}) {
  const startRef = useRef<{ x: number; y: number; moved: boolean } | null>(
    null,
  );
  const cancel = () => {
    startRef.current = null;
    onDrag(null);
  };
  if (locked) return null;
  return (
    <button
      type="button"
      className="calm-dock-handle"
      aria-label={`移动${label}`}
      title={`移动${label}：拖到任一边缘，或使用左右方向键。布局设置中也可以直接选择位置。`}
      onKeyDown={(e) => {
        if (["ArrowLeft", "ArrowRight", "Escape"].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          if (e.key !== "Escape")
            onMove(dock, e.key === "ArrowLeft" ? "left" : "right");
          cancel();
        }
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.focus({ preventScroll: true });
        startRef.current = { x: e.clientX, y: e.clientY, moved: false };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const start = startRef.current;
        if (!start) return;
        e.stopPropagation();
        if (
          !start.moved &&
          Math.hypot(e.clientX - start.x, e.clientY - start.y) >= 6
        ) {
          start.moved = true;
          onDrag(dock);
        }
      }}
      onPointerUp={(e) => {
        const start = startRef.current;
        if (!start) return;
        e.stopPropagation();
        const bounds = e.currentTarget
          .closest("[data-canvas-workspace]")
          ?.getBoundingClientRect();
        if (
          start.moved &&
          bounds &&
          e.clientY >= bounds.top &&
          e.clientY <= bounds.bottom
        ) {
          const edge = Math.min(264, bounds.width * 0.3);
          if (e.clientX >= bounds.left && e.clientX <= bounds.left + edge)
            onMove(dock, "left");
          else if (
            e.clientX >= bounds.right - edge &&
            e.clientX <= bounds.right
          )
            onMove(dock, "right");
        }
        cancel();
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
    >
      ⠿
    </button>
  );
}

export function DockTargets({ dragging }: { dragging: DockId | null }) {
  if (!dragging) return null;
  return (
    <>
      {(["left", "right"] as const).map((side) => (
        <div
          key={side}
          className={`calm-dock-target calm-dock-target-${side}`}
          style={{ zIndex: Z.modal }}
          aria-hidden="true"
        >
          {side === "left" ? "停靠左侧" : "停靠右侧"}
        </div>
      ))}
    </>
  );
}

const DOCK_LABELS: readonly (readonly [DockId, string])[] = [
  ["tools", "工作区导航"],
  ["sheets", "资料导航"],
  ["work", "工作与审核"],
];

export function WorkspaceLayoutDialog({
  open,
  onClose,
  onOpenChange,
  prefs,
}: {
  open: boolean;
  onClose: () => void;
  onOpenChange?: (open: boolean) => void;
  prefs: WorkspaceLayoutState;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!open) return;
    const dialog = ref.current;
    dialog?.showModal();
    onOpenChange?.(true);
    return () => {
      dialog?.close();
      onOpenChange?.(false);
    };
  }, [open, onOpenChange]);
  const { layout, update } = prefs;
  return (
    <dialog
      ref={ref}
      className="calm-layout-dialog"
      onKeyDown={(e) => e.stopPropagation()}
      aria-labelledby="workspace-layout-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <h2 id="workspace-layout-title">你的工作区</h2>
          <p>仅保存在此浏览器中，团队成员的布局互不影响。</p>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭布局设置">
          ×
        </button>
      </header>
      <section className="workspace-appearance">
        <h3>外观</h3>
        <label>
          工作面
          <select
            aria-label="工作区外观"
            value={layout.look}
            onChange={(e) =>
              update({ look: e.target.value === "dark" ? "dark" : "light" })
            }
          >
            <option value="light">暖白工作室</option>
            <option value="dark">深色仪表面</option>
          </select>
        </label>
        <label>
          活动图标背光
          <input
            aria-label="活动图标背光"
            type="range"
            min="0"
            max="100"
            value={layout.backlight}
            onChange={(e) => update({ backlight: Number(e.target.value) })}
          />
          <output>{layout.backlight}%</output>
        </label>
      </section>
      <label className="calm-lock">
        <input
          type="checkbox"
          checked={layout.locked}
          onChange={(e) => update({ locked: e.target.checked })}
        />
        锁定面板位置和尺寸
      </label>
      <p className="calm-layout-help">
        解锁后可将面板握柄拖到任一边缘，或在下方选择位置。面板始终可以打开和关闭。
      </p>
      <fieldset disabled={layout.locked}>
        <legend>面板布局</legend>
        {DOCK_LABELS.map(([id, label]) => (
          <label key={id}>
            {label}
            <select
              aria-label={`${label}位置`}
              value={layout[id]}
              onChange={(e) =>
                prefs.move(id, e.target.value === "left" ? "left" : "right")
              }
            >
              <option value="left">左侧栏</option>
              <option value="right">右侧栏</option>
            </select>
          </label>
        ))}
        <label>
          工作面板宽度
          <input
            aria-label="工作面板宽度"
            type="range"
            min="300"
            max="480"
            step="20"
            value={layout.workWidth}
            onChange={(e) => update({ workWidth: Number(e.target.value) })}
          />
          <output>{layout.workWidth}px</output>
        </label>
        <label>
          资料面板宽度
          <input
            aria-label="资料面板宽度"
            type="range"
            min="220"
            max="340"
            step="20"
            value={layout.sheetWidth}
            onChange={(e) => update({ sheetWidth: Number(e.target.value) })}
          />
          <output>{layout.sheetWidth}px</output>
        </label>
      </fieldset>
      <section>
        <h3>已保存的布局</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            prefs.save(name);
            setMessage(`已保存“${name.trim()}”。`);
            setName("");
          }}
        >
          <input
            aria-label="布局名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="例如：我的审查工作台"
          />
          <button disabled={!name.trim()}>保存当前布局</button>
        </form>
        <p className="calm-layout-help">
          最多保存 8 个布局。同名保存将覆盖原布局。加载布局也会恢复其锁定设置。
        </p>
        {prefs.saved.map((s) => (
          <div key={s.name} className="calm-saved-layout">
            <button
              type="button"
              onClick={() => {
                update(s.layout);
                setMessage(`已加载“${s.name}”。`);
              }}
            >
              {s.name}
            </button>
            <button
              type="button"
              aria-label={`删除布局${s.name}`}
              onClick={() => {
                prefs.remove(s.name);
                setMessage(`已从保存列表中移除“${s.name}”。`);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <p role="status">
          {prefs.storageFailed
            ? "浏览器存储不可用，此布局仅在当前会话中保留。"
            : message}
        </p>
      </section>
      <footer>
        <button
          type="button"
          onClick={() => {
            update(DEFAULT_LAYOUT);
            setMessage("已恢复默认布局，保存的布局仍会保留。");
          }}
        >
          重置布局
        </button>
        <button type="button" onClick={onClose}>
          完成
        </button>
      </footer>
    </dialog>
  );
}
