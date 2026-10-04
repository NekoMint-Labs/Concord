import { html, nothing } from "lit";
import { ThatOpenDataTable } from "../components/ThatOpenDataTable";
import { useRef, useState } from "react";
import { ThatOpenPanelSection } from "../components/ThatOpenUI";
import type { AgentRun, DTO } from "../api/client";
import { AppDialog } from "../components/ui/AppDialog";
import { Button } from "../components/ui/button";
import { AppDisclosure } from "../components/ui/AppDisclosure";
import { AppMenu, AppMenuItem } from "../components/ui/AppMenu";
import { AddSourcesDialog } from "./CreateSourceDialog";
import { BaselineHistory, baselineEntryLabel } from "./BaselineHistory";
import {
  latestBaselineEntries,
  sourceRevisionLabel,
  useProjectSources,
} from "./useProjectSources";
import { processingLabel, useSourceProcessing } from "./useSourceProcessing";

export type ProjectSourceRegisterProps = {
  project: string;
  sourceId?: string;
  onSelectSource: (sourceId: string) => void;
  onRun?: (run: AgentRun) => void;
};

/** Object lane only: selection belongs to ProjectHome, details to SourceContextPane. */
export function ProjectSourceRegister({
  project,
  sourceId,
  onSelectSource,
  onRun,
}: ProjectSourceRegisterProps) {
  const data = useProjectSources(project, sourceId, onRun);
  const processing = useSourceProcessing(project, data.revisionCatalog, onRun);
  const [addOpen, setAddOpen] = useState(false);
  const actionsRef = useRef<HTMLButtonElement>(null);
  const [baselineEntries, setBaselineEntries] = useState<
    DTO<"BaselineEntry">[] | null
  >(null);
  const statuses = data.sources.data ?? [];
  const baselines = data.baselines.data ?? [];
  const baseline = baselines.at(-1);
  const nextSequence =
    Math.max(0, ...baselines.map((item) => item.sequence)) + 1;
  const missing = statuses.filter((item) => !item.latest_revision_id);

  return (
    <section aria-label="项目资料">
      <ThatOpenPanelSection
        className="sources-object-lane"
        label={`${statuses.length} 份`}
        fixed
        headerActions={
          <AppMenu label="资料操作" triggerRef={actionsRef}>
            <AppMenuItem onSelect={() => setAddOpen(true)}>
              添加资料
            </AppMenuItem>
          </AppMenu>
        }
      >
        <h2 slot="header-start">资料</h2>
        {!!(statuses.length || baselines.length) && (
          <section aria-label="当前基线" className="sources-baseline-line">
            <span>
              当前基线{" "}
              <strong>{baseline ? `B${baseline.sequence}` : "尚未确认"}</strong>
            </span>
            <AppDisclosure label="基线记录与操作" className="sources-support">
              <Button
                size="sm"
                variant="ghost"
                disabled={
                  data.sources.isPending ||
                  data.sources.isError ||
                  data.baselines.isPending ||
                  data.baselines.isError ||
                  !latestBaselineEntries(statuses).length
                }
                onClick={() => {
                  data.acceptBaseline.reset();
                  setBaselineEntries(latestBaselineEntries(statuses));
                }}
              >
                确认新基线
              </Button>
              {!!baselines.length && (
                <BaselineHistory
                  baselines={baselines}
                  statuses={statuses}
                  revisions={data.revisionCatalog}
                />
              )}
            </AppDisclosure>
          </section>
        )}
        {data.sources.isPending && (
          <p role="status" className="quiet-message">
            正在读取资料…
          </p>
        )}
        {(data.sources.error || data.catalogError || data.baselines.error) && (
          <div role="alert" className="sources-error">
            {data.sources.error?.message ||
              data.catalogError?.message ||
              data.baselines.error?.message}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void data.sources.refetch();
                void data.baselines.refetch();
                void data.refetchCatalog();
              }}
            >
              重新读取
            </Button>
          </div>
        )}
        {!!statuses.length && (
          <ThatOpenDataTable
            aria-label="项目资料表"
            className="sources-register-table"
            columns={[
              { name: "资料", width: "minmax(160px, 1fr)" },
              { name: "最新", width: "90px" },
              { name: "基线", width: "90px" },
              { name: "状态", width: "minmax(160px, 1fr)" },
              { name: "操作", width: "64px" },
            ]}
            hiddenColumns={["编号"]}
            data={statuses.map((item) => ({
              id: item.source.id,
              data: {
                资料: item.source.name,
                最新: sourceRevisionLabel(
                  data.revisionCatalog,
                  item.source.id,
                  item.latest_revision_id,
                ),
                基线: sourceRevisionLabel(
                  data.revisionCatalog,
                  item.source.id,
                  item.accepted_revision_id,
                ),
                状态: item.source.id,
                编号: item.source.id,
                操作: item.source.id,
              },
            }))}
            dataTransform={{
              资料: (value, row) =>
                html`<div style="min-width: 0; overflow-wrap: anywhere;">
                  <strong>${value}</strong><br /><small
                    >${statuses.find((item) => item.source.id === row.编号)?.source.kind === "BIM" ? "IFC 模型" : "工程文档"}</small
                  >
                </div>`,
              操作: (value, row) =>
                html`<bim-button
                  label="打开"
                  aria-label=${`打开 ${row.资料}`}
                  .active=${sourceId === value}
                  aria-pressed=${String(sourceId === value)}
                  @click=${() => onSelectSource(String(value))}
                ></bim-button>`,
              状态: (value) => {
                const item = statuses.find(
                  (source) => source.source.id === value,
                )!;
                const state = item.latest_revision_id
                  ? processing.states.get(item.latest_revision_id)
                  : undefined;
                const error =
                  state?.error || state?.readError || state?.run?.error;
                const retryable =
                  !!item.latest_revision_id &&
                  state &&
                  !state.loading &&
                  !state.readError &&
                  !state.starting &&
                  (!!state.error ||
                    !state.run ||
                    ["FAILED", "CANCELLED", "EXPIRED"].includes(
                      state.run.status,
                    ));
                return html`
                  ${!item.latest_revision_id || state?.run?.status !== "COMPLETED" || error ? html`<span>${item.latest_revision_id ? processingLabel(state) : "尚未上传"}</span>` : nothing}
                  ${item.has_pending_revision || !item.accepted_revision_id ? html`<small>${item.has_pending_revision ? (item.accepted_revision_id ? "有新版本待检查 · 基线未变" : "首次版本待确认") : "尚未确认基线"}</small>` : nothing}
                  ${error ? html`<p role="alert">${error}</p>` : nothing}
                  ${state?.run && error ? html`<small>处理记录 ${state.run.id}</small>` : nothing}
                  ${state?.readError ? html`<bim-button label="重新读取处理状态" @click=${() => void processing.refetch(item.latest_revision_id!)}></bim-button>` : nothing}
                  ${retryable ? html`<bim-button label=${state.error || state.run ? "重试处理" : "开始处理"} @click=${() => processing.retry.mutate({ source: item.source.id, revision: item.latest_revision_id! })}></bim-button>` : nothing}
                `;
              },
            }}
          />
        )}

        {!data.sources.isPending &&
          !data.sources.isError &&
          !statuses.length && (
            <p className="quiet-message sources-register-empty workspace-empty">
              还没有资料。添加 IFC
              或当前服务支持的工程文档；每份资料单独保留版本与原文件。
            </p>
          )}
        {data.capabilities.error && (
          <p className="quiet-message">
            无法读取文档解析能力，目前只提供 IFC。
            <Button
              variant="ghost"
              type="button"
              onClick={() => void data.capabilities.refetch()}
            >
              重试能力检查
            </Button>
          </p>
        )}
      </ThatOpenPanelSection>
      <AddSourcesDialog
        returnFocusRef={actionsRef}
        open={addOpen}
        onOpenChange={setAddOpen}
        sources={statuses}
        supportedFormats={data.supportedFormats}
        onCreate={(input) => data.createSource.mutateAsync(input)}
        onUpload={(input) => data.upload.mutateAsync(input)}
        onUploaded={onSelectSource}
      />
      <AppDialog
        open={baselineEntries !== null}
        onOpenChange={(open) => {
          if (!open && !data.acceptBaseline.isPending) setBaselineEntries(null);
        }}
        title={`确认基线 B${nextSequence}`}
        description="请核对完整资料版本集合。确认后保存为新的不可变基线；旧基线与原文件继续保留。上传和处理均不会替您确认。"
      >
        <div className="sources-baseline-confirm">
          <ul>
            {(baselineEntries ?? []).map((entry) => {
              const state = processing.states.get(entry.revision_id);
              return (
                <li key={entry.source_id}>
                  <strong>
                    {baselineEntryLabel(entry, statuses, data.revisionCatalog)}
                  </strong>
                  <span>{processingLabel(state)}</span>
                  {(state?.error || state?.readError || state?.run?.error) && (
                    <p className="sources-error">
                      {state.error || state.readError || state.run?.error}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {!!missing.length && (
            <p className="quiet-message">
              没有版本，不纳入本次基线：
              {missing.map((item) => item.source.name).join("、")}。
            </p>
          )}
          <p className="quiet-message">
            处理中的或处理失败的版本仍会按上列集合纳入基线；基线确认不代表解析成功或可施工。
          </p>
          {baselineEntries &&
            JSON.stringify(baselineEntries) !==
              JSON.stringify(latestBaselineEntries(statuses)) && (
              <p role="status">
                资料版本已变化。本次仍确认上列版本；关闭后重新打开可选择最新集合。
              </p>
            )}
          {data.acceptBaseline.error && (
            <p role="alert" className="sources-error">
              {data.acceptBaseline.error.message}
            </p>
          )}
          <div className="dialog-actions">
            <Button
              variant="secondary"
              disabled={data.acceptBaseline.isPending}
              onClick={() => setBaselineEntries(null)}
            >
              取消
            </Button>
            <Button
              disabled={
                data.acceptBaseline.isPending || !baselineEntries?.length
              }
              onClick={() =>
                data.acceptBaseline.mutate(baselineEntries!, {
                  onSuccess: () => setBaselineEntries(null),
                })
              }
            >
              {data.acceptBaseline.isPending
                ? "正在确认…"
                : `确认 B${nextSequence}`}
            </Button>
          </div>
        </div>
      </AppDialog>
    </section>
  );
}
