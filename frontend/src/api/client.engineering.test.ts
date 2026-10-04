import { afterEach, expect, it, vi } from "vitest";
import { api, APIError, setToken, type FindingDecision } from "./client";

afterEach(() => vi.unstubAllGlobals());

it("uses authenticated, project-scoped engineering routes and generated request bodies", async () => {
  const response = { server: "authoritative" };
  const fetch = vi.fn().mockImplementation(
    async () =>
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetch);
  setToken("engineering-test");
  const decision: FindingDecision = {
    decision: "CLOSED",
    note: "Verified all dependencies",
    recheck_id: "check/one",
  };
  const operations = [
    [() => api.engineeringFindings("p/one"), "findings", undefined],
    [
      () => api.engineeringFinding("p/one", "f/one"),
      "findings/f%2Fone",
      undefined,
    ],
    [
      () => api.engineeringEvidence("p/one", "e/one"),
      "evidence/e%2Fone",
      undefined,
    ],
    [
      () => api.engineeringDecision("p/one", "f/one", decision),
      "findings/f%2Fone/decisions",
      decision,
    ],
    [
      () => api.engineeringCoordination("p/one", "f/one"),
      "findings/f%2Fone/coordination",
      undefined,
    ],
    [
      () => api.engineeringRechecks("p/one", "f/one"),
      "findings/f%2Fone/rechecks",
      undefined,
    ],
    [
      () =>
        api.requestEngineeringRechecks("p/one", "f/one", {
          operation_id: "retry-id",
        }),
      "findings/f%2Fone/rechecks",
      { operation_id: "retry-id" },
    ],
  ] as const;
  for (const [operation, route, body] of operations) {
    expect(await operation()).toEqual(response);
    const [path, init] = fetch.mock.lastCall!;
    expect(path).toBe(`/api/projects/p%2Fone/engineering/${route}`);
    expect(init.headers.get("Authorization")).toBe("Bearer engineering-test");
    expect(init.method).toBe(body ? "POST" : undefined);
    expect(init.body).toBe(body ? JSON.stringify(body) : undefined);
    if (body) expect(init.headers.get("Content-Type")).toBe("application/json");
  }
});

it.each([401, 403, 404, 409, 422])(
  "preserves engineering rejection status %s and server message",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: "Current evidence cannot authorize closure",
            code: "stale",
          }),
          { status },
        ),
      ),
    );
    await expect(
      api.engineeringDecision("p", "f", { decision: "CLOSED" }),
    ).rejects.toMatchObject({
      name: "APIError",
      status,
      code: "stale",
      message: "Current evidence cannot authorize closure",
    } satisfies Partial<APIError>);
  },
);
