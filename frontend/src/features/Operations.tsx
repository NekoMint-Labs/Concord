import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type AgentRun, type DTO } from "../api/client";
import { Button } from "../components/ui/button";
import { RunHistory } from "./RunHistory";
import { SemanticRetrieval } from "./SemanticRetrieval";

export function Operations({
  project,
  perform,
}: {
  project: string;
  perform: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [problem, setProblem] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [preferredRun, setPreferredRun] = useState("");
  const [busy, setBusy] = useState(false);
  const capabilities = useQuery({
    queryKey: ["capabilities", false],
    queryFn: () => api.capabilities(),
  });
  const fixture = useQuery({
    queryKey: ["scheduling-fixture"],
    queryFn: api.optimizationFixture,
  });
  const enabled = (name: string) =>
    capabilities.data?.capabilities.find((item) => item.name === name)
      ?.status === "enabled";
  async function submit(operation: () => Promise<AgentRun>) {
    setBusy(true);
    try {
      await perform(async () => {
        const run = await operation();
        setPreferredRun(run.id);
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="content-view operations-view">
      <div className="view-heading">
        <div>
          <h2>运行作业与历史记录</h2>
        </div>
      </div>
      <p className="muted">
        所有作业都使用所选运行时。结果不会自动更改排程、授予权限或作出安全决策。
      </p>
      <details className="operation-form" open>
        <summary>约束排程 / OR-Tools</summary>
        <p>
          示例数据：具备资质的班组、共享设备、前置关系、时间窗与最短完工时间。服务端校验会独立检查返回的指派。
        </p>
        <textarea
          aria-label="排程问题 JSON"
          rows={8}
          value={
            problem ||
            (fixture.data ? JSON.stringify(fixture.data, null, 2) : "")
          }
          onChange={(event) => setProblem(event.target.value)}
        />
        <Button
          disabled={busy || !enabled("optimization") || !fixture.data}
          onClick={() =>
            void submit(() =>
              api.optimize(
                project,
                JSON.parse(
                  problem || JSON.stringify(fixture.data),
                ) as DTO<"SchedulingProblem-Input">,
              ),
            )
          }
        >
          求解排程
        </Button>
        {!enabled("optimization") && (
          <small>
            请启用 CCA_OPTIMIZATION_ENABLED
            并安装排程优化扩展。不会显示任何虚构的求解结果。
          </small>
        )}
      </details>
      <details className="operation-form">
        <summary>图像观察 / 已配置的视觉模型</summary>
        <p>
          仅可上传你有权分享的安全图像。元数据会被剥离，但图像中仍可能残留个人或商业视觉信息。
        </p>
        <input
          aria-label="视觉图像"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            setImage(event.target.files?.[0] ?? null);
            setConsent(false);
          }}
        />
        <label className="consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          我同意将所选、已净化的图像发送到已配置的云端模型。
        </label>
        <Button
          disabled={busy || !image || !consent || !enabled("vision")}
          onClick={() =>
            image && void submit(() => api.vision(project, image, consent))
          }
        >
          分析图像
        </Button>
        {!enabled("vision") && (
          <small>视觉功能已禁用或不可用。请显式配置视觉模型与凭据。</small>
        )}
      </details>
      <SemanticRetrieval
        project={project}
        enabled={enabled("vector retrieval")}
        perform={perform}
        onRun={setPreferredRun}
      />
      <RunHistory
        key={preferredRun}
        project={project}
        preferred={preferredRun}
        perform={perform}
      />
    </div>
  );
}
