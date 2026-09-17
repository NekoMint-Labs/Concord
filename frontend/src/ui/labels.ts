/**
 * The one place domain enum values become product words.
 *
 * The backend speaks in stable machine values (`WAITING_APPROVAL`, `workforce`,
 * `unavailable_credential`), and those values are the API contract. They are not
 * product copy, and the defect this module fixes is what happens when they reach
 * the surface unlabelled: a state falls through as English (`WAITING APPROVAL`)
 * in a Chinese product, or a chip's tone is decided by a hand-written list in each
 * view and the same state is amber in one place and grey in another.
 *
 * So the maps are namespaced by the domain that owns the value, and only the
 * status family - whose values are disjoint across the three domains that carry
 * a chip - has a flat default (`statusLabel`).
 *
 * Rules this layer keeps:
 *
 * - Only values that actually exist in `frontend/openapi.json` (plus the three
 *   UI-derived states `UNCHECKED`, `STALE`, and `NO RUN`) appear here. Nothing is
 *   invented, and a value the API adds tomorrow fails the coverage test in
 *   `labels.test.ts` rather than reaching a user in English.
 * - An unknown value is returned unchanged. Unknown identifiers are shown as
 *   identifiers, never guessed at, and never machine-uppercased into prose.
 * - User data never routes through this module: imported document titles, names
 *   carried by an imported IFC file, project names, and free-text event titles are
 *   evidence, not UI language. The deterministic *fixture's* own English is
 *   localized one layer down, keyed by stable fixture identifiers
 *   (frontend/src/ui/demo/demoPresentation.ts).
 *
 * One family is deliberately absent: constraint and effect kinds. Those values
 * describe the deterministic fixture's own English sentences, so their words are
 * owned by the demo presentation boundary that rewrites those sentences
 * (frontend/src/ui/demo/demoPresentation.ts). Copying them here would create a
 * second answer to the same question.
 *
 * Language switching is deliberately not solved here: this pass establishes
 * complete Chinese product copy, not a locale runtime (that belongs to the
 * Settings foundation, where an `en` map would sit beside these).
 */

/** Readiness never transitions through a run; it is the work package's own state. */
const READINESS: Record<string, string> = {
  READY: "就绪",
  BLOCKED: "已阻塞",
  /* UI-derived: no analysis has judged this work package yet. */
  UNCHECKED: "未检查",
  /* UI-derived: authoritative facts changed after the recorded judgement. */
  STALE: "需要重新检查",
};

/** The analysis workflow. Distinct from readiness: a run's state is not the package's. */
const RUN: Record<string, string> = {
  QUEUED: "等待分析",
  RUNNING: "分析中",
  WAITING_APPROVAL: "等待批准",
  COMPLETED: "已完成",
  FAILED: "失败",
  CANCELLED: "已取消",
  EXPIRED: "已过期",
  /* UI-derived: the timeline's own position when no run exists at all. It reads
     as a position in the workflow rather than as an absence of one. */
  "NO RUN": "未开始",
};

/** Capability health, as reported by `/api/capabilities`. */
const CAPABILITY: Record<string, string> = {
  enabled: "已启用",
  available_disabled: "已具备，未启用",
  unavailable_dependency: "缺少依赖",
  unavailable_credential: "缺少凭据",
  unhealthy: "异常",
};

/** Run categories. A technical word is kept inside the label where it is the object. */
const CATEGORY: Record<string, string> = {
  coordination: "协调分析",
  investigation: "范围调查",
  document_parse: "文档解析",
  bim_import: "BIM 导入",
  optimization: "排程优化",
  vision: "图像识别",
  embedding_index: "向量索引",
};

/** The change kinds a user can record. The submitted enum value is never translated. */
const EVENT_KIND: Record<string, string> = {
  design_revision: "设计修订",
  workforce: "班组人员不足",
  predecessor: "前置工作未完成",
  material: "材料不可用",
  equipment: "设备不可用",
  inspection: "验收未通过",
  external: "外部观察",
};

/** How a judgement was reached. Provenance, so it stays quiet but readable. */
const QUALITY: Record<string, string> = {
  structured: "结构化",
  extracted: "抽取",
  inferred: "推断",
};

