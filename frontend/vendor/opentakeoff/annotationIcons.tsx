/** Concord display shim; donor tool behavior stays in AnnotationWorkbench. */
export function Icon({ name }: { name: string; size?: number }) {
  const glyphs: Record<string, string> = {
    highlighter: "▰",
    callout: "↗",
    cloud: "☁",
    select: "⌖",
    stamp: "☆",
  };
  return <span aria-hidden="true">{glyphs[name] ?? "•"}</span>;
}
