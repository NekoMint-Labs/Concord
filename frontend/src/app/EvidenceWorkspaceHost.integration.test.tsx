import { createHash, webcrypto } from "node:crypto";
import { Blob as NodeBlob } from "node:buffer";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useEffect, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, type DTO } from "../api/client";
import { EvidenceWorkspaceHost, type Evidence } from "./EvidenceWorkspaceHost";

type SurfaceProps = {
  drawing: ComponentProps<
    typeof import("../viewers/drawing/DrawingSurface").default
  >;
  cad: ComponentProps<typeof import("../viewers/cad/CadSurface").default>;
  bim: ComponentProps<typeof import("../viewers/ifc/IfcSurface").default>;
  document: ComponentProps<
    typeof import("../viewers/document/DocumentSurface").default
  >;
};
type Kind = keyof SurfaceProps;
type Target = NonNullable<Evidence["viewer_target"]>;

const surfaces = vi.hoisted(() => ({
  received: vi.fn(),
  mounted: vi.fn(),
  disposed: vi.fn(),
}));

// Replace only C's default surfaces, not the host, provenance loader or hashing.
// These props are derived from the real C exports; no invented onSuccess seam.
function SurfaceProbe<K extends Kind>({
  kind,
  props,
}: {
  kind: K;
  props: SurfaceProps[K];
}) {
  surfaces.received(kind, props);
  useEffect(() => {
    surfaces.mounted(kind, props);
    return () => {
      surfaces.disposed(kind, props);
    };
  }, [kind]);
  return (
    <section aria-label={`${kind} surface probe`}>
      <p role="status">C is still loading; no navigation acknowledgement</p>
      <button
        onClick={() =>
          props.onError?.("C could not locate the canonical target")
        }
      >
        Report C error
      </button>
      <button onClick={() => props.onError?.(null)}>Clear C error</button>
    </section>
  );
}

vi.mock("../viewers/drawing/DrawingSurface", () => ({
  default: (props: SurfaceProps["drawing"]) => (
    <SurfaceProbe kind="drawing" props={props} />
  ),
}));
vi.mock("../viewers/cad/CadSurface", () => ({
  default: (props: SurfaceProps["cad"]) => (
    <SurfaceProbe kind="cad" props={props} />
  ),
}));
vi.mock("../viewers/ifc/IfcSurface", () => ({
  default: (props: SurfaceProps["bim"]) => (
    <SurfaceProbe kind="bim" props={props} />
  ),
}));
vi.mock("../viewers/document/DocumentSurface", () => ({
  default: (props: SurfaceProps["document"]) => (
    <SurfaceProbe kind="document" props={props} />
  ),
}));

const project = "project-original";
const bytes = "exact persisted source bytes — not the latest revision";
const hash = createHash("sha256").update(bytes).digest("hex");
const otherHash = createHash("sha256").update("other version").digest("hex");
const revision: DTO<"ProjectSourceRevision"> = {
  id: "revision-original",
  project_id: project,
  source_id: "source-original",
  sequence: 1,
  external_label: "Issued original",
  original_filename: "original-source.file",
  sha256: hash,
  media_type: "application/octet-stream",
  size_bytes: Buffer.byteLength(bytes),
  storage_key: "opaque-storage-key-not-a-download-url",
  import_status: "STORED",
  imported_at: "2026-03-22T10:00:00Z",
};
const latest: DTO<"ProjectSourceRevision"> = {
  ...revision,
  id: "revision-latest",
  sequence: 2,
  sha256: otherHash,
  original_filename: "latest-source.file",
};
const exactDocument: DTO<"DocumentMetadata"> = {
  id: "document-exact-hash",
  project_id: project,
  filename: "catalog-name-does-not-select-the-source.file",
  content_hash: hash,
  parser: "persisted-parser",
  created_at: revision.imported_at,
};
const chunks: DTO<"DocumentChunk">[] = [
  {
    id: "persisted-chunk",
    text: "Persisted source extraction, not evidence.fact",
    page: 2,
    location: "Sheet1 / row:4 / cell:C4",
    source_hash: hash,
    parser: "persisted-parser",
  },
];
const targets = [
  {
    kind: "drawing",
    source_revision_id: revision.id,
    page: 5,
    normalized_bbox: [0.32, 0.28, 0.62, 0.52],
  },
  {
    kind: "cad",
    source_revision_id: revision.id,
    entity_id: "A17",
    layer: null,
    view_bounds: [10, 20, 40, 60],
  },
  {
    kind: "bim",
    source_revision_id: revision.id,
    global_ids: ["GlobalId-A", "GlobalId-B"],
    viewpoint: [1, 2, 3, 4, 5, 6],
  },
  {
    kind: "document",
    source_revision_id: revision.id,
    page: 2,
    structural_path: ["Sheet1", "row:4", "cell:C4"],
    location: "Original document location",
  },
] satisfies (Target & { kind: Kind })[];

