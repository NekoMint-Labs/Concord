import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Table } from "@thatopen/ui";
import { donorText } from "../../tests/donor-dom";
import { api } from "../api/client";
import { statusLabel } from "../ui/labels";
import { Capabilities } from "./Capabilities";

afterEach(() => vi.restoreAllMocks());

it("renders capability status and diagnostics through real donor cells", async () => {
  vi.spyOn(api, "profile").mockResolvedValue({
    profile: "local",
    runtime: "local",
    reasoning: "offline",
    storage: "local",
    database: "local",
    simulation: false,
    authentication: "local",
  });
  vi.spyOn(api, "capabilities").mockResolvedValue({
    capabilities: [
      {
        name: "document parser",
        implementation: "LightweightDocumentParser",
        status: "enabled",
        enabled: true,
        dependency_available: true,
        credential_present: null,
        service_reachable: null,
        reason: "Local text/Markdown parsing",
        version: null,
      },
    ],
  });
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={cache}>
      <Capabilities />
    </QueryClientProvider>,
  );
  const table = view.container.querySelector<Table>("bim-table")!;
  expect(table).toBeInstanceOf(customElements.get("bim-table")!);
  await waitFor(() => {
    expect(table.data).toHaveLength(1);
    expect(donorText("文档解析", table)).toBeDefined();
    expect(donorText(statusLabel("enabled"), table)).toBeDefined();
    expect(
      donorText("本地文本与 Markdown 解析 · 尚未探测外部服务连通性", table),
    ).toBeDefined();
  });
  expect(table.hiddenColumns).toContain("状态");
  expect(table.data[0].id).toBe("document parser");
  expect(
    donorText(statusLabel("enabled"), table)?.getAttribute("data-status"),
  ).toBe("enabled");
  expect(api.capabilities).toHaveBeenCalledWith(false);
});
