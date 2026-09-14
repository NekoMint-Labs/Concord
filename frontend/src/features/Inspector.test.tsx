import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../../tests/fixtures/inspector.json";
import { api, type Workspace } from "../api/client";
import { Inspector, type InspectorView } from "./Inspector";

type Scalar = string | number | boolean | null;
const record = <T extends Scalar>(
  values: object,
  isValue: (value: unknown) => value is T,
): Record<string, T> =>
  Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, T] =>
      isValue(entry[1]),
    ),
  );
const booleanRecord = (values: object) =>
  record(values, (value): value is boolean => typeof value === "boolean");
const scalarRecord = (values: object) =>
  record(
    values,
    (value): value is Scalar =>
      value === null || ["string", "number", "boolean"].includes(typeof value),
  );
const waiting = {
  ...fixture.waiting,
  state: {
    ...fixture.waiting.state,
    work_packages: fixture.waiting.state.work_packages.map((workPackage) => ({
      ...workPackage,
      materials: booleanRecord(workPackage.materials),
      equipment: booleanRecord(workPackage.equipment),
    })),
  },
  audit: fixture.waiting.audit.map((entry) => ({
    ...entry,
    detail: scalarRecord(entry.detail),
  })),
} as Workspace;
const proposal = waiting.proposals.find(
  (item) => item.work_package_id === "WP-200",
)!;
const perform = async (operation: () => Promise<unknown>) => {
  await operation();
};
const props = {
  selected: "WP-200",
  selectedConstraint: "",
  perform,
  onClose: () => undefined,
  onView: () => undefined,
};
const action = (workspace: Workspace, view: InspectorView = "action") => (
  <Inspector {...props} workspace={workspace} view={view} />
);
const approved = { ...waiting, approvals: [fixture.approval] } as Workspace;

afterEach(() => vi.restoreAllMocks());

describe("evidence-backed action controls", () => {
  it("requires exact R4 confirmation and never offers unapproved execution", () => {
    render(action(waiting));
    expect(screen.getByText(/执行前需要批准/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "执行并重新检查" }),
    ).toBeDisabled();
    const approve = screen.getByRole("button", { name: "批准 R4" });
    expect(approve).toBeDisabled();
    fireEvent.change(screen.getByLabelText("R4 confirmation"), {
      target: { value: "approve r4" },
    });
    expect(approve).toBeDisabled();
    fireEvent.change(screen.getByLabelText("R4 confirmation"), {
      target: { value: "APPROVE R4" },
    });
    expect(approve).toBeEnabled();
  });

  it("sends strong confirmation only for the selected proposal", () => {
    const request = vi
      .spyOn(api, "approve")
      .mockResolvedValue(fixture.approval as Workspace["approvals"][number]);
    render(action(waiting));
    fireEvent.change(screen.getByLabelText("R4 confirmation"), {
      target: { value: "APPROVE R4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "批准 R4" }));
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(proposal.id, true, "APPROVE R4");
  });

  it("clears typed consent when a new proposal replaces the old one", () => {
    const { rerender } = render(action(waiting));
    fireEvent.change(screen.getByLabelText("R4 confirmation"), {
      target: { value: "APPROVE R4" },
    });
    const next = {
      ...waiting,
      proposals: waiting.proposals.map((item) => ({
        ...item,
        id: item.id + "-replacement",
      })),
    };
    rerender(action(next));
    expect(screen.getByLabelText("R4 confirmation")).toHaveValue("");
    expect(screen.getByRole("button", { name: "批准 R4" })).toBeDisabled();
  });

  it("allows execution only after approval", () => {
    const request = vi.spyOn(api, "execute").mockResolvedValue({
      run_id: proposal.run_id,
      operation_id: proposal.operation_id,
      queued: true,
    });
    render(action(approved));
    expect(screen.getByRole("button", { name: "已批准" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "执行并重新检查" }));
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(proposal.id);
  });

  it.each([
    { stale: true, busy: false },
    { stale: false, busy: true },
  ])("prevents stale or overlapping mutations: %j", ({ stale, busy }) => {
    render(
      <Inspector
        {...props}
        workspace={{ ...approved, stale }}
        view="action"
        busy={busy}
      />,
    );
    expect(screen.getByRole("button", { name: "已批准" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "执行并重新检查" }),
    ).toBeDisabled();
  });

  it("renders evidence as text rather than executing document markup", () => {
    const text = "<script>window.unsafe = true</script>";
    const workspace = structuredClone(waiting);
    workspace.analysis!.evidence.forEach((item) => {
      item.fact = text;
    });
    const { container } = render(action(workspace, "evidence"));
    expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    expect(container.querySelector("script")).toBeNull();
  });
});

it.each(["CANCELLED", "EXPIRED", "FAILED", "COMPLETED"] as const)(
  "cannot dispatch a proposal whose owning run is %s",
  (status) => {
    const owner = { ...approved.run!, status };
    render(action({ ...approved, analysis_run: owner }));
    expect(
      screen.getByRole("button", { name: "执行并重新检查" }),
    ).toBeDisabled();
  },
);

it("uses the analysis owner rather than an unrelated completed upload", () => {
  render(
    action({
      ...approved,
      analysis_run: { ...approved.run!, status: "WAITING_APPROVAL" },
      run: {
        ...approved.run!,
        id: "upload-run",
        category: "document_parse",
        status: "COMPLETED",
      },
    }),
  );
  expect(screen.getByRole("button", { name: "执行并重新检查" })).toBeEnabled();
});

it("lists only blocking constraints as blocker reasons", () => {
  const workspace = structuredClone(waiting);
  workspace.analysis!.constraints.push({
    ...workspace.analysis!.constraints[0],
    id: "informational-constraint",
    blocking: false,
    description: "Informational coordination note",
  });

  render(action(workspace, "blocker"));

  expect(
    screen.queryByText("Informational coordination note"),
  ).not.toBeInTheDocument();
});

describe("contextual detail", () => {
  it("shows only the detail the user opened", () => {
    const { rerender } = render(action(waiting, "evidence"));
    expect(screen.getByText("验收尚未通过。")).toBeVisible();
    // The inspector never restates the recommendation or the approval gate.
    expect(screen.queryByText(/执行前需要批准/)).not.toBeInTheDocument();
    expect(screen.queryByText(/完成相关负责人确认后/)).not.toBeInTheDocument();

    rerender(action(waiting, "action"));
    expect(screen.getByText(/完成相关负责人确认后/)).toBeVisible();
    expect(screen.getByText(/执行前需要批准/)).toBeVisible();
    // Nor the blocker narrative the workspace already told.
    expect(screen.queryByText("验收尚未通过。")).not.toBeInTheDocument();
  });

  it("switches between details without a work-package headline", () => {
    const onView = vi.fn();
    render(
      <Inspector
        {...props}
        workspace={waiting}
        view="blocker"
        onView={onView}
      />,
    );
    expect(
      screen.queryByRole("heading", { name: /East-wing duct installation/ }),
    ).not.toBeInTheDocument();
    screen.getByRole("button", { name: /^判断依据/ }).click();
    expect(onView).toHaveBeenCalledWith("evidence");
  });

  it("labels deterministic fixture evidence in Chinese with stable identifiers", () => {
    render(action(waiting, "evidence"));
    expect(screen.getByText("验收", { exact: true })).toBeVisible();
    expect(
      screen.getByText(
        /来源 structured-inspection · inspection\/WP-200 · r2 · L02-E/,
      ),
    ).toBeVisible();
  });
});