function evidenceWith(
  target: Evidence["viewer_target"] = targets[0],
): Evidence {
  return {
    id: "evidence-original",
    snapshot_id: "snapshot-original",
    provider: "engineering-provider",
    source_id: revision.source_id,
    source_revision_id: revision.id,
    source_revision: hash,
    observed_at: revision.imported_at,
    work_package_id: "work-package-original",
    element_ids: ["legacy-element-not-a-global-id"],
    page: 99,
    location: "Legacy position must never become the canonical target",
    fact: "Original evidence remains selected",
    quality: "structured",
    viewer_target: target,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function contentUrl(item = revision) {
  return `/api/projects/${encodeURIComponent(item.project_id)}/sources/${encodeURIComponent(item.source_id)}/revisions/${encodeURIComponent(item.id)}/content`;
}

function host() {
  return screen.getByRole("region", { name: /workspace host$/ });
}

function expectReceipt(evidence: Evidence) {
  expect(host()).toHaveAttribute("data-evidence-id", evidence.id);
  expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
    evidence.fact,
  );
  expect(
    JSON.parse(screen.getByLabelText("Exact viewer target").textContent!),
  ).toEqual(evidence.viewer_target);
}

function received<K extends Kind>(kind: K): SurfaceProps[K] {
  const calls = surfaces.received.mock.calls.filter(
    ([surface]) => surface === kind,
  );
  expect(calls.length).toBeGreaterThan(0);
  return calls.at(-1)![1] as SurfaceProps[K];
}

async function expectActive(kind: Kind) {
  await screen.findByRole("region", { name: `${kind} surface probe` });
  expect(host()).toHaveAttribute("data-navigation-state", "viewer_active");
}

async function expectFailed(message: string) {
  await waitFor(() =>
    expect(host()).toHaveAttribute(
      "data-navigation-state",
      "navigation_failed",
    ),
  );
  expect(host()).toHaveTextContent(message);
  expect(surfaces.received).not.toHaveBeenCalled();
}

beforeEach(() => {
  surfaces.received.mockClear();
  surfaces.mounted.mockClear();
  surfaces.disposed.mockClear();
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Blob", NodeBlob);
  vi.spyOn(api, "sourceRevisions").mockResolvedValue([latest, revision]);
  vi.spyOn(api, "documents").mockResolvedValue([
    {
      ...exactDocument,
      id: "same-hash-other-project",
      project_id: "other-project",
    },
    {
      ...exactDocument,
      id: "same-filename-wrong-hash",
      filename: revision.original_filename,
      content_hash: otherHash,
    },
    exactDocument,
  ]);
  vi.spyOn(api, "chunks").mockResolvedValue(chunks);
  // Node's Response supplies a Blob with arrayBuffer(); jsdom's Blob does not.
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response(bytes),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("EvidenceWorkspaceHost → C surface integration", () => {
  it.each(targets)(
    "dispatches $kind with the unchanged canonical target and verified exact source",
    async (target) => {
      const metadata = deferred<DTO<"ProjectSourceRevision">[]>();
      vi.mocked(api.sourceRevisions).mockReturnValueOnce(metadata.promise);
      const evidence = evidenceWith(target);
      const original = JSON.stringify(evidence);
      const view = render(
        <EvidenceWorkspaceHost project={project} evidence={evidence} />,
      );

      expect(host()).toHaveAttribute("data-navigation-state", "loading");
      expect(
        screen.getByText("正在验证来源版本与原文件。"),
      ).toBeInTheDocument();
      expect(surfaces.received).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      expectReceipt(evidence);

      await act(async () => {
        metadata.resolve([latest, revision]);
      });
      await expectActive(target.kind);
      expect(api.sourceRevisions).toHaveBeenCalledExactlyOnceWith(
        project,
        revision.source_id,
      );
      expect(fetch).toHaveBeenCalledExactlyOnceWith(contentUrl(), {
        headers: expect.objectContaining({ Authorization: expect.any(String) }),
        signal: expect.objectContaining({ aborted: false }),
      });
      const props = received(target.kind);
      expect(props.target).toBe(target);
      expect(props.onError).toEqual(expect.any(Function));
      expect(Object.keys(props).sort()).toEqual(
        [
          target.kind === "cad"
            ? "before"
            : target.kind === "bim"
              ? "sources"
              : "source",
          "target",
          "onError",
        ].sort(),
      );
      const expectedSource = {
        revisionId: revision.id,
        sourceHash: hash,
        name: revision.original_filename,
        data: expect.anything(),
      };
      if (target.kind === "document") {
        const documentProps = received("document");
        expect(documentProps.source).toEqual({
          sourceRevisionId: revision.id,
          sourceHash: hash,
          filename: revision.original_filename,
          chunks,
        });
        expect(documentProps.source.chunks).toBe(chunks);
        expect(api.documents).toHaveBeenCalledExactlyOnceWith(project);
        expect(api.chunks).toHaveBeenCalledExactlyOnceWith(exactDocument.id);
      } else {
        const source =
          target.kind === "cad"
            ? received("cad").before
            : target.kind === "bim"
              ? received("bim").sources[0]
              : received("drawing").source;
        expect(source).toEqual(expectedSource);
        expect(new Uint8Array(source.data)).toEqual(
          new Uint8Array(await new Response(bytes).arrayBuffer()),
        );
        if (target.kind === "bim")
          expect(received("bim").sources).toEqual([expectedSource]);
        expect(api.documents).not.toHaveBeenCalled();
        expect(api.chunks).not.toHaveBeenCalled();
      }

      // C owns readiness. A non-null failure and its nullable reset are not an
      // acknowledgement that the target was found, even though bytes are verified.
      fireEvent.click(screen.getByRole("button", { name: "Report C error" }));
      expect(host()).toHaveAttribute(
        "data-navigation-state",
        "navigation_failed",
      );
      expect(host()).toHaveTextContent(
        "C could not locate the canonical target",
      );
      expectReceipt(evidence);
      fireEvent.click(screen.getByRole("button", { name: "Clear C error" }));
      expect(host()).toHaveAttribute("data-navigation-state", "viewer_active");
      expect(host()).not.toHaveTextContent(
        "C could not locate the canonical target",
      );
      expect(
        screen.getByText("C is still loading; no navigation acknowledgement"),
      ).toBeInTheDocument();
      expect(host()).toHaveTextContent("加载与定位结果见查看器状态");
      expectReceipt(evidence);
      expect(JSON.stringify(evidence)).toBe(original);
      expect(api.sourceRevisions).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledTimes(1);

      view.unmount();
      expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
      expect(surfaces.mounted).toHaveBeenCalledExactlyOnceWith(
        target.kind,
        expect.anything(),
      );
      expect(surfaces.disposed).toHaveBeenCalledExactlyOnceWith(
        target.kind,
        expect.objectContaining({ target }),
      );
    },
  );

  it.each([
    {
      name: "missing target",
      evidence: evidenceWith(null),
      state: "missing_viewer_target",
    },
    {
      name: "target/evidence revision mismatch",
      evidence: { ...evidenceWith(), source_revision_id: latest.id },
      state: "revision_mismatch",
    },
    {
      name: "explicitly unavailable revision",
      evidence: evidenceWith(),
      state: "revision_unavailable",
      available: false,
    },
  ])(
    "does not load or invent navigation for $name",
    ({ evidence, state, available }) => {
      render(
        <EvidenceWorkspaceHost
          project={project}
          evidence={evidence}
          revisionAvailable={available}
        />,
      );
      expect(host()).toHaveAttribute("data-navigation-state", state);
      expectReceipt(evidence);
      expect(api.sourceRevisions).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      expect(api.documents).not.toHaveBeenCalled();
      expect(surfaces.received).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      name: "missing exact revision (latest is not a fallback)",
      revisions: [latest],
      message: "目标来源版本不可用",
    },
    {
      name: "wrong project",
      revisions: [{ ...revision, project_id: "other-project" }],
      message: "目标来源版本不可用",
    },
    {
      name: "wrong source",
      revisions: [{ ...revision, source_id: "other-source" }],
      message: "目标来源版本不可用",
    },
    {
      name: "metadata hash differs from evidence",
      revisions: [{ ...revision, sha256: otherHash }],
      message: "Evidence 来源版本或完整性哈希不匹配",
    },
  ])(
    "rejects $name before downloading any bytes",
    async ({ revisions, message }) => {
      vi.mocked(api.sourceRevisions).mockResolvedValue(revisions);
      const evidence = evidenceWith();
      render(<EvidenceWorkspaceHost project={project} evidence={evidence} />);
      await expectFailed(message);
      expectReceipt(evidence);
      expect(fetch).not.toHaveBeenCalled();
      expect(api.documents).not.toHaveBeenCalled();
      expect(api.chunks).not.toHaveBeenCalled();
    },
  );

  it("rejects a corrupt download and retries the same revision without turning null into success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("corrupt original bytes"),
    );
    const evidence = evidenceWith();
    render(<EvidenceWorkspaceHost project={project} evidence={evidence} />);
    await expectFailed("来源原文件完整性验证失败");
    expectReceipt(evidence);
    expect(api.documents).not.toHaveBeenCalled();

    const retry = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(retry.promise);
    fireEvent.click(screen.getByRole("button", { name: "重试工程查看器" }));
    expect(host()).toHaveAttribute("data-navigation-state", "loading");
    expect(host()).not.toHaveTextContent("来源原文件完整性验证失败");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(surfaces.received).not.toHaveBeenCalled();
    await act(async () => {
      retry.resolve(new Response(bytes));
    });
    await expectActive("drawing");
    expectReceipt(evidence);
    expect(api.sourceRevisions).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
      contentUrl(),
      contentUrl(),
    ]);
    expect(received("drawing").target).toBe(evidence.viewer_target);
    expect(
      screen.getByText("C is still loading; no navigation acknowledgement"),
    ).toBeInTheDocument();
  });

  it.each([
    {
      name: "no persisted extraction",
      catalog: [],
      extracted: chunks,
      message: "精确来源版本尚无已持久化文档提取",
      chunkCalls: 0,
    },
    {
      name: "filename match but wrong hash",
      catalog: [
        {
          ...exactDocument,
          filename: revision.original_filename,
          content_hash: otherHash,
        },
      ],
      extracted: chunks,
      message: "精确来源版本尚无已持久化文档提取",
      chunkCalls: 0,
    },
    {
      name: "hash match in another project",
      catalog: [{ ...exactDocument, project_id: "other-project" }],
      extracted: chunks,
      message: "精确来源版本尚无已持久化文档提取",
      chunkCalls: 0,
    },
    {
      name: "one chunk from another source version",
      catalog: [exactDocument],
      extracted: [
        ...chunks,
        { ...chunks[0], id: "foreign-chunk", source_hash: otherHash },
      ],
      message: "文档提取不属于此来源版本",
      chunkCalls: 1,
    },
  ])(
    "does not fabricate document extraction for $name",
    async ({ catalog, extracted, message, chunkCalls }) => {
      vi.mocked(api.documents).mockResolvedValue(catalog);
      vi.mocked(api.chunks).mockResolvedValue(extracted);
      const evidence = evidenceWith(targets[3]);
      render(<EvidenceWorkspaceHost project={project} evidence={evidence} />);
      await expectFailed(message);
      expectReceipt(evidence);
      expect(api.documents).toHaveBeenCalledExactlyOnceWith(project);
      expect(api.chunks).toHaveBeenCalledTimes(chunkCalls);
      if (chunkCalls) expect(api.chunks).toHaveBeenCalledWith(exactDocument.id);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole("button", { name: "重试工程查看器" }),
      ).toBeInTheDocument();
    },
  );

  it("keeps document loading until the exact persisted chunks arrive", async () => {
    const extraction = deferred<DTO<"DocumentChunk">[]>();
    vi.mocked(api.chunks).mockReturnValueOnce(extraction.promise);
    const evidence = evidenceWith(targets[3]);
    render(<EvidenceWorkspaceHost project={project} evidence={evidence} />);
    await waitFor(() =>
      expect(api.chunks).toHaveBeenCalledExactlyOnceWith(exactDocument.id),
    );
    expect(host()).toHaveAttribute("data-navigation-state", "loading");
    expect(surfaces.received).not.toHaveBeenCalled();
    await act(async () => {
      extraction.resolve(chunks);
    });
    await expectActive("document");
    expect(received("document").source.chunks).toBe(chunks);
    expect(received("document").target).toBe(evidence.viewer_target);
  });

  it("passes a source-only BIM target without inventing GlobalIds from legacy element_ids", async () => {
    const target: Target = { kind: "bim", source_revision_id: revision.id };
    const evidence = evidenceWith(target);
    render(<EvidenceWorkspaceHost project={project} evidence={evidence} />);
    await expectActive("bim");
    const props = received("bim");
    expect(props.target).toBe(target);
    expect(props.target).toEqual({
      kind: "bim",
      source_revision_id: revision.id,
    });
    expect(props.target).not.toHaveProperty("global_ids");
    expect(props.target).not.toHaveProperty("viewpoint");
    expect(props.sources).toHaveLength(1);
    expect(props.sources[0]).toMatchObject({
      revisionId: revision.id,
      sourceHash: hash,
      name: revision.original_filename,
    });
    expectReceipt(evidence);
  });

  it.each(["success", "failure"] as const)(
    "fences delayed old A %s and old B responses across A → B → A",
    async (oldAResult) => {
      const a = evidenceWith();
      const bRevision = {
        ...revision,
        id: "revision-B",
        source_id: "source-B",
      };
      const b = {
        ...evidenceWith({ ...targets[1], source_revision_id: bRevision.id }),
        id: "evidence-B",
        source_id: bRevision.source_id,
        source_revision_id: bRevision.id,
      };
      vi.mocked(api.sourceRevisions).mockImplementation(
        async (_project, source) =>
          source === bRevision.source_id ? [bRevision] : [latest, revision],
      );
      const oldA = deferred<Response>();
      const oldB = deferred<Response>();
      const currentA = deferred<Response>();
      vi.mocked(fetch)
        .mockReturnValueOnce(oldA.promise)
        .mockReturnValueOnce(oldB.promise)
        .mockReturnValueOnce(currentA.promise);
      const view = render(
        <EvidenceWorkspaceHost project={project} evidence={a} />,
      );
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      view.rerender(<EvidenceWorkspaceHost project={project} evidence={b} />);
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      expectReceipt(b);
      view.rerender(<EvidenceWorkspaceHost project={project} evidence={a} />);
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));

      await act(async () => {
        if (oldAResult === "success") oldA.resolve(new Response(bytes));
        else oldA.reject(new Error("late old A failure"));
        oldB.reject(new Error("late old B failure"));
        await Promise.allSettled([oldA.promise, oldB.promise]);
      });
      expectReceipt(a);
      expect(host()).toHaveAttribute("data-navigation-state", "loading");
      expect(host()).not.toHaveTextContent("late old");
      expect(surfaces.received).not.toHaveBeenCalled();
      expect(surfaces.mounted).not.toHaveBeenCalled();

      await act(async () => {
        currentA.resolve(new Response(bytes));
      });
      await expectActive("drawing");
      expectReceipt(a);
      expect(received("drawing").target).toBe(a.viewer_target);
      // Visible probe DOM precedes its passive mount effect after async hashing.
      await waitFor(() =>
        expect(surfaces.mounted).toHaveBeenCalledExactlyOnceWith(
          "drawing",
          expect.anything(),
        ),
      );
      expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
        contentUrl(),
        contentUrl(bRevision),
        contentUrl(),
      ]);
      view.unmount();
      expect(surfaces.disposed).toHaveBeenCalledExactlyOnceWith(
        "drawing",
        expect.objectContaining({ target: a.viewer_target }),
      );
    },
  );

  it("disposes the mounted surface on context replacement and unmount", async () => {
    const a = evidenceWith();
    const b = { ...evidenceWith(targets[1]), id: "evidence-B" };
    const view = render(
      <EvidenceWorkspaceHost project={project} evidence={a} />,
    );
    await expectActive("drawing");
    await waitFor(() =>
      expect(surfaces.mounted).toHaveBeenCalledExactlyOnceWith(
        "drawing",
        expect.objectContaining({ target: a.viewer_target }),
      ),
    );
    view.rerender(<EvidenceWorkspaceHost project={project} evidence={b} />);
    await expectActive("cad");
    await waitFor(() => {
      expect(surfaces.mounted).toHaveBeenCalledTimes(2);
      expect(surfaces.mounted).toHaveBeenLastCalledWith(
        "cad",
        expect.objectContaining({ target: b.viewer_target }),
      );
    });
    expect(surfaces.disposed).toHaveBeenCalledExactlyOnceWith(
      "drawing",
      expect.objectContaining({ target: a.viewer_target }),
    );
    expect(
      screen.queryByRole("region", { name: "drawing surface probe" }),
    ).not.toBeInTheDocument();
    expectReceipt(b);
    view.unmount();
    expect(surfaces.disposed.mock.calls.map(([kind]) => kind)).toEqual([
      "drawing",
      "cad",
    ]);
  });

  it.each(["success", "failure"] as const)(
    "ignores a delayed download %s after unmount",
    async (result) => {
      const pending = deferred<Response>();
      vi.mocked(fetch).mockReturnValueOnce(pending.promise);
      const view = render(
        <EvidenceWorkspaceHost project={project} evidence={evidenceWith()} />,
      );
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      view.unmount();
      await act(async () => {
        if (result === "success") pending.resolve(new Response(bytes));
        else pending.reject(new Error("download failed after unmount"));
        await Promise.allSettled([pending.promise]);
      });
      expect(
        screen.queryByRole("region", { name: /workspace host$/ }),
      ).not.toBeInTheDocument();
      expect(surfaces.received).not.toHaveBeenCalled();
      expect(surfaces.mounted).not.toHaveBeenCalled();
      expect(surfaces.disposed).not.toHaveBeenCalled();
    },
  );
});
