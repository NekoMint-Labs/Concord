import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type AgentRun, type DTO } from "../api/client";
import { Button } from "../components/ui/button";
import { RunHistory } from "./RunHistory";
import { SemanticRetrieval } from "./SemanticRetrieval";

export function Operations({
  project,
  perform,
}: {
  project: string;
  perform: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [problem, setProblem] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [preferredRun, setPreferredRun] = useState("");
  const [busy, setBusy] = useState(false);
  const capabilities = useQuery({
    queryKey: ["capabilities", false],
    queryFn: () => api.capabilities(),
  });
  const fixture = useQuery({
    queryKey: ["scheduling-fixture"],
    queryFn: api.optimizationFixture,
  });
  const enabled = (name: string) =>
    capabilities.data?.capabilities.find((item) => item.name === name)
      ?.status === "enabled";
  async function submit(operation: () => Promise<AgentRun>) {
    setBusy(true);
    try {
      await perform(async () => {
        const run = await operation();
        setPreferredRun(run.id);
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="content-view operations-view">
      <div className="view-heading">
        <div>
          <h2>Operations & run history</h2>
        </div>
      </div>
      <p className="muted">
        All jobs use the selected runtime. Results do not automatically change
        schedules, grant permissions, or issue safety decisions.
      </p>
      <details className="operation-form" open>
        <summary>Constrained scheduling / OR-Tools</summary>
        <p>
          Fixture: qualified crews, shared equipment, precedence, time windows
          and minimum makespan. Server validation independently checks the
          returned assignments.
        </p>
        <textarea
          aria-label="Scheduling problem JSON"
          rows={8}
          value={
            problem ||
            (fixture.data ? JSON.stringify(fixture.data, null, 2) : "")
          }
          onChange={(event) => setProblem(event.target.value)}
        />
        <Button
          disabled={busy || !enabled("optimization") || !fixture.data}
          onClick={() =>
            void submit(() =>
              api.optimize(
                project,
                JSON.parse(
                  problem || JSON.stringify(fixture.data),
                ) as DTO<"SchedulingProblem-Input">,
              ),
            )
          }
        >
          Solve schedule
        </Button>
        {!enabled("optimization") && (
          <small>
            Enable CCA_OPTIMIZATION_ENABLED and install the optimization extra.
            No fabricated solution is displayed.
          </small>
        )}
      </details>
      <details className="operation-form">
        <summary>Image observations / configured vision model</summary>
        <p>
          Only upload a safe image you are permitted to share. Metadata is
          stripped, but visual personal or commercial information can remain in
          the image.
        </p>
        <input
          aria-label="Vision image"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            setImage(event.target.files?.[0] ?? null);
            setConsent(false);
          }}
        />
        <label className="consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          I consent to sending the selected, sanitized image to the configured
          cloud model.
        </label>
        <Button
          disabled={busy || !image || !consent || !enabled("vision")}
          onClick={() =>
            image && void submit(() => api.vision(project, image, consent))
          }
        >
          Analyze image
        </Button>
        {!enabled("vision") && (
          <small>
            Vision is disabled or unavailable. Configure a vision model and
            credential explicitly.
          </small>
        )}
      </details>
      <SemanticRetrieval
        project={project}
        enabled={enabled("vector retrieval")}
        perform={perform}
        onRun={setPreferredRun}
      />
      <RunHistory
        key={preferredRun}
        project={project}
        preferred={preferredRun}
        perform={perform}
      />
    </div>
  );
}
