/** Lifecycle contracts use a MapLibre seam; Playwright runs real WebGL separately. */
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api/client";
import GISWorkspace from "./GISWorkspace";

const driver = vi.hoisted(() => ({
  instances: [] as {
    remove: ReturnType<typeof vi.fn>;
    handlers: Record<string, (...args: unknown[]) => void>;
    setPaintProperty: ReturnType<typeof vi.fn>;
  }[],
  options: [] as Record<string, unknown>[],
  failControl: false,
}));
vi.mock("maplibre-gl", () => ({
  default: {
    Map: class {
      handlers: Record<string, (...args: unknown[]) => void> = {};
      remove = vi.fn();
      setPaintProperty = vi.fn();
      constructor(options?: Record<string, unknown>) {
        driver.options.push(options ?? {});
        driver.instances.push(this);
      }
      addControl() {
        if (driver.failControl)
          throw new Error("Control initialization failed");
      }
      on(
        name: string,
        layerOrCallback: string | ((...args: unknown[]) => void),
        callback?: (...args: unknown[]) => void,
      ) {
        this.handlers[name] =
          typeof layerOrCallback === "function" ? layerOrCallback : callback!;
      }
      addSource() {}
      addLayer() {}
      resize() {}
      getLayer() {
        return {};
      }
    },
    NavigationControl: class {},
    Popup: class {
      setLngLat() {
        return this;
      }
      setText() {
        return this;
      }
      addTo() {
        return this;
      }
    },
  },
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  driver.instances.length = 0;
  driver.options.length = 0;
  driver.failControl = false;
});

function view() {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(api, "geo").mockResolvedValue({
    type: "FeatureCollection",
    features: [],
  });
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const selected = vi.fn();
  const result = render(
    <QueryClientProvider client={cache}>
      <GISWorkspace
        project="harbor-east"
        selected="WP-200"
        onSelected={selected}
      />
    </QueryClientProvider>,
  );
  return { ...result, cache, selected };
}

it("removes a partially constructed map when a later setup step fails", async () => {
  driver.failControl = true;
  const { unmount, cache } = view();
  await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
    "Control initialization failed",
  );
  expect(driver.instances[0].remove).toHaveBeenCalledTimes(1);
  unmount();
  cache.clear();
});

it("selects linked work packages and removes its map on unmount", async () => {
  const { unmount, cache, selected } = view();
  await waitFor(() => expect(driver.instances).toHaveLength(1));
  const map = driver.instances[0];
  await act(async () => {
    map.handlers.load();
  });
  expect(screen.getByRole("status")).toHaveTextContent("地图已就绪");
  expect(map.setPaintProperty).toHaveBeenCalled();
  act(() => {
    map.handlers.click({
      features: [{ properties: { work_package_id: "WP-300" } }],
      lngLat: [0, 0],
    });
  });
  expect(selected).toHaveBeenCalledWith("WP-300");
  unmount();
  cache.clear();
  expect(map.remove).toHaveBeenCalledTimes(1);
  act(() => {
    map.handlers.load();
  });
  expect(map.remove).toHaveBeenCalledTimes(1);
});

it("presents the site map as product copy with context and a MapLibre locale patch", async () => {
  const { unmount, cache } = view();
  await waitFor(() => expect(driver.instances).toHaveLength(1));
  await act(async () => {
    driver.instances[0].handlers.load();
  });
  // Toolbar: user copy, not developer copy.
  expect(screen.getByText("现场地图")).toBeInTheDocument();
  expect(screen.getByText("项目现场与工作包位置")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("地图已就绪");
  // Minimum context: what the polygon and the points are.
  expect(screen.getByText("作业区域")).toBeInTheDocument();
  expect(screen.getByText("工作包位置")).toBeInTheDocument();
  // The current work package, localized for the deterministic fixture.
  expect(screen.getByText("当前工作包")).toBeInTheDocument();
  expect(screen.getByText("WP-200")).toBeInTheDocument();
  expect(screen.getByText("东翼风管安装")).toBeInTheDocument();
  // MapLibre's own controls and accessibility names are patched, not replaced.
  expect(driver.options[0]).toMatchObject({
    locale: {
      "Map.Title": expect.any(String),
      "NavigationControl.ZoomIn": expect.any(String),
      "NavigationControl.ZoomOut": expect.any(String),
      "NavigationControl.ResetBearing": expect.any(String),
      "Popup.Close": expect.any(String),
    },
  });
  unmount();
  cache.clear();
});
