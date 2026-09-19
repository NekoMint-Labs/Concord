import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../../tests/fixtures/inspector.json";
import { api, type AgentRun } from "../api/client";
import BIMWorkspace from "./BIMWorkspace";

vi.mock("./IFCViewer", () => ({
  default: ({ file }: { file: File }) => <div>Local viewer: {file.name}</div>,
}));
afterEach(() => vi.restoreAllMocks());

function view() {
  vi.spyOn(api, "bim").mockResolvedValue([]);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const result = render(
    <QueryClientProvider client={cache}>
      <BIMWorkspace project="harbor-east" impacted={[]} />
    </QueryClientProvider>,
  );
  return { ...result, cache };
}

it("a local IFC stays local and overlapping import clicks submit only once", async () => {
  const run = {
    ...fixture.waiting.run,
    generation: 0,
    category: "bim_import",
    status: "COMPLETED",
  } as AgentRun;
  let finish!: (value: AgentRun) => void;
  vi.spyOn(api, "uploadIFC").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  vi.spyOn(api, "run").mockResolvedValue(run);
  const { unmount, cache } = view();
  fireEvent.change(screen.getByLabelText("本地 IFC 文件"), {
    target: { files: [new File(["IFC fixture"], "fixture.ifc")] },
  });
  await screen.findByText("Local viewer: fixture.ifc");
  expect(api.uploadIFC).not.toHaveBeenCalled();
  const submit = screen.getByRole("button", { name: "导入项目" });
  fireEvent.click(submit);
  fireEvent.click(submit);
  expect(api.uploadIFC).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("本地 IFC 文件")).toBeDisabled();
  await act(async () => {
    finish(run);
  });
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("已完成"),
  );
  await waitFor(() => expect(api.bim).toHaveBeenCalledTimes(2));
  unmount();
  cache.clear();
});

it("rejecting a new oversized file clears the previous import target", async () => {
  const { unmount, cache } = view();
  fireEvent.change(screen.getByLabelText("本地 IFC 文件"), {
    target: { files: [new File(["IFC"], "first.ifc")] },
  });
  await screen.findByText("Local viewer: first.ifc");
  const tooLarge = new File(["x"], "too-large.ifc");
  Object.defineProperty(tooLarge, "size", { value: 26 * 1024 * 1024 });
  fireEvent.change(screen.getByLabelText("本地 IFC 文件"), {
    target: { files: [tooLarge] },
  });
  expect(screen.getByRole("alert")).toHaveTextContent("25 MiB");
  expect(
    screen.queryByRole("button", { name: "导入项目" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("Local viewer: first.ifc")).not.toBeInTheDocument();
  unmount();
  cache.clear();
});

it("renders the full condition set as labelled rows, never as JSON source", async () => {
  vi.spyOn(api, "bim").mockResolvedValue([
    {
      id: "2O2Fr$t4X7Zf8NOew3FL9r",
      name: "East core wall",
      type: "IfcWall",
      storey: "L02-E",
      space: "L02-E-ZONE",
      revision: "V16",
      ifc_schema: null,
      related_ids: [],
      properties: {
        FireRating: "120 min",
        Width: 0.2,
        ChangeStatus: "baseline",
        WorkPackageIds: ["WP-100", "WP-200"],
      },
    },
  ]);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const { unmount } = render(
    <QueryClientProvider client={cache}>
      <BIMWorkspace project="harbor-east" impacted={[]} />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByText("East core wall"));
  fireEvent.click(screen.getByRole("button", { name: "全部属性" }));
  expect(await screen.findByText("防火等级")).toBeInTheDocument();
  expect(screen.getByText("120 min")).toBeInTheDocument();
  expect(screen.getByText("0.2 m")).toBeInTheDocument();
  expect(screen.getByText("基线")).toBeInTheDocument();
  expect(screen.getByText("WP-100、WP-200")).toBeInTheDocument();
  // The disclosure is a property sheet, not a dumped record.
  expect(document.querySelector(".bim-properties pre")).toBeNull();
  unmount();
  cache.clear();
});
