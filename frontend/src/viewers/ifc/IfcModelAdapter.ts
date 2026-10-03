import { IfcViewer } from "../../../vendor/ifc-viewer-online/ifc-viewer-sdk";
import type {
  IfcSource,
  IfcNavigation,
  IfcElementReference,
  IfcModelSummary,
  IfcDiagnostics,
  IfcPanel,
  IfcCamera,
  IfcBcfScope,
  IfcBcfExport,
} from "./ifcTypes";
import { validateIfcNavigation } from "./ifcValidation";

/** Mature donor SDK stays entirely inside C's engineering adapter. */
export class IfcModelAdapter {
  private readonly viewer: IfcViewer;
  private readonly models = new Map<
    string,
    { source: IfcSource; modelId: string }
  >();
  private disposed = false;
  readonly summaries: IfcModelSummary[] = [];
  constructor(
    mount: HTMLElement,
    onSelection?: (reference: IfcElementReference) => void,
  ) {
    this.viewer = new IfcViewer(mount, {
      baseUrl: new URL("/viewer/ifc/index.html", location.origin).href,
      lang: "en",
      ui: "kiosk",
      validate: false,
      panels: ["properties", "scene", "measurement", "section", "plans"],
      title: "Concord IFC viewer",
      loadTimeout: 120000,
    });
    this.viewer.on("element-selected", async (event) => {
      const binding = [...this.models.values()].find(
        (item) => item.modelId === event.modelId,
      );
      if (!binding || this.disposed) return;
      try {
        const item = await this.viewer.getElement(
          event.expressId,
          binding.modelId,
        );
        if (!item?.globalId || this.disposed) return;
        const reference = {
          sourceRevisionId: binding.source.revisionId,
          sourceHash: binding.source.sourceHash,
          globalId: item.globalId,
        };
        validateIfcNavigation(reference);
        onSelection?.(reference);
      } catch (error) {
        if (!this.disposed)
          console.warn(
            "IFC selection could not resolve a stable reference",
            error,
          );
      }
    });
  }
  async load(sources: readonly IfcSource[]) {
    await this.viewer.whenReady();
    for (const source of sources) {
      if (this.disposed) throw new Error("IFC viewer was closed");
      const start = performance.now();
      const loaded = await this.viewer.add(source.name, source.data.slice(0));
      this.models.set(source.revisionId, { source, modelId: loaded.modelId });
      this.summaries.push({
        sourceRevisionId: source.revisionId,
        sourceHash: source.sourceHash,
        elementCount: loaded.elementCount,
        fromCache: loaded.fromCache,
        elapsedMs: performance.now() - start,
      });
    }
    return this.summaries.slice();
  }
  async navigate(target: IfcNavigation) {
    validateIfcNavigation(target);
    const binding = this.models.get(target.sourceRevisionId);
    if (!binding || binding.source.sourceHash !== target.sourceHash)
      throw new Error("IFC target revision is not loaded or its hash changed");
    const [id] = await this.viewer.getIdsByGuids(
      [target.globalId],
      binding.modelId,
    );
    if (!Number.isSafeInteger(id) || id! <= 0)
      throw new Error(
        "IFC GlobalId is absent from the requested source revision",
      );
    const element = await this.viewer.getElement(id!, binding.modelId);
    if (element?.globalId !== target.globalId)
      throw new Error("IFC target identity could not be verified");
    this.viewer.select(id!, binding.modelId);
    return { ...target };
  }
  diagnostics(): Promise<IfcDiagnostics> {
    return this.viewer.getEngineeringDiagnostics();
  }
  async panels(): Promise<IfcPanel[]> {
    const result = await this.viewer.getPanels();
    return result.available
      .map((item) => item.id)
      .filter((id): id is IfcPanel =>
        ["properties", "scene", "measurement", "section", "plans"].includes(id),
      );
  }
  openPanel(panel: IfcPanel) {
    this.viewer.openPanel(panel);
  }
  fit() {
    this.viewer.fit();
  }
  showAll() {
    this.viewer.showAll();
  }
  async camera(): Promise<IfcCamera> {
    const state = await this.viewer.getCamera();
    if (!state) throw new Error("IFC camera is unavailable");
    return {
      position: state.position,
      direction: state.direction,
      up: state.up,
      fieldOfView: state.fovDeg,
      cameraKind: state.cameraKind,
      viewToWorldScale: state.viewToWorldScale,
      aspectRatio: state.aspect,
    };
  }
  async screenshot() {
    const snapshot = await this.viewer.screenshot();
    if (!snapshot.startsWith("data:image/png;base64,"))
      throw new Error("IFC snapshot is unavailable");
    return snapshot;
  }
  async section(enabled: boolean) {
    const state = enabled
      ? await this.viewer.setSectionBox("model")
      : await this.viewer.removeSection();
    return { enabled: state.active > 0, count: state.active };
  }
  async measure(enabled: boolean) {
    await this.viewer.setMeasureTool(enabled ? "distance" : "none");
  }
  private bcfScope(scope: readonly IfcBcfScope[]) {
    if (this.disposed) throw new Error("IFC viewer was closed");
    if (
      !scope.length ||
      scope.length > 4 ||
      new Set(scope.map((s) => s.sourceRevisionId)).size !== scope.length
    )
      throw new Error("BCF requires a unique loaded source scope");
    return scope.map((reference) => {
      const binding = this.models.get(reference.sourceRevisionId);
      if (!binding || binding.source.sourceHash !== reference.sourceHash)
        throw new Error(
          "BCF source revision is not loaded or its hash changed",
        );
      return binding.modelId;
    });
  }
  private bcfSelection(
    selected: readonly { modelId: string; globalId: string }[],
  ) {
    return selected.map((item) => {
      const binding = [...this.models.values()].find(
        (value) => value.modelId === item.modelId,
      );
      if (!binding || this.disposed)
        throw new Error("BCF selection source is unavailable");
      const reference = {
        sourceRevisionId: binding.source.revisionId,
        sourceHash: binding.source.sourceHash,
        globalId: item.globalId,
      };
      validateIfcNavigation(reference);
      return reference;
    });
  }
  async saveBcf(
    title: string,
    author: string,
    scope: readonly IfcBcfScope[] = this.summaries,
  ): Promise<IfcBcfExport> {
    const verified = scope.map((item) => ({
      sourceRevisionId: item.sourceRevisionId,
      sourceHash: item.sourceHash,
    }));
    const result = await this.viewer.captureBcf(
      this.bcfScope(verified),
      title,
      author,
    );
    return {
      data: result.bytes,
      format: "bcf3.0",
      scope: verified,
      topicGuid: result.topicGuid,
      viewpointGuid: result.viewpointGuid,
      selected: this.bcfSelection(result.selected),
    };
  }
  async openBcf(
    data: ArrayBuffer,
    scope: readonly IfcBcfScope[],
    topicGuid?: string,
    viewpointGuid?: string,
  ) {
    let size: number;
    try {
      size = Object.getOwnPropertyDescriptor(
        ArrayBuffer.prototype,
        "byteLength",
      )!.get!.call(data);
    } catch {
      throw new Error("BCF bytes must be an ArrayBuffer");
    }
    if (!size || size > 25 * 1024 * 1024)
      throw new Error("BCF bytes exceed the 25 MiB limit or are empty");
    const models = this.bcfScope(scope);
    const snapshot = new ArrayBuffer(size);
    new Uint8Array(snapshot).set(new Uint8Array(data));
    const result = await this.viewer.reopenBcf(
      snapshot,
      models,
      topicGuid,
      viewpointGuid,
    );
    return {
      topicGuid: result.topicGuid,
      viewpointGuid: result.viewpointGuid,
      title: result.title,
      commentCount: result.commentCount,
      selected: this.bcfSelection(result.selected),
    };
  }
  dispose() {
    this.disposed = true;
    this.viewer.dispose();
    this.models.clear();
    this.summaries.length = 0;
  }
}
