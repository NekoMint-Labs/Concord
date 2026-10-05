import { modelRegistry } from "./model-registry";
import { useValidationStore } from "../stores/validationStore";
import { parseSpatialNodeArray } from "./type-guards";
import { indexDiagnostics, readIndex, writeIndex } from "./concord-index-cache";
import type { FragmentIndex } from "./concord-fragment-index";

/** Existing donor store seam, with stale-model checks around every await. */
export async function buildConcordIndex(
  modelId: string,
  produce: () => Promise<FragmentIndex>,
): Promise<void> {
  const entry = modelRegistry.get(modelId);
  if (!entry) return;
  const alive = () => modelRegistry.get(modelId) === entry;
  const cached = await readIndex(entry.opfsCacheKey);
  if (!alive()) return;
  let index = cached;
  if (
    index &&
    !parseSpatialNodeArray(index.tree, "cached fragment index").length
  )
    index = null;
  if (index) indexDiagnostics.hits++;
  else {
    indexDiagnostics.builds++;
    try {
      index = await produce();
    } catch (error) {
      indexDiagnostics.failures++;
      throw error;
    }
    if (!alive()) return;
    if (!parseSpatialNodeArray(index.tree, "native fragment index").length)
      throw new Error("Native fragment index has no model tree");
    await writeIndex(entry.opfsCacheKey, index);
  }
  if (!alive()) return;
  const store = useValidationStore.getState();
  store.setSpatialTreeForModel(modelId, index.tree);
  store.setDecompMapForModel(modelId, new Map(index.decomp));
}
