import { Box, ChevronRight } from "lucide-react";
import { AppDisclosure } from "../components/ui/AppDisclosure";
import { propertySections } from "./bimProperties";
import {
  demoConstraintKind,
  demoConstraintText,
  demoElementName,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";
import type { SpatialInspectorProps } from "./SpatialInspector";

type DetailsProps = Pick<
  SpatialInspectorProps,
  | "mode"
  | "issue"
  | "title"
  | "classification"
  | "inspectorTab"
  | "activeId"
  | "change"
  | "linkedIssues"
  | "item"
  | "snapshot"
  | "geometryAvailable"
  | "workPackage"
  | "revisionLabel"
  | "fromRevisionLabel"
  | "sourceName"
  | "viewFile"
  | "viewerProperties"
  | "elements"
  | "workspace"
  | "select"
  | "chooseIssue"
  | "onIssueResolution"
  | "onInvestigate"
  | "openChanges"
> & {
  technicalOpen: boolean;
  setTechnicalOpen: (open: boolean) => void;
};

export function SpatialInspectorDetails({
  mode,
  issue,
  title,
  inspectorTab,
  activeId,
  change,
  linkedIssues,
  item,
  snapshot,
  geometryAvailable,
  workPackage,
  revisionLabel,
  fromRevisionLabel,
  sourceName,
  viewFile,
  viewerProperties,
  elements,
  workspace,
  select,
  chooseIssue,
  onIssueResolution,
  onInvestigate,
  openChanges,
  technicalOpen,
  setTechnicalOpen,
}: DetailsProps) {
  const description = (aspects: string[]) =>
    aspects
      .map(
        (aspect) =>
          ({
            placement: "位置变更",
            geometry: "几何变更",
            attributes: "属性变更",
            properties: "属性集变更",
            impact: "受设计变更影响",
          })[aspect] ?? aspect,
      )
      .join(" · ");
  return (
    <div className="spatial-inspector-body">
      {mode === "changes" && change && (
        <section className="comparison-inspection">
          <span className="context-status">
            {change.change_kind === "added"
              ? "新增"
              : change.change_kind === "deleted"
                ? "删除"
                : "修改"}
          </span>
          <h3>修订记录</h3>
          <div className="comparison-step">
            <strong>{revisionLabel ?? "目标版本"}</strong>
            <span>{description(change.changed_aspects)}</span>
          </div>
          <div className="comparison-step">
            <strong>{fromRevisionLabel ?? "上一版本"}</strong>
            <span>上一模型版本</span>
          </div>
          <h3>变更标识</h3>
          <p>所选构件以蓝色标识，其他变更构件以琥珀色标识。</p>
          <button type="button" onClick={openChanges}>
            在变更列表中查看 →
          </button>
        </section>
      )}
      {mode === "issues" && issue && (
        <section className="issue-inspection issue-primary">
          <h3>详情</h3>
          <dl className="element-facts">
            <div>
              <dt>类型</dt>
              <dd>{demoConstraintKind(issue.kind)}</dd>
            </div>
            <div>
              <dt>优先级</dt>
              <dd className="issue-priority">阻塞</dd>
            </div>
            <div>
              <dt>工作包</dt>
              <dd>
                {workPackage
                  ? demoWorkPackageName(workPackage.id, workPackage.name)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>楼层</dt>
              <dd>{snapshot?.storey ?? item?.storey ?? "—"}</dd>
            </div>
          </dl>
          <h3>描述</h3>
          <p>{demoConstraintText(issue.kind, issue.description)}</p>
          <h3>判断依据</h3>
          <p>
            {workspace?.analysis?.evidence
              .filter((entry) => issue.evidence_ids.includes(entry.id))
              .map((entry) => demoConstraintText(issue.kind, entry.fact))
              .join(" · ") || "暂无关联的空间判断依据。"}
          </p>
          {onIssueResolution && (
            <button
              type="button"
              className="issue-resolution"
              onClick={() => onIssueResolution(issue.id)}
            >
              查看处理建议 →
            </button>
          )}
        </section>
      )}
      {mode !== "issues" && (item || snapshot || activeId) && (
        <>
          {inspectorTab === "overview" && (
            <>
              {(geometryAvailable === false ||
                (!item && !snapshot && !viewerProperties)) && (
                <p className="quiet-message">
                  {change?.change_kind === "deleted"
                    ? "目标版本无几何（历史变更保留）"
                    : "当前版本缺失（保留历史关联）"}
                  {snapshot
                    ? "；以下为已保存的历史属性，不是目标版本几何。"
                    : "；当前版本无构件属性。"}
                </p>
              )}
              <dl className="element-facts">
                {/* 类别 is already the panel subtitle; repeating it here spends a
                      row of the most-read block on a value the reader has just
                      been shown. */}
                {(item?.space || snapshot?.space) && (
                  <div>
                    <dt>系统</dt>
                    <dd>{item?.space ?? snapshot?.space}</dd>
                  </div>
                )}
                {(snapshot?.storey || item?.storey) && (
                  <div>
                    <dt>楼层</dt>
                    <dd>{snapshot?.storey ?? item?.storey}</dd>
                  </div>
                )}
                {workPackage && (
                  <div>
                    <dt>工作包</dt>
                    <dd>
                      {demoWorkPackageName(workPackage.id, workPackage.name)}
                    </dd>
                  </div>
                )}
                <div>
                  <dt>模型</dt>
                  <dd>
                    {revisionLabel ?? sourceName ?? viewFile?.name ?? "—"}
                  </dd>
                </div>
              </dl>
            </>
          )}
          {((inspectorTab === "overview" && !!change) ||
            inspectorTab === "changes") && (
            <section className="element-section">
              <h3>
                变更 <small>{change ? 1 : 0}</small>
              </h3>
              {change ? (
                <button
                  type="button"
                  className="element-context-row"
                  onClick={openChanges}
                >
                  <i className="dot amber" />
                  {description(change.changed_aspects)}
                  <ChevronRight size={13} />
                </button>
              ) : (
                <p className="quiet-message">此构件暂无变更。</p>
              )}
            </section>
          )}
          {((inspectorTab === "overview" && linkedIssues.length > 0) ||
            inspectorTab === "issues") && (
            <section className="element-section">
              <h3>
                问题 <small>{linkedIssues.length}</small>
              </h3>
              {linkedIssues.map((entry) => (
                <button
                  type="button"
                  className="element-context-row"
                  key={entry.id}
                  onClick={() => chooseIssue(entry)}
                >
                  <i className="dot red" />
                  {demoConstraintText(entry.kind, entry.description)}
                  <ChevronRight size={13} />
                </button>
              ))}
              {!linkedIssues.length && (
                <p className="quiet-message">暂无关联问题。</p>
              )}
            </section>
          )}
          {inspectorTab === "overview" && (
            <>
              {!!item?.related_ids.length && (
                <section className="element-section">
                  <h3>关联构件</h3>
                  {item?.related_ids.map((id) => (
                    <button
                      type="button"
                      className="element-context-row"
                      key={id}
                      onClick={() => select(id)}
                    >
                      <Box size={13} />
                      {demoElementName(
                        id,
                        elements?.find((e) => e.id === id)?.name ?? id,
                      )}
                      <ChevronRight size={13} />
                    </button>
                  ))}
                </section>
              )}
              <AppDisclosure
                label="技术详情"
                open={technicalOpen}
                onOpenChange={setTechnicalOpen}
              >
                <dl className="element-facts">
                  <div>
                    <dt>GlobalId</dt>
                    <dd className="mono">{activeId}</dd>
                  </div>
                  <div>
                    <dt>修订</dt>
                    <dd>{item?.revision ?? snapshot?.revision_id}</dd>
                  </div>
                </dl>
                {propertySections(
                  snapshot?.properties ?? item?.properties ?? viewerProperties,
                ).map((section, i) => (
                  <div key={i} className="technical-properties">
                    <strong>{section.title ?? "其他属性"}</strong>
                    <dl>
                      {section.fields.map((field, j) => (
                        <div key={j}>
                          <dt>{field.label}</dt>
                          <dd>{field.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </AppDisclosure>
            </>
          )}
        </>
      )}
      {mode !== "issues" && issue && (
        <section className="element-section issue-inspection">
          <h3>问题上下文</h3>
          <p>{demoConstraintText(issue.kind, issue.description)}</p>
          <small>
            工作包 ·{" "}
            {demoWorkPackageName(
              issue.work_package_id,
              workspace?.state.work_packages.find(
                (wp) => wp.id === issue.work_package_id,
              )?.name ?? issue.work_package_id,
            )}
          </small>
        </section>
      )}
      {!activeId && !item && !snapshot && !issue && (
        <p className="quiet-message">
          选择模型构件或下方列表项，查看相关上下文。
        </p>
      )}
      {change && onInvestigate && (
        <div className="inspector-foot">
          <button
            type="button"
            className="investigate-link"
            onClick={() => onInvestigate(activeId)}
          >
            调查变更 →
          </button>
        </div>
      )}
    </div>
  );
}
