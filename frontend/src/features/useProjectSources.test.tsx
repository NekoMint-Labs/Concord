import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  api,
  type AgentRun,
  type Capability,
  type ProjectSourceRevision,
  type ProjectSourceStatus,
} from "../api/client";
import { supportedSourceFormats, useProjectSources } from "./useProjectSources";
import { startSourceImport } from "./useSourceProcessing";

const source: ProjectSourceStatus = {
  source: {
    id: "source-a",
    project_id: "project",
    name: "MEP",
    kind: "BIM",
    created_at: "2026-01-01T00:00:00Z",
  },
  latest_revision_id: "r2",
  accepted_revision_id: "r1",
  baseline_id: "b1",
  has_pending_revision: true,
};
const revision: ProjectSourceRevision = {
  id: "r2",
  project_id: "project",
  source_id: "source-a",
  sequence: 2,
  external_label: null,
  original_filename: "mep.ifc",
  sha256: "0".repeat(64),
  media_type: null,
  size_bytes: 1,
  storage_key: "key",
  import_status: "STORED",
  imported_at: "2026-01-01T00:00:00Z",
};
const run: AgentRun = {
  id: "import-run",
  project_id: "project",
  event_id: null,
  status: "QUEUED",
  runtime: "test",
  runtime_execution_id: null,
  generation: 0,
  runtime_generation: 0,
  category: "bim_import",
  analysis_id: null,
  error: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};
