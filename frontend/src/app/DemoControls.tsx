import type { DTO } from "../api/client";

/** The single demo entry point. There is no second "演示" affordance elsewhere. */
export function DemoControls({
  project,
  busy,
  createEvent,
  onReset,
}: {
  project: string;
  busy: boolean;
  createEvent: (event: DTO<"ProjectEvent-Input">) => void;
  onReset: () => void;
}) {
  return (
    <details className="demo-menu">
      <summary>演示选项</summary>
      <div className="demo-menu-content">
        <span>确定性演示</span>
        <button
          disabled={busy}
          onClick={() =>
            createEvent({
              project_id: project,
              work_package_id: "WP-200",
              kind: "design_revision",
              title: "风管路径修订 / V17",
              change: { revision: "V17" },
            })
          }
        >
          图纸 V16 → V17
        </button>
        <button
          disabled={busy}
          onClick={() =>
            createEvent({
              project_id: project,
              work_package_id: "WP-300",
              kind: "workforce",
              title: "电气班组人员不足",
              change: { available_workers: 1 },
            })
          }
        >
          电气班组不足
        </button>
        <button
          disabled={busy}
          onClick={() => {
            if (window.confirm("重置演示项目？审计记录将保留。")) onReset();
          }}
        >
          重置演示
        </button>
      </div>
    </details>
  );
}
