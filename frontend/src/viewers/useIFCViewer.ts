import { useEffect, useRef, useState } from "react";
import * as OBC from "@thatopen/components";
import * as FRAGS from "@thatopen/fragments";
import * as THREE from "three";
import { viewerProjection } from "./viewerProjection";

export type MappingSelection = {
  candidateIds: readonly string[];
  selectedIds: readonly string[];
  allowedIds: readonly string[];
};

/** Mapping uses a click, never a camera drag or a click on canvas chrome. */
export function bindGeometrySelection(
  element: HTMLElement,
  canvas: HTMLElement,
  select: (event: MouseEvent) => void,
  single: () => boolean,
) {
  let down: { x: number; y: number; pointerId: number; moved: boolean } | null =
    null;
  const start = (event: PointerEvent) => {
    if (
      event.target === canvas &&
      event.button === 0 &&
      event.isPrimary !== false
    )
      down = {
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
        moved: false,
      };
  };
  const move = (event: PointerEvent) => {
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4)
      down.moved = true;
  };
  const end = (event: PointerEvent) => {
    const click = down;
    down = null;
    if (
      single() &&
      click &&
      !click.moved &&
      click.pointerId === event.pointerId &&
      event.target === canvas &&
      Math.hypot(event.clientX - click.x, event.clientY - click.y) <= 4
    )
      select(event);
  };
  const cancel = () => {
    down = null;
  };
  const double = (event: MouseEvent) => {
    if (!single() && event.target === canvas) select(event);
  };
  element.addEventListener("pointerdown", start);
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", end);
  element.addEventListener("pointercancel", cancel);
  element.addEventListener("pointerleave", cancel);
  element.addEventListener("dblclick", double);
  return () => {
    element.removeEventListener("pointerdown", start);
    element.removeEventListener("pointermove", move);
    element.removeEventListener("pointerup", end);
    element.removeEventListener("pointercancel", cancel);
    element.removeEventListener("pointerleave", cancel);
    element.removeEventListener("dblclick", double);
  };
}

type ViewerControls = {
  impacts(ids: readonly string[]): Promise<void>;
  focus(): Promise<void>;
  isolate(): Promise<void>;
  showAll(): Promise<void>;
  selectMode(): Promise<void>;
  setViewMode(mode: "2d" | "3d"): Promise<void>;
  selectGuid(id: string): Promise<void>;
  mapping(value?: MappingSelection): Promise<void>;
  highlightCandidates(): Promise<void>;
  isolateCandidates(): Promise<void>;
  isolateSelected(): Promise<void>;
};