const parser: Capability = {
  name: "document parser",
  implementation: "LightweightDocumentParser",
  status: "enabled",
  enabled: true,
  dependency_available: true,
  credential_present: null,
  service_reachable: null,
  reason: "",
  version: null,
};
function setup(sourceId = "source-a", onRun = vi.fn()) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  return {
    ...renderHook(() => useProjectSources("project", sourceId, onRun), {
      wrapper,
    }),
    cache,
    onRun,
  };
}
beforeEach(() => {
  vi.spyOn(api, "capabilities").mockResolvedValue({ capabilities: [parser] });
  vi.spyOn(api, "sourceStatuses").mockResolvedValue([source]);
  vi.spyOn(api, "sourceRevisions").mockResolvedValue([revision]);
  vi.spyOn(api, "baselines").mockResolvedValue([]);
  vi.spyOn(api, "comparisons").mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());

it("advertises only installed parser formats, never drawings or spreadsheets", () => {
  expect(supportedSourceFormats()).toEqual([".ifc"]);
  expect(
    supportedSourceFormats([
      {
        ...parser,
        name: "BIM",
        implementation: "IfcOpenShell",
        dependency_available: false,
        status: "unavailable_dependency",
      },
    ]),
  ).toEqual([]);
  expect(supportedSourceFormats([parser])).toEqual([".ifc", ".txt", ".md"]);
  expect(
    supportedSourceFormats([{ ...parser, implementation: "Docling" }]),
  ).toEqual([".ifc", ".pdf", ".docx", ".pptx", ".txt", ".md", ".html"]);
  expect(
    supportedSourceFormats([
      {
        ...parser,
        implementation: "Docling",
        dependency_available: false,
        status: "unavailable_dependency",
      },
    ]),
  ).toEqual([".ifc"]);
});
it("accepts a complete latest revision set only through the explicit baseline mutation", async () => {
  vi.mocked(api.sourceStatuses).mockResolvedValue([
    source,
    {
      ...source,
      source: { ...source.source, id: "source-b", kind: "DOCUMENT" },
      latest_revision_id: "doc-r1",
    },
    {
      ...source,
      source: { ...source.source, id: "empty" },
      latest_revision_id: null,
    },
  ]);
  const create = vi.spyOn(api, "createBaseline").mockResolvedValue({
    id: "b1",
    project_id: "project",
    name: "B1",
    sequence: 1,
    entries: [],
    accepted_by: "user",
    created_at: "2026-01-01T00:00:00Z",
  });
  const { result } = setup();
  await waitFor(() => expect(result.current.sources.isSuccess).toBe(true));
  expect(create).not.toHaveBeenCalled();
  await act(() => result.current.acceptBaseline.mutateAsync());
  expect(create).toHaveBeenCalledWith("project", {
    name: "B1",
    entries: [
      { source_id: "source-a", revision_id: "r2" },
      { source_id: "source-b", revision_id: "doc-r1" },
    ],
  });
});
it("automatically imports uploads but never accepts a baseline", async () => {
  const upload = vi
    .spyOn(api, "uploadRevision")
    .mockResolvedValue({ revision, duplicate: false });
  const importing = vi.spyOn(api, "importRevision").mockResolvedValue(run);
  const baseline = vi.spyOn(api, "createBaseline");
  const { result, onRun } = setup();
  await waitFor(() => expect(result.current.sources.isSuccess).toBe(true));
  const file = new File(["IFC"], "mep.ifc");
  await act(() =>
    result.current.upload.mutateAsync({ source: "source-a", file, label: "" }),
  );
  expect(upload).toHaveBeenCalledWith("project", "source-a", file, "");
  expect(importing).toHaveBeenCalledWith("project", "source-a", "r2");
  expect(onRun).toHaveBeenCalledWith(run);
  expect(baseline).not.toHaveBeenCalled();
});
it("retains the stored revision and a revision-scoped error if import startup fails", async () => {
  vi.spyOn(api, "uploadRevision").mockResolvedValue({
    revision,
    duplicate: false,
  });
  vi.spyOn(api, "importRevision").mockRejectedValue(
    new Error("worker unavailable"),
  );
  const { result, cache } = setup();
  await waitFor(() => expect(result.current.sources.isSuccess).toBe(true));
  let uploaded;
  await act(async () => {
    uploaded = await result.current.upload.mutateAsync({
      source: "source-a",
      file: new File(["IFC"], "mep.ifc"),
      label: "",
    });
  });
  expect(uploaded).toEqual({ revision, duplicate: false });
  expect(
    cache.getQueryData(["source-import-error", "project", "source-a", "r2"]),
  ).toBe("worker unavailable");
});
it("resumes the durable failed run on retry because import POST is idempotent", async () => {
  vi.spyOn(api, "importRevision").mockResolvedValue({
    ...run,
    status: "FAILED",
    error: "parse failed",
  });
  const resume = vi
    .spyOn(api, "resume")
    .mockResolvedValue({ ...run, generation: 1 });
  const cache = new QueryClient();
  await startSourceImport(cache, "project", "source-a", "r2", true);
  expect(resume).toHaveBeenCalledWith("import-run");
  expect(
    cache.getQueryData(["revision-import", "project", "source-a", "r2"]),
  ).toMatchObject({ generation: 1, status: "QUEUED" });
});
it("imports document revisions without calling the BIM comparison API", async () => {
  vi.mocked(api.sourceStatuses).mockResolvedValue([
    { ...source, source: { ...source.source, kind: "DOCUMENT" } },
  ]);
  vi.spyOn(api, "uploadRevision").mockResolvedValue({
    revision: { ...revision, original_filename: "notice.txt" },
    duplicate: true,
  });
  const importing = vi
    .spyOn(api, "importRevision")
    .mockResolvedValue({ ...run, category: "document_parse" });
  const { result } = setup();
  await waitFor(() =>
    expect(
      result.current.capabilities.isSuccess && result.current.sources.isSuccess,
    ).toBe(true),
  );
  await act(() =>
    result.current.upload.mutateAsync({
      source: "source-a",
      file: new File(["notice"], "notice.txt"),
      label: "",
    }),
  );
  expect(importing).toHaveBeenCalledWith("project", "source-a", "r2");
  expect(api.comparisons).not.toHaveBeenCalled();
});
it("rejects unsupported or wrong-kind uploads before sending file bytes", async () => {
  const upload = vi.spyOn(api, "uploadRevision");
  const { result } = setup();
  await waitFor(() =>
    expect(
      result.current.capabilities.isSuccess && result.current.sources.isSuccess,
    ).toBe(true),
  );
  await act(async () => {
    await expect(
      result.current.upload.mutateAsync({
        source: "source-a",
        file: new File(["x"], "plan.xlsx"),
        label: "",
      }),
    ).rejects.toThrow("不支持");
    await expect(
      result.current.upload.mutateAsync({
        source: "source-a",
        file: new File(["x"], "notice.txt"),
        label: "",
      }),
    ).rejects.toThrow("不一致");
  });
  expect(upload).not.toHaveBeenCalled();
});

it("shows a failed automatic import without silently retrying the run", async () => {
  vi.spyOn(api, "importRevision").mockResolvedValue({
    ...run,
    status: "FAILED",
    error: "parse failed",
  });
  const resume = vi.spyOn(api, "resume");
  const cache = new QueryClient();
  const result = await startSourceImport(cache, "project", "source-a", "r2");
  expect(result.status).toBe("FAILED");
  expect(resume).not.toHaveBeenCalled();
});
