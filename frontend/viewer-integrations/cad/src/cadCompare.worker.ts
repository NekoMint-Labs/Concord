import {
  acapCompareSnapshots,
  type AcApDiffCompareOptions,
  type EntitySnapshot,
} from "../vendor/compare/acapCompareDrawings";
const post = self.postMessage as (message: unknown) => void;

/** Consume native render-database snapshots. This worker never receives DXF bytes. */
self.onmessage = ({
  data,
}: MessageEvent<{
  id: number;
  before: EntitySnapshot[];
  after: EntitySnapshot[];
  options: AcApDiffCompareOptions;
}>) => {
  const started = performance.now();
  try {
    if (data.before.length > 100000 || data.after.length > 100000)
      throw new Error("CAD comparison snapshot count limit exceeded");
    const result = acapCompareSnapshots(data.before, data.after, data.options);
    if (result.navigation.length > 10000 || result.unchanged.length > 10000)
      throw new Error("CAD difference result limit exceeded");
    post({
      id: data.id,
      result,
      elapsedMs: performance.now() - started,
      sourceParses: 0,
    });
  } catch (error) {
    post({
      id: data.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
