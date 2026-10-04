import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { DTO } from "../api/client";
import { evidenceLabel } from "../app/EvidenceWorkspaceHost";
import { donorRoots } from "../../tests/donor-dom";
import { shortDate } from "../ui/labels";
import { FindingFollowUp } from "./FindingFollowUp";
import type { useEngineeringFinding } from "./useEngineeringFindings";

const timestamp = "2026-03-22T10:15:00Z";
const dependency = {
  source_id: "source-opaque",
  source_revision_id: "revision-opaque",
  capability: "clearance",
  expected_condition: "净高满足设计条件",
  target: { kind: "drawing", source_revision_id: "revision-opaque", page: 5 },
} satisfies DTO<"FindingDependency">;
const check = {
  id: "check-opaque",
  project_id: "project-opaque",
  finding_id: "finding-opaque",
  source_id: dependency.source_id,
  source_revision_id: dependency.source_revision_id,
  dependencies: [dependency],
  finding_updated_at: timestamp,
  request_id: "request-opaque",
  outcome: "STILL_OPEN",
  explanation: "净高仍低于设计要求",
  evidence_ids: ["evidence-opaque"],
  created_at: timestamp,
  completed_at: timestamp,
} satisfies DTO<"ReCheck">;
const evidence = {
  id: "evidence-opaque",
  snapshot_id: "snapshot-opaque",
  source_id: dependency.source_id,
  source_revision_id: dependency.source_revision_id,
  source_revision: "hash-opaque",
  provider: "detector",
  observed_at: timestamp,
  work_package_id: null,
  element_ids: [],
  page: null,
  location: null,
  fact: "实测净高低于设计要求",
  quality: "structured",
  viewer_target: {
    kind: "drawing",
    source_revision_id: dependency.source_revision_id,
    page: 5,
  },
} satisfies DTO<"Evidence">;
const record = {
  id: "coordination-opaque",
  project_id: check.project_id,
  finding_id: check.finding_id,
  decision: "CONFIRMED",
  actor: "工程师",
  note: "确认需要协调净高",
  recheck_id: null,
  created_at: timestamp,
} satisfies DTO<"Coordination">;
const source = {
  source: {
    id: dependency.source_id,
    project_id: check.project_id,
    name: "机电图纸",
    kind: "DRAWING",
    created_at: timestamp,
  },
  latest_revision_id: dependency.source_revision_id,
  accepted_revision_id: null,
  baseline_id: null,
  has_pending_revision: true,
} satisfies DTO<"ProjectSourceStatus">;

afterEach(cleanup);

it("uses object-first receipts and keeps exact enums, IDs and timestamps in native details", async () => {
  // Only the read surface is exercised here; hook persistence/fencing has its own suite.
  const session = {
    finding: {
      data: {
        id: check.finding_id,
        project_id: check.project_id,
        title: "净高协调",
        state: "CONFIRMED",
        updated_at: timestamp,
      },
    },
    rechecks: { data: [check] },
    runs: [
      {
        data: {
          id: check.id,
          status: "COMPLETED",
          created_at: timestamp,
          updated_at: timestamp,
        },
      },
    ],
    evidence: [{ data: evidence }],
    coordination: { data: [record] },
    busy: false,
    error: "来自其他人工判断的错误",
    requestRechecks: vi.fn(),
  } as unknown as ReturnType<typeof useEngineeringFinding>;
  const onEvidence = vi.fn();
  render(
    <FindingFollowUp
      session={session}
      sources={[source]}
      onEvidence={onEvidence}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "协调 / 复核" }));
  const dialog = screen.getByRole("dialog", { name: "协调 / ReCheck" });
  const row = within(dialog)
    .getByRole("list", { name: "ReCheck 历史" })
    .querySelector("li")!;
  expect(row.querySelector(".workspace-row-top")).toHaveTextContent(
    `问题仍存在${shortDate(timestamp)}`,
  );
  expect(row).toHaveTextContent("机电图纸 · 净高满足设计条件");
  expect(row.querySelector(".workspace-row-bottom")).toHaveTextContent(
    "执行：已完成",
  );
  const details = row.querySelector("details")!;
  expect(details).not.toHaveAttribute("open");
  expect(details).toHaveTextContent("STILL_OPEN · 问题仍存在");
  expect(details).toHaveTextContent("执行：COMPLETED");
  expect(details).toHaveTextContent(check.request_id);
  expect(details).toHaveTextContent(timestamp);
  expect(
    JSON.parse(
      within(details).getByLabelText("Exact ReCheck record").textContent!,
    ),
  ).toEqual(check);
  const link = within(row).getByRole("button", {
    name: `查看复核 Evidence · ${evidence.id}`,
  });
  const content = () =>
    [link, ...donorRoots(link)].map((root) => root.textContent).join("");
  await waitFor(() => expect(content()).toContain(evidence.fact));
  expect(content()).toContain(evidenceLabel(evidence));
  expect(content()).not.toContain(evidence.id);
  const history = within(dialog).getByRole("list", {
    name: "Coordination 历史",
  });
  expect(history.querySelector(".workspace-row-top")).toHaveTextContent(
    `已确认${shortDate(timestamp)}`,
  );
  expect(history).toHaveTextContent(record.actor);
  expect(history).toHaveTextContent(record.note);
  expect(history.querySelector("details")).toHaveTextContent("CONFIRMED");
  expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  fireEvent.click(link);
  expect(onEvidence).toHaveBeenCalledWith(evidence.id);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
