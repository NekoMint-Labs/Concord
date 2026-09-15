import type { FeatureCollection } from "geojson";

import type { components } from "./schema";

export type DTO<K extends keyof components["schemas"]> =
  components["schemas"][K];
export type Workspace = DTO<"WorkspaceResponse">;
export type WorkPackage = DTO<"WorkPackage">;
export type Constraint = DTO<"Constraint">;
export type ActionProposal = DTO<"ActionProposal">;
export type AgentRun = DTO<"AgentRun">;
export type DocumentChunk = DTO<"DocumentChunk">;
export type Capability = DTO<"Capability">;
export type BIMElement = DTO<"BIMElement">;

const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
  location.hostname,
);
let apiBase = import.meta.env?.VITE_API_BASE?.replace(/\/$/, "") ?? "";
let apiToken =
  sessionStorage.getItem("cca-token") ?? (loopback ? "local-demo-admin" : "");
export const isDesktop = "__TAURI_INTERNALS__" in window;

export async function initializeConnection(): Promise<void> {
  if (!isDesktop) return;
  const { invoke } = await import("@tauri-apps/api/core");
  const connection = await invoke<{ endpoint: string; token: string }>(
    "connection_info",
  );
  const endpoint = new URL(connection.endpoint);
  if (
    endpoint.protocol !== "http:" ||
    endpoint.hostname !== "127.0.0.1" ||
    !endpoint.port ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== "/" ||
    connection.token.length < 32
  ) {
    throw new Error("桌面版返回的本地连接信息无效");
  }
  apiBase = endpoint.origin;
  apiToken = connection.token;
}

export function setToken(token: string): void {
  apiToken = token;
  if (!isDesktop) sessionStorage.setItem("cca-token", token);
}

export function requestHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${apiToken}` };
}
export function apiUrl(path: string): string {
  return apiBase + path;
}

export class APIError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "APIError";
    this.status = status;
    this.code = code;
  }
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", requestHeaders().Authorization);
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { ...init, headers });
  } catch (cause) {
    /*
     * A request that never reached the service is reported as the product's own
     * failure rather than as the platform's throw. A browser says "Failed to
     * fetch", which names neither what failed nor what to do about it, and it is
     * the one error every surface (the workspace banner, a failed action) would
     * otherwise show verbatim. The cause is kept in the error's `code` so nothing
     * is swallowed.
     */
    throw new APIError(
      0,
      "无法连接 Concord 本地服务。请重新连接；如问题持续，可查看诊断信息。",
      cause instanceof Error ? cause.name : "network",
    );
  }
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: response.statusText }));
    throw new APIError(
      response.status,
      typeof error.detail === "string"
        ? error.detail
        : JSON.stringify(error.detail),
      error.code,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  projects: () => request<DTO<"Project">[]>("/api/projects"),
  workspace: (project: string) =>
    request<Workspace>(`/api/projects/${project}/workspace`),
  profile: () => request<DTO<"ProfileResponse">>("/api/profile"),
  capabilities: (probe = false) =>
    request<DTO<"CapabilityResponse">>(`/api/capabilities?probe=${probe}`),
  events: (project: string, event: DTO<"ProjectEvent-Input">) =>
    request<AgentRun>(`/api/projects/${project}/events`, {
      method: "POST",
      body: JSON.stringify(event),
    }),
  recheck: (project: string) =>
    request<AgentRun>(`/api/projects/${project}/recheck`, { method: "POST" }),
  reset: () => request<AgentRun>("/api/demo/reset", { method: "POST" }),
  approve: (id: string, strong = false, confirmation = "") =>
    request<DTO<"Approval">>(`/api/proposals/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ strong, confirmation }),
    }),
  execute: (id: string) =>
    request<DTO<"ExecuteResponse">>(`/api/proposals/${id}/execute`, {
      method: "POST",
    }),
  runs: (project: string) =>
    request<AgentRun[]>(`/api/projects/${project}/runs`),
  run: (id: string) => request<AgentRun>(`/api/runs/${id}`),
  job: (id: string) => request<DTO<"CapabilityJob">>(`/api/jobs/${id}`),
  timeline: (id: string) =>
    request<DTO<"StreamEvent">[]>(
      `/api/runs/${encodeURIComponent(id)}/timeline?tail=200`,
    ),
  cancel: (id: string) => request(`/api/runs/${id}/cancel`, { method: "POST" }),
  resume: (id: string) =>
    request<AgentRun>(`/api/runs/${id}/resume`, { method: "POST" }),
  bim: (project: string) =>
    request<BIMElement[]>(`/api/projects/${project}/bim/elements`),
  geo: (project: string) =>
    request<FeatureCollection>(`/api/projects/${project}/geo`),
  documents: (project: string) =>
    request<DTO<"DocumentMetadata">[]>(`/api/projects/${project}/documents`),
  chunks: (id: string) =>
    request<DocumentChunk[]>(`/api/documents/${id}/chunks`),
  search: (project: string, query: string) =>
    request<DocumentChunk[]>(
      `/api/projects/${project}/search?q=${encodeURIComponent(query)}`,
    ),
  upload: (project: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<AgentRun>(`/api/projects/${project}/documents`, {
      method: "POST",
      body,
    });
  },
  uploadIFC: (project: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<AgentRun>(`/api/projects/${project}/bim/import`, {
      method: "POST",
      body,
    });
  },
  optimizationFixture: () =>
    request<DTO<"SchedulingProblem-Output">>("/api/optimization/fixture"),
  optimize: (project: string, problem: DTO<"SchedulingProblem-Input">) =>
    request<AgentRun>(`/api/projects/${project}/optimization`, {
      method: "POST",
      body: JSON.stringify(problem),
    }),
  vision: (project: string, file: File, consent: boolean) => {
    const body = new FormData();
    body.append("file", file);
    body.append("consent", String(consent));
    return request<AgentRun>(`/api/projects/${project}/vision`, {
      method: "POST",
      body,
    });
  },
  indexDocument: (project: string, documentId: string, consent: boolean) =>
    request<AgentRun>(`/api/projects/${project}/semantic/index`, {
      method: "POST",
      body: JSON.stringify({ document_id: documentId, consent }),
    }),
  semanticSearch: (
    project: string,
    query: string,
    documentId: string,
    consent: boolean,
  ) =>
    request<DTO<"SemanticMatch">[]>(
      `/api/projects/${project}/semantic/search`,
      {
        method: "POST",
        body: JSON.stringify({
          query,
          document_id: documentId || null,
          consent,
        }),
      },
    ),
};

/** Binary downloads remain authenticated; bearer secrets are never put in URLs. */
export async function readSource(path: string): Promise<Blob> {
  const response = await fetch(apiUrl(path), { headers: requestHeaders() });
  if (!response.ok) throw new APIError(response.status, "来源文件不可用");
  return response.blob();
}
