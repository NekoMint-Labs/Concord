import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api, type DTO } from "../api/client";
import { ConcordAgent, type ConcordContext } from "./ConcordAgent";
import { useConcordAgent } from "./useConcordAgent";

vi.mock("../components/ui/AppPopover", () => ({
  AppPopover: ({
    trigger,
    children,
  }: {
    trigger: ReactNode;
    children: ReactNode;
  }) => (
    <div>
      {trigger}
      <div>{children}</div>
    </div>
  ),
  AppPopoverClose: ({ children }: { children: ReactNode }) => children,
}));

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
    options: { value: string; label: ReactNode }[];
  }) => (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

const context: ConcordContext = {
  projectName: "Campus Lab",
  sourceId: "source-1",
  sourceName: "MEP Model",
  fromRevisionId: "r1",
  fromRevisionLabel: "R1",
  revisionId: "r2",
  revisionLabel: "R2",
  workPackageId: "WP-27",
  elementIds: ["gid-1"],
};

function view() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ConcordAgent project="project" context={context} onRun={() => {}} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

it("defaults initiative to Suggest and persists an explicit mode change", async () => {
  vi.spyOn(api, "agentSettings").mockResolvedValue({ initiative: "suggest" });
  vi.spyOn(api, "agentNotices").mockResolvedValue([]);
  const configure = vi
    .spyOn(api, "setAgentSettings")
    .mockResolvedValue({ initiative: "manual" });
  view();
  fireEvent.click(screen.getByRole("button", { name: "调查方式" }));
  expect(await screen.findByLabelText("调查方式")).toHaveTextContent("建议");
  fireEvent.change(screen.getByLabelText("调查方式"), {
    target: { value: "manual" },
  });
  await waitFor(() =>
    expect(configure).toHaveBeenCalledWith("project", "manual"),
  );
});

it("keeps Ask read-only and only Investigate returns the current durable run", async () => {
  vi.spyOn(api, "agentSettings").mockResolvedValue({ initiative: "suggest" });
  vi.spyOn(api, "agentNotices").mockResolvedValue([]);
  const ask = vi.spyOn(api, "askAgent").mockResolvedValue({
    answer: {
      summary: "R2 is newer than the accepted baseline.",
      evidence_ids: [],
      limitations: [],
    },
    scope: {
      source_id: "source-1",
      from_revision_id: "r1",
      to_revision_id: "r2",
      work_package_ids: ["WP-27"],
      area_ids: [],
      element_ids: ["gid-1"],
    },
    evidence: [],
    tools: [],
    persisted: false,
  });
  const investigate = vi.spyOn(api, "investigate").mockResolvedValue({
    id: "run-current",
    project_id: "project",
    event_id: null,
    status: "QUEUED",
    runtime: "dbos",
    runtime_execution_id: null,
    generation: 1,
    runtime_generation: 1,
    category: "investigation",
    analysis_id: null,
    error: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } satisfies DTO<"AgentRun">);
  const onRun = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConcordAgent project="project" context={context} onRun={onRun} />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByPlaceholderText(/当前为什么不能施工/), {
    target: { value: "Why is this pending?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "询问" }));
  expect(await screen.findByText(/R2 is newer/)).toBeVisible();
  expect(screen.getByText(/不写入项目依据/)).toBeVisible();
  expect(ask).toHaveBeenCalledOnce();
  expect(ask).toHaveBeenCalledWith("project", {
    instruction: "Why is this pending?",
    scope: {
      source_id: "source-1",
      from_revision_id: "r1",
      to_revision_id: "r2",
      work_package_ids: ["WP-27"],
      element_ids: ["gid-1"],
    },
  });
  expect(onRun).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "保存为工程调查" }));
  await waitFor(() =>
    expect(investigate).toHaveBeenCalledWith("project", {
      instruction: "Why is this pending?",
      scope: {
        source_id: "source-1",
        from_revision_id: "r1",
        to_revision_id: "r2",
        work_package_ids: ["WP-27"],
        element_ids: ["gid-1"],
      },
    }),
  );
});

