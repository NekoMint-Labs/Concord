import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { html } from "lit";
import { ThatOpenDataTable } from "../components/ThatOpenDataTable";
import { statusLabel, statusTone } from "../ui/labels";

const capabilityNames: Record<string, string> = {
  database: "项目数据库",
  runtime: "任务运行时",
  reasoning: "工程推理",
  storage: "文件存储",
  BIM: "BIM 数据",
  "document parser": "文档解析",
  GIS: "现场地图",
  "BIM viewer": "BIM 几何查看",
  "desktop host": "桌面宿主",
  "DBOS adapter": "DBOS 运行适配",
  "distributed runtime": "分布式运行时",
  "IFC import": "IFC 导入",
  optimization: "约束排程",
  "advanced documents": "高级文档解析",
  "object storage": "对象存储",
  vision: "现场图像识别",
  "vector retrieval": "文档向量检索",
  observability: "运行观测",
};

const reasonLabels: Record<string, string> = {
  "Read-only SELECT 1 completed": "只读数据库探测已通过",
  "Database probe failed": "数据库探测失败",
  "Runtime initialized; workflow status is individually inspectable":
    "运行时已初始化，可逐项检查工作流状态",
  "Deterministic offline reasoning; no cloud egress":
    "确定性离线推理，不向云端发送数据",
  "Controlled local file directory": "受控的本地文件目录",
  "Structured BIM fixture": "结构化 BIM 数据源",
  "Local text/Markdown parsing": "本地文本与 Markdown 解析",
  "Local site data; browser reports WebGL readiness separately":
    "本地现场数据；WebGL 状态由客户端单独报告",
  "Browser dependencyRenderer readiness is not asserted by this server":
    "几何渲染依赖由桌面客户端单独检查",
};

const profileLabels: Record<string, string> = {
  "Single-project trusted deployment with configured bearer principals; not multi-tenant identity":
    "单项目可信部署，使用已配置的访问凭据；不提供多租户身份体系",
};

const capabilityLabel = (value: string) => capabilityNames[value] ?? value;
const reasonLabel = (value: string) => reasonLabels[value] ?? value;

export function Capabilities() {
  const [probe, setProbe] = useState(false);
  const profile = useQuery({ queryKey: ["profile"], queryFn: api.profile });
  const capabilities = useQuery({
    queryKey: ["capabilities", probe],
    queryFn: () => api.capabilities(probe),
  });
  return (
    <main className="workspace-stage-surface capabilities-stage">
      {/* Capability health diagnoses the installation, not the selected work
          package: it is local information inside the stage, not a page. The band
          carries the probe control and the running profile only. */}
      <header className="workspace-stage-band">
        <span className="t-label">能力状态</span>
        <span className="dot-leader" aria-hidden="true" />
        <small>运行配置：{profile.data?.profile ?? "加载中"}</small>
        <button
          type="button"
          onClick={() => {
            setProbe(true);
            void capabilities.refetch();
          }}
        >
          探测服务
        </button>
      </header>
      <div className="workspace-stage-body">
        {profile.data && (
          <div className="profile-summary">
            <strong>{profile.data.runtime}</strong>
            <span>
              本地服务 {profile.data.database} / {profile.data.storage}
            </span>
            <p>
              {profileLabels[profile.data.authentication] ??
                profile.data.authentication}
            </p>
          </div>
        )}
        {capabilities.error && <p role="alert">能力请求失败。</p>}
        <ThatOpenDataTable
          aria-label="能力状态表"
          className="capability-table"
          columns={[
            { name: "能力", width: "minmax(160px, 1fr)" },
            { name: "实现", width: "minmax(180px, 1fr)" },
            { name: "状态与原因", width: "minmax(240px, 2fr)" },
          ]}
          hiddenColumns={["状态"]}
          data={(capabilities.data?.capabilities ?? []).map((cap) => ({
            id: cap.name,
            data: {
              能力: capabilityLabel(cap.name),
              实现: cap.implementation,
              状态: cap.status,
              状态与原因: `${reasonLabel(cap.reason)}${cap.service_reachable === null ? " · 尚未探测外部服务连通性" : ""}`,
            },
          }))}
          dataTransform={{
            能力: (value) => html`<strong>${value}</strong>`,
            状态与原因: (value, row) =>
              html`<div>
                <span
                  data-status=${row.状态}
                  style=${`color: var(${statusTone(String(row.状态 ?? "")) === "blocked" ? "--danger-fg" : "--ink-2"})`}
                  >${statusLabel(String(row.状态 ?? ""))}</span
                ><br /><small>${value}</small>
              </div>`,
          }}
        />
      </div>
    </main>
  );
}
