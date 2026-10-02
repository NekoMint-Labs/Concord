import { CircleAlert } from "lucide-react";
import type { Constraint, WorkPackage, Workspace } from "../api/client";
import { PropertyRow, PropertyTable } from "../components/PropertyTable";
import { Button } from "../components/ui/button";
import { demoConstraintText } from "../ui/demo/demoPresentation";
import type { InspectorView } from "./Inspector";

export function CoordinationSchedule({ wp }: { wp: WorkPackage }) {
  return (
    <section className="package-tab-content">
      <h2>进度</h2>
      <p>此工作包尚未记录日期。</p>
      <p>这里显示已记录的前置关系与设计版本；施工日期请核对项目进度资料。</p>
      <PropertyTable>
        <PropertyRow
          label="前置工作包"
          value={wp.predecessors?.length ? wp.predecessors.join("、") : "无"}
        />
        <PropertyRow label="已接受设计版本" value={wp.accepted_revision} />
        <PropertyRow label="当前设计版本" value={wp.design_revision} />
      </PropertyTable>
    </section>
  );
}

export function CoordinationIssues({
  constraints,
  analysis,
  onIssues,
  onConstraint,
  onDetails,
}: {
  constraints: Constraint[];
  analysis: Workspace["analysis"];
  onIssues?: () => void;
  onConstraint?: (id: string) => void;
  onDetails: (view: InspectorView) => void;
}) {
  return (
    <section className="package-tab-content">
      <h2>未解决问题 · {constraints.length}</h2>
      {!!constraints.length && onIssues && (
        <Button variant="ghost" size="sm" onClick={onIssues}>
          在模型中查看 →
        </Button>
      )}
      {constraints.length ? (
        constraints.map((issue) => (
          <button
            className="package-issue"
            key={issue.id}
            type="button"
            onClick={() => {
              onConstraint?.(issue.id);
              onDetails("blocker");
            }}
          >
            <CircleAlert size={15} />
            <span>
              <strong>
                {demoConstraintText(issue.kind, issue.description)}
              </strong>
              <small>{issue.evidence_ids.length} 项判断依据 · 查看问题 →</small>
            </span>
          </button>
        ))
      ) : (
        <p>
          {analysis
            ? "此工作包没有已记录的阻塞问题。工程条件变化后，请返回概览重新检查；这不代替现场核验。"
            : "此工作包尚未检查，暂无问题记录。请返回概览重新检查施工条件。"}
        </p>
      )}
    </section>
  );
}
