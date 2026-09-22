import { X } from "lucide-react";
import type { ReactNode } from "react";
import { AppTooltip } from "./ui/AppTooltip";
import { icon } from "./ui/icon";

export function DetailInspectorHeader<T extends string>({
  eyebrow,
  title,
  meta,
  tabs,
  activeTab,
  onTab,
  onClose,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  tabs?: readonly { id: T; label: ReactNode; count?: number }[];
  activeTab?: T;
  onTab?: (tab: T) => void;
  onClose: () => void;
}) {
  return (
    <header className="pane-header is-stacked detail-inspector-header">
      <div className="pane-header-row">
        <div className="detail-inspector-title">
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <strong>{title}</strong>
        </div>
        {meta && <span className="detail-inspector-meta">{meta}</span>}
        <AppTooltip label="关闭详情" side="left">
          <button
            type="button"
            className="icon-button"
            aria-label="关闭详情"
            onClick={onClose}
          >
            <X {...icon} />
          </button>
        </AppTooltip>
      </div>
      {!!tabs?.length && activeTab && onTab && (
        <nav className="inspector-switch" aria-label="详情类型">
          {tabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              className={tab.id === activeTab ? "active" : ""}
              aria-current={tab.id === activeTab ? "true" : undefined}
              onClick={() => onTab(tab.id)}
            >
              {tab.label}
              {!!tab.count && <span className="count">{tab.count}</span>}
            </button>
          ))}
        </nav>
      )}
    </header>
  );
}
