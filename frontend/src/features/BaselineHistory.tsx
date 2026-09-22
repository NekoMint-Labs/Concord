import type {
  Baseline,
  ProjectSourceRevision,
  ProjectSourceStatus,
} from "../api/client";
import { AppDisclosure } from "../components/ui/AppDisclosure";

export function baselineEntryLabel(
  entry: Baseline["entries"][number],
  statuses: readonly ProjectSourceStatus[],
  revisions: readonly ProjectSourceRevision[],
): string {
  const source = statuses.find((item) => item.source.id === entry.source_id);
  const revision = revisions.find(
    (item) =>
      item.source_id === entry.source_id && item.id === entry.revision_id,
  );
  return `${source?.source.name ?? entry.source_id}：R${revision?.sequence ?? entry.revision_id.slice(0, 8)}`;
}

export function BaselineHistory({
  baselines,
  statuses,
  revisions,
}: {
  baselines: readonly Baseline[];
  statuses: readonly ProjectSourceStatus[];
  revisions: readonly ProjectSourceRevision[];
}) {
  return (
    <section className="baseline-register">
      <header>
        <h3>基线历史</h3>
        <span className="count">{baselines.length}</span>
      </header>
      <div className="baseline-list">
        {baselines.map((baseline) => (
          <AppDisclosure
            key={baseline.id}
            className="baseline-entry"
            label={`B${baseline.sequence} · ${baseline.name} · ${baseline.entries.length} 个来源版本 · ${new Date(baseline.created_at).toLocaleString("zh-CN")}`}
          >
            <div className="baseline-entries">
              {baseline.entries.map((entry) => (
                <code key={`${entry.source_id}:${entry.revision_id}`}>
                  {baselineEntryLabel(entry, statuses, revisions)}
                </code>
              ))}
            </div>
          </AppDisclosure>
        ))}
        {!baselines.length && (
          <p className="quiet-message">尚未接受工程基线。</p>
        )}
      </div>
    </section>
  );
}
