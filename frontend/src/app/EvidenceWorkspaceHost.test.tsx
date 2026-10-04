import { render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { DTO } from "../api/client";
import { EvidenceWorkspaceHost, targetSurface } from "./EvidenceWorkspaceHost";

type Evidence = DTO<"Evidence">;

function evidenceWith(target: Evidence["viewer_target"]): Evidence {
  return {
    id: "evidence-16",
    snapshot_id: "snapshot-16",
    provider: "engineering-provider",
    source_id: "source-16",
    source_revision_id: "revision-16",
    source_revision: "sha256-original-bytes",
    observed_at: "2026-03-22T10:15:00Z",
    work_package_id: "work-package-16",
    element_ids: ["element-16", "element-17"],
    page: 9,
    location: "Legacy location, not a viewer target",
    fact: "The original evidence remains selected.",
    quality: "structured",
    viewer_target: target,
  };
}

const targets = [
  {
    target: {
      kind: "drawing",
      source_revision_id: "target-drawing-r1",
      page: 5,
      normalized_bbox: [0.32, 0.28, 0.62, 0.52],
    },
    surface: "drawing",
    host: "Drawing · 图纸",
    knownLocation: "0.32 · 0.28 · 0.62 · 0.52",
  },
  {
    target: {
      kind: "cad",
      source_revision_id: "target-cad-r1",
      entity_id: "A17",
      layer: "MEP-original-layer",
      view_bounds: [10, 20, 40, 60],
    },
    surface: "drawing",
    host: "Drawing · 图纸",
    knownLocation: "MEP-original-layer",
  },
  {
    target: {
      kind: "bim",
      source_revision_id: "target-bim-r1",
      global_ids: ["GlobalId-A", "GlobalId-B"],
      viewpoint: [1, 2, 3, 4, 5, 6],
    },
    surface: "model",
    host: "Model · 模型",
    knownLocation: "GlobalId-A · GlobalId-B",
  },
  {
    target: {
      kind: "document",
      source_revision_id: "target-document-r1",
      page: 2,
      structural_path: ["Sheet1", "row:4", "cell:C4"],
      location: "Original document location",
    },
    surface: "document",
    host: "Document · 文档",
    knownLocation: "Sheet1 / row:4 / cell:C4",
  },
] satisfies {
  target: NonNullable<Evidence["viewer_target"]>;
  surface: ReturnType<typeof targetSurface>;
  host: string;
  knownLocation: string;
}[];

afterEach(() => vi.restoreAllMocks());

it.each(targets)(
  "routes $target.kind to $surface without claiming viewer navigation or changing the target",
  ({ target, surface, host, knownLocation }) => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const evidence = evidenceWith(target);
    const original = JSON.stringify(evidence);
    expect(targetSurface(evidence.viewer_target)).toBe(surface);
    render(<EvidenceWorkspaceHost evidence={evidence} />);
    const region = screen.getByRole("region", {
      name: `${host} workspace host`,
    });
    expect(region).toHaveAttribute("data-target-surface", surface);
    expect(region).toHaveAttribute("data-viewer-target-kind", target.kind);
    expect(region).toHaveAttribute(
      "data-source-revision-id",
      target.source_revision_id,
    );
    expect(region).toHaveAttribute(
      "data-navigation-state",
      "viewer_unavailable",
    );
    expect(region).toHaveTextContent(knownLocation);
    expect(screen.getByRole("status")).toHaveTextContent("查看器暂不可用");
    expect(
      screen.getByRole("button", { name: "查看原始工程目标" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("status")).toHaveTextContent("尚未执行定位");
    expect(
      JSON.parse(screen.getByLabelText("Exact viewer target").textContent!),
    ).toEqual(target);
    expect(evidence.viewer_target).toBe(target);
    expect(JSON.stringify(evidence)).toBe(original);
    expect(fetch).not.toHaveBeenCalled();
  },
);

it.each([undefined, null, "Explicit layer"])(
  "preserves CAD optional layer exactly (%s), never inferring one from legacy location",
  (layer) => {
    const target: NonNullable<Evidence["viewer_target"]> = {
      kind: "cad",
      source_revision_id: "cad-r2",
      entity_id: "A17",
      view_bounds: null,
      ...(layer === undefined ? {} : { layer }),
    };
    render(<EvidenceWorkspaceHost evidence={evidenceWith(target)} />);
    const receipt = JSON.parse(
      screen.getByLabelText("Exact viewer target").textContent!,
    );
    expect(receipt).toEqual(target);
    expect(Object.hasOwn(receipt, "layer")).toBe(layer !== undefined);
    if (layer !== undefined) expect(receipt.layer).toBe(layer);
  },
);

it.each(["structured", "extracted", "inferred"] as const)(
  "shows full provenance and truthful %s quality",
  (quality) => {
    const evidence = { ...evidenceWith(targets[0].target), quality };
    render(<EvidenceWorkspaceHost evidence={evidence} />);
    const region = screen.getByRole("region");
    for (const value of [
      evidence.id,
      evidence.snapshot_id,
      evidence.provider,
      evidence.source_id,
      evidence.source_revision_id!,
      evidence.source_revision,
      evidence.observed_at,
      evidence.work_package_id!,
      ...evidence.element_ids,
      evidence.location!,
      evidence.fact,
      evidence.quality,
    ])
      expect(region).toHaveTextContent(value);
    expect(within(region).getByText("9")).toBeInTheDocument();
    expect(Boolean(screen.queryByText("推断 · 不是已验证工程事实"))).toBe(
      quality === "inferred",
    );
  },
);

it("keeps legacy evidence selected with an explicit missing target, without inferring navigation", () => {
  const evidence = {
    ...evidenceWith(null),
    source_revision_id: null,
    work_package_id: null,
  };
  render(<EvidenceWorkspaceHost evidence={evidence} />);
  const region = screen.getByRole("region", {
    name: "Evidence · 证据 workspace host",
  });
  expect(region).toHaveAttribute("data-evidence-id", evidence.id);
  expect(region).toHaveAttribute(
    "data-navigation-state",
    "missing_viewer_target",
  );
  expect(region).not.toHaveAttribute("data-target-surface");
  expect(region).not.toHaveAttribute("data-source-revision-id");
  expect(screen.getByRole("status")).toHaveTextContent("没有精确定位目标");
  expect(region).toHaveTextContent(evidence.source_revision);
  expect(region).toHaveTextContent(evidence.location!);
  expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
    evidence.fact,
  );
  expect(screen.getByLabelText("Exact viewer target")).toHaveTextContent(
    "null",
  );
  expect(targetSurface(null)).toBeNull();
});

it("reports an unavailable exact revision without switching target or deselecting evidence", () => {
  const evidence = evidenceWith(targets[1].target);
  const { rerender } = render(<EvidenceWorkspaceHost evidence={evidence} />);
  rerender(
    <EvidenceWorkspaceHost
      evidence={evidence}
      revisionAvailable={false}
      stale
    />,
  );
  const region = screen.getByRole("region");
  expect(region).toHaveAttribute(
    "data-navigation-state",
    "revision_unavailable",
  );
  expect(region).toHaveAttribute("data-evidence-id", evidence.id);
  expect(region).toHaveAttribute(
    "data-source-revision-id",
    targets[1].target.source_revision_id,
  );
  expect(region).toHaveAttribute("data-evidence-stale", "true");
  expect(screen.getByText(/目标来源版本不可用/)).toBeInTheDocument();
  expect(screen.getByText(/已过期或被替换/)).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
    evidence.fact,
  );
  expect(
    JSON.parse(screen.getByLabelText("Exact viewer target").textContent!),
  ).toEqual(evidence.viewer_target);
});