/** Whether an executed action ran against the simulation or an external system. */
const MODE: Record<string, string> = {
  simulated: "模拟",
  external: "外部",
};

/** How strongly an approval had to be confirmed. */
const LEVEL: Record<string, string> = {
  standard: "标准",
  strong: "强确认",
};

/** Whether an action was verified after execution. */
const EXECUTION: Record<string, string> = {
  VERIFIED: "已核验",
};

/** Values carried inside BIM element properties, where the domain is certain. */
const PROPERTY_CHANGE: Record<string, string> = {
  baseline: "基线",
  unchanged: "未变更",
  changed: "已变更",
  affected: "受影响",
};

/**
 * The analysis trace: what the run band's process list says, row by row.
 *
 * Three vocabularies reach that one list, because the durable run stream is an
 * event log rather than a product feed: the frame *types* (`STEP_STARTED`), the
 * step *names* (`capture-and-evaluate`), and the custom event *names*
 * (`approval-needed`). They are merged here only because they share one reader
 * and never share a value - a capability step name is the run category the rest
 * of the product already labels 文档解析 / 排程优化, so that set is spread in
 * rather than copied, and a value this map does not know is returned as the
 * identifier it is instead of being split into pretend prose.
 */
const RUN_TRACE: Record<string, string> = {
  ...CATEGORY,
  RUN_STARTED: "分析开始",
  RUN_FINISHED: "分析完成",
  RUN_ERROR: "分析出错",
  STEP_STARTED: "步骤开始",
  STEP_FINISHED: "步骤完成",
  STATE_SNAPSHOT: "状态快照",
  CUSTOM: "事件",
  "capture-and-evaluate": "采集并判定",
  "execute-and-verify": "执行并核验",
  "event-ingested": "已接收变更",
  analysis: "分析",
  "snapshot-captured": "已记录快照",
  "approval-needed": "需要批准",
  "stale-result": "结果已过期",
  cancelled: "已取消",
  expired: "已过期",
  resumed: "已恢复",
  "action-approved": "已批准",
  "action-rejected": "已拒绝",
  "action-result": "执行结果",
  "capability-result": "能力结果",
  "investigation-result": "调查结果",
};

const SETS = {
  run: RUN,
  readiness: READINESS,
  capability: CAPABILITY,
  category: CATEGORY,
  eventKind: EVENT_KIND,
  quality: QUALITY,
  mode: MODE,
  level: LEVEL,
  execution: EXECUTION,
  propertyChange: PROPERTY_CHANGE,
  runTrace: RUN_TRACE,
} as const;

export type LabelSet = keyof typeof SETS;

/**
 * The status family, flattened. `Status` renders a chip from three different
 * domains and the three value sets are disjoint, so one lookup is unambiguous
 * and the component does not have to be told which domain it is rendering.
 */
const STATUS: Record<string, string> = {
  ...READINESS,
  ...RUN,
  ...CAPABILITY,
};

/** The one exception colour. Anything not listed here is neutral. */
const ATTENTION = new Set([
  "BLOCKED",
  "STALE",
  "WAITING_APPROVAL",
  "FAILED",
  "EXPIRED",
  "unavailable_dependency",
  "unavailable_credential",
  "unhealthy",
]);
const POSITIVE = new Set(["READY", "COMPLETED", "enabled", "VERIFIED"]);

export function statusLabel(value: string): string {
  return STATUS[value] ?? value;
}

/**
 * Which of the three chip treatments a status value earns. Kept beside the
 * labels because they are the same judgement about the same value, and splitting
 * them is how a state ends up red in one view and grey in another.
 */
export function statusTone(value: string): "ready" | "blocked" | "neutral" {
  if (ATTENTION.has(value)) return "blocked";
  if (POSITIVE.has(value)) return "ready";
  return "neutral";
}

/** A domain value in its product words. Unknown values are returned unchanged. */
export function domainLabel(set: LabelSet, value: string): string {
  return SETS[set][value] ?? value;
}

/** Booleans as words, for the places a value reads as `是 / 否`. */
export function yesNo(value: boolean): string {
  return value ? "是" : "否";
}
