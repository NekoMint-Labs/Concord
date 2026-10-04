import { useState } from "react";
import type { DTO } from "../api/client";
import { targetLabel, qualityLabels } from "../app/EvidenceWorkspaceHost";
import { WorkspaceInlineState } from "../components/WorkspaceInlineState";
import { AppDialog } from "../components/ui/AppDialog";
import { Button } from "../components/ui/button";
import { shortDate, statusLabel } from "../ui/labels";
import type { useEngineeringFinding } from "./useEngineeringFindings";

export const decisionLabels = {
  CONFIRMED: "已确认",
  DISMISSED: "已忽略",
  CLOSED: "人工关闭",
  EDITED: "人工编辑",
  REOPENED: "重新打开",
};
export const outcomeLabels = {
  RESOLVED: "条件已验证满足",
  STILL_OPEN: "问题仍存在",
  CHANGED: "问题已变化，需重新判断",
  NEEDS_REVIEW: "需要人工复核 · 非执行失败",
};
export function recheckFreshness(
  check: DTO<"ReCheck">,
  finding: DTO<"Finding">,
  sources?: DTO<"ProjectSourceStatus">[],
) {
  if (check.finding_updated_at !== finding.updated_at)
    return "已过期 · Finding 已更新";
  const source = sources?.find((item) => item.source.id === check.source_id);
  if (!source?.latest_revision_id) return "版本时效未验证 · 当前源版本不可用";
  if (source.latest_revision_id !== check.source_revision_id)
    return "已过期 · 源版本已更新";
  return "当前版本绑定 · 关闭仍由服务器验证";
}

