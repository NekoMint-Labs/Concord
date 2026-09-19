import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { useProjectLifecycle } from "./useProjectLifecycle";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })
      }
    >
      {children}
    </QueryClientProvider>
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

it("restores and switches real persisted projects through a client preference", async () => {
  localStorage.setItem("concord:last-project", "campus-lab");
  vi.spyOn(api, "projects").mockResolvedValue([
    {
      id: "harbor-east",
      name: "Harbor East",
      description: "Demo",
      timezone: "UTC",
    },
    {
      id: "campus-lab",
      name: "Campus Lab",
      description: "Pilot",
      timezone: "Asia/Shanghai",
    },
    {
      id: "hospital",
      name: "Hospital",
      description: "",
      timezone: "UTC",
    },
  ]);
  const { result } = renderHook(useProjectLifecycle, { wrapper });

  await waitFor(() => expect(result.current.projects.isSuccess).toBe(true));
  expect(result.current.project).toBe("campus-lab");
  act(() => result.current.openProject("hospital"));
  expect(result.current.project).toBe("hospital");
  expect(localStorage.getItem("concord:last-project")).toBe("hospital");
});

it("does not silently open the demo when no user project exists", async () => {
  vi.spyOn(api, "projects").mockResolvedValue([
    {
      id: "harbor-east",
      name: "Harbor East",
      description: "Demo",
      timezone: "UTC",
    },
  ]);
  const { result } = renderHook(useProjectLifecycle, { wrapper });
  await waitFor(() => expect(result.current.projects.isSuccess).toBe(true));
  expect(result.current.project).toBe("");
});
