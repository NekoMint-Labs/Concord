import type { WorkspaceTab } from "./destinations";

const links: { tab: WorkspaceTab; title: string; description: string }[] = [
  {
    tab: "work-packages",
    title: "工作包",
    description: "区域、专业与施工范围",
  },
  {
    tab: "sources",
    title: "模型与版本",
    description: "上传、处理、关联与基线",
  },
  { tab: "documents", title: "文档", description: "项目文件与解析内容" },
  { tab: "history", title: "历史", description: "模型基线与版本记录" },
  { tab: "settings", title: "项目设置", description: "项目信息与结构" },
];

export function ProjectHome({ onTab }: { onTab: (tab: WorkspaceTab) => void }) {
  return (
    <section className="project-home" aria-label="项目管理">
      <header>
        <span className="eyebrow">当前项目</span>
        <h1>项目</h1>
        <p>管理工程资料与项目结构。</p>
      </header>
      <nav aria-label="项目内容">
        {links.map((link) => (
          <button type="button" key={link.tab} onClick={() => onTab(link.tab)}>
            <strong>{link.title}</strong>
            <span>{link.description}</span>
            <span aria-hidden="true">→</span>
          </button>
        ))}
      </nav>
    </section>
  );
}
