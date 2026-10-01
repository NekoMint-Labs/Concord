import { useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  Box,
  BriefcaseBusiness,
  FileText,
  GitCompare,
  History,
  Layers,
  Search,
  ScrollText,
} from "lucide-react";
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

export type ExplorerTarget =
  | { kind: "source"; id: string; revisionId?: string; comparisonId?: string }
  | { kind: "package" | "document" | "evidence" | "baseline"; id: string };
type Entry = {
  target: ExplorerTarget;
  title: string;
  meta: string;
  type: string;
  state?: string;
  search?: string;
};
const categories = [
  "全部",
  "资料",
  "工作包",
  "文档",
  "版本与比较",
  "判断依据",
  "基线与历史",
] as const;
type Category = (typeof categories)[number];

/** Search existing project records without a second task queue or search backend. */
export function ProjectExplorer({
  workspace,
  sources,
  onOpen,
}: {
  workspace: Workspace;
  sources: ProjectSourceStatus[];
  onOpen: (target: ExplorerTarget) => void;
  onTab: (tab: WorkspaceTab) => void;
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
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("全部");
  const catalog = revisions.flatMap((result) => result.data ?? []);
  const label = (id: string) => {
    const revision = catalog.find((item) => item.id === id);
    return revision ? `R${revision.sequence}` : id;
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
        type: item.source.kind === "BIM" ? "IFC 模型" : "工程文档",
        state: !item.latest_revision_id
          ? "尚未上传"
          : !item.accepted_revision_id
            ? "待确认基线"
            : item.has_pending_revision
              ? "新版本待检查"
              : "当前基线",
        meta: `${item.latest_revision_id ? `${label(item.latest_revision_id)} · 最新版本` : "尚未上传原文件"}${item.accepted_revision_id ? ` · 基线 ${label(item.accepted_revision_id)}` : " · 尚未确认基线"}`,
        search: item.source.id,
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
          title: `${sources.find((item) => item.source.id === revision.source_id)?.source.name ?? revision.source_id} · R${revision.sequence}`,
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
        meta: `${demoSourceLabel(evidence.source_id)} · ${evidence.source_revision} · ${evidence.location ?? "项目依据"}`,
        search: `${evidence.id} ${evidence.work_package_id ?? ""} ${evidence.provider}`,
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
  const queries = [sourceRecords, ...revisions, ...comparisons];
  const pending =
    context.recordsPending || queries.some((result) => result.isPending);
  const unavailable =
    !!context.recordsError || queries.some((result) => result.isError);
  return (
    <section className="project-explorer" aria-label="Project Explorer">
      <header className="explorer-heading">
        <h1>浏览</h1>
      </header>
      <label className="explorer-search">
        <Search size={16} />
        <span className="sr-only">搜索项目对象</span>
        <input
          type="search"
          placeholder="搜索名称、编号、版本与依据"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            if (!event.target.value.trim()) setCategory("全部");
          }}
        />
      </label>
      {needle && (
        <>
          <nav className="explorer-filters" aria-label="浏览对象类型">
            {categories.map((item) => (
              <button
                type="button"
                key={item}
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </nav>
          <p className="quiet-message" role="status">
            {count} 个对象匹配「{query.trim()}」
          </p>
        </>
      )}
      {pending && <p role="status">正在读取项目记录…</p>}
      {(queries.some((result) => result.isError) || context.recordsError) && (
        <div role="alert">
          <p>部分项目记录读取失败，搜索结果可能不完整。</p>
          <button
            type="button"
            onClick={() => {
              queries.forEach((result) => {
                if (result.isError) void result.refetch();
              });
              context.retryRecords();
            }}
          >
            重试读取
          </button>
        </div>
      )}
      {needle &&
        (!count && !pending && !unavailable ? (
          <div className="explorer-empty workspace-empty">
            <h2>没有匹配的项目对象</h2>
            <p>
              搜索只包含当前项目已有对象的名称、编号和记录信息；试试其他关键词或类型。
            </p>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setQuery("");
                setCategory("全部");
              }}
            >
              清除搜索与筛选
            </button>
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
                <ul>
                  {group.entries.map((entry) => (
                    <li
                      key={`${entry.target.kind}:${entry.target.id}:${entry.target.kind === "source" ? (entry.target.revisionId ?? entry.target.comparisonId ?? "") : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => onOpen(entry.target)}
                      >
                        <span
                          className="explorer-object-icon"
                          aria-hidden="true"
                        >
                          {entry.target.kind === "package" ? (
                            <BriefcaseBusiness size={17} />
                          ) : entry.target.kind === "document" ? (
                            <FileText size={17} />
                          ) : entry.target.kind === "baseline" ? (
                            <History size={17} />
                          ) : entry.target.kind === "evidence" ? (
                            <ScrollText size={17} />
                          ) : entry.target.kind === "source" &&
                            entry.target.comparisonId ? (
                            <GitCompare size={17} />
                          ) : entry.target.kind === "source" &&
                            entry.target.revisionId ? (
                            <Layers size={17} />
                          ) : (
                            <Box size={17} />
                          )}
                        </span>
                        <span className="explorer-object-identity">
                          <strong className="object-identity">
                            {entry.title}
                          </strong>
                          <span className="object-kind">{entry.type}</span>
                        </span>
                        <small className="explorer-object-context">
                          {entry.meta}
                        </small>
                        <span className="explorer-object-state">
                          {entry.state}
                        </span>
                        <span
                          className="explorer-object-open"
                          aria-hidden="true"
                        >
                          →
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
        ))}
    </section>
  );
}
