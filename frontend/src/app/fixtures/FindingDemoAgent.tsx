// Isolated visual/test fixture. Never imported by the production application.
import { useState } from "react";
import { ScanSearch } from "lucide-react";
import { Button } from "../../components/ui/button";
import { icon } from "../../components/ui/icon";
import { AppPopover, AppPopoverClose } from "../../components/ui/AppPopover";
import { findingFixture } from "./finding";
import type { FindingPreviewSession } from "../../features/useFindingPreview";
export function FindingDemoAgent({
  session,
}: {
  session: FindingPreviewSession;
}) {
  const subject = JSON.stringify([
    session.active.id,
    session.values,
    session.followUp.revision,
    session.followUp.generation,
    session.latestSample,
    session.followUp.closed,
  ]);
  const explanationEvidence = [
    ...findingFixture.evidence,
    ...(session.report?.checks.flatMap((check) =>
      check.evidence ? [check.evidence] : [],
    ) ?? []),
  ];
  const [selected, setSelected] = useState<{
    subject: string;
    id: string;
  } | null>(null);
  const questions = [
    {
      id: "support",
      label: "这项判断有哪些依据？",
      answer:
        "几何变化与碰撞是结构化证据示例；图纸区域变化也是结构化示例。设计变更条款是提取文本，不等于对施工影响的验证。它们之间的关联仍是推断，需要工程师复核。",
      evidenceIds: ["beam", "clash", "drawing", "document"],
    },
    {
      id: "discipline",
      label: "为什么建议机电专业？",
      answer:
        session.values.discipline === findingFixture.discipline
          ? "受影响对象包含送风管 M-038，因此示例建议机电专业复核标高。这是专业分配建议，不是检测器确认的责任归属，也没有证明可施工。"
          : `当前专业“${session.values.discipline}”来自人工示例编辑；原始建议是机电专业。人工修改不能被重新标注为 AI 结论。`,
      evidenceIds: ["clash"],
    },
    {
      id: "limits",
      label: "还缺哪些验证？",
      answer:
        "需要真实新版结构/机电模型、检测结果及图纸/变更文件，并确认其版本一致。这里没有执行检测、创建协调项或验证问题关闭；新版本本身不能证明已解决。",
      evidenceIds: ["clash", "drawing", "document"],
    },
  ];
  if (session.followUp.revision > 1)
    questions.push({
      id: "recheck",
      label: "复核为什么能或不能关闭？",
      answer: `${session.report?.explanation ?? "新版本只表示资料变化，尚无复核依据。"} ${session.report && !session.currentSample ? "旧复核已过期，不能授权关闭。" : ""} ${session.canClose ? "全部依赖的当前样本已覆盖，但仍需明确人工确认。" : "此时不能通过该样本关闭。"} 以上只是 fixture 解释；真实关闭必须由 A 的 API 校验权限、版本、Finding 与全部依赖证据。`,
      evidenceIds:
        session.report?.checks.flatMap((check) =>
          check.evidence ? [check.evidence.id] : [],
        ) ?? [],
    });
  const answer =
    selected?.subject === subject
      ? questions.find((item) => item.id === selected.id)
      : undefined;
  return (
    <AppPopover
      label="Finding 上下文说明"
      side="bottom"
      trigger={
        <Button variant="ghost" size="sm" aria-label="询问 Concord">
          <ScanSearch {...icon} />
        </Button>
      }
    >
      <div className="agent-surface finding-context-agent">
        <header className="agent-header">
          <div>
            <span className="eyebrow">Concord · Finding 示例</span>
            <h3>围绕当前对象询问</h3>
          </div>
        </header>
        <p>
          <strong>{session.values.title}</strong>
        </p>
        <p className="quiet-message">
          当前证据：{session.active.title} · {session.active.source}
        </p>
        <p className="quiet-message">
          离线解释 fixture · 非在线 AI 回答 · 不写入项目
        </p>
        <div className="finding-context-questions">
          {questions.map((question) => (
            <Button
              key={question.id}
              variant="secondary"
              size="sm"
              aria-pressed={answer?.id === question.id}
              onClick={() => setSelected({ subject, id: question.id })}
            >
              {question.label}
            </Button>
          ))}
        </div>
        {answer && (
          <section
            aria-label="Finding 示例说明"
            className="finding-context-answer"
          >
            <h4>推断解释 · 需人工复核</h4>
            <p>{answer.answer}</p>
            <h4>查看依据</h4>
            {!answer.evidenceIds.length && <p>当前没有可定位的复核依据。</p>}
            {answer.evidenceIds.map((id) => {
              const evidence = explanationEvidence.find(
                (item) => item.id === id,
              )!;
              return (
                <AppPopoverClose key={id}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => session.selectEvidence(id)}
                  >
                    {evidence.title} ·{" "}
                    {evidence.quality === "structured" ? "结构化" : "提取"} →
                  </Button>
                </AppPopoverClose>
              );
            })}
          </section>
        )}
        <AppPopoverClose>
          <Button variant="ghost" size="sm">
            关闭说明
          </Button>
        </AppPopoverClose>
      </div>
    </AppPopover>
  );
}
