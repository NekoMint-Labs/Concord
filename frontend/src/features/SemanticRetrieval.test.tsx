import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { SemanticRetrieval } from "./SemanticRetrieval";

const mocks = vi.hoisted(() => ({ semanticSearch: vi.fn() }));
vi.mock("../api/client", () => ({
  api: {
    documents: async () => [
      { id: "first", filename: "First source" },
      { id: "second", filename: "Second source" },
    ],
    semanticSearch: mocks.semanticSearch,
  },
}));

/* Consent and stale-result handling are ours; the floating select is browser-covered. */
vi.mock("../components/ui/AppSelect", () => ({
  AppSelect: ({
    label,
    value,
    onChange,
    options,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
  }) => (
    <select
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

beforeEach(() => vi.clearAllMocks());

const documents = [
  { id: "first", filename: "First source" },
  { id: "second", filename: "Second source" },
];

/* The document list is seeded into the cache: these tests cover state, not fetch. */
function setup() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  cache.setQueryData(["documents", "harbor-east"], documents);
  render(
    <QueryClientProvider client={cache}>
      <SemanticRetrieval
        project="harbor-east"
        enabled
        perform={async (fn) => {
          await fn();
        }}
        onRun={() => {}}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByText("派生向量检索 / PostgreSQL"));
}

function chooseDocument(name: string) {
  const select = screen.getByRole("combobox", { name: "待索引文档" });
  const option = screen.getByRole("option", { name }) as HTMLOptionElement;
  fireEvent.change(select, { target: { value: option.value } });
}

it("changing source or query clears the previous disclosure consent", () => {
  setup();
  const consent = screen.getByRole("checkbox");
  fireEvent.click(consent);
  chooseDocument("Second source");
  expect(consent).not.toBeChecked();
  fireEvent.click(consent);
  fireEvent.change(screen.getByLabelText("语义查询"), {
    target: { value: "different text" },
  });
  expect(consent).not.toBeChecked();
});

it("a late result for an old source cannot appear under the new source", async () => {
  let finish!: (value: unknown[]) => void;
  mocks.semanticSearch.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  setup();
  fireEvent.change(screen.getByLabelText("语义查询"), {
    target: { value: "duct evidence" },
  });
  fireEvent.click(screen.getByRole("button", { name: "搜索向量" }));
  expect(mocks.semanticSearch).toHaveBeenCalledTimes(1);
  chooseDocument("Second source");
  /* The stale run's version no longer matches, so resolution cannot commit it. */
  finish([
    {
      chunk_id: "old",
      text: "OLD SOURCE RESULT",
      score: 0.9,
      model: "test",
      model_version: "v1",
      source_hash: "123456789012",
      test_only: true,
    },
  ]);
  await Promise.resolve();
  await Promise.resolve();
  expect(screen.queryByText("OLD SOURCE RESULT")).toBeNull();
});
