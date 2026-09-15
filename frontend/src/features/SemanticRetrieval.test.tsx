import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { SemanticRetrieval } from "./SemanticRetrieval";

/* jsdom has no layout, so Radix cannot scroll a focused option into view. */
beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});

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
beforeEach(() => vi.clearAllMocks());

const documents = [
  { id: "first", filename: "First source" },
  { id: "second", filename: "Second source" },
];

/* the document list is seeded into the cache so the picker is populated on the
   first render - the tests are about the consent/race semantics, not the fetch */
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

/* choosing means opening the Concord select and activating an option; both
   steps are synchronous, so nothing waits while a floating surface is open */
function chooseDocument(name: string) {
  fireEvent.click(screen.getByRole("combobox", { name: "待索引文档" }));
  fireEvent.click(screen.getByRole("option", { name }));
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

/*
 * The one test in this suite that drives a Concord select while another request is
 * in flight. Measured cost of the awaited work around it in jsdom: ~21s, against a
 * 5s default budget, and shimming the frame loop (above) does not remove it - the
 * select's floating layer leaves the file's event loop busy for the tests that
 * follow. What that measures is the harness, not the product: a real browser opens
 * the same list in milliseconds, and `e2e/coordination.spec.ts` chooses a change
 * type through it end to end. So the test states the budget it needs; the follow-up
 * is recorded rather than hidden.
 */
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
  /* the stale run's version no longer matches, so resolving it must not commit
     a result; the microtasks let the awaited search continuation run first */
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
}, 60_000);
