import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import {
  api,
  type AgentRun,
  type DTO,
  type InvestigationReport,
} from "../api/client";
import { AppPopover } from "../components/ui/AppPopover";
import { Button } from "../components/ui/button";
import { icon } from "../components/ui/icon";
import { Status } from "../components/Status";

export type ConcordContext = {
  projectName: string;
  sourceId?: string;
  sourceName?: string;
  fromRevisionId?: string;
  fromRevisionLabel?: string;
  revisionId?: string;
  revisionLabel?: string;
  workPackageId?: string;
  elementIds: string[];
};

function scopeFor(context: ConcordContext): DTO<"AgentScope-Input"> {
  return {
    source_id: context.sourceId ?? null,
    from_revision_id: context.fromRevisionId ?? null,
    to_revision_id: context.revisionId ?? null,
    work_package_ids: context.workPackageId ? [context.workPackageId] : [],
    element_ids: context.elementIds,
  };
}

export function ConcordAgent({
  project,
  context,
  currentRun,
  report,
  onRun,
}: {
  project: string;
  context: ConcordContext;
  currentRun?: AgentRun | null;
  report?: InvestigationReport | null;
  onRun: (run: AgentRun) => void;
}) {
  const cache = useQueryClient();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<DTO<"AgentResponse"> | null>(null);
  const settings = useQuery({
    queryKey: ["agent-settings", project],
    queryFn: () => api.agentSettings(project),
  });
  const notices = useQuery({
    queryKey: ["agent-notices", project],
    queryFn: () => api.agentNotices(project),
  });
  const configure = useMutation({
    mutationFn: (initiative: DTO<"AgentSettings-Input">["initiative"]) =>
      api.setAgentSettings(project, initiative),
    onSuccess: async () => {
      await cache.invalidateQueries({
        queryKey: ["agent-settings", project],
      });
    },
  });
  const ask = useMutation({
    mutationFn: () =>
      api.askAgent(project, {
        instruction: question,
        scope: scopeFor(context),
      }),
    onSuccess: setAnswer,
  });
  const investigate = useMutation({
    mutationFn: (instruction: string) =>
      api.investigate(project, {
        instruction,
        scope: scopeFor(context),
      }),
    onSuccess: (run) => {
      setAnswer(null);
      onRun(run);
    },
  });

  return (
    <AppPopover
      label="Concord"
      side="bottom"
      trigger={
        <Button variant="secondary" size="sm">
          <Sparkles {...icon} /> Concord
        </Button>
      }
    >
      <div className="agent-surface">
        <header>
          <div>
            <span className="eyebrow">当前上下文</span>
            <h3>Concord</h3>
          </div>
          <label>
            主动模式
            <select
              aria-label="Concord 主动模式"
              value={settings.data?.initiative ?? "suggest"}
              disabled={configure.isPending}
              onChange={(event) =>
                configure.mutate(
                  event.target
                    .value as DTO<"AgentSettings-Input">["initiative"],
                )
              }
            >
              <option value="manual">手动</option>
              <option value="suggest">建议</option>
              <option value="auto-investigate">自动调查</option>
            </select>
          </label>
        </header>
        <dl className="agent-context">
          <dt>项目</dt>
          <dd>{context.projectName}</dd>
          {context.sourceName && (
            <>
              <dt>来源</dt>
              <dd>{context.sourceName}</dd>
            </>
          )}
          {context.revisionLabel && (
            <>
              <dt>{context.fromRevisionLabel ? "比较" : "版本"}</dt>
              <dd>
                {context.fromRevisionLabel
                  ? `${context.fromRevisionLabel} → ${context.revisionLabel}`
                  : context.revisionLabel}
              </dd>
            </>
          )}
          {context.workPackageId && (
            <>
              <dt>工作包</dt>
              <dd>{context.workPackageId}</dd>
            </>
          )}
          {!!context.elementIds.length && (
            <>
              <dt>已选 BIM</dt>
              <dd>{context.elementIds.length} 个构件</dd>
            </>
          )}
        </dl>
        <form
          className="agent-ask"
          onSubmit={(event) => {
            event.preventDefault();
            if (question.trim()) ask.mutate();
          }}
        >
          <label className="form-label">
            询问（只读）
            <textarea
              maxLength={2000}
              placeholder="解释当前上下文中的事实…"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </label>
          <Button
            type="submit"
            size="sm"
            disabled={!question.trim() || ask.isPending}
          >
            {ask.isPending ? "正在回答…" : "询问"}
          </Button>
        </form>
        {answer && (
          <section className="agent-answer">
            <p>{answer.answer.summary}</p>
            <small>即时只读回答 · 未保存为 Evidence</small>
            {answer.answer.limitations.map((item) => (
              <small key={item}>{item}</small>
            ))}
          </section>
        )}
        <section className="agent-actions">
          <span className="fact-label">委托调查</span>
          {context.revisionId && (
            <Button
              size="sm"
              variant="secondary"
              disabled={investigate.isPending}
              onClick={() => investigate.mutate("调查当前工程来源版本")}
            >
              调查当前版本
            </Button>
          )}
          {context.workPackageId && (
            <Button
              size="sm"
              variant="secondary"
              disabled={investigate.isPending}
              onClick={() => investigate.mutate("调查当前工作包")}
            >
              调查此工作包
            </Button>
          )}
          {!!context.elementIds.length && (
            <Button
              size="sm"
              variant="secondary"
              disabled={investigate.isPending}
              onClick={() => investigate.mutate("调查当前选中的 BIM 构件")}
            >
              调查已选构件
            </Button>
          )}
          {!context.revisionId && !context.workPackageId && (
            <Button
              size="sm"
              variant="secondary"
              disabled={investigate.isPending}
              onClick={() => investigate.mutate("调查当前项目")}
            >
              调查当前项目
            </Button>
          )}
        </section>
        {currentRun && (
          <section className="agent-current-run">
            <span className="fact-label">当前 Agent 运行</span>
            <div>
              <code>{currentRun.id.slice(0, 8)}</code>
              <Status value={currentRun.status} />
              <small>第 {currentRun.generation} 代</small>
            </div>
            {currentRun.error && <p role="alert">{currentRun.error}</p>}
          </section>
        )}
        {report && report.run_id === currentRun?.id && (
          <section className="agent-result">
            <span className="fact-label">最近结果</span>
            <p>{report.answer.summary}</p>
            <small>
              {report.evidence.length} 条已持久化 Evidence · 第{" "}
              {report.generation} 代
            </small>
          </section>
        )}
        {!!notices.data?.length && (
          <section className="agent-notices">
            <span className="fact-label">需要关注</span>
            {notices.data.slice(-3).map((notice) => (
              <div key={notice.id}>
                <span>来源有新版本</span>
                <code>{notice.revision_id.slice(0, 8)}</code>
              </div>
            ))}
          </section>
        )}
        {(ask.error || investigate.error || configure.error) && (
          <p className="alert" role="alert">
            {ask.error?.message ??
              investigate.error?.message ??
              configure.error?.message}
          </p>
        )}
      </div>
    </AppPopover>
  );
}
