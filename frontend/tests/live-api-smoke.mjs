/** Actual production TypeScript client -> real HTTP backend, not a React/browser test. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const endpoint = new URL(process.env.CCA_SMOKE_ENDPOINT ?? "");
assert.equal(endpoint.protocol, "http:");
assert.equal(endpoint.hostname, "127.0.0.1");
assert.ok(
  endpoint.port &&
    !endpoint.username &&
    !endpoint.password &&
    !endpoint.search &&
    !endpoint.hash,
);
assert.equal(endpoint.pathname, "/");
const token = process.env.CCA_SMOKE_TOKEN;
assert.ok(token?.length >= 32);
// Only browser-global/relative-URL compatibility is supplied. Every fetch uses
// Node's real HTTP implementation; no API response or SDK behavior is mocked.
const actualFetch = globalThis.fetch;
globalThis.location = { hostname: endpoint.hostname };
globalThis.window = {};
const storage = new Map();
globalThis.sessionStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
};
globalThis.fetch = (url, init = {}) => {
  const resolved = new URL(url, endpoint);
  assert.equal(
    resolved.origin,
    endpoint.origin,
    "This fixture may call only its isolated API",
  );
  return actualFetch(resolved, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(10000),
  });
};
const { api, APIError, request, requestHeaders, readSource, setToken } =
  await import("../src/api/client.ts");
const { readRunEvents } = await import("../src/api/sse.ts");
setToken(token);
const project = "harbor-east";
const checks = [];
async function waitFor(read, predicate) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const value = await read();
    if (predicate(value)) return value;
    await delay(75);
  }
  throw new Error("Actual API did not reach the expected state");
}
async function event(change, kind = "design_revision", wp = "WP-200") {
  return api.events(project, {
    id: randomUUID(),
    project_id: project,
    work_package_id: wp,
    kind,
    title: "Production-client HTTP fixture",
    change,
  });
}
async function waiting(run) {
  await waitFor(
    () => api.run(run.id),
    (value) => value.status === "WAITING_APPROVAL",
  );
  return api.workspace(project);
}
const profile = await api.profile();
assert.equal(profile.runtime, process.env.CCA_SMOKE_RUNTIME);
assert.ok((await api.projects()).some((value) => value.id === project));
await waitFor(
  () => api.workspace(project),
  (value) =>
    value.analysis && !value.stale && value.run?.status === "COMPLETED",
);
checks.push("real-client-authenticated-profile-and-projects");
const submitted = {
  id: randomUUID(),
  project_id: project,
  work_package_id: "WP-200",
  kind: "design_revision",
  title: "Production client V17",
  change: { revision: "V17" },
};
const run = await api.events(project, submitted);
const before = await waiting(run);
assert.ok(before.analysis.evidence.length);
assert.equal(
  before.analysis.readiness.find((value) => value.work_package_id === "WP-200")
    .status,
  "BLOCKED",
);
assert.equal((await api.events(project, submitted)).id, run.id);
assert.equal(
  (await api.workspace(project)).state.version,
  before.state.version,
);
checks.push("json-event-retry-and-blocking-evidence");
const proposal = before.proposals.find(
  (value) => value.work_package_id === "WP-200",
);
await assert.rejects(
  api.execute(proposal.id),
  (value) => value instanceof APIError && value.status === 403,
);
const approval = await api.approve(proposal.id);
assert.equal((await api.approve(proposal.id)).id, approval.id);
await api.execute(proposal.id);
await waitFor(
  () => api.run(run.id),
  (value) => value.status === "COMPLETED",
);
const after = await api.workspace(project);
assert.notEqual(after.analysis.snapshot.id, before.analysis.snapshot.id);
assert.equal(after.analysis.snapshot.version, after.state.version);
assert.equal(
  after.analysis.readiness.find((value) => value.work_package_id === "WP-200")
    .status,
  "READY",
);
const receipt = await request(`/api/operations/${proposal.operation_id}`);
assert.equal((await api.execute(proposal.id)).queued, false);
assert.deepEqual(
  await request(`/api/operations/${proposal.operation_id}`),
  receipt,
);
assert.equal(
  (await api.workspace(project)).state.version,
  receipt.after_version,
);
checks.push("approval-idempotency-receipt-and-fresh-recheck");
const frames = [];
const streamErrors = [];
await readRunEvents(`/api/runs/${run.id}/events`, {
  headers: requestHeaders(),
  signal: AbortSignal.timeout(15000),
  maxReconnects: 0,
  onEvent: (value) => frames.push(value),
  onError: (value) => streamErrors.push(value),
});
assert.deepEqual(streamErrors, []);
assert.ok(frames.some((value) => value.data.type === "RUN_FINISHED"));
assert.ok(frames.some((value) => value.data.type === "STATE_SNAPSHOT"));
assert.equal(new Set(frames.map((value) => value.id)).size, frames.length);
assert.ok(
  frames.every((value, index) => !index || value.id > frames[index - 1].id),
);
checks.push("production-sse-decoder-over-real-http");
const crewRun = await event({ available_workers: 1 }, "workforce", "WP-300");
const crew = await waiting(crewRun);
const crewProposal = crew.proposals.find(
  (value) => value.work_package_id === "WP-300",
);
await api.approve(crewProposal.id);
await api.execute(crewProposal.id);
await waitFor(
  () => api.run(crewRun.id),
  (value) => value.status === "COMPLETED",
);
assert.equal(
  (await api.workspace(project)).analysis.readiness.find(
    (value) => value.work_package_id === "WP-300",
  ).status,
  "READY",
);
checks.push("second-workforce-coordination-path");
const content =
  "# Evidence\nnode-production-client-evidence\nUnicode: \u5de5\u7a0b\u534f\u8c03";
const uploaded = await api.upload(
  project,
  new File([content], "node-evidence.md", { type: "text/markdown" }),
);
await waitFor(
  () => api.run(uploaded.id),
  (value) => value.status === "COMPLETED",
);
const job = await api.job(uploaded.id);
assert.equal(
  job.result.content_hash,
  createHash("sha256").update(content).digest("hex"),
);
assert.ok(
  (await api.documents(project)).some(
    (value) => value.id === job.request.document_id,
  ),
);
assert.ok(
  (await api.chunks(job.request.document_id)).some((value) =>
    value.text.includes("\u5de5\u7a0b\u534f\u8c03"),
  ),
);
assert.ok(
  (await api.search(project, "node-production-client-evidence")).length,
);
assert.equal(
  await (
    await readSource(`/api/documents/${job.request.document_id}/content`)
  ).text(),
  content,
);
checks.push("real-multipart-unicode-fts-and-authenticated-binary-download");
assert.ok((await api.bim(project)).length);
assert.equal((await api.geo(project)).type, "FeatureCollection");
checks.push("structured-bim-and-geojson-api-contracts");
setToken("local-demo-viewer");
assert.ok((await api.projects()).length);
await assert.rejects(
  api.recheck(project),
  (value) => value instanceof APIError && value.status === 403,
);
setToken(token);
checks.push("viewer-read-access-and-mutation-denial");
const oldRun = await event({ revision: "V18" });
const old = await waiting(oldRun);
const oldProposal = old.proposals.find(
  (value) => value.work_package_id === "WP-200",
);
await event({ revision: "V19" });
await assert.rejects(
  api.approve(oldProposal.id),
  (value) => value instanceof APIError && value.status === 409,
);
checks.push("stale-snapshot-error-through-production-client");
console.log(
  JSON.stringify(
    {
      status: "PASS",
      runtime: profile.runtime,
      checks,
      scope:
        "Unmodified production client.ts and sse.ts with a real HTTP backend; not React rendering or browser E2E",
    },
    null,
    2,
  ),
);
