import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { DTO } from "../api/client";
import { InvestigationInspector } from "./InvestigationInspector";

it("presents a durable investigation as context, trace, and evidence", () => {
  const onClose = vi.fn();
  render(
    <InvestigationInspector
      context={{
        projectName: "Campus Lab",
        sourceId: "source-1",
        sourceName: "MEP Model",
        fromRevisionId: "r1",
        fromRevisionLabel: "R1",
        revisionId: "r2",
        revisionLabel: "R2",
        workPackageId: "WP-27",
        elementIds: ["gid-1"],
      }}
      run={null}
      report={
        {
          run_id: "run-123456789",
          analysis_id: "analysis-123456789",
          generation: 2,
          persisted: true,
          answer: {
            summary: "R2 changes the MEP routing in WP-27.",
            evidence_ids: ["ev-1"],
            limitations: ["No approved drawing was attached."],
          },
          scope: {
            source_id: "source-1",
            from_revision_id: "r1",
            to_revision_id: "r2",
            work_package_ids: ["WP-27"],
            area_ids: [],
            element_ids: ["gid-1"],
          },
          tools: [
            { tool: "compare_bim", available: true, evidence_ids: ["ev-1"] },
          ],
          evidence: [
            {
              id: "ev-1",
              snapshot_id: "snapshot-1",
              provider: "bim",
              source_id: "MEP Model",
              source_revision: "R2",
              observed_at: "2026-01-01T00:00:00Z",
              work_package_id: "WP-27",
              element_ids: ["gid-1"],
              page: null,
              location: "Level 2",
              fact: "The riser moved 450 mm east.",
              quality: "structured",
            },
          ],
        } satisfies DTO<"InvestigationReport">
      }
      onClose={onClose}
    />,
  );

  expect(screen.getByText("工程调查")).toBeVisible();
  expect(screen.queryByText("CONCORD · AI")).not.toBeInTheDocument();
  expect(
    screen.getByText("R2 changes the MEP routing in WP-27."),
  ).toBeVisible();
  expect(screen.getByText("R1 → R2")).toBeVisible();
  expect(screen.queryByText("compare_bim")).not.toBeVisible();
  fireEvent.click(screen.getByText(/技术详情 · 1 步/));
  expect(screen.getByText("compare_bim")).toBeVisible();
  expect(screen.getByText("The riser moved 450 mm east.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "关闭详情" }));
  expect(onClose).toHaveBeenCalledOnce();
});
