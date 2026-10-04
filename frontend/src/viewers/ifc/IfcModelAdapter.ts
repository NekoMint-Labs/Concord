import { IfcViewer } from "../../../vendor/ifc-viewer-online/ifc-viewer-sdk";
import type {
  IfcSource,
  BimTarget,
  IfcElementReference,
  IfcModelSummary,
  IfcDiagnostics,
  IfcPanel,
  IfcCamera,
  IfcBcfScope,
  IfcBcfExport,
} from "./ifcTypes";
import { validateIfcReference } from "./ifcValidation";
import { snapshotBimTarget } from "./ifcTarget";

/** Mature donor SDK stays entirely inside C's engineering adapter. */
export class IfcModelAdapter {
  private readonly viewer: IfcViewer;
  private readonly models = new Map<
    string,
    { source: IfcSource; modelId: string }
  >();
  private disposed = false;
  private navigationQueue: Promise<unknown> = Promise.resolve();
  private pendingNavigation = 0;
  private readonly onSelection?: (target: BimTarget) => void;
  private readonly onNavigationError?: (error: Error | null) => void;
  readonly summaries: IfcModelSummary[] = [];
  constructor(
    mount: HTMLElement,
    onSelection?: (reference: BimTarget) => void,
    onNavigationError?: (error: Error | null) => void,
  ) {
    this.onSelection = onSelection;
    this.onNavigationError = onNavigationError;
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
      if (!binding || this.disposed || this.pendingNavigation) return;
      try {
        const item = await this.viewer.getElement(
          event.expressId,
          binding.modelId,
        );
        if (this.disposed || this.pendingNavigation) return;
        if (!item?.globalId)
          throw new Error("IFC selection has no stable GlobalId");
        const reference = {
          sourceRevisionId: binding.source.revisionId,
          sourceHash: binding.source.sourceHash,
          globalId: item.globalId,
        };
        validateIfcReference(reference);
        onSelection?.({
          kind: "bim",
          source_revision_id: reference.sourceRevisionId,
          global_ids: [reference.globalId],
        });
        onNavigationError?.(null);
      } catch (error) {
        if (!this.disposed)
          onNavigationError?.(
            error instanceof Error ? error : new Error(String(error)),
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
      if (this.disposed) throw new Error("IFC viewer was closed");
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
  navigate(target: BimTarget): Promise<BimTarget> {
    if (this.disposed)
      return Promise.reject(new Error("IFC viewer was closed"));
    if (this.pendingNavigation >= 16) {
      const failure = new Error("Too many pending BIM navigation requests");
      this.onNavigationError?.(failure);
      return Promise.reject(failure);
    }
    let verified: BimTarget | undefined;
    let validationError: unknown;
    try {
      verified = snapshotBimTarget(target);
    } catch (error) {
      validationError = error;
    }
    this.pendingNavigation++;
    const operation = this.navigationQueue.then(async () => {
      try {
        if (!verified) throw validationError;
        const result = await this.navigateVerified(verified);
        if (this.disposed) throw new Error("IFC viewer was closed");
        this.onNavigationError?.(null);
        this.onSelection?.(result);
        return result;
      } catch (error) {
        return await this.rejectNavigation(error);
      } finally {
        this.pendingNavigation--;
      }
    });
    this.navigationQueue = operation.catch(() => {});
    return operation;
  }
  private async rejectNavigation(error: unknown): Promise<never> {
    const failure = error instanceof Error ? error : new Error(String(error));
    if (!this.disposed) {
      this.onNavigationError?.(failure);
      try {
        await this.viewer.clearTargetSelection();
      } catch (cleanupError) {
        if (!this.disposed)
          this.onNavigationError?.(
            new Error(
              `${failure.message}; IFC selection cleanup failed: ${String(cleanupError)}`,
            ),
          );
      }
    }
    throw failure;
  }
  private async navigateVerified(target: BimTarget) {
    const checkpoint = () => {
      if (this.disposed) throw new Error("IFC viewer was closed");
    };
    checkpoint();
    const binding = this.models.get(target.source_revision_id);
    if (!binding) throw new Error("IFC target source revision is not loaded");
    const guids = target.global_ids!;
    const ids = await this.viewer.getIdsByGuids(guids, binding.modelId);
    checkpoint();
    if (
      ids.length !== guids.length ||
      ids.some((id) => !Number.isSafeInteger(id) || id! <= 0)
    )
      throw new Error(
        "IFC GlobalId is absent from the requested source revision",
      );
    // Bound SDK queries; every GUID must verify before any selection/camera effect.
    for (let offset = 0; offset < ids.length; offset += 16) {
      const elements = await Promise.all(
        ids
          .slice(offset, offset + 16)
          .map((id) => this.viewer.getElement(id!, binding.modelId)),
      );
      checkpoint();
      if (
        elements.some(
          (element, index) => element?.globalId !== guids[offset + index],
        )
      )
        throw new Error("IFC target identity could not be verified");
    }
    await this.viewer.navigateElements(ids as number[], binding.modelId);
    checkpoint();
    return target;
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
      validateIfcReference(reference);
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
