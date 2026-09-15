import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { Operations } from "./Operations";

const mocks = vi.hoisted(() => ({ vision: vi.fn() }));
vi.mock("../api/client", () => ({
  api: {
    capabilities: async () => ({
      capabilities: [{ name: "vision", status: "enabled" }],
    }),
    optimizationFixture: async () => ({ tasks: [], crews: [] }),
    runs: async () => [],
    documents: async () => [],
    vision: mocks.vision,
  },
}));
beforeEach(() => vi.clearAllMocks());

it("changing the selected image requires renewed cloud disclosure consent", async () => {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <Operations
        project="harbor-east"
        perform={async (fn) => {
          await fn();
        }}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByText("图像观察 / 已配置的视觉模型"));
  const image = screen.getByLabelText("视觉图像");
  const consent = screen.getByRole("checkbox", { name: /已净化的图像/ });
  const analyze = screen.getByRole("button", { name: "分析图像" });
  fireEvent.change(image, {
    target: {
      files: [new File(["first"], "first.png", { type: "image/png" })],
    },
  });
  fireEvent.click(consent);
  await waitFor(() => expect(analyze).toBeEnabled());
  fireEvent.change(image, {
    target: {
      files: [new File(["second"], "second.png", { type: "image/png" })],
    },
  });
  expect(consent).not.toBeChecked();
  expect(analyze).toBeDisabled();
  expect(mocks.vision).not.toHaveBeenCalled();
});
