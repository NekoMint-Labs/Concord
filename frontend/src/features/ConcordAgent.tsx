import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScanSearch } from "lucide-react";
import {
  api,
  type AgentRun,
  type DTO,
  type InvestigationReport,
} from "../api/client";
import { useRunStream } from "../api/stream";
import {
  AGENT_ELEMENT_LIMIT_MESSAGE,
  engineeringContextKey,
  MAX_AGENT_ELEMENTS,
  reportMatchesRun,
  scopeFor,
} from "./agentContext";
import { PropertyRow, PropertyTable } from "../components/PropertyTable";
import { Status } from "../components/Status";
import { AppPopover, AppPopoverClose } from "../components/ui/AppPopover";
import { AppDisclosure } from "../components/ui/AppDisclosure";
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
  workPackageName?: string;
  elementIds: string[];
};

export function ConcordAgent({
  project,
  context,
  currentRun,
  report,
  onRun,
  onOpenReport,
  onInvestigate,
}: {
  project: string;
  context: ConcordContext;
  currentRun?: AgentRun | null;
  report?: InvestigationReport | null;
  onRun: (run: AgentRun) => void;
  onOpenReport?: () => void;
  onInvestigate?: (
    instruction: string,
    context: ConcordContext,
  ) => Promise<AgentRun | void> | AgentRun | void;
}) {
  const cache = useQueryClient();
  const [question, setQuestion] = useState("");
  const contextKey = engineeringContextKey(project, context);
  // A fresh token also fences A → B → A, not just different revision IDs.
  const askContext = useRef({ key: contextKey });
  if (askContext.current.key !== contextKey)
    askContext.current = { key: contextKey };
  const [answerState, setAnswer] = useState<{
    identity: typeof askContext.current;
    response: DTO<"AgentResponse">;
  } | null>(null);
  const answer =
    answerState?.identity === askContext.current ? answerState.response : null;
  const scopeTooLarge = context.elementIds.length > MAX_AGENT_ELEMENTS;
  const validRun = currentRun?.project_id === project ? currentRun : null;
  const validReport = reportMatchesRun(report, validRun) ? report : null;
  const investigation = useMemo(
    () =>
      context.elementIds.length
        ? {
            label: `检查 ${context.elementIds.length} 个已选构件`,
            instruction: "查看所选构件的影响与依据",
          }
        : context.revisionId
          ? {
              label: context.fromRevisionId
                ? "查看版本变化的原因"
                : "查看当前模型",
              instruction: "查看模型变化及工作包影响",
            }
          : context.workPackageId
            ? { label: "查看工作包问题", instruction: "查看工作包的问题与依据" }
            : { label: "检查当前项目", instruction: "调查当前项目" },
    [context],
  );
  const submittedInstruction = question.trim() || investigation.instruction;
  const stream = useRunStream(
    validRun?.id,
    !!validRun &&
      ["QUEUED", "RUNNING", "WAITING_APPROVAL"].includes(validRun.status),
    validRun?.generation ?? 0,
    project,
  );
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
    mutationFn: (submitted: {
      identity: typeof askContext.current;
      project: string;
      context: ConcordContext;
      instruction: string;
    }) =>
      api.askAgent(submitted.project, {
        instruction: submitted.instruction,
        scope: scopeFor(submitted.context),
      }),
    onSuccess: (response, submitted) => {
      if (submitted.identity === askContext.current)
        setAnswer({ identity: submitted.identity, response });
    },
  });
  const askIsCurrent = ask.variables?.identity === askContext.current;
  const askPending = askIsCurrent && ask.isPending;
  const askError = askIsCurrent ? ask.error : null;
  const investigate = useMutation({
    mutationFn: async (instruction: string) => {
      const next = onInvestigate
        ? await onInvestigate(instruction, context)
        : await api.investigate(project, {
            instruction,
            scope: scopeFor(context),
          });
      if (!next) return;
      onRun(next);
      return next;
    },
    onSuccess: () => setAnswer(null),
  });
  const retry = useMutation({
    mutationFn: () => api.resume(validRun!.id),
    onSuccess: (next) => onRun(next),
  });

  return (
    <AppPopover
      label="询问 Concord"
      side="bottom"
      trigger={
        <Button variant="ghost" size="sm" aria-label="询问 Concord">
          <ScanSearch {...icon} />
        </Button>
      }
    >
      <div className="agent-surface">
        <header className="agent-header">
          <div>
            <span className="eyebrow">Concord</span>
            <h3>询问与检查</h3>
          </div>
        </header>
        <AppDisclosure label="调查方式">
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
        </AppDisclosure>

        <section className="agent-context-block">
          <span className="section-label">调查范围</span>
          <strong>
            {context.workPackageName ??
              context.sourceName ??
              context.projectName}
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
            if (question.trim() && !scopeTooLarge && !askPending)
              ask.mutate({
                identity: askContext.current,
                project,
                context: { ...context, elementIds: [...context.elementIds] },
                instruction: question.trim(),
              });
          }}
        >
          <label className="section-label" htmlFor="context-question">
            询问当前工程问题
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
              disabled={!question.trim() || askPending || scopeTooLarge}
            >
              {askPending ? "查询中" : "询问"}
            </Button>
          </div>
        </form>

        {scopeTooLarge && <p role="alert">{AGENT_ELEMENT_LIMIT_MESSAGE}</p>}

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
            <strong>Concord 核对影响、原因和判断依据</strong>
          </div>
          <Button
            size="sm"
            disabled={investigate.isPending || scopeTooLarge}
            onClick={() => investigate.mutate(submittedInstruction)}
          >
            {investigate.isPending
              ? "正在启动"
              : question.trim()
                ? "保存为工程调查"
                : investigation.label}
          </Button>
        </section>

        {validRun && (
          <section className="agent-current-run">
            <div className="agent-run-heading">
              <span className="section-label">Concord 调查状态</span>
              <Status value={validRun.status} />
            </div>
            <PropertyTable>
              {validReport && (
                <PropertyRow
                  label="判断依据"
                  value={`${validReport.evidence.length} 条`}
                />
              )}
            </PropertyTable>
            {validReport && (
              <>
                <p>{demoInvestigationText(validReport.answer.summary)}</p>
                {onOpenReport && (
                  <AppPopoverClose>
                    <Button size="sm" variant="ghost" onClick={onOpenReport}>
                      查看调查结果
                    </Button>
                  </AppPopoverClose>
                )}
              </>
            )}
            {validRun.status === "FAILED" && (
              <div className="agent-run-failure">
                <p role="alert">调查未完成，请从当前工程位置重试。</p>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={retry.isPending}
                  onClick={() => retry.mutate()}
                >
                  {retry.isPending ? "正在恢复" : "重试调查"}
                </Button>
              </div>
            )}
            {!!stream.events.length && (
              <ol className="agent-run-timeline" aria-label="调查进度">
                {stream.events.slice(-5).map((event) => (
                  <li key={event.sequence}>
                    <span>
                      {event.type === "RUN_FINISHED"
                        ? "运行已完成"
                        : event.type === "RUN_ERROR"
                          ? "运行失败"
                          : event.type === "CUSTOM"
                            ? (event.name ?? "已记录活动")
                            : event.type === "STEP_FINISHED"
                              ? "读取步骤已完成"
                              : "运行进行中"}
                    </span>
                    {event.stepName && <small>{event.stepName}</small>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        {!!notices.data?.length && (
          <section className="agent-notices">
            <span className="section-label">需要关注</span>
            {notices.data.slice(-3).map((notice) => (
              <div key={notice.id}>
                <span>发现待审核的模型版本</span>
              </div>
            ))}
          </section>
        )}

        {(askError ||
          investigate.error ||
          retry.error ||
          configure.error ||
          stream.error) && (
          <p className="alert" role="alert">
            {retry.error || investigate.error
              ? "调查无法启动或恢复，请重试。"
              : askError
                ? "暂时无法回答，请重试。"
                : stream.error
                  ? "调查进度暂时不可用。"
                  : "设置未保存，请重试。"}
          </p>
        )}
      </div>
    </AppPopover>
  );
}
