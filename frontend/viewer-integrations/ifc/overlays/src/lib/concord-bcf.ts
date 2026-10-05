/** Standard BCF bytes only; the donor's parser/writer own XML and coordinate conversion. */
import { exportBcfZip } from "./bcf";
import {
  clippingPlanesFromCuts,
  cutsFromClippingPlanes,
} from "./bcf-viewpoint";
import { validateBcfViewpoint } from "./concord-bcf-camera";
import type { ViewerAPI } from "./viewer";
import type { BcfTopic } from "../types";
const LIMIT = 25 * 1024 * 1024;
const requests = new Map<Worker, (error: Error) => void>();

export function disposeBcfRequests() {
  for (const cancel of [...requests.values()])
    cancel(new Error("BCF viewer was closed"));
}
export function parseBcfForHost(
  buffer: ArrayBuffer,
): Promise<{ topics: BcfTopic[]; version: string }> {
  if (
    !(buffer instanceof ArrayBuffer) ||
    !buffer.byteLength ||
    buffer.byteLength > LIMIT
  )
    return Promise.reject(
      new Error("BCF bytes exceed the 25 MiB limit or are empty"),
    );
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/bcf-parser.worker.ts", import.meta.url),
      { type: "module" },
    );
    const id = crypto.randomUUID();
    let complete = false;
    const finish = (
      failure?: Error,
      result?: { topics: BcfTopic[]; version: string },
    ) => {
      if (complete) return;
      complete = true;
      clearTimeout(timer);
      requests.delete(worker);
      worker.terminate();
      if (failure) reject(failure);
      else resolve(result!);
    };
    requests.set(worker, (error) => finish(error));
    const timer = setTimeout(
      () => finish(new Error("BCF parsing timed out")),
      20000,
    );
    worker.onerror = (event) =>
      finish(new Error(event.message || "BCF parser failed"));
    worker.onmessage = (event) => {
      if (event.data.id !== id) return;
      if (event.data.type === "error") finish(new Error(event.data.message));
      else if (event.data.type === "done") finish(undefined, event.data);
    };
    worker.postMessage({ type: "parse", id, buffer, strictVersion: true }, [
      buffer,
    ]);
  });
}
export async function captureBcf(
  api: ViewerAPI,
  modelIds: string[],
  title: string,
  author: string,
): Promise<{
  bytes: ArrayBuffer;
  topicGuid: string;
  viewpointGuid: string;
  selected: Array<{ modelId: string; globalId: string }>;
}> {
  if (
    !title.trim() ||
    title.length > 1000 ||
    !author.trim() ||
    author.length > 1000
  )
    throw new Error("BCF title and author are required and bounded");
  if (
    !modelIds.length ||
    modelIds.length > 4 ||
    modelIds.some((id) => !api.hasModel(id))
  )
    throw new Error("BCF source scope is not loaded");
  const camera = api.getCameraViewpoint();
  if (!camera) throw new Error("BCF camera is unavailable");
  const selected = [] as Array<{ modelId: string; globalId: string }>;
  for (const item of api.getBcfSelection()) {
    if (!modelIds.includes(item.modelId))
      throw new Error("BCF selection is outside the requested source scope");
    const data = await api.getItemData(item.expressId, item.modelId);
    if (!data?.globalId)
      throw new Error("BCF selection has no stable GlobalId");
    selected.push({ modelId: item.modelId, globalId: data.globalId });
  }
  for (const item of selected) {
    const matches = [] as string[];
    for (const modelId of modelIds) {
      const [id] = await api.getIdsByGuids([item.globalId], modelId);
      if (
        id &&
        (await api.getItemData(id, modelId))?.globalId === item.globalId
      )
        matches.push(modelId);
    }
    if (matches.length !== 1)
      throw new Error(
        "BCF selected GlobalId is ambiguous in the requested source scope",
      );
  }
  const vp = {
    guid: crypto.randomUUID(),
    cameraPosition: camera.position,
    cameraDirection: camera.direction,
    cameraUp: camera.up,
    cameraKind: camera.cameraKind,
    viewToWorldScale: camera.viewToWorldScale,
    fieldOfView: camera.fovDeg,
    aspectRatio: camera.aspect,
    componentGuids: selected.map((item) => item.globalId),
    clippingPlanes: clippingPlanesFromCuts(api.getSections().getActivePlanes()),
    snapshotBase64: api.takeSnapshot(),
  };
  validateBcfViewpoint(vp);
  if (!vp.snapshotBase64.startsWith("data:image/png;base64,"))
    throw new Error("BCF snapshot is unavailable");
  const topic: BcfTopic = {
    guid: crypto.randomUUID(),
    title,
    creationDate: new Date().toISOString(),
    creationAuthor: author,
    viewpoints: [vp],
    comments: [],
    source: "generated",
  };
  const bytes = exportBcfZip([topic], "3.0");
  if (bytes.byteLength > LIMIT || vp.snapshotBase64.length > LIMIT)
    throw new Error("BCF export exceeds the 25 MiB limit");
  return {
    bytes: new Uint8Array(bytes).buffer,
    topicGuid: topic.guid,
    viewpointGuid: vp.guid,
    selected,
  };
}
export async function reopenBcf(
  api: ViewerAPI,
  bytes: ArrayBuffer,
  modelIds: string[],
  topicGuid?: string,
  viewpointGuid?: string,
) {
  if (
    !modelIds.length ||
    modelIds.length > 4 ||
    new Set(modelIds).size !== modelIds.length ||
    modelIds.some((id) => !api.hasModel(id))
  )
    throw new Error("BCF source scope is not loaded");
  const parsed = await parseBcfForHost(bytes);
  if (!["2.1", "3.0"].includes(parsed.version))
    throw new Error("Only BCF 2.1 and 3.0 are supported");
  const candidates = parsed.topics
    .filter((t) => !topicGuid || t.guid === topicGuid)
    .flatMap((topic) =>
      topic.viewpoints
        .filter((vp) => !viewpointGuid || vp.guid === viewpointGuid)
        .map((vp) => ({ topic, vp })),
    );
  if (candidates.length !== 1)
    throw new Error("Select one BCF topic/viewpoint explicitly");
  const { topic, vp } = candidates[0];
  validateBcfViewpoint(vp);
  const selected = [] as Array<{
    modelId: string;
    expressId: number;
    globalId: string;
  }>;
  for (const globalId of new Set(vp.componentGuids ?? [])) {
    const matches = [] as Array<{
      modelId: string;
      expressId: number;
      globalId: string;
    }>;
    for (const modelId of modelIds) {
      const [id] = await api.getIdsByGuids([globalId], modelId);
      if (!id || !Number.isSafeInteger(id)) continue;
      const data = await api.getItemData(id, modelId);
      if (data?.globalId === globalId)
        matches.push({ modelId, expressId: id, globalId });
    }
    if (matches.length !== 1)
      throw new Error(
        "BCF selected GlobalId is missing or ambiguous in the requested source scope",
      );
    selected.push(matches[0]);
  }
  // Resolve every identity before changing the scene. No status becomes Concord state.
  await api.applyBcfSelection(selected);
  api
    .getSections()
    .applyPlanes(cutsFromClippingPlanes(vp.clippingPlanes ?? []));
  await api.applyBcfCamera(vp);
  return {
    topicGuid: topic.guid,
    viewpointGuid: vp.guid,
    title: topic.title,
    commentCount: topic.comments.length,
    selected: selected.map(({ modelId, globalId }) => ({ modelId, globalId })),
  };
}