it("does not present an old run result as the current operation", () => {
  vi.spyOn(api, "agentSettings").mockResolvedValue({ initiative: "suggest" });
  vi.spyOn(api, "agentNotices").mockResolvedValue([]);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConcordAgent
        project="project"
        context={context}
        currentRun={{
          id: "run-current",
          project_id: "project",
          event_id: null,
          status: "RUNNING",
          runtime: "dbos",
          runtime_execution_id: null,
          generation: 2,
          runtime_generation: 2,
          category: "investigation",
          analysis_id: null,
          error: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        }}
        report={{
          run_id: "run-old",
          analysis_id: "analysis-old",
          generation: 1,
          persisted: true,
          answer: {
            summary: "Old failed investigation",
            evidence_ids: [],
            limitations: [],
          },
          scope: {
            source_id: null,
            from_revision_id: null,
            to_revision_id: null,
            work_package_ids: [],
            area_ids: [],
            element_ids: [],
          },
          evidence: [],
          tools: [],
        }}
        onRun={() => {}}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByText("分析中")).toBeVisible();
  expect(screen.queryByText("run-curr")).toBeNull();
  expect(screen.queryByText("Old failed investigation")).toBeNull();
});

it("uses the shared investigation launcher and the typed instruction", async () => {
  vi.spyOn(api, "agentSettings").mockResolvedValue({ initiative: "suggest" });
  vi.spyOn(api, "agentNotices").mockResolvedValue([]);
  const investigate = vi.spyOn(api, "investigate");
  const onInvestigate = vi.fn().mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConcordAgent
        project="project"
        context={context}
        onRun={vi.fn()}
        onInvestigate={onInvestigate}
      />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByPlaceholderText(/当前为什么不能施工/), {
    target: { value: "Check only this comparison" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存为工程调查" }));
  await waitFor(() =>
    expect(onInvestigate).toHaveBeenCalledWith(
      "Check only this comparison",
      context,
    ),
  );
  expect(investigate).not.toHaveBeenCalled();
});

const askResponse: DTO<"AgentResponse"> = {
  answer: { summary: "Answer for R2", evidence_ids: [], limitations: [] },
  scope: {
    source_id: "source-1",
    from_revision_id: "r1",
    to_revision_id: "r2",
    work_package_ids: ["WP-27"],
    area_ids: [],
    element_ids: ["gid-1"],
  },
  evidence: [],
  tools: [],
  persisted: false,
};

function askView() {
  vi.spyOn(api, "agentSettings").mockResolvedValue({ initiative: "suggest" });
  vi.spyOn(api, "agentNotices").mockResolvedValue([]);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const content = (next = context, project = "project") => (
    <QueryClientProvider client={cache}>
      <ConcordAgent project={project} context={next} onRun={vi.fn()} />
    </QueryClientProvider>
  );
  const result = render(content());
  const submit = () => {
    fireEvent.change(screen.getByPlaceholderText(/当前为什么不能施工/), {
      target: { value: "Explain this context" },
    });
    fireEvent.click(screen.getByRole("button", { name: "询问" }));
  };
  return { ...result, content, submit, cache };
}

it.each([
  ["project", context, "other-project"],
  ["source", { ...context, sourceId: "source-2" }, "project"],
  ["baseline", { ...context, fromRevisionId: "r0" }, "project"],
  ["revision", { ...context, revisionId: "r3" }, "project"],
  ["work package", { ...context, workPackageId: "WP-28" }, "project"],
  ["selection", { ...context, elementIds: ["gid-2"] }, "project"],
])(
  "hides a completed Ask answer when the %s changes",
  async (_field, next, project) => {
    vi.spyOn(api, "askAgent").mockResolvedValue(askResponse);
    const { submit, rerender, content, cache } = askView();
    submit();
    expect(await screen.findByText("Answer for R2")).toBeVisible();
    rerender(content(next, project));
    expect(screen.queryByText("Answer for R2")).toBeNull();
    rerender(content());
    expect(screen.queryByText("Answer for R2")).toBeNull();
    cache.clear();
  },
);

it("fences a late Ask response after leaving its submitted context", async () => {
  let finish!: (response: DTO<"AgentResponse">) => void;
  const ask = vi.spyOn(api, "askAgent").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { submit, rerender, content, cache } = askView();
  submit();
  await waitFor(() => expect(ask).toHaveBeenCalledOnce());
  expect(ask.mock.calls[0][1].scope?.to_revision_id).toBe("r2");
  rerender(content({ ...context, revisionId: "r3" }));
  await act(async () => finish(askResponse));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "询问" })).toBeEnabled(),
  );
  expect(screen.queryByText("Answer for R2")).toBeNull();
  rerender(content());
  expect(screen.queryByText("Answer for R2")).toBeNull();
  submit();
  await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
  await act(async () => finish(askResponse));
  expect(await screen.findByText("Answer for R2")).toBeVisible();
  cache.clear();
});

