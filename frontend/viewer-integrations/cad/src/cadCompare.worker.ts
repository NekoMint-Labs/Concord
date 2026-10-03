import {
  AcDbDatabase,
  AcDbFileType,
  acdbHostApplicationServices,
} from "@mlightcad/data-model";
import { acapCompareDrawings } from "../vendor/compare";
import type { AcApDiffCompareOptions } from "../vendor/compare";
import { CAD_ENGINE, verifyCadSource } from "./cadTypes";
import type { CadSource } from "./cadTypes";
const post = self.postMessage as (message: unknown) => void;
const databases = new Map<string, AcDbDatabase>();
let chain = Promise.resolve();
async function load(source: CadSource) {
  await verifyCadSource(source);
  const key = `${CAD_ENGINE}:${source.sourceHash}`;
  const existing = databases.get(key);
  if (existing) return existing;
  const database = new AcDbDatabase();
  acdbHostApplicationServices().workingDatabase = database;
  await database.read(source.data, { readOnly: true }, AcDbFileType.DXF);
  let entityCount = 0;
  for (const _entity of database.tables.blockTable.modelSpace.newIterator()) {
    if (++entityCount > 100000)
      throw new Error("CAD model-space entity limit exceeded");
  }
  databases.set(key, database);
  while (databases.size > 2) {
    const oldest = databases.keys().next().value!;
    databases.delete(oldest);
  }
  return database;
}
self.onmessage = ({
  data,
}: MessageEvent<{
  id: number;
  before: CadSource;
  after: CadSource;
  options: AcApDiffCompareOptions;
}>) => {
  const run = async () => {
    const started = performance.now();
    const cacheHit =
      databases.has(`${CAD_ENGINE}:${data.before.sourceHash}`) &&
      databases.has(`${CAD_ENGINE}:${data.after.sourceHash}`);
    try {
      const before = await load(data.before);
      const after = await load(data.after);
      const result = acapCompareDrawings(before, after, data.options);
      if (result.navigation.length > 10000)
        throw new Error("CAD difference result limit exceeded");
      post({
        id: data.id,
        result,
        elapsedMs: performance.now() - started,
        cacheHit,
      });
    } catch (error) {
      post({
        id: data.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  chain = chain.then(run, run);
};
