import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type AgentRun, type DTO } from "../api/client";
import { AppDisclosure } from "../components/ui/AppDisclosure";
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
  const [tool, setTool] = useState<"schedule" | "vision" | "retrieval">(
    "schedule",
  );
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
    <section className="operations-workspace">
      <header className="view-toolbar">
        <h2>运行检查</h2>
        <span className="viewer-toolbar-note">
          显式启动工程检查，并核对每次运行的结果与轨迹
        </span>
      </header>
      <div className="operations-layout">
        <aside className="operation-console" aria-label="启动检查">
          <header>
            <span className="eyebrow">检查工具</span>
            <h3>启动新运行</h3>
          </header>
          <nav className="operation-tabs" aria-label="检查类型">
            {[
              ["schedule", "约束排程", "班组、设备与前置关系"],
              ["vision", "现场图像", "安全图像观察"],
              ["retrieval", "文档检索", "派生向量索引"],
            ].map(([id, label, hint]) => (
              <button
                type="button"
                key={id}
                className={tool === id ? "selected" : ""}
                onClick={() =>
                  setTool(id as "schedule" | "vision" | "retrieval")
                }
              >
                <strong>{label}</strong>
                <small>{hint}</small>
              </button>
            ))}
          </nav>

          <div className="operation-tool">
            {tool === "schedule" && (
              <section aria-labelledby="schedule-tool">
                <h4 id="schedule-tool">约束排程</h4>
                <p>
                  使用具备资质的班组、共享设备、前置关系和时间窗求解；服务端会独立校验返回指派。
                </p>
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
                  启动排程检查
                </Button>
                <AppDisclosure label="高级排程输入">
                  <label className="form-label">
                    排程问题 JSON
                    <textarea
                      aria-label="排程问题 JSON"
                      rows={7}
                      value={
                        problem ||
                        (fixture.data
                          ? JSON.stringify(fixture.data, null, 2)
                          : "")
                      }
                      onChange={(event) => setProblem(event.target.value)}
                    />
                  </label>
                </AppDisclosure>
                {!enabled("optimization") && (
                  <small className="operation-unavailable">
                    排程扩展未启用；不会生成模拟结果。
                  </small>
                )}
              </section>
            )}

            {tool === "vision" && (
              <section aria-labelledby="vision-tool">
                <h4 id="vision-tool">现场图像观察</h4>
                <p>
                  仅上传有权分享的安全图像。元数据会被剥离，但画面仍可能包含人员或商业信息。
                </p>
                <label className="file-field">
                  <span>现场图像</span>
                  <input
                    aria-label="视觉图像"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => {
                      setImage(event.target.files?.[0] ?? null);
                      setConsent(false);
                    }}
                  />
                </label>
                <label className="consent">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                  我同意将所选、已净化的图像发送到已配置的模型。
                </label>
                <Button
                  disabled={busy || !image || !consent || !enabled("vision")}
                  onClick={() =>
                    image &&
                    void submit(() => api.vision(project, image, consent))
                  }
                >
                  启动图像检查
                </Button>
                {!enabled("vision") && (
                  <small className="operation-unavailable">
                    图像能力未配置或不可用。
                  </small>
                )}
              </section>
            )}

            {tool === "retrieval" && (
              <SemanticRetrieval
                project={project}
                enabled={enabled("vector retrieval")}
                perform={perform}
                onRun={setPreferredRun}
              />
            )}
          </div>
        </aside>

        <RunHistory
          key={preferredRun}
          project={project}
          preferred={preferredRun}
          perform={perform}
        />
      </div>
    </section>
  );
}
