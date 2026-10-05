import { useState } from "react";
import { findingFixture, type FixtureEvidence } from "../app/fixtures/finding";
import {
  recheckFixture,
  recheckScenarios,
  type FixtureRecheckScenario,
} from "../app/fixtures/recheck";

// ProjectApplication owns this session UI. Never serialize it or send fixture IDs to an API.
export type FixtureDecision = "confirm" | "dismiss" | "insufficient";
export const fixtureDecisionLabels = {
  confirm: "已确认",
  dismiss: "已忽略",
  insufficient: "证据不足",
};
const initialValues = () => ({
  title: findingFixture.title as string,
  discipline: findingFixture.discipline as string,
  action: findingFixture.action as string,
});

const initialFollowUp = (): {
  revision: number;
  generation: number;
  closed: boolean;
  samples: {
    scenario: FixtureRecheckScenario;
    revision: number;
    generation: number;
  }[];
  history: { action: FixtureDecision | "edit" | "close"; note: string }[];
} => ({ revision: 1, generation: 0, closed: false, samples: [], history: [] });

export function useFindingPreview() {
  const [enabled, setEnabled] = useState(false);
  const [active, setActive] = useState<FixtureEvidence>(
    findingFixture.evidence[2],
  );
  const [values, setValues] = useState(initialValues);
  const [review, setReview] = useState<{
    decision: FixtureDecision | null;
    note: string;
  }>({ decision: null, note: "" });
  const [followUp, setFollowUp] = useState(initialFollowUp);
  const [activeSample, setActiveSample] = useState<
    (typeof followUp.samples)[number] | null
  >(null);
  const latestSample = followUp.samples.at(-1);
  const report = latestSample
    ? recheckFixture(latestSample.scenario, latestSample.revision)
    : null;
  const currentSample =
    !!latestSample &&
    latestSample.revision === followUp.revision &&
    latestSample.generation === followUp.generation;
  const canClose =
    review.decision === "confirm" &&
    !followUp.closed &&
    currentSample &&
    !!report &&
    report.outcome === "RESOLVED" &&
    report.checks.every(
      (check) => check.verified && check.evidence?.quality === "structured",
    );
  const recheckAvailable =
    review.decision === "confirm" &&
    !followUp.closed &&
    followUp.revision > 1 &&
    !currentSample;
  const followUpLabel = followUp.closed
    ? "人工关闭（示例）"
    : recheckAvailable
      ? "ReCheck 可用"
      : currentSample && report
        ? `${report.outcome}（样本）`
        : "";
  return {
    enabled,
    followUp,
    latestSample,
    report,
    currentSample,
    canClose,
    recheckAvailable,
    followUpLabel,
    setEnabled,
    active,
    activeSampleStale:
      !!activeSample &&
      (activeSample !== latestSample ||
        activeSample.revision !== followUp.revision ||
        activeSample.generation !== followUp.generation),
    values,
    ...review,
    reviewLabel: followUp.closed
      ? "已关闭"
      : review.decision
        ? fixtureDecisionLabels[review.decision]
        : "待人工判断",
    selectEvidence(id: string) {
      // ponytail: scan the small session fixture list; use A's query records after #19.
      const original = findingFixture.evidence.find((item) => item.id === id);
      const sample = [...followUp.samples]
        .reverse()
        .find((item) =>
          recheckFixture(item.scenario, item.revision).checks.some(
            (check) => check.evidence?.id === id,
          ),
        );
      const evidence =
        original ??
        (sample
          ? recheckFixture(sample.scenario, sample.revision).checks.find(
              (check) => check.evidence?.id === id,
            )?.evidence
          : null);
      if (!evidence) return false;
      setActive(evidence);
      setActiveSample(original ? null : (sample ?? null));
      return true;
    },
    edit(draft: ReturnType<typeof initialValues>) {
      const next = {
        title: draft.title.trim(),
        discipline: draft.discipline.trim(),
        action: draft.action.trim(),
      };
      if (!next.title || !next.discipline || !next.action) return false;
      setValues(next);
      setReview({ decision: null, note: "" });
      setFollowUp((previous) => ({
        ...previous,
        generation: previous.generation + 1,
        closed: false,
        history: [
          ...previous.history,
          { action: "edit", note: "人工编辑示例；旧判断与复核不再授权关闭。" },
        ],
      }));
      return true;
    },
    decide(decision: FixtureDecision, note: string) {
      if (decision !== "confirm" && !note.trim()) return false;
      setReview({ decision, note: note.trim() });
      setFollowUp((previous) => ({
        ...previous,
        generation: previous.generation + 1,
        closed: false,
        history: [...previous.history, { action: decision, note: note.trim() }],
      }));
      return true;
    },
    receiveRevision() {
      if (review.decision !== "confirm" || followUp.closed) return false;
      setFollowUp((previous) => ({
        ...previous,
        revision: previous.revision + 1,
      }));
      return true;
    },
    showRecheckSample(scenario: FixtureRecheckScenario) {
      if (
        review.decision !== "confirm" ||
        followUp.closed ||
        followUp.revision < 2 ||
        !Object.hasOwn(recheckScenarios, scenario)
      )
        return false;
      setFollowUp((previous) => ({
        ...previous,
        samples: [
          ...previous.samples,
          {
            scenario,
            revision:
              scenario === "stale" ? previous.revision - 1 : previous.revision,
            generation: previous.generation,
          },
        ],
      }));
      return true;
    },
    close(note: string, expectedSample = latestSample) {
      if (!canClose || expectedSample !== latestSample || !note.trim())
        return false;
      setFollowUp((previous) => ({
        ...previous,
        closed: true,
        history: [...previous.history, { action: "close", note: note.trim() }],
      }));
      return true;
    },
    reset() {
      setValues(initialValues());
      setFollowUp(initialFollowUp());
      setActive(findingFixture.evidence[2]);
      setActiveSample(null);
      setReview({ decision: null, note: "" });
    },
  };
}
export type FindingPreviewSession = ReturnType<typeof useFindingPreview>;
