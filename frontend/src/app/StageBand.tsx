/*
 * The stage band: the header every primary surface wears.
 *
 * Project, Browse, Model, Documents and the Evidence host used to each invent their
 * own head — a dashed-leader row, a `browse-identity` block, an evidence object bar —
 * which is why the product read as several applications in one window. They now share
 * this one shape, so "what am I looking at" is answered in the same place, in the same
 * type, on every surface:
 *
 *   kind    what class of object this is (a mono caption, quietest tier)
 *   title   the object's own name (the largest text on the work plane)
 *   meta    the facts that qualify it: revision, state, counts, chips
 *   actions the verbs that act on *this* object, on the right, where a desktop tool
 *           puts them
 *
 * The band is deliberately a *paper* surface sitting on the stage plane. It is the top
 * of the document you are reading, not another instrument row.
 */
import type { ReactNode } from "react";

export function StageBand({
  kind,
  title,
  meta,
  actions,
  titleId,
  className,
}: {
  kind: string;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  titleId?: string;
  className?: string;
}) {
  return (
    <header
      className={["stage-band", className].filter(Boolean).join(" ")}
      aria-label={typeof title === "string" ? title : undefined}
    >
      <div className="stage-band-main">
        <span className="t-label stage-band-kind">{kind}</span>
        <h2 className="stage-band-title" id={titleId}>
          {title}
        </h2>
        {meta ? <div className="stage-band-meta">{meta}</div> : null}
      </div>
      {actions ? <div className="stage-band-actions">{actions}</div> : null}
    </header>
  );
}

/** A quiet fact inside a band's meta line: label, then the value that is scanned. */
export function StageFact({
  label,
  children,
  tone,
}: {
  label: string;
  children: ReactNode;
  tone?: "neutral" | "attention" | "positive";
}) {
  return (
    <span className="stage-fact" data-tone={tone ?? "neutral"}>
      <span className="t-label">{label}</span>
      <span className="stage-fact-value">{children}</span>
    </span>
  );
}