it("keeps Ask answers for equivalent engineering scope despite label and element-order changes", async () => {
  vi.spyOn(api, "askAgent").mockResolvedValue(askResponse);
  const { submit, rerender, content, cache } = askView();
  rerender(content({ ...context, elementIds: ["gid-1", "gid-2"] }));
  submit();
  expect(await screen.findByText("Answer for R2")).toBeVisible();
  rerender(
    content({
      ...context,
      sourceName: "Renamed model",
      revisionLabel: "New label",
      elementIds: ["gid-2", "gid-1"],
    }),
  );
  expect(screen.getByText("Answer for R2")).toBeVisible();
  cache.clear();
});

it("does not send oversized explicit selections to Ask or Investigate", async () => {
  const ask = vi.spyOn(api, "askAgent");
  const investigate = vi.spyOn(api, "investigate");
  const { submit, rerender, content, cache } = askView();
  rerender(
    content({
      ...context,
      elementIds: Array.from({ length: 201 }, (_, i) => `gid-${i}`),
    }),
  );
  submit();
  expect(screen.getByRole("button", { name: "询问" })).toBeDisabled();
  const investigation = screen.getByRole("button", { name: "保存为工程调查" });
  expect(investigation).toBeDisabled();
  fireEvent.click(investigation);
  await act(async () => {});
  expect(ask).not.toHaveBeenCalled();
  expect(investigate).not.toHaveBeenCalled();
  expect(screen.getByText(/最多.*200.*构件/)).toBeVisible();
  cache.clear();
});

it("rejects a late response even when the user returns to its original scope before resolution", async () => {
  let finish!: (response: DTO<"AgentResponse">) => void;
  const ask = vi.spyOn(api, "askAgent").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { submit, rerender, content, cache } = askView();
  submit();
  await waitFor(() => expect(ask).toHaveBeenCalledOnce());
  rerender(content({ ...context, revisionId: "r3" }));
  rerender(content());
  await act(async () => finish(askResponse));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "询问" })).toBeEnabled(),
  );
  expect(screen.queryByText("Answer for R2")).toBeNull();
  cache.clear();
});

it.each(["before", "after"])(
  "does not display an Ask failure that resolves %s leaving its context",
  async (timing) => {
    let reject!: (error: Error) => void;
    const ask = vi.spyOn(api, "askAgent").mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    const { submit, rerender, content, cache } = askView();
    submit();
    await waitFor(() => expect(ask).toHaveBeenCalledOnce());
    if (timing === "after") rerender(content({ ...context, revisionId: "r3" }));
    await act(async () => reject(new Error("Ask failed in R2")));
    if (timing === "before") {
      expect(await screen.findByText("暂时无法回答，请重试。")).toBeVisible();
      rerender(content({ ...context, revisionId: "r3" }));
    } else {
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "询问" })).toBeEnabled(),
      );
    }
    expect(screen.queryByText("暂时无法回答，请重试。")).toBeNull();
    cache.clear();
  },
);

it("allows Ask in the new context while the previous request is pending and preserves the new answer", async () => {
  let finishA!: (response: DTO<"AgentResponse">) => void;
  const ask = vi
    .spyOn(api, "askAgent")
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishA = resolve;
        }),
    )
    .mockResolvedValueOnce({
      ...askResponse,
      answer: { ...askResponse.answer, summary: "Answer for R3" },
    });
  const { submit, rerender, content, cache } = askView();
  submit();
  await waitFor(() => expect(ask).toHaveBeenCalledOnce());
  rerender(content({ ...context, revisionId: "r3" }));
  expect(screen.getByRole("button", { name: "询问" })).toBeEnabled();
  submit();
  expect(await screen.findByText("Answer for R3")).toBeVisible();
  await act(async () => finishA(askResponse));
  expect(screen.getByText("Answer for R3")).toBeVisible();
  expect(screen.queryByText("Answer for R2")).toBeNull();
  expect(ask.mock.calls[1][1].scope?.to_revision_id).toBe("r3");
  cache.clear();
});

