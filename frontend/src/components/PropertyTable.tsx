import type { ReactNode } from "react";

export function PropertyGroup({
  title,
  children,
  className,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={["shared-property-group", className].filter(Boolean).join(" ")}
    >
      {title && <div className="property-group-heading">{title}</div>}
      {children}
    </section>
  );
}

export function PropertyTable({
  children,
  columns = 1,
  className,
}: {
  children: ReactNode;
  columns?: 1 | 2;
  className?: string;
}) {
  return (
    <dl
      className={[
        "property-table",
        columns === 2 ? "is-two-column" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </dl>
  );
}

export function PropertyRow({
  label,
  value,
  attention = false,
  mono = false,
}: {
  label: ReactNode;
  value: ReactNode;
  attention?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="property-row">
      <dt>{label}</dt>
      <dd
        className={[
          attention ? "is-attention" : "",
          mono ? "mono" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}
