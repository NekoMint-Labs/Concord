/**
 * Demo-only presentation boundary for the deterministic Harbor East fixture.
 *
 * The backend owns authoritative fixture facts and emits them in English.
 * This module localizes ONLY the known deterministic fixture content, keyed by
 * stable fixture identifiers (work-package/area IDs), semantic type
 * (constraint/effect kind), or an exact field-context match.
 *
 * Anything unrecognized — including runtime and user-authored text such as
 * event titles, document names, audit actors, and free-text notes — passes
 * through unchanged. Do not route runtime content through these helpers.
 *
 * English locale renders the original backend copy unchanged.
 */

export type DemoLocale = "zh" | "en";

function initialLocale(): DemoLocale {
  if (typeof location === "undefined") return "zh";
  return new URLSearchParams(location.search).get("lang") === "en"
    ? "en"
    : "zh";
}

let locale: DemoLocale = initialLocale();

export function demoLocale(): DemoLocale {
  return locale;
}

/** Tests and the demo harness set the locale before rendering. */
export function setDemoLocale(next: DemoLocale): void {
  locale = next;
}

const PROJECT_NAMES: Record<string, string> = {
  "harbor-east": "A 栋项目",
};

const PROJECT_DESCRIPTIONS: Record<string, string> = {
  "harbor-east": "合成施工协调参考项目",
};

const WORK_PACKAGE_NAMES: Record<string, string> = {
  "WP-100": "结构交接",
  "WP-200": "东翼风管安装",
  "WP-300": "03 层电气粗装",
};

const AREA_NAMES: Record<string, string> = {
  "L02-E": "L02 东翼",
  "L03-E": "L03 东翼",
};

const DISCIPLINES: Record<string, string> = {
  Structure: "结构",
  Mechanical: "机电",
  Electrical: "电气",
};

const OWNERS: Record<string, string> = {
  "WP-100": "结构 / 林",
  "WP-200": "机电 / 陈",
  "WP-300": "电气 / 王",
};

const SOURCE_LABELS: Record<string, string> = {
  drawing: "图纸",
  bim: "BIM",
  schedule: "进度",
  workforce: "人员",
  material: "材料",
  equipment: "设备",
  inspection: "验收",
  project_state: "项目状态",
  "harbor-east": "A 栋项目",
};

const CONSTRAINT_KINDS: Record<string, string> = {
  design: "设计变更",
  predecessor: "前置工作",
  workforce: "人员",
  qualification: "资质",
  material: "材料",
  equipment: "设备",
  inspection: "验收",
};

const EFFECT_KINDS: Record<string, string> = {
  acknowledge_design: "确认新版设计",
  assign_crew: "补齐班组",
  confirm_qualification: "确认资质",
  confirm_predecessor: "确认前置工作包",
  confirm_material: "确认材料",
  confirm_equipment: "确认设备",
  record_inspection: "记录验收",
};

/** Deterministic rule sentences, guarded by the constraint kind that produced them. */
const FACTS: Record<
  string,
  { pattern: RegExp; zh: (...groups: string[]) => string }
> = {
  design: {
    pattern: /^Drawing (\S+) is current; workface acknowledged (\S+)\.$/,
    zh: (current, acknowledged) =>
      `图纸已更新至 ${current}，但当前施工面仍基于 ${acknowledged}。`,
  },
  predecessor: {
    pattern: /^Predecessor (\S+) is incomplete\.$/,
    zh: (id) => `前置工作包 ${id} 尚未完成。`,
  },
  workforce: {
    pattern: /^Crew available (\d+); required (\d+)\.$/,
    zh: (available, required) =>
      `可用班组 ${available} 人，需要 ${required} 人。`,
  },
  qualification: {
    pattern: /^Missing qualifications: (.+)\.$/,
    zh: (missing) => `缺少资质：${missing}。`,
  },
  material: {
    pattern: /^Material (.+) is unavailable\.$/,
    zh: (name) => `材料 ${name} 不可用。`,
  },
  equipment: {
    pattern: /^Equipment (.+) is unavailable\.$/,
    zh: (name) => `设备 ${name} 不可用。`,
  },
  inspection: {
    pattern: /^Inspection acceptance has not passed\.$/,
    zh: () => "验收尚未通过。",
  },
};

const PROPOSAL_EXPLANATION =
  "Obtain the listed confirmations from responsible owners, then refresh and re-check. " +
  "Demo execution simulates confirmations; it does not perform site work or certify safety.";
const PROPOSAL_EXPLANATION_ZH = "完成相关负责人确认后，重新检查当前施工条件。";

/**
 * Evidence rows carry no constraint kind, so their deterministic source prefix
 * supplies the candidate kinds that source is allowed to have produced.
 */
const SOURCE_KINDS: Record<string, string[]> = {
  drawing: ["design"],
  bim: ["design"],
  schedule: ["predecessor"],
  workforce: ["workforce", "qualification"],
  material: ["material"],
  equipment: ["equipment"],
  inspection: ["inspection"],
};

export function demoProjectName(id: string, fallback: string): string {
  return locale === "zh" ? (PROJECT_NAMES[id] ?? fallback) : fallback;
}

export function demoProjectDescription(id: string, fallback: string): string {
  return locale === "zh" ? (PROJECT_DESCRIPTIONS[id] ?? fallback) : fallback;
}

export function demoWorkPackageName(id: string, fallback: string): string {
  return locale === "zh" ? (WORK_PACKAGE_NAMES[id] ?? fallback) : fallback;
}

