const labels: Record<string, string> = {
  READY: "就绪",
  BLOCKED: "已阻塞",
  UNCHECKED: "未检查",
  STALE: "需要重新检查",
  QUEUED: "等待分析",
  RUNNING: "分析中",
  WAITING_APPROVAL: "等待批准",
  COMPLETED: "已完成",
  "NO RUN": "无分析",
};

/** Blocking and approval states carry the one exception colour; everything else is neutral. */
const warn = new Set([
  "BLOCKED",
  "WAITING_APPROVAL",
  "STALE",
  "FAILED",
  "unhealthy",
]);
const positive = new Set(["READY", "COMPLETED", "enabled"]);

export function statusLabel(value: string) {
  return labels[value] ?? value.replaceAll("_", " ");
}

export function Status({ value }: { value: string }) {
  const kind = warn.has(value)
    ? "blocked"
    : positive.has(value)
      ? "ready"
      : "neutral";
  return (
    <span className={`status status-${kind}`} aria-label={value}>
      {statusLabel(value)}
    </span>
  );
}
