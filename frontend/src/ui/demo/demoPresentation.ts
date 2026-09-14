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
  return fact;
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
