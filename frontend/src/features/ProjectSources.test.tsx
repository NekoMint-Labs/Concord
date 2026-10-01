import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api, type DTO } from "../api/client";
import { BaselineHistory, baselineEntryLabel } from "./BaselineHistory";
import {
  ProjectSources,
  freshCheckAfterImport,
  revisionState,
} from "./ProjectSources";

afterEach(() => vi.restoreAllMocks());

const source = {
  source: {
    id: "source",
    project_id: "project",
    name: "MEP model",
    kind: "BIM",
    created_at: "2026-01-01T00:00:00Z",
  },
  latest_revision_id: "r2",
  accepted_revision_id: "r1",
  baseline_id: "b1",
  has_pending_revision: true,
} satisfies DTO<"ProjectSourceStatus">;

it("keeps latest, accepted, and pending source revision meanings distinct", () => {
  expect(revisionState(source, "r2")).toBe("latest");
  expect(revisionState(source, "r1")).toBe("accepted");
  expect(revisionState(source, "older")).toBe("historical");
  expect(
    revisionState(
      {
        ...source,
        accepted_revision_id: "r2",
        has_pending_revision: false,
      },
      "r2",
    ),
  ).toBe("latest-accepted");
});

it("preserves the legacy freshness helper without imposing a baseline gate", () => {
  expect(
    freshCheckAfterImport(true, "2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z"),
  ).toBe(true);
  expect(
    freshCheckAfterImport(true, "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"),
  ).toBe(false);
  expect(
    freshCheckAfterImport(
      false,
      "2026-01-02T00:00:00Z",
      "2026-01-01T00:00:00Z",
    ),
  ).toBe(false);
});

it("resolves baseline entries against their own source revision catalog", () => {
  expect(
    baselineEntryLabel(
      { source_id: "source-2", revision_id: "r2" },
      [
        source,
        {
          ...source,
          source: { ...source.source, id: "source-2", name: "Structure" },
          latest_revision_id: "r2",
          accepted_revision_id: "r2",
          has_pending_revision: false,
        },
      ],
      [
        {
          id: "r2",
          project_id: "project",
          source_id: "source-2",
          sequence: 2,
          external_label: null,
          original_filename: "structure.ifc",
          sha256: "hash".padEnd(64, "0"),
          media_type: "application/x-step",
          size_bytes: 1,
          storage_key: "key",
          import_status: "STORED",
          imported_at: "2026-01-01T00:00:00Z",
        },
      ],
    ),
  ).toBe("Structure：R2");
});

const baseline: DTO<"Baseline"> = {
  id: "b1",
  project_id: "project",
  sequence: 1,
  name: "协调确认",
  created_at: "2026-01-01T00:00:00Z",
  accepted_by: "reviewer",
  entries: [{ source_id: "source", revision_id: "r1" }],
};

it("keeps baseline identity and provenance visible with only the exact focused disclosure expanded", () => {
  const view = render(
    <BaselineHistory
      baselines={[baseline, { ...baseline, id: "b2", sequence: 2 }]}
      statuses={[source]}
      revisions={[]}
      focusBaselineId="b1"
    />,
  );
  const [older, current] = screen.getAllByRole("article");
  expect(within(older).getByText("确认人 reviewer")).toBeVisible();
  expect(within(older).getByText("协调确认")).toBeVisible();
  expect(within(older).getByText("保留的历史基线")).toBeVisible();
  expect(within(current).getByText("当前基线")).toBeVisible();
  expect(older).toHaveClass("is-focused");
  expect(current).not.toHaveClass("is-focused");
  expect(within(older).getByRole("button")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(within(current).getByRole("button")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(within(older).getByText("MEP model：Rr1")).toBeVisible();
  fireEvent.click(within(older).getByRole("button"));
  expect(within(older).getByRole("button")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  view.rerender(
    <BaselineHistory
      baselines={[baseline, { ...baseline, id: "b2", sequence: 2 }]}
      statuses={[source]}
      revisions={[]}
      focusBaselineId="b2"
    />,
  );
  expect(within(current).getByRole("button")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
});

it("groups the empty baseline explanation with one existing Open Project action", () => {
  const onProject = vi.fn();
  render(
    <BaselineHistory
      baselines={[]}
      statuses={[]}
      revisions={[]}
      onProject={onProject}
    />,
  );
  expect(
    screen.getByRole("heading", { name: "尚未确认项目基线" }),
  ).toBeVisible();
  expect(
    screen.getByText("在项目核对资料版本后，人工确认基线。"),
  ).toBeVisible();
  expect(screen.getAllByRole("button")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "打开项目 →" }));
  expect(onProject).toHaveBeenCalledOnce();
});

it("keeps history loading, error/retry, and successful empty states distinct", async () => {
  let rejectHistory!: (reason: Error) => void;
  vi.spyOn(api, "capabilities").mockResolvedValue({ capabilities: [] });
  vi.spyOn(api, "sourceStatuses").mockResolvedValue([]);
  const history = vi
    .spyOn(api, "baselines")
    .mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectHistory = reject;
        }),
    )
    .mockResolvedValueOnce([]);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const onProject = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ProjectSources project="project" historyOnly onProject={onProject} />
    </QueryClientProvider>,
  );
  expect(screen.getByRole("status")).toHaveTextContent("正在读取基线历史…");
  expect(screen.queryByText("尚未确认项目基线")).not.toBeInTheDocument();
  rejectHistory(new Error("历史暂时无法读取"));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "历史暂时无法读取",
  );
  expect(screen.queryByText("尚未确认项目基线")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重试读取历史" }));
  expect(
    await screen.findByRole("heading", { name: "尚未确认项目基线" }),
  ).toBeVisible();
  expect(history).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "打开项目 →" })).toHaveLength(1);
});
