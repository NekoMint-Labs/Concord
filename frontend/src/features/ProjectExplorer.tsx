import { Button } from "../components/ui/button";
import { ThatOpenTextInput } from "../components/ThatOpenUI";
import { createElement, useEffect, useRef, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { html, type Selector } from "@thatopen/ui";
import { ThatOpenDataTable } from "../components/ThatOpenDataTable";
import { api, type ProjectSourceStatus, type Workspace } from "../api/client";
import { useProjectContext } from "../app/useProjectContext";
import {
  demoAreaName,
  demoDiscipline,
  demoEvidenceFact,
  demoSourceLabel,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";
import { shortDate, statusLabel } from "../ui/labels";
import type { WorkspaceTab } from "../app/destinations";
import {
  evidenceLabel,
  targetLabel,
  qualityLabels,
} from "../app/EvidenceWorkspaceHost";
import { engineeringKeys } from "./useEngineeringFindings";
import { WorkspaceInlineState } from "../components/WorkspaceInlineState";

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
type Entry = ExplorerEntry;
const categories = [
  "全部",
  "资料",
  "工作包",
  "文档",
  "版本与比较",
  "判断依据",
  "基线与历史",
  "交互示例",
  "工程判断",
] as const;
type Category = (typeof categories)[number];

/** Search existing project records without a second task queue or search backend. */
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
  const project = workspace.state.project.id;
  const sourceRecords = useQuery({
    queryKey: ["sources", project],
    queryFn: () => api.sourceStatuses(project),
  });
  const context = useProjectContext(project, sources);
  const revisions = useQueries({
    queries: sources.map(({ source }) => ({
      queryKey: ["source-revisions", project, source.id],
      queryFn: () => api.sourceRevisions(project, source.id),
    })),
  });
  const models = sources.filter(({ source }) => source.kind === "BIM");
  const comparisons = useQueries({
    queries: models.map(({ source }) => ({
      queryKey: ["comparisons", project, source.id],
      queryFn: () => api.comparisons(project, source.id),
    })),
  });
  const evidenceIds = [
    ...new Set(
      findingEntries.flatMap((entry) =>
        entry.target.kind === "finding" && entry.target.evidenceId
          ? [entry.target.evidenceId]
          : [],
      ),
    ),
  ];
  const evidenceQueries = useQueries({
    queries: evidenceIds.map((id) => ({
      queryKey: engineeringKeys.evidence(project, id),
      queryFn: () => api.engineeringEvidence(project, id),
      select: (
        item: Awaited<ReturnType<typeof api.engineeringEvidence>> & {
          project_id?: string | null;
        },
      ) =>
        item.id === id &&
        (item.project_id === undefined || item.project_id === project)
          ? item
          : undefined,
    })),
  });
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("全部");
  const filterRef = useRef<Selector>(null);
  useEffect(() => {
    const selector = filterRef.current;
    if (!selector) return;
    if (selector.value !== category) selector.value = category;
    const change = () => {
      const value = selector.value as Category;
      if (categories.includes(value)) setCategory(value);
    };
    selector.addEventListener("change", change);
    return () => selector.removeEventListener("change", change);
  }, [category, previewEntries.length]);
  const catalog = revisions.flatMap((result) => result.data ?? []);
  const label = (id: string) => {
    const revision = catalog.find((item) => item.id === id);
    return revision ? `R${revision.sequence}` : "版本名称未提供";
  };
  const groups: {
    category: Exclude<Category, "全部">;
    entries: Entry[];
  }[] = [
    {
      category: "资料",
      entries: sources.map((item) => ({
        target: { kind: "source", id: item.source.id },
        title: item.source.name,
        type:
          item.source.kind === "BIM"
            ? "IFC 模型"
            : item.source.kind === "DRAWING"
              ? "工程图纸"
              : "工程文档",
        state: !item.latest_revision_id
          ? "尚未上传"
          : !item.accepted_revision_id
            ? "待确认基线"
            : item.has_pending_revision
              ? "新版本待检查"
              : "当前基线",
        meta: `${item.latest_revision_id ? `${label(item.latest_revision_id)} · 最新版本` : "尚未上传原文件"}${item.accepted_revision_id ? ` · 基线 ${label(item.accepted_revision_id)}` : " · 尚未确认基线"}`,
        search: `${item.source.id} ${item.latest_revision_id ?? ""} ${item.accepted_revision_id ?? ""}`,
      })),
    },
    {
      category: "工作包",
      entries: workspace.state.work_packages.map((wp) => ({
        target: { kind: "package", id: wp.id },
        title: demoWorkPackageName(wp.id, wp.name),
        type: "工作包",
        state: workspace.stale
          ? statusLabel("STALE")
          : statusLabel(
              workspace.analysis?.readiness.find(
                (item) => item.work_package_id === wp.id,
              )?.status ?? "UNCHECKED",
            ),
        meta: `${wp.id} · ${demoAreaName(wp.area_id, workspace.state.areas.find((area) => area.id === wp.area_id)?.name ?? wp.area_id)} · ${demoDiscipline(wp.discipline)} · ${wp.element_ids.length} 个关联构件`,
      })),
    },
    {
      category: "文档",
      entries: context.documents.map((doc) => ({
        target: { kind: "document", id: doc.id },
        title: doc.filename,
        type: "文档",
        state: "已解析",
        meta: shortDate(doc.created_at),
        search: `${doc.id} ${doc.parser}`,
      })),
    },
    {
      category: "版本与比较",
      entries: [
        ...catalog.map((revision): Entry => ({
          type: "资料版本",
          state:
            sources.find((item) => item.source.id === revision.source_id)
              ?.accepted_revision_id === revision.id
              ? "当前基线"
              : sources.find((item) => item.source.id === revision.source_id)
                    ?.latest_revision_id === revision.id
                ? "最新版本"
                : "历史版本",
          target: {
            kind: "source",
            id: revision.source_id,
            revisionId: revision.id,
          },
          title: `${sources.find((item) => item.source.id === revision.source_id)?.source.name ?? "来源名称未提供"} · R${revision.sequence}`,
          meta: `${revision.original_filename} · ${revision.external_label ?? "原文件版本"} · ${shortDate(revision.imported_at)}`,
          search: revision.id,
        })),
        ...comparisons.flatMap((result, index) =>
          (result.data ?? []).map((comparison): Entry => ({
            type: "模型比较",
            state: "已保存",
            target: {
              kind: "source",
              id: models[index].source.id,
              comparisonId: comparison.id,
            },
            title: `${models[index].source.name} · ${label(comparison.from_revision_id)} → ${label(comparison.to_revision_id)}`,
            meta: `比较 · 新增 ${comparison.summary.added} · 删除 ${comparison.summary.deleted} · 变更 ${comparison.summary.changed}`,
            search: comparison.id,
          })),
        ),
      ],
    },
    {
      category: "判断依据",
      entries: (workspace.analysis?.evidence ?? []).map((evidence) => ({
        target: { kind: "evidence", id: evidence.id },
        type: "判断依据",
        title: demoEvidenceFact(evidence.source_id, evidence.fact),
        meta: `${sources.find((item) => item.source.id === evidence.source_id)?.source.name ?? demoSourceLabel(evidence.source_id)} · ${evidence.location ?? "项目依据"}`,
        search: `${evidence.id} ${evidence.work_package_id ?? ""} ${evidence.provider} ${evidence.source_revision}`,
      })),
    },
    {
      category: "基线与历史",
      entries: context.baselines.map((baseline) => ({
        target: { kind: "baseline", id: baseline.id },
        type: "项目基线",
        state: context.baseline?.id === baseline.id ? "当前基线" : "历史基线",
        title:
          baseline.name === `B${baseline.sequence}`
            ? baseline.name
            : `B${baseline.sequence} · ${baseline.name}`,
        meta: `${baseline.entries.length} 个资料版本 · ${baseline.accepted_by} · ${shortDate(baseline.created_at)}`,
        search: baseline.id,
      })),
    },
  ];
  if (previewEntries.length)
    groups.push({ category: "交互示例", entries: previewEntries });
  if (findingEntries.length)
    groups.push({
      category: "工程判断",
      entries: findingEntries.map((entry) => {
        if (entry.target.kind !== "finding" || !entry.target.evidenceId)
          return entry;
        const evidence = evidenceQueries.find(
          (result) =>
            result.data?.id ===
            (entry.target.kind === "finding" ? entry.target.evidenceId : ""),
        )?.data;
        return evidence
          ? {
              ...entry,
              title: evidenceLabel(evidence),
              type: targetLabel(evidence.viewer_target),
              meta:
                sources.find((item) => item.source.id === evidence.source_id)
                  ?.source.name || "来源名称未提供",
              state: qualityLabels[evidence.quality],
              search: `${entry.search ?? ""} ${evidence.id} ${evidence.source_id} ${evidence.source_revision_id ?? ""} ${evidence.provider} ${JSON.stringify(evidence.viewer_target)}`,
            }
          : entry;
      }),
    });
  // Stable presentation keys also keep action bindings exact during Lit updates.
  const tableEntries = new Map(
    groups.flatMap((group) =>
      group.entries.map(
        (entry) => [JSON.stringify(entry.target), entry] as const,
      ),
    ),
  );
  const needle = query.trim().toLocaleLowerCase();
  const shown = groups
    .filter((group) => category === "全部" || category === group.category)
    .map((group) => ({
      ...group,
      entries: group.entries.filter((entry) =>
        `${entry.title} ${entry.type} ${entry.meta} ${entry.state ?? ""} ${entry.search ?? ""}`
          .toLocaleLowerCase()
          .includes(needle),
      ),
    }));
  const count = shown.reduce((total, group) => total + group.entries.length, 0);
  const queries = [
    sourceRecords,
    ...revisions,
    ...comparisons,
    ...evidenceQueries,
  ];
  const pending =
    context.recordsPending || queries.some((result) => result.isPending);
  const unavailable =
    !!context.recordsError || queries.some((result) => result.isError);
  return (
    <section className="project-explorer" aria-label="Project Explorer">
      <header className="explorer-heading">
        <h1>浏览</h1>
        {onPreviewEnabled && (
          <label className="explorer-preview-toggle">
            <input
              type="checkbox"
              checked={previewEntries.length > 0}
              onChange={(event) => {
                onPreviewEnabled(event.target.checked);
                setCategory("全部");
              }}
            />
            包含 Finding 交互示例
          </label>
        )}
        {previewEntries.length > 0 && (
          <p>示例非项目记录；判断与编辑仅在本次会话保留。</p>
        )}
      </header>
      <label className="explorer-search">
        <Search size={16} />
        <span className="sr-only">搜索项目对象</span>
        <ThatOpenTextInput
          aria-label="搜索项目对象"
          type="search"
          placeholder="搜索名称、编号、版本与依据"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            if (!event.target.value.trim()) setCategory("全部");
          }}
        />
      </label>
      <>
        <nav className="explorer-filters" aria-label="浏览对象类型">
          {createElement(
            "bim-selector",
            { ref: filterRef, label: "浏览对象类型" },
            categories
              .filter(
                (item) => item !== "交互示例" || previewEntries.length > 0,
              )
              .map((item) =>
                createElement("bim-option", {
                  key: item,
                  label: item,
                  value: item,
                }),
              ),
          )}
        </nav>
        <p className="quiet-message" role="status">
          {needle
            ? `${count} 个对象匹配「${query.trim()}」`
            : `${count} 个项目对象`}
        </p>
      </>
      {pending && (
        <WorkspaceInlineState title="正在读取项目记录…">
          正在准备对象列表。
        </WorkspaceInlineState>
      )}
      {(queries.some((result) => result.isError) || context.recordsError) && (
        <WorkspaceInlineState
          title="部分项目记录读取失败"
          alert
          diagnostic={queries
            .filter((result) => result.isError)
            .map((result) => result.error?.message)
            .join("\n")}
          action={
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                queries.forEach((result) => {
                  if (result.isError) void result.refetch();
                });
                context.retryRecords();
              }}
            >
              重试读取
            </Button>
          }
        >
          搜索结果可能不完整；其他已读取对象仍可打开。
        </WorkspaceInlineState>
      )}
      {!count && !pending && !unavailable ? (
        <div className="explorer-empty workspace-empty">
          <h2>没有匹配的项目对象</h2>
          <p>
            搜索只包含当前项目已有对象的名称、编号和记录信息；试试其他关键词或类型。
          </p>
          <Button
            variant="ghost"
            type="button"
            className="text-button"
            onClick={() => {
              setQuery("");
              setCategory("全部");
            }}
          >
            清除搜索与筛选
          </Button>
        </div>
      ) : (
        shown
          .filter((group) => group.entries.length)
          .map((group) => (
            <section
              className="explorer-group"
              key={group.category}
              aria-label={group.category}
            >
              <h2>
                {group.category} <span>{group.entries.length}</span>
              </h2>
              <ThatOpenDataTable
                className="explorer-table"
                aria-label={`${group.category}对象`}
                columns={[
                  { name: "名称", width: "minmax(180px, 1fr)" },
                  { name: "类型", width: "130px" },
                  { name: "记录", width: "minmax(200px, 1.3fr)" },
                  { name: "状态", width: "100px" },
                  { name: "操作", width: "64px" },
                ]}
                hiddenColumns={["编号"]}
                data={group.entries.map((entry) => ({
                  id: JSON.stringify(entry.target),
                  data: {
                    名称: entry.title,
                    类型: entry.type,
                    记录: entry.meta,
                    状态: entry.state ?? "",
                    编号:
                      entry.target.kind === "finding"
                        ? (entry.target.evidenceId ?? entry.target.id)
                        : entry.target.id,
                    操作: JSON.stringify(entry.target),
                  },
                }))}
                dataTransform={{
                  名称: (value, data) => html`
                    <div style="min-width: 0; overflow-wrap: anywhere">
                      <strong>${value}</strong>
                      <details
                        style="color: var(--muted); font-size: 12px; margin-top: 4px"
                      >
                        <summary>对象编号</summary>
                        <code>${data.编号}</code>
                      </details>
                    </div>
                  `,
                  记录: (value) => html`
                    <span
                      style="color: var(--muted); line-height: 1.6; overflow-wrap: anywhere"
                      >${value}</span
                    >
                  `,
                  操作: (value, data) => {
                    const entry = tableEntries.get(String(value));
                    if (!entry) return html``;
                    return html`
                      <bim-button
                        label="打开"
                        aria-label=${`打开 ${data.名称}`}
                        @click=${() => onOpen(entry.target)}
                      ></bim-button>
                    `;
                  },
                }}
              />
            </section>
          ))
      )}
    </section>
  );
}
