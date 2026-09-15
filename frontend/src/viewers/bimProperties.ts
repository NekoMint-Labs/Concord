import { domainLabel, yesNo } from "../ui/labels";

/**
 * The element's full condition set, structured for a reader rather than for a
 * developer.
 *
 * The 全部属性 disclosure used to print `JSON.stringify(item, null, 2)`, so a
 * Windows smoke handed normal users source under a product label. This module
 * turns the open, import-defined `properties` object into label/value rows the
 * property sheet already knows how to render.
 *
 * The keys are a mix of this project's own fixture fields and whatever an
 * imported IFC file carried, and both arrive here. Only keys whose meaning is
 * certain get a Chinese label; every other key stays a technical identifier and
 * is still shown as a key/value row. Values are formatted the way the sheet
 * reads elsewhere - a list separated by 、, a boolean as 是 / 否 - and a nested
 * property set (IfcOpenShell returns `{PsetName: {name: value}}`) becomes a
 * nested heading with rows of its own rather than a stringified blob.
 *
 * No raw JSON is produced anywhere in this module, so the ordinary 全部属性
 * disclosure cannot regress to source.
 */

export interface PropertyField {
  label: string;
  value: string;
}

export interface PropertySection {
  /** A nested property set's own name; undefined for the element's top-level set. */
  title?: string;
  fields: PropertyField[];
}

/** The heading for the element's own top-level values, above the nested sets. */
export const OTHER_PROPERTIES_TITLE = "其他属性";

/**
 * Product labels for keys whose meaning is certain. A key that is not here is a
 * technical identifier and is returned unchanged: guessing a translation for an
 * unknown IFC property would mislabel real imported data.
 */
const PROPERTY_LABELS: Record<string, string> = {
  FireRating: "防火等级",
  Width: "宽度",
  Height: "高度",
  ChangeStatus: "变更状态",
  WorkPackageIds: "关联工作包",
  Easting: "东向偏移",
};

export function propertyLabel(key: string): string {
  return PROPERTY_LABELS[key] ?? key;
}

/*
 * Units are added only where this project's own fixture establishes them: the
 * demo provider measures Width / Height / Easting in metres
 * (backend/app/adapters/demo.py). FireRating already carries its own unit inside
 * the string ("120 min"), and no unit is guessed for any other key or for a value
 * an imported IFC file supplied.
 */
const METRES = new Set(["Width", "Height", "Easting"]);

function formatScalar(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return yesNo(value);
  if (typeof value === "number")
    return METRES.has(key) ? `${value} m` : String(value);
  if (Array.isArray(value))
    return value.length
      ? value.map((item) => formatScalar(key, item)).join("、")
      : "—";
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length
      ? entries
          .map(([k, v]) => `${propertyLabel(k)}：${formatScalar(k, v)}`)
          .join("、")
      : "—";
  }
  const text = String(value);
  return key === "ChangeStatus" ? domainLabel("propertyChange", text) : text;
}

/** One property value as the sheet reads it: a list, 是 / 否, or the raw scalar. */
export function formatPropertyValue(key: string, value: unknown): string {
  return formatScalar(key, value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fields(set: Record<string, unknown>): PropertyField[] {
  return Object.entries(set).map(([key, value]) => ({
    label: propertyLabel(key),
    value: formatScalar(key, value),
  }));
}

/**
 * The properties as the disclosure renders them: the element's own top-level
 * values first (the caller titles that group), then one section per nested
 * property set, titled by the set's own name.
 */
export function propertySections(properties: unknown): PropertySection[] {
  if (!isPlainObject(properties)) return [];
  const own: PropertyField[] = [];
  const nested: PropertySection[] = [];
  for (const [key, value] of Object.entries(properties)) {
    if (isPlainObject(value))
      nested.push({ title: key, fields: fields(value) });
    else
      own.push({ label: propertyLabel(key), value: formatScalar(key, value) });
  }
  return own.length ? [{ fields: own }, ...nested] : nested;
}
