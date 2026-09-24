import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it } from "vitest";
import fixture from "../../tests/fixtures/inspector.json";
import type { Workspace } from "../api/client";
import { WorkspaceHeader } from "./WorkspaceHeader";

it("carries project and location context without repeating the work package", () => {
  const data = structuredClone(fixture.waiting) as unknown as Workspace;
  const wp = data.state.work_packages.find((item) => item.id === "WP-200")!;
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <WorkspaceHeader data={data} wp={wp} />
    </QueryClientProvider>,
  );

  expect(screen.queryByText("A 栋项目")).not.toBeInTheDocument();
  expect(screen.getByText("东翼风管安装")).toBeVisible();
  expect(screen.getByText("L02 东翼")).toBeVisible();
  expect(screen.queryByText("WP-200")).not.toBeInTheDocument();

  // Title, status, and actions belong to the coordination workspace.
  expect(
    screen.queryByText("East-wing duct installation"),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("就绪")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /重新检查/ }),
  ).not.toBeInTheDocument();
});