export function demoAreaName(id: string, fallback: string): string {
  return locale === "zh" ? (AREA_NAMES[id] ?? fallback) : fallback;
}

export function demoDiscipline(value: string): string {
  return locale === "zh" ? (DISCIPLINES[value] ?? value) : value;
}

export function demoOwner(id: string, fallback: string): string {
  return locale === "zh" ? (OWNERS[id] ?? fallback) : fallback;
}

/**
 * Structured-BIM element names.
 *
 * A fixture element's GlobalId is its stable identity
 * (backend/app/adapters/demo_ids.py), so the three deterministic elements can be
 * named here the way the fixture's work packages, areas, owners and constraint
 * sentences already are. Any other id is an imported file's own element: that name
 * is the file's data and passes through unchanged, exactly as an imported
 * document's title does. The GlobalId stays visible as the element's identifier
 * wherever it is shown, so nothing is hidden by the label.
 */
const ELEMENT_NAMES: Record<string, string> = {
  "2EG_GvBOnHSANjPr7CHowU": "东侧核心筒墙",
  "2CU_Px_b9MJe1kH$vDvU8G": "送风管 E-01",
  "1xhjFnj$HKePcWkxtV734X": "电缆桥架 E-01",
};

export function demoElementName(id: string, fallback: string): string {
  return locale === "zh" ? (ELEMENT_NAMES[id] ?? fallback) : fallback;
}

export function demoConstraintKind(kind: string): string {
  return locale === "zh" ? (CONSTRAINT_KINDS[kind] ?? kind) : kind;
}

export function demoEffectKind(kind: string): string {
  return locale === "zh"
    ? (EFFECT_KINDS[kind] ?? kind.replaceAll("_", " "))
    : kind.replaceAll("_", " ");
}

export function demoConstraintText(
  kind: string | undefined,
  text: string,
): string {
  const rule = kind ? FACTS[kind] : undefined;
  const match = locale === "zh" ? rule?.pattern.exec(text) : null;
  return match ? rule!.zh(...match.slice(1)) : text;
}

const INVESTIGATION_LIMITATIONS: Record<string, string> = {
  "File metadata does not establish BIM changes or engineering readiness.":
    "文件元数据不足以判断 BIM 变更或工程就绪状态。",
  "Persisted BIM comparison provider is not connected.":
    "尚未接入 BIM 版本对比服务。",
  "Persisted source-level BIM binding provider is not connected.":
    "尚未接入工程来源与构件关联服务。",
  "Historical evidence retains its original snapshot and source revision.":
    "历史依据保留原始快照与工程来源版本。",
  "Source catalog truncated to 50; select a source for further work.":
    "工程来源仅显示前 50 项；请选择来源继续调查。",
  "Work-package catalog truncated to 50; narrow the scope for more.":
    "工作包仅显示前 50 项；请缩小调查范围。",
  "Overview evidence truncated to 30; narrow the scope for details.":
    "概览依据仅显示前 30 条；请缩小调查范围。",
  "Work-package metadata and scoped blocker counts do not establish readiness.":
    "工作包元数据与阻塞项数量不足以判断施工条件是否就绪。",
  "Documents lack scoped WP/element associations.":
    "文档尚无与当前工作包或构件的范围关联。",
};

export function demoInvestigationText(text: string): string {
  if (locale !== "zh") return text;
  if (INVESTIGATION_LIMITATIONS[text]) return INVESTIGATION_LIMITATIONS[text];
  const projectState =
    /^Recorded project version (\d+); showing (\d+) scoped work packages; (\d+) returned sources differ from baseline\.$/.exec(
      text,
    );
  if (projectState)
    return `已记录项目版本 ${projectState[1]}；当前范围包含 ${projectState[2]} 个工作包；${projectState[3]} 个工程来源与基准不同。`;
  const comparison =
    /^Compared IFC revisions: (\d+) added, (\d+) deleted, (\d+) changed; GlobalId continuity ([\d.]+%)\.$/.exec(
      text,
    );
  return comparison
    ? `IFC 版本对比：新增 ${comparison[1]}、删除 ${comparison[2]}、修改 ${comparison[3]}；构件标识连续率 ${comparison[4]}。`
    : text;
}

/**
 * Evidence carries no kind, so only the kinds its deterministic source prefix
 * can produce are considered. An unrecognized source passes through unchanged.
 */
export function demoEvidenceFact(sourceId: string, fact: string): string {
  const kinds = SOURCE_KINDS[sourceId.split("/")[0]] ?? [];
  for (const kind of kinds) {
    const translated = demoConstraintText(kind, fact);
    if (translated !== fact) return translated;
  }
  return demoInvestigationText(fact);
}

/** Human label for the source an evidence row came from. */
export function demoSourceLabel(sourceId: string): string {
  const source = sourceId.split("/")[0];
  return locale === "zh" ? (SOURCE_LABELS[source] ?? source) : source;
}

export function demoProposalTitle(
  workPackageId: string,
  fallback: string,
): string {
  const name = WORK_PACKAGE_NAMES[workPackageId];
  const match =
    locale === "zh" && name ? /^Coordinate (.+)$/.exec(fallback) : null;
  return match ? `协调${name}` : fallback;
}

export function demoProposalExplanation(fallback: string): string {
  return locale === "zh" && fallback.startsWith(PROPOSAL_EXPLANATION)
    ? PROPOSAL_EXPLANATION_ZH
    : fallback;
}
