/* Legacy export kept for in-flight call sites (WorkspaceViews, navigation).
 *
 * The Browse destination is now the donor composition: the shell owns the
 * navigator (`browseNavigatorItems` → `WorkspaceNavigator`) and the central
 * object stage (`BrowseStage`). This component is therefore no longer a
 * grouped, workspace-wide table page; it renders a compact, donor-styled index
 * of the same objects so a still-wired call site degrades gracefully instead of
 * owning navigation or a full-page table.
 *
 * The exported symbols and prop contract are unchanged so existing imports
 * (`ExplorerTarget` in navigation and the inspector, `ExplorerEntry` in App)
 * keep compiling.
 */
import type { ProjectSourceStatus, Workspace } from "../api/client";
import type { WorkspaceTab } from "../app/destinations";
import { demoDiscipline, demoWorkPackageName } from "../ui/demo/demoPresentation";
import "../styles/features/browse.css";

export type ExplorerTarget =
  | { kind: "source"; id: string; revisionId?: string; comparisonId?: string }
  | { kind: "package" | "document" | "evidence" | "baseline"; id: string }
  | { kind: "fixture-finding" | "fixture-evidence"; id: string }
  | { kind: "finding"; id: string; evidenceId?: string };
export type ExplorerEntry = {
  target: ExplorerTarget;
  title: string;
  meta: string;
  type: string;
  state?: string;
  search?: string;
};

type IndexItem = {
  key: string;
  label: string;
  file: string;
  target: ExplorerTarget;
};

const kindText = (kind: ProjectSourceStatus["source"]["kind"]): string =>
  kind === "BIM"
    ? "IFC 模型"
    : kind === "DRAWING"
      ? "工程图纸"
      : "工程文档";

/** A compact, non-navigating index of the same objects the Browse stage shows. */
export function ProjectExplorer({
  workspace,
  sources,
  onOpen,
  previewEntries = [],
  findingEntries = [],
  onPreviewEnabled,
}: {
  workspace: Workspace;
  sources: ProjectSourceStatus[];
  onOpen: (target: ExplorerTarget) => void;
  onTab: (tab: WorkspaceTab) => void;
  /** Explicitly opted-in UI fixtures; never mixed into authoritative project groups. */
  previewEntries?: ExplorerEntry[];
  findingEntries?: ExplorerEntry[];
  onPreviewEnabled?: (enabled: boolean) => void;
}) {
  const groups: { name: string; items: IndexItem[] }[] = [
    {
      name: "资料",
      items: sources.map((status) => ({
        key: `source:${status.source.id}`,
        label: status.source.name,
        file: `${kindText(status.source.kind)} · ${
          status.latest_revision_id ? "有版本" : "尚未上传"
        }`,
        target: { kind: "source", id: status.source.id },
      })),
    },
    {
      name: "工作包",
      items: workspace.state.work_packages.map((workPackage) => {
        const area = workspace.state.areas.find(
          (item) => item.id === workPackage.area_id,
        );
        return {
          key: `package:${workPackage.id}`,
          label: demoWorkPackageName(workPackage.id, workPackage.name),
          file: `${area?.name ?? workPackage.area_id} · ${demoDiscipline(workPackage.discipline)}`,
          target: { kind: "package", id: workPackage.id },
        };
      }),
    },
    {
      name: "工程判断",
      items: findingEntries.map((entry) => ({
        key: JSON.stringify(entry.target),
        label: entry.title,
        file: `${entry.type}${entry.state ? ` · ${entry.state}` : ""}`,
        target: entry.target,
      })),
    },
  ];
  if (previewEntries.length)
    groups.push({
      name: "交互示例",
      items: previewEntries.map((entry) => ({
        key: JSON.stringify(entry.target),
        label: entry.title,
        file: entry.type,
        target: entry.target,
      })),
    });
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  return (
    <section className="browse-stage" aria-label="项目对象">
      <header className="browse-stage-head">
        <div className="browse-identity">
          <span className="t-label browse-kind">浏览</span>
          <h2>项目对象</h2>
          <p className="browse-head-meta">{total} 个项目对象</p>
        </div>
        {onPreviewEnabled && (
          <div className="browse-head-actions">
            <label className="browse-toggle">
              <input
                type="checkbox"
                checked={previewEntries.length > 0}
                onChange={(event) => onPreviewEnabled(event.target.checked)}
              />
              包含 Finding 交互示例
            </label>
          </div>
        )}
      </header>
      <div className="browse-stage-body">
        {groups
          .filter((group) => group.items.length)
          .map((group) => (
            <section
              className="browse-section"
              key={group.name}
              aria-label={group.name}
            >
              <h3 className="t-label">{group.name}</h3>
              <ul className="browse-links">
                {group.items.map((item) => (
                  <li key={item.key}>
                    <button
                      type="button"
                      className="row browse-row"
                      onClick={() => onOpen(item.target)}
                    >
                      <span className="browse-link-copy">
                        <strong>{item.label}</strong>
                        <small>{item.file}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </section>
  );
}
