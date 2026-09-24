import { useEffect, useRef, useState } from "react";
import * as OBC from "@thatopen/components";
import * as FRAGS from "@thatopen/fragments";
import * as THREE from "three";

type ViewerControls = {
  impacts(ids: readonly string[]): Promise<void>;
  focus(): Promise<void>;
  isolate(): Promise<void>;
  showAll(): Promise<void>;
  selectGuid(id: string): Promise<void>;
};

/** Own the complete SDK lifetime inside the lazy IFC boundary. */
export function useIFCViewer(
  file: File,
  impacted: readonly string[],
  onSelected: (id: string) => void,
  focusId?: string,
  onProperties?: (properties: unknown) => void,
) {
  const container = useRef<HTMLDivElement>(null);
  const controls = useRef<ViewerControls | null>(null);
  const callback = useRef(onSelected);
  callback.current = onSelected;
  const propertyCallback = useRef(onProperties);
  propertyCallback.current = onProperties;
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
          .create<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>();
        world.scene = new OBC.SimpleScene(components);
        world.renderer = new OBC.SimpleRenderer(components, element);
        world.camera = new OBC.SimpleCamera(components);
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
          await world.camera.controls.setLookAt(
            center.x + radius * 0.5,
            center.y + radius * 0.8,
            center.z + radius * 0.4,
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
            if (selected.length)
              await model.highlight(selected, {
                color: new THREE.Color("#397ad5"),
                renderedFaces: FRAGS.RenderedFaces.TWO,
                opacity: 1,
                transparent: false,
              });
            if (!cancelled) await fragments.core.update(true);
          });
          paintTail = next.catch(() => {}); // A failed paint must not poison the queue.
          return next;
        };
        controls.current = {
          async impacts(ids) {
            const ticket = ++impactTicket;
            const matches = await model.getLocalIdsByGuids([...ids]);
            if (cancelled || ticket !== impactTicket) return;
            impactIds = matches.filter(
              (id): id is number => typeof id === "number",
            );
            await paint();
            if (cancelled || ticket !== impactTicket) return;
            setMessage(
              `${file.name}：已匹配 ${impactIds.length}/${ids.length} 个受影响构件 GUID。双击构件选择；聚焦和隔离以当前选择为准。`,
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
          },
          async selectGuid(id) {
            const [localId] = await model.getLocalIdsByGuids([id]);
            if (cancelled || typeof localId !== "number") return;
            selected = [localId];
            const [data] = await model.getItemsData(selected);
            if (cancelled) return;
            setProperties(data);
            propertyCallback.current?.(data);
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
            selected = [];
            setProperties(null);
            propertyCallback.current?.(null);
            setAnchor(null);
            callback.current("");
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
            if (cancelled || ticket !== selectionTicket) return;
            selected = ids;
            setProperties(data[0]);
            propertyCallback.current?.(data[0]);
            callback.current(guid ?? String(hit.localId));
            await paint();
            await updateAnchor();
          } catch (cause) {
            if (!cancelled)
              setError(cause instanceof Error ? cause.message : "构件选择失败");
          }
        };
        element.addEventListener("dblclick", select);
        cleanupSelection = () =>
          element.removeEventListener("dblclick", select);
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
    if (!ready || !focusId) return;
    const current = controls.current;
    void current?.selectGuid(focusId).catch((cause) => {
      if (controls.current === current) setError(String(cause));
    });
  }, [focusId, ready]);
  async function act(name: "focus" | "isolate" | "showAll") {
    if (actionActive.current || !controls.current) return;
    actionActive.current = true;
    setBusy(true);
    const current = epoch.current;
    try {
      await controls.current[name]();
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
  return { container, ready, message, error, properties, busy, act, anchor };
}