it("the header stops presenting an R2 Investigation after navigation while its historical report stays inspectable", async () => {
  vi.spyOn(api, "agentSettings").mockResolvedValue({ initiative: "suggest" });
  vi.spyOn(api, "agentNotices").mockResolvedValue([]);
  const completed: DTO<"AgentRun"> = {
    id: "completed-r2",
    project_id: "project",
    category: "investigation",
    event_id: null,
    status: "COMPLETED",
    runtime: "dbos",
    runtime_execution_id: null,
    generation: 0,
    runtime_generation: 0,
    analysis_id: "analysis-r2",
    error: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
  const report = {
    ...askResponse,
    run_id: completed.id,
    analysis_id: completed.analysis_id!,
    generation: 0,
    persisted: true,
  };
  vi.spyOn(api, "runs").mockResolvedValue([completed]);
  vi.spyOn(api, "run").mockResolvedValue(completed);
  vi.spyOn(api, "investigate").mockResolvedValue(completed);
  vi.spyOn(api, "investigation").mockResolvedValue(report);
  vi.spyOn(api, "sourceRevisions").mockResolvedValue([]);
  let agent!: ReturnType<typeof useConcordAgent>;
  function Header() {
    agent = useConcordAgent({
      project: "project",
      projectName: "Project",
      workPackageId: "WP-27",
    });
    return (
      <>
        <ConcordAgent
          project="project"
          context={agent.context}
          currentRun={agent.contextualRun}
          report={agent.contextualReport}
          onRun={agent.rememberRun}
          onInvestigate={agent.startInvestigation}
        />
        <aside aria-label="Historical investigation">
          {agent.investigation.data?.answer.summary}{" "}
          {agent.reportContext.revisionId}
        </aside>
      </>
    );
  }
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <Header />
    </QueryClientProvider>,
  );
  act(() => agent.bimContext("source-1", "r2", ["gid-1"], "r1"));
  fireEvent.click(screen.getByRole("button", { name: "检查 1 个已选构件" }));
  expect(await screen.findByText("Concord 调查状态")).toBeVisible();
  await waitFor(() =>
    expect(screen.getAllByText(/Answer for R2/)).toHaveLength(2),
  );
  act(() => agent.bimContext("source-1", "r3", ["gid-1"], "r2"));
  expect(screen.queryByText("Concord 调查状态")).toBeNull();
  expect(screen.getByLabelText("Historical investigation")).toHaveTextContent(
    "Answer for R2 r2",
  );
  act(() => agent.bimContext("source-1", "r2", ["gid-1"], "r1"));
  expect(screen.queryByText("Concord 调查状态")).toBeNull();
  cache.clear();
});

it.each([false, true])(
  "header retry preserves only its original context visit (navigate during retry: %s)",
  async (navigate) => {
    vi.spyOn(api, "agentSettings").mockResolvedValue({ initiative: "suggest" });
    vi.spyOn(api, "agentNotices").mockResolvedValue([]);
    const failed: DTO<"AgentRun"> = {
      id: "failed-r2",
      project_id: "project",
      category: "investigation",
      event_id: null,
      status: "FAILED",
      runtime: "dbos",
      runtime_execution_id: null,
      generation: 0,
      runtime_generation: 0,
      analysis_id: null,
      error: "Failed",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    vi.spyOn(api, "runs").mockResolvedValue([]);
    vi.spyOn(api, "run").mockResolvedValue(failed);
    vi.spyOn(api, "investigate").mockResolvedValue(failed);
    vi.spyOn(api, "investigation").mockResolvedValue(null);
    let finish!: (run: DTO<"AgentRun">) => void;
    const resume = vi.spyOn(api, "resume").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    let agent!: ReturnType<typeof useConcordAgent>;
    function Header() {
      agent = useConcordAgent({ project: "project", projectName: "Project" });
      return (
        <ConcordAgent
          project="project"
          context={agent.context}
          currentRun={agent.contextualRun}
          report={agent.contextualReport}
          onRun={agent.rememberRun}
          onInvestigate={agent.startInvestigation}
        />
      );
    }
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={cache}>
        <Header />
      </QueryClientProvider>,
    );
    act(() => agent.bimContext("source", "r2", ["gid"]));
    fireEvent.click(screen.getByRole("button", { name: "检查 1 个已选构件" }));
    fireEvent.click(await screen.findByRole("button", { name: "重试调查" }));
    await waitFor(() => expect(resume).toHaveBeenCalledWith(failed.id));
    if (navigate) {
      act(() => agent.bimContext("source", "r3", ["gid"]));
      act(() => agent.bimContext("source", "r2", ["gid"]));
    }
    await act(async () => finish(failed));
    await waitFor(() => expect(agent.pending).toBe(false));
    if (navigate) expect(screen.queryByText("Concord 调查状态")).toBeNull();
    else expect(screen.getByText("Concord 调查状态")).toBeVisible();
    expect(agent.currentRun.data?.id).toBe(failed.id);
    cache.clear();
  },
);
