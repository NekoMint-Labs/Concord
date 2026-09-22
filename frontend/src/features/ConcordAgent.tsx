import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScanSearch } from "lucide-react";
import {
  api,
  type AgentRun,
  type DTO,
  type InvestigationReport,
} from "../api/client";
import { PropertyRow, PropertyTable } from "../components/PropertyTable";
import { Status } from "../components/Status";
import { AppPopover, AppPopoverClose } from "../components/ui/AppPopover";
import { AppSelect } from "../components/ui/AppSelect";
import { Button } from "../components/ui/button";
import { icon } from "../components/ui/icon";
import { demoInvestigationText } from "../ui/demo/demoPresentation";

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
    source_id: context.sourceId,
    from_revision_id: context.fromRevisionId,
    to_revision_id: context.revisionId,
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
  onOpenReport,
}: {
  project: string;
  context: ConcordContext;
  currentRun?: AgentRun | null;
  report?: InvestigationReport | null;
  onRun: (run: AgentRun) => void;
  onOpenReport?: () => void;
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
      await cache.invalidateQueries({ queryKey: ["agent-settings", project] });
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
  const investigation = context.elementIds.length
    ? {
        label: `检查 ${context.elementIds.length} 个已选构件`,
        instruction: "调查当前选中的 BIM 构件",
      }
    : context.revisionId
      ? {
          label: context.fromRevisionId ? "检查当前版本差异" : "检查当前版本",
          instruction: "调查当前工程来源版本",
        }
      : context.workPackageId
        ? { label: "检查当前工作包", instruction: "调查当前工作包" }
        : { label: "检查当前项目", instruction: "调查当前项目" };

  return (
    <AppPopover
      label="工程调查"
      side="bottom"
      trigger={
        <Button variant="ghost" size="sm">
          <ScanSearch {...icon} /> 调查
        </Button>
      }
    >
      <div className="agent-surface">
        <header className="agent-header">
          <div>
            <span className="eyebrow">Concord</span>
            <h3>工程调查</h3>
          </div>
          <label>
            <span>模式</span>
            <AppSelect
              label="调查方式"
              value={settings.data?.initiative ?? "suggest"}
              disabled={configure.isPending}
              onChange={(value) =>
                configure.mutate(
                  value as DTO<"AgentSettings-Input">["initiative"],
                )
              }
              options={[
                { value: "manual", label: "手动" },
                { value: "suggest", label: "建议" },
                { value: "auto-investigate", label: "自动调查" },
              ]}
            />
          </label>
        </header>

        <section className="agent-context-block">
          <span className="section-label">当前上下文</span>
          <strong>
            {context.workPackageId ?? context.sourceName ?? context.projectName}
          </strong>
          <p>
            {[
              context.sourceName,
              context.fromRevisionLabel && context.revisionLabel
                ? `${context.fromRevisionLabel} → ${context.revisionLabel}`
                : context.revisionLabel,
              context.elementIds.length
                ? `${context.elementIds.length} 个构件`
                : undefined,
            ]
              .filter(Boolean)
              .join(" · ") || "当前项目"}
          </p>
        </section>

        <form
          className="agent-ask"
          onSubmit={(event) => {
            event.preventDefault();
            if (question.trim()) ask.mutate();
          }}
        >
          <label className="section-label" htmlFor="context-question">
            询问当前上下文
          </label>
          <div className="agent-ask-row">
            <input
              id="context-question"
              maxLength={2000}
              placeholder="例如：当前为什么不能施工？"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
            <Button
              type="submit"
              size="sm"
              disabled={!question.trim() || ask.isPending}
            >
              {ask.isPending ? "查询中" : "询问"}
            </Button>
          </div>
        </form>

        {answer && (
          <section className="agent-answer">
            <p>{demoInvestigationText(answer.answer.summary)}</p>
            <small>即时只读回答 · 不写入项目依据</small>
            {answer.answer.limitations.map((item) => (
              <small key={item}>{item}</small>
            ))}
          </section>
        )}

        <section className="agent-investigate">
          <div>
            <span className="section-label">调查</span>
            <strong>核对工程事实并保存判断依据</strong>
          </div>
          <Button
            size="sm"
            disabled={investigate.isPending}
            onClick={() => investigate.mutate(investigation.instruction)}
          >
            {investigate.isPending ? "正在启动" : investigation.label}
          </Button>
        </section>

        {currentRun && (
          <section className="agent-current-run">
            <div className="agent-run-heading">
              <span className="section-label">最近调查</span>
              <Status value={currentRun.status} />
            </div>
            <PropertyTable>
              <PropertyRow
                label="运行"
                value={currentRun.id.slice(0, 8)}
                mono
              />
              <PropertyRow label="代次" value={currentRun.generation} />
              {report?.run_id === currentRun.id && (
                <PropertyRow
                  label="判断依据"
                  value={`${report.evidence.length} 条`}
                />
              )}
            </PropertyTable>
            {report?.run_id === currentRun.id && (
              <>
                <p>{demoInvestigationText(report.answer.summary)}</p>
                {onOpenReport && (
                  <AppPopoverClose>
                    <Button size="sm" variant="ghost" onClick={onOpenReport}>
                      查看调查结果
                    </Button>
                  </AppPopoverClose>
                )}
              </>
            )}
            {currentRun.error && <p role="alert">{currentRun.error}</p>}
          </section>
        )}

        {!!notices.data?.length && (
          <section className="agent-notices">
            <span className="section-label">需要关注</span>
            {notices.data.slice(-3).map((notice) => (
              <div key={notice.id}>
                <span>工程来源有新版本</span>
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
