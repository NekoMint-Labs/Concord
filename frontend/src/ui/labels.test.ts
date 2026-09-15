import { expect, it } from "vitest";
import openapi from "../../openapi.json";
import {
  domainLabel,
  statusLabel,
  statusTone,
  yesNo,
  type LabelSet,
} from "./labels";

/**
 * The label layer's own contract.
 *
 * What it exists to prevent is a raw machine value reaching a Chinese surface, so
 * the tests that matter are the ones that read the *API schema* and demand a label
 * for every value it can report - not a hand-copied list that goes stale the day a
 * state is added.
 */
type Schema = {
  properties: Record<string, { enum?: string[]; const?: string }>;
};
const schemas = (openapi as { components: { schemas: Record<string, Schema> } })
  .components.schemas;
/** A field states its values as an enum, or as a single `const` when it has one. */
const enumOf = (schema: string, field: string) => {
  const property = schemas[schema].properties[field];
  return (
    property.enum ?? (property.const === undefined ? [] : [property.const])
  );
};

it("labels every status value the API can report", () => {
  const values = [
    ...enumOf("AgentRun", "status"),
    ...enumOf("Capability", "status"),
    ...enumOf("Readiness", "status"),
  ];
  expect(values.length).toBeGreaterThan(0);
  for (const value of values) expect(statusLabel(value)).not.toBe(value);
});

it("labels every workflow and provenance value the API can report", () => {
  const sets: Array<[LabelSet, string, string]> = [
    ["eventKind", "ProjectEvent-Input", "kind"],
    ["category", "AgentRun", "category"],
    ["quality", "Evidence", "quality"],
    ["mode", "ActionProposal", "execution_mode"],
    ["level", "Approval", "level"],
    ["execution", "ActionExecution", "status"],
  ];
  for (const [set, schema, field] of sets) {
    const values = enumOf(schema, field);
    expect(values.length, `${schema}.${field}`).toBeGreaterThan(0);
    for (const value of values) expect(domainLabel(set, value)).not.toBe(value);
  }
});

it("labels the analysis trace the run stream actually writes", () => {
  /*
   * The durable stream is an event log rather than a product feed, so these three
   * families reach the run panel together: frame types, step names, and custom
   * event names (backend/app/application/streaming.py and its callers).
   */
  const trace = [
    "RUN_STARTED",
    "RUN_FINISHED",
    "RUN_ERROR",
    "STEP_STARTED",
    "STEP_FINISHED",
    "STATE_SNAPSHOT",
    "CUSTOM",
    "capture-and-evaluate",
    "execute-and-verify",
    "document_parse",
    "bim_import",
    "optimization",
    "vision",
    "embedding_index",
    "event-ingested",
    "analysis",
    "snapshot-captured",
    "approval-needed",
    "stale-result",
    "cancelled",
    "expired",
    "resumed",
    "action-approved",
    "action-rejected",
    "action-result",
    "capability-result",
  ];
  for (const value of trace)
    expect(domainLabel("runTrace", value)).not.toBe(value);
});

it("returns a value it does not know unchanged rather than inventing prose", () => {
  // A state the backend adds tomorrow must read as the identifier it is, not as
  // "SOMETHING NEW" guessed at by this frontend.
  expect(statusLabel("QUARANTINED")).toBe("QUARANTINED");
  expect(domainLabel("eventKind", "seismic")).toBe("seismic");
  expect(domainLabel("runTrace", "future-frame")).toBe("future-frame");
});

it("spends the exception colour only on states that are actually exceptional", () => {
  for (const value of [
    "BLOCKED",
    "STALE",
    "WAITING_APPROVAL",
    "FAILED",
    "EXPIRED",
    "unhealthy",
    "unavailable_credential",
  ])
    expect(statusTone(value), value).toBe("blocked");
  for (const value of ["READY", "COMPLETED", "enabled", "VERIFIED"])
    expect(statusTone(value), value).toBe("ready");
  for (const value of ["QUEUED", "RUNNING", "UNCHECKED", "available_disabled"])
    expect(statusTone(value), value).toBe("neutral");
});

it("states a boolean the way the property sheets read one", () => {
  expect(yesNo(true)).toBe("是");
  expect(yesNo(false)).toBe("否");
});