/** Real append-only human history and persisted ReChecks, never AI closure. */
export function FindingFollowUp({
  session,
  sources,
  onEvidence,
  onRun,
}: {
  session: ReturnType<typeof useEngineeringFinding>;
  sources?: DTO<"ProjectSourceStatus">[];
  onEvidence: (id: string) => void;
  onRun?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Decision failures belong to the decision dialog, not this request surface.
  const [requestScope, setRequestScope] = useState<string>();
  const finding = session.finding.data;
  const scope = finding && JSON.stringify([finding.project_id, finding.id]);
  const requestError =
    requestScope && requestScope === scope ? session.error : "";
  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) setRequestScope(undefined);
  };
  const sourceName = (id: string) =>
    sources?.find((item) => item.source.id === id)?.source.name ??
    "来源名称不可用";
  const requestRechecks = () => {
    setRequestScope(scope);
    void session.requestRechecks();
  };
  return (
    <AppDialog
      trigger={
        <Button variant="secondary" size="sm">
          协调 / 复核
        </Button>
      }
      open={open}
      onOpenChange={changeOpen}
      title="协调 / ReCheck"
      description="人工决策记录与工程复核结果分开呈现。新版本、AI 解释或执行完成均不自动关闭 Finding。"
      className="finding-follow-up-dialog"
    >
      <div className="finding-follow-up">
        <strong>{finding?.title}</strong>
        <section className="finding-section" aria-label="工程复核">
          <h3>ReCheck · 工程复核</h3>
          <Button
            size="sm"
            variant="secondary"
            disabled={session.busy || finding?.state !== "CONFIRMED"}
            onClick={requestRechecks}
          >
            {session.busy
              ? "正在提交…"
              : requestError
                ? "重试复核请求"
                : "请求当前版本复核"}
          </Button>
          <p className="workspace-receipt-note">
            执行完成不等于问题已解决；关闭须检查当前工程依据并由人工确认。
          </p>
          {requestError && (
            <WorkspaceInlineState
              title="复核请求未提交"
              diagnostic={requestError}
              alert
            >
              记录保持不变，请重试当前请求。
            </WorkspaceInlineState>
          )}
          {session.rechecks.isPending && (
            <WorkspaceInlineState title="正在读取 ReCheck…">
              等待服务器返回复核记录。
            </WorkspaceInlineState>
          )}
          {session.rechecks.isError && (
            <WorkspaceInlineState
              title="复核记录读取失败"
              diagnostic={session.rechecks.error.message}
              alert
              action={
                <Button
                  size="sm"
                  onClick={() => void session.rechecks.refetch()}
                >
                  重试读取复核
                </Button>
              }
            >
              暂时无法读取历史，不据此判断问题已解决。
            </WorkspaceInlineState>
          )}
          {!session.rechecks.isPending &&
            !session.rechecks.isError &&
            !session.rechecks.data?.length && (
              <WorkspaceInlineState title="尚无 ReCheck，不能据此声称问题已解决。">
                确认工程判断后可请求当前版本复核。
              </WorkspaceInlineState>
            )}
          <ol className="finding-preview-history" aria-label="ReCheck 历史">
            {session.rechecks.data?.map((check, index) => {
              const runQuery = session.runs[index];
              const run = runQuery?.data;
              const outcome = check.outcome
                ? outcomeLabels[check.outcome]
                : "工程结论待定";
              const timestamp = check.completed_at ?? check.created_at;
              return (
                <li key={check.id}>
                  <div className="workspace-row-top">
                    <strong>{outcome}</strong>
                    <time dateTime={timestamp}>{shortDate(timestamp)}</time>
                  </div>
                  <p>{check.explanation}</p>
                  <dl>
                    <div>
                      <dt>检查来源</dt>
                      <dd>{sourceName(check.source_id)}</dd>
                    </div>
                    <div>
                      <dt>检查条件</dt>
                      <dd>
                        {check.dependencies.length
                          ? check.dependencies.map((dependency, index) => (
                              <p key={index}>
                                {sourceName(dependency.source_id)} ·{" "}
                                {dependency.expected_condition}
                              </p>
                            ))
                          : "未记录检查条件，不推断已验证范围。"}
                      </dd>
                    </div>
                  </dl>
                  <p className="workspace-row-bottom">
                    执行：
                    {run
                      ? statusLabel(run.status)
                      : runQuery?.isError
                        ? "执行状态不可用"
                        : "正在读取执行状态…"}
                  </p>
                  {run?.error && (
                    <WorkspaceInlineState
                      title="复核执行失败"
                      diagnostic={run.error}
                      alert
                    >
                      执行失败不代表工程问题已解决，也不等于需要人工复核的工程结论。
                    </WorkspaceInlineState>
                  )}
                  {runQuery?.isError && (
                    <WorkspaceInlineState
                      title="执行状态不可用"
                      diagnostic={runQuery.error.message}
                      alert
                      action={
                        <Button
                          size="sm"
                          onClick={() => void runQuery.refetch()}
                        >
                          重试读取执行状态
                        </Button>
                      }
                    >
                      工程结论与执行状态分别记录。
                    </WorkspaceInlineState>
                  )}
                  <p role="status" className="workspace-receipt-note">
                    {finding && recheckFreshness(check, finding, sources)}
                  </p>
                  {check.evidence_ids.map((id) => {
                    const evidence = session.evidence.find(
                      (query) => query.data?.id === id,
                    )?.data;
                    return (
                      <Button
                        variant="ghost"
                        type="button"
                        className="finding-evidence-link"
                        aria-label={`查看复核 Evidence · ${id}`}
                        key={id}
                        onClick={() => {
                          changeOpen(false);
                          onEvidence(id);
                        }}
                      >
                        <span>
                          <strong>
                            {evidence?.fact ?? "复核 Evidence 暂不可读"}
                          </strong>
                          <small>
                            {evidence
                              ? `${sourceName(evidence.source_id)} · ${targetLabel(evidence.viewer_target)}`
                              : "保留证据选择，不制造定位信息。"}
                          </small>
                        </span>
                        {evidence && (
                          <span className="finding-quality">
                            {qualityLabels[evidence.quality]}
                          </span>
                        )}
                      </Button>
                    );
                  })}
                  <details className="workspace-technical-details">
                    <summary>技术详情 · 请求与版本</summary>
                    <dl>
                      <div>
                        <dt>工程结论</dt>
                        <dd>
                          {check.outcome ?? "PENDING"} · {outcome}
                        </dd>
                      </div>
                      <div>
                        <dt>执行状态</dt>
                        <dd>{run && `执行：${run.status}`}</dd>
                      </div>
                      <div>
                        <dt>ReCheck / Run ID</dt>
                        <dd>
                          <code>{check.id}</code>
                        </dd>
                      </div>
                      <div>
                        <dt>请求 ID</dt>
                        <dd>
                          <code>{check.request_id}</code>
                        </dd>
                      </div>
                      <div>
                        <dt>创建时间</dt>
                        <dd>
                          <code>{check.created_at}</code>
                        </dd>
                      </div>
                      <div>
                        <dt>完成时间</dt>
                        <dd>
                          <code>{check.completed_at ?? "尚未完成"}</code>
                        </dd>
                      </div>
                      <div>
                        <dt>绑定 Finding 更新时间</dt>
                        <dd>
                          <code>{check.finding_updated_at}</code>
                        </dd>
                      </div>
                    </dl>
                    <pre aria-label="Exact ReCheck record">
                      {JSON.stringify(check, null, 2)}
                    </pre>
                    {run && (
                      <pre aria-label="Exact ReCheck run">
                        {JSON.stringify(run, null, 2)}
                      </pre>
                    )}
                  </details>
                  {onRun && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRun(check.id)}
                    >
                      运行时间线
                    </Button>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
        <section className="finding-section" aria-label="人工决策历史">
          <h3>Coordination · 人工决策历史</h3>
          {session.coordination.isPending && (
            <WorkspaceInlineState title="正在读取人工决策历史…">
              等待服务器返回人工记录。
            </WorkspaceInlineState>
          )}
          {session.coordination.isError && (
            <WorkspaceInlineState
              title="人工决策历史读取失败"
              diagnostic={session.coordination.error.message}
              alert
              action={
                <Button
                  size="sm"
                  onClick={() => void session.coordination.refetch()}
                >
                  重试读取历史
                </Button>
              }
            >
              暂时无法读取历史，不生成替代记录。
            </WorkspaceInlineState>
          )}
          {!session.coordination.isPending &&
            !session.coordination.isError &&
            !session.coordination.data?.length && (
              <WorkspaceInlineState title="尚无人工决策记录。">
                检查关联依据后可作人工判断。
              </WorkspaceInlineState>
            )}
          <ol
            className="finding-preview-history"
            aria-label="Coordination 历史"
          >
            {session.coordination.data?.map((record) => (
              <li key={record.id}>
                <div className="workspace-row-top">
                  <strong>{decisionLabels[record.decision]}</strong>
                  <time dateTime={record.created_at}>
                    {shortDate(record.created_at)}
                  </time>
                </div>
                <p className="workspace-row-bottom">{record.actor}</p>
                <p>{record.note}</p>
                <details className="workspace-technical-details">
                  <summary>技术详情 · 人工记录</summary>
                  <dl>
                    <div>
                      <dt>决策</dt>
                      <dd>
                        <code>{record.decision}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>记录 ID</dt>
                      <dd>
                        <code>{record.id}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>创建时间</dt>
                      <dd>
                        <code>{record.created_at}</code>
                      </dd>
                    </div>
                    {record.recheck_id && (
                      <div>
                        <dt>关闭依据 ReCheck</dt>
                        <dd>
                          <code>{record.recheck_id}</code>
                        </dd>
                      </div>
                    )}
                  </dl>
                  <pre aria-label="Exact Coordination record">
                    {JSON.stringify(record, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ol>
          <p className="workspace-receipt-note">
            记录人工判断的来源。确认或关闭不代表自动验证工程条件。
          </p>
        </section>
      </div>
      <Button variant="secondary" onClick={() => changeOpen(false)}>
        返回证据
      </Button>
    </AppDialog>
  );
}
