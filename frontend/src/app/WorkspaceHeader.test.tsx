import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import fixture from "../../tests/fixtures/inspector.json";
import type { Workspace } from "../api/client";
import { WorkspaceHeader } from "./WorkspaceHeader";

it("carries project and location context without repeating the work package", () => {
  const data = structuredClone(fixture.waiting) as unknown as Workspace;
  const wp = data.state.work_packages.find((item) => item.id === "WP-200")!;
  render(<WorkspaceHeader data={data} wp={wp} />);

  expect(screen.getByText("Harbor East / Building A")).toBeVisible();
  expect(screen.getByText("L02 东翼")).toBeVisible();
  expect(screen.getByText("WP-200")).toBeVisible();

  // Title, status, and actions belong to the coordination workspace.
  expect(
    screen.queryByText("East-wing duct installation"),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("就绪")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /重新检查/ }),
  ).not.toBeInTheDocument();
});
