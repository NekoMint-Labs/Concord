import { useEffect, useRef, useState } from "react";
import type { IfcModelAdapter } from "./IfcModelAdapter";
import type { IfcSource, BimTarget } from "./ifcTypes";
import {
  IFC_DONOR,
  IFC_NAVIGATION,
  IFC_LOCK,
  validateIfcSources,
  snapshotIfcSources,
} from "./ifcValidation";

export default function IfcSurface({
  sources,
  target,
  onReady,
  onSelection,
}: {
  sources: readonly IfcSource[];
  target?: BimTarget;
  onReady?: (adapter: IfcModelAdapter) => void;
  onSelection?: (reference: BimTarget) => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onReady, onSelection });
  callbacks.current = { onReady, onSelection };
  const [activeAdapter, setActiveAdapter] = useState<IfcModelAdapter>();
  const [status, setStatus] = useState("Loading IFC capability…");
  const [error, setError] = useState("");
  useEffect(() => {
    const element = mount.current;
    if (!element) return;
    const controller = new AbortController();
    let adapter: IfcModelAdapter | undefined;
    let live = true;
    const fail = (failure: unknown) => {
      if (!live) return;
      live = false;
      controller.abort();
      adapter?.dispose();
      setError(failure instanceof Error ? failure.message : String(failure));
    };
    const timer = setTimeout(
      () => fail(new Error("The local IFC capability timed out")),
      150000,
    );
    setActiveAdapter(undefined);
    setError("");
    setStatus("Loading IFC capability…");
    void (async () => {
      const verified = snapshotIfcSources(sources);
      await validateIfcSources(verified);
      const response = await fetch("/viewer/ifc/capability.json", {
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error("The local IFC capability has not been built");
      const capability = await response.json();
      if (
        capability.name !== "concord-ifc-integration" ||
        capability.revision !== IFC_DONOR ||
        capability.lock !== IFC_LOCK ||
        capability.navigation !== IFC_NAVIGATION
      )
        throw new Error("The local IFC capability version is unsupported");
      const { IfcModelAdapter } = await import("./IfcModelAdapter");
      if (!live) return;
      adapter = new IfcModelAdapter(
        element,
        (reference) => {
          if (live) callbacks.current.onSelection?.(reference);
        },
        (failure) => {
          if (live) setError(failure?.message ?? "");
        },
      );
      const models = await adapter.load(verified);
      if (!live) return;
      clearTimeout(timer);
      setStatus(
        `IFC opened: ${models.reduce((sum, model) => sum + model.elementCount, 0)} elements in ${models.length} model(s).`,
      );
      setActiveAdapter(adapter);
      callbacks.current.onReady?.(adapter);
    })().catch(fail);
    return () => {
      live = false;
      controller.abort();
      clearTimeout(timer);
      adapter?.dispose();
    };
  }, [sources]);
  useEffect(() => {
    if (activeAdapter && target)
      void activeAdapter.navigate(target).catch(() => {});
  }, [activeAdapter, target]);
  return (
    <section aria-label="IFC viewer">
      <p role={error ? "alert" : "status"}>{error || status}</p>
      <div ref={mount} style={{ width: "100%", height: "70vh" }} />
    </section>
  );
}