it("reports a missing target revision rather than using the evidence hash or revision as a fallback", () => {
  const evidence = evidenceWith({
    ...targets[0].target,
    source_revision_id: "",
  });
  render(<EvidenceWorkspaceHost evidence={evidence} />);
  expect(screen.getByRole("region")).toHaveAttribute(
    "data-navigation-state",
    "revision_unavailable",
  );
  expect(screen.getByRole("status")).toHaveTextContent("目标来源版本不可用");
  expect(
    JSON.parse(screen.getByLabelText("Exact viewer target").textContent!)
      .source_revision_id,
  ).toBe("");
});

it.each([undefined, "future-format"])(
  "reports unsupported kind %s without inferring a host or dropping the raw receipt",
  (kind) => {
    // Exercise a malformed/future server payload at the product boundary.
    const target = {
      source_revision_id: "original-r1",
      kind,
      page: 4,
    } as Evidence["viewer_target"];
    const evidence = evidenceWith(target);
    render(<EvidenceWorkspaceHost evidence={evidence} />);
    const region = screen.getByRole("region", {
      name: "Evidence · 证据 workspace host",
    });
    expect(targetSurface(target)).toBeNull();
    expect(region).not.toHaveAttribute("data-target-surface");
    expect(region).toHaveAttribute(
      "data-navigation-state",
      "target_unsupported",
    );
    expect(region).toHaveAttribute("data-evidence-id", evidence.id);
    expect(screen.getByRole("status")).toHaveTextContent("暂不支持此定位目标");
    expect(
      JSON.parse(screen.getByLabelText("Exact viewer target").textContent!),
    ).toEqual(JSON.parse(JSON.stringify(target)));
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      evidence.fact,
    );
  },
);

it.each([
  { kind: "drawing", source_revision_id: "r1", page: 1, normalized_bbox: null },
  { kind: "bim", source_revision_id: "r1" },
  { kind: "document", source_revision_id: "r1", page: null },
] satisfies NonNullable<Evidence["viewer_target"]>[])(
  "accepts optional/null $kind fields without manufacturing defaults",
  (target) => {
    render(<EvidenceWorkspaceHost evidence={evidenceWith(target)} />);
    expect(screen.getByRole("status")).toHaveTextContent("查看器暂不可用");
    expect(
      JSON.parse(screen.getByLabelText("Exact viewer target").textContent!),
    ).toEqual(target);
  },
);

it.each(targets)(
  "presents the $surface engineering target before collapsed, complete provenance",
  ({ target }) => {
    const evidence = evidenceWith(target);
    render(<EvidenceWorkspaceHost evidence={evidence} />);
    const region = screen.getByRole("region");
    const details = within(region)
      .getByText("来源与技术详情")
      .closest("details")!;
    expect(details.open).toBe(false);
    const facts = region.querySelector(".evidence-primary-facts")!;
    expect(
      facts.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(facts).not.toHaveTextContent(evidence.id);
    expect(facts).not.toHaveTextContent(evidence.provider);
    expect(facts).not.toHaveTextContent(evidence.source_revision);
    for (const value of [
      evidence.id,
      evidence.provider,
      evidence.source_revision,
      evidence.observed_at,
    ])
      expect(details).toHaveTextContent(value);
    expect(
      JSON.parse(
        within(details).getByLabelText("Exact viewer target").textContent!,
      ),
    ).toEqual(target);
  },
);
