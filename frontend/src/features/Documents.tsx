import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Search, Upload } from "lucide-react";
import { api, isDesktop, readSource, type AgentRun } from "../api/client";
import { Button } from "../components/ui/button";

export function Documents({
  project,
  perform,
}: {
  project: string;
  perform: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [selected, setSelected] = useState("");
  const [runId, setRunId] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const cache = useQueryClient();
  const documents = useQuery({
    queryKey: ["documents", project],
    queryFn: () => api.documents(project),
  });
  const current = selected || documents.data?.[0]?.id || "";
  const chunks = useQuery({
    queryKey: ["chunks", current],
    queryFn: () => api.chunks(current),
    enabled: !!current,
  });
  const results = useQuery({
    queryKey: ["search", project, query],
    queryFn: () => api.search(project, query),
    enabled: !!query,
  });
  const run = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.run(runId),
    enabled: !!runId,
    refetchInterval: (q) =>
      ["QUEUED", "RUNNING"].includes(q.state.data?.status ?? "") ? 1000 : false,
  });
  useEffect(() => {
    if (run.data?.status === "COMPLETED") {
      void cache.invalidateQueries({ queryKey: ["documents", project] });
      void cache.invalidateQueries({ queryKey: ["search", project] });
    }
  }, [run.data?.id, run.data?.status, project, cache]);
  const visible = query ? results.data : chunks.data;
  async function nativeImport() {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<AgentRun | { cancelled: true }>(
      "import_document",
      { projectId: project },
    );
    if ("id" in result) setRunId(result.id);
    await cache.invalidateQueries({ queryKey: ["documents"] });
  }
  return (
    <div className="content-view documents-view">
      <div className="view-heading">
        <div>
          <h2>Documents & retrieval</h2>
        </div>
        <Button
          variant="secondary"
          onClick={() =>
            isDesktop ? void perform(nativeImport) : input.current?.click()
          }
        >
          <Upload size={14} /> Import document
        </Button>
        <input
          ref={input}
          type="file"
          hidden
          accept=".md,.txt,.csv,.log,.pdf,.docx,.pptx,.html"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file)
              void perform(async () => {
                const run = await api.upload(project, file);
                setRunId(run.id);
                await cache.invalidateQueries({ queryKey: ["documents"] });
              });
          }}
        />
      </div>
      {run.data && (
        <div className="upload-status" role="status">
          Import {run.data.status.replaceAll("_", " ")} /{" "}
          {run.data.error ?? run.data.id.slice(0, 8)}. Details are in
          Operations.
        </div>
      )}
      {current && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void perform(async () => {
              const blob = await readSource(
                `/api/documents/${current}/content`,
              );
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download =
                documents.data?.find((doc) => doc.id === current)?.filename ??
                "source";
              anchor.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            })
          }
        >
          Save selected source
        </Button>
      )}
      <form
        className="search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(search);
        }}
      >
        <Search size={16} />
        <input
          aria-label="Search documents"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search local documents, no embeddings required"
        />
        <Button type="submit" variant="secondary" size="sm">
          Search
        </Button>
        {query && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setQuery("");
              setSearch("");
            }}
          >
            Clear
          </Button>
        )}
      </form>
      <div className="document-layout">
        <div className="document-list">
          {documents.data?.map((doc) => (
            <button
              className={current === doc.id ? "selected" : ""}
              onClick={() => {
                setSelected(doc.id);
                setQuery("");
              }}
              key={doc.id}
            >
              <FileText size={17} />
              <span>
                <strong>{doc.filename}</strong>
                <small>
                  {doc.parser}
                  <br />
                  SHA {doc.content_hash.slice(0, 12)}
                </small>
              </span>
            </button>
          ))}
        </div>
        <div className="document-content">
          {query && <h3>Search: {query}</h3>}
          {(chunks.error || results.error || documents.error) && (
            <p role="alert">
              Document request failed. Check the connection and capability
              status.
            </p>
          )}
          {visible?.map((chunk) => (
            <article className="document-chunk" key={chunk.id}>
              <div className="eyebrow">
                PAGE {chunk.page ?? "?"} / {chunk.location}
              </div>
              <pre>{chunk.text}</pre>
              <small className="mono">
                {chunk.source_hash.slice(0, 20)} / {chunk.parser}
              </small>
            </article>
          ))}
          {visible?.length === 0 && <p>No matching document evidence.</p>}
        </div>
      </div>
    </div>
  );
}