/** Own the complete SDK lifetime inside the lazy IFC boundary. */
export function useIFCViewer(
  file: File,
  impacted: readonly string[],
  onSelected: (id: string) => void,
  focusId?: string,
  onProperties?: (properties: unknown, id?: string) => void,
  mapping?: MappingSelection,
) {
  const container = useRef<HTMLDivElement>(null);
  const controls = useRef<ViewerControls | null>(null);
  const callback = useRef(onSelected);
  callback.current = onSelected;
  const propertyCallback = useRef(onProperties);
  propertyCallback.current = onProperties;
  const mappingRef = useRef(mapping);
  mappingRef.current = mapping;
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("正在准备本地 IFC 引擎…");
  const [error, setError] = useState("");
  /*
   * The selected element's attributes, as the SDK returned them - not as a string.
   * The panel that renders them is a product surface, and a product surface that
   * prints `JSON.stringify` output is showing its reader source code
   * (frontend/src/viewers/bimProperties.ts owns the structured presentation).
   */
  const [properties, setProperties] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [hasTarget, setHasTarget] = useState(false);
  const [isolated, setIsolated] = useState(false);
  const [candidatesHighlighted, setCandidatesHighlighted] = useState(true);
  const [viewMode, setViewMode] = useState<"2d" | "3d">("3d");
  const actionActive = useRef(false);
  const epoch = useRef(0);
  useEffect(() => {
    if (!container.current) return;
    const element = container.current;
    let cancelled = false;
    let cleanupSelection: (() => void) | undefined;
    let observer: ResizeObserver | undefined;
    let components: OBC.Components | undefined;
    setReady(false);
    setError("");
    setProperties(null);
    setAnchor(null);
    setHasTarget(false);
    setIsolated(false);
    setCandidatesHighlighted(true);
    setViewMode("3d");
    setBusy(false);
    setMessage("正在准备本地 IFC 引擎…");
    actionActive.current = false;
    const fail = (cause: unknown) => {
      if (!cancelled)
        setError(cause instanceof Error ? cause.message : "IFC 引擎启动失败");
    };
    async function load() {
      try {
        components = new OBC.Components();
        const world = components
          .get(OBC.Worlds)
          .create<
            OBC.SimpleScene,
            OBC.OrthoPerspectiveCamera,
            OBC.SimpleRenderer
          >();
        world.scene = new OBC.SimpleScene(components);
        world.renderer = new OBC.SimpleRenderer(components, element);
        world.camera = new OBC.OrthoPerspectiveCamera(components);
        world.scene.setup();
        world.scene.three.background = new THREE.Color("#e7eaec");
        components.init();
        await world.camera.controls.setLookAt(15, 15, 15, 0, 0, 0);
        if (cancelled) return;
        const fragments = components.get(OBC.FragmentsManager);
        fragments.init("/viewer/worker.mjs");
        world.camera.controls.addEventListener("update", () => {
          if (!cancelled) void fragments.core.update().catch(fail);
        });
        observer = new ResizeObserver(() => {
          world.renderer?.resize();
          world.camera.updateAspect();
        });
        observer.observe(element);
        const loader = components.get(OBC.IfcLoader);
        await loader.setup({
          autoSetWasm: false,
          wasm: { path: "/viewer/wasm/", absolute: true },
        });
        if (cancelled) return;
        setMessage(`正在本机解析 ${file.name}…`);
        const buffer = new Uint8Array(await file.arrayBuffer());
        if (cancelled) return;
        const model = await loader.load(buffer, false, file.name);
        if (cancelled) {
          await fragments.core.disposeModel(model.modelId).catch(() => {});
          return;
        }
        model.useCamera(world.camera.three);
        world.scene.three.add(model.object);
        await fragments.core.update(true);
        if (cancelled) return;
        const frame = async (box: THREE.Box3, transition = false) => {
          await world.camera.controls.fitToBox(box, false);
          const center = box.getCenter(new THREE.Vector3());
          const radius = world.camera.controls.distance;
          const plan = world.camera.projection.current === "Orthographic";
          await world.camera.controls.setLookAt(
            center.x + (plan ? 0 : radius * 0.5),
            center.y + (plan ? Math.max(radius, 20) : radius * 0.8),
            center.z + (plan ? 0 : radius * 0.4),
            center.x,
            center.y,
            center.z,
            transition,
          );
        };
        await frame(model.box);
        if (cancelled) return;
        let selected: number[] = [];
        let impactIds: number[] = [];
        let candidateIds: number[] = [];
        let mappedIds: number[] = [];
        let mappingTicket = 0;
        let showCandidates = true;
        const updateAnchor = async () => {
          if (!selected.length || cancelled) return;
          const box = await model.getMergedBox(selected);
          if (cancelled) return;
          const point = box
            .getCenter(new THREE.Vector3())
            .project(world.camera.three);
          setAnchor({
            x: ((point.x + 1) / 2) * element.clientWidth,
            y: ((1 - point.y) / 2) * element.clientHeight,
          });
        };
        world.camera.controls.addEventListener("update", () => {
          void updateAnchor().catch(fail);
        });

        let paintTail = Promise.resolve();
        let selectionTicket = 0;
        let impactTicket = 0;
        const paint = () => {
          const next = paintTail.then(async () => {
            if (cancelled) return;
            await model.resetHighlight();
            if (cancelled) return;
            if (impactIds.length)
              await model.highlight(impactIds, {
                color: new THREE.Color("#d99c43"),
                renderedFaces: FRAGS.RenderedFaces.TWO,
                opacity: 1,
                transparent: false,
              });
            if (showCandidates && candidateIds.length)
              await model.highlight(candidateIds, {
                color: new THREE.Color("#d99c43"),
                renderedFaces: FRAGS.RenderedFaces.TWO,
                opacity: 1,
                transparent: false,
              });
            if (mappedIds.length)
              await model.highlight(mappedIds, {
                color: new THREE.Color("#268d75"),
                renderedFaces: FRAGS.RenderedFaces.TWO,
                opacity: 1,
                transparent: false,
              });
            if (selected.length)
              await model.highlight(selected, {
                color: new THREE.Color("#2f86b3"),
                renderedFaces: FRAGS.RenderedFaces.TWO,
                opacity: 1,
                transparent: false,
              });
            if (!cancelled) await fragments.core.update(true);
          });
          paintTail = next.catch(() => {}); // A failed paint must not poison the queue.
          return next;
        };
        const project = viewerProjection(world.camera, model.box, () =>
          model.useCamera(world.camera.three),
        );
        const isolateIds = async (ids: number[]) => {
          if (!ids.length) return;
          await model.setVisible(undefined, false);
          await model.setVisible(ids, true);
          await fragments.core.update(true);
          if (!cancelled) setIsolated(true);
        };
        controls.current = {
          async mapping(value) {
            const ticket = ++mappingTicket;
            const [candidates, mapped] = await Promise.all([
              model.getLocalIdsByGuids([...(value?.candidateIds ?? [])]),
              model.getLocalIdsByGuids([...(value?.selectedIds ?? [])]),
            ]);
            if (cancelled || ticket !== mappingTicket) return;
            candidateIds = candidates.filter(
              (id): id is number => typeof id === "number",
            );
            mappedIds = mapped.filter(
              (id): id is number => typeof id === "number",
            );
            await paint();
          },
          async highlightCandidates() {
            showCandidates = !showCandidates;
            setCandidatesHighlighted(showCandidates);
            await paint();
          },
          async isolateCandidates() {
            await isolateIds(candidateIds);
          },
          async isolateSelected() {
            await isolateIds(mappedIds);
          },
          async impacts(ids) {
            const ticket = ++impactTicket;
            const matches = await model.getLocalIdsByGuids([...ids]);
            if (cancelled || ticket !== impactTicket) return;
            impactIds = matches.filter(
              (id): id is number => typeof id === "number",
            );
            setHasTarget(selected.length > 0 || impactIds.length > 0);
            await paint();
            if (cancelled || ticket !== impactTicket) return;
            setMessage(
              `${file.name}：已匹配 ${impactIds.length}/${ids.length} 个受影响构件 GUID。${mappingRef.current ? "单击构件选择；候选、已选与当前构件分别标识。" : "双击构件选择；聚焦和隔离以当前选择为准。"}`,
            );
          },
          async focus() {
            const ids = selected.length ? selected : impactIds;
            await frame(
              ids.length ? await model.getMergedBox(ids) : model.box,
              true,
            );
          },
          async isolate() {
            const ids = selected.length ? selected : impactIds;
            if (!ids.length) return;
            await model.setVisible(undefined, false);
            await model.setVisible(ids, true);
            await fragments.core.update(true);
            setIsolated(true);
          },
          async selectMode() {
            await model.resetVisible();
            await fragments.core.update(true);
            setIsolated(false);
            await paint();
          },
          async setViewMode(mode) {
            await project(mode);
            setViewMode(mode);
          },
          async selectGuid(id) {
            const ticket = ++selectionTicket;
            selected = [];
            setProperties(null);
            setAnchor(null);
            propertyCallback.current?.(null, id);
            const [localId] = id ? await model.getLocalIdsByGuids([id]) : [];
            if (cancelled || ticket !== selectionTicket) return;
            if (typeof localId !== "number") {
              setHasTarget(impactIds.length > 0);
              await paint();
              return;
            }
            selected = [localId];
            setHasTarget(true);
            const [data] = await model.getItemsData(selected);
            if (cancelled || ticket !== selectionTicket) return;
            setProperties(data);
            propertyCallback.current?.(data, id);
            await paint();
            const contextBox = (await model.getMergedBox(selected)).clone();
            const sceneSize = model.box.getSize(new THREE.Vector3());
            contextBox.expandByScalar(
              Math.max(sceneSize.x, sceneSize.y, sceneSize.z) * 0.25,
            );
            await frame(contextBox, true);
            await updateAnchor();
          },
          async showAll() {
            selectionTicket++;
            await model.resetVisible();
            if (cancelled) return;
            setIsolated(false);
            await paint();
          },
        };
        const select = async (event: MouseEvent) => {
          const ticket = ++selectionTicket;
          try {
            // Upstream raycasting expects client pixels and the actual canvas, not a div.
            const hit = await model.raycast({
              camera: world.camera.three,
              mouse: new THREE.Vector2(event.clientX, event.clientY),
              dom: world.renderer!.three.domElement,
            });
            if (!hit || cancelled || ticket !== selectionTicket) return;
            const ids = [hit.localId];
            const [data, [guid]] = await Promise.all([
              model.getItemsData(ids),
              model.getGuidsByLocalIds(ids),
            ]);
            if (
              cancelled ||
              ticket !== selectionTicket ||
              !guid ||
              (mappingRef.current &&
                !mappingRef.current.allowedIds.includes(guid))
            )
              return;
            selected = ids;
            setHasTarget(true);
            setProperties(data[0]);
            callback.current(guid);
            propertyCallback.current?.(data[0], guid);
            await paint();
            await updateAnchor();
          } catch (cause) {
            if (!cancelled)
              setError(cause instanceof Error ? cause.message : "构件选择失败");
          }
        };
        cleanupSelection = bindGeometrySelection(
          element,
          world.renderer!.three.domElement,
          (event) => void select(event),
          () => !!mappingRef.current,
        );
        if (!cancelled) setReady(true);
      } catch (cause) {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : "IFC 引擎启动失败");
      }
    }
    const loading = load();
    return () => {
      cancelled = true;
      epoch.current++;
      controls.current = null;
      cleanupSelection?.();
      observer?.disconnect();
      // The loader's model-loaded event still uses FragmentsManager. Dispose only
      // after that in-flight load settles when switching work surfaces quickly.
      void loading.finally(() => components?.dispose());
    };
  }, [file]);
  useEffect(() => {
    if (!ready) return;
    const current = controls.current;
    void current?.impacts(impacted).catch((cause) => {
      if (controls.current === current) setError(String(cause));
    });
  }, [impacted, ready]);
  useEffect(() => {
    if (!ready || focusId === undefined) return;
    const current = controls.current;
    void current?.selectGuid(focusId).catch((cause) => {
      if (controls.current === current) setError(String(cause));
    });
  }, [focusId, ready]);
  useEffect(() => {
    if (!ready || !mapping) return;
    const current = controls.current;
    void current?.mapping(mapping).catch((cause) => {
      if (controls.current === current) setError(String(cause));
    });
  }, [mapping?.candidateIds, mapping?.selectedIds, ready]);
  async function act(
    name:
      | "focus"
      | "isolate"
      | "showAll"
      | "selectMode"
      | "highlightCandidates"
      | "isolateCandidates"
      | "isolateSelected",
  ): Promise<void>;
  async function act(name: "setViewMode", mode: "2d" | "3d"): Promise<void>;
  async function act(
    name:
      | "focus"
      | "isolate"
      | "showAll"
      | "selectMode"
      | "setViewMode"
      | "highlightCandidates"
      | "isolateCandidates"
      | "isolateSelected",
    mode?: "2d" | "3d",
  ) {
    if (actionActive.current || !controls.current) return;
    actionActive.current = true;
    setBusy(true);
    const current = epoch.current;
    try {
      if (name === "setViewMode") await controls.current.setViewMode(mode!);
      else await controls.current[name]();
    } catch (cause) {
      if (current === epoch.current)
        setError(cause instanceof Error ? cause.message : "查看器操作失败");
    } finally {
      if (current === epoch.current) {
        actionActive.current = false;
        setBusy(false);
      }
    }
  }
  return {
    container,
    ready,
    message,
    error,
    properties,
    busy,
    act,
    anchor,
    hasTarget,
    isolated,
    candidatesHighlighted,
    viewMode,
  };
}
