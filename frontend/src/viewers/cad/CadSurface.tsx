import { useEffect, useRef, useState } from "react";
import type {
  CadSource,
  CadComparison,
  CadNavigation,
  CadController,
} from "./cadTypes";
import {
  snapshotCadSources,
  verifyCadSource,
  validateCadTarget,
} from "./cadValidation";
/** One self-hosted SDK lifetime per active CAD surface; B owns its workspace. */
export default function CadSurface({
  before,
  after,
  target,
  onComparison,
  onSelection,
  onReady,
}: {
  before: CadSource;
  after?: CadSource;
  target?: CadNavigation;
  onComparison?: (result: CadComparison) => void;
  onSelection?: (reference: CadNavigation) => void;
  onReady?: (controller: CadController) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const callbacks = useRef({ onComparison, onSelection, onReady });
  callbacks.current = { onComparison, onSelection, onReady };
  const navigation = useRef<CadController | undefined>(undefined);
  const [activeClient, setActiveClient] = useState<CadController>();
  const [status, setStatus] = useState("Loading CAD capability…");
  const [error, setError] = useState("");
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const token = crypto.randomUUID();
    const requestId = crypto.randomUUID();
    const controller = new AbortController();
    const pending = new Map<
      string,
      {
        resolve: (target: CadNavigation) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    >();
    let live = true,
      ready = false,
      opened = false;
    let timer: ReturnType<typeof setTimeout>;
    let sources: [CadSource, CadSource?] | undefined;
    const send = (message: object) =>
      element.contentWindow?.postMessage(
        { ...message, token },
        location.origin,
      );
    const closeRequests = () => {
      navigation.current = undefined;
      setActiveClient(undefined);
      for (const request of pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error("CAD viewer was closed"));
      }
      pending.clear();
      sources = undefined;
    };
    const fail = (message: string) => {
      if (!live) return;
      live = false;
      clearTimeout(timer);
      closeRequests();
      setError(message);
      send({ type: "dispose" });
      element.src = "about:blank";
    };
    const client: CadController = {
      navigate: (target) => {
        if (!live || !opened)
          return Promise.reject(new Error("CAD viewer is not ready"));
        try {
          validateCadTarget(target);
        } catch (error) {
          return Promise.reject(error);
        }
        if (pending.size >= 16)
          return Promise.reject(
            new Error("Too many pending CAD navigation requests"),
          );
        const id = crypto.randomUUID();
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            pending.delete(id);
            reject(new Error("CAD entity navigation timed out"));
          }, 15000);
          pending.set(id, { resolve, reject, timer: timeout });
          send({ type: "navigate", requestId: id, target });
        });
      },
    };
    const receive = (event: MessageEvent) => {
      if (
        !live ||
        event.source !== element.contentWindow ||
        event.origin !== location.origin ||
        event.data?.token !== token
      )
        return;
      const message = event.data;
      if (message.type === "ready" && !ready) {
        ready = true;
        clearTimeout(timer);
        timer = setTimeout(
          () => fail("Opening or comparing the DXF timed out"),
          120000,
        );
        const a = sources![0].data,
          b = sources![1]?.data;
        element.contentWindow?.postMessage(
          {
            type: "open",
            token,
            requestId,
            before: sources![0],
            after: sources![1],
          },
          location.origin,
          b ? [a, b] : [a],
        );
        return;
      }
      if (message.type === "selected" && opened) {
        callbacks.current.onSelection?.(message.target);
        return;
      }
      const request = pending.get(message.requestId);
      if (
        request &&
        (message.type === "navigated" || message.type === "error")
      ) {
        clearTimeout(request.timer);
        pending.delete(message.requestId);
        if (message.type === "error")
          request.reject(new Error(message.message || "CAD navigation failed"));
        else request.resolve(message.target);
        return;
      }
      if (message.requestId !== requestId) return;
      if (message.type === "opened") {
        clearTimeout(timer);
        opened = true;
        navigation.current = client;
        setActiveClient(client);
        setStatus(
          `DXF opened: ${message.elementCount} entities. Review font and donor comparison limitations.`,
        );
        callbacks.current.onReady?.(client);
      }
      if (message.type === "comparison")
        callbacks.current.onComparison?.(message.result);
      if (message.type === "error")
        fail(message.message || "CAD capability failed");
    };
    setError("");
    setStatus("Loading CAD capability…");
    window.addEventListener("message", receive);
    timer = setTimeout(
      () => fail("The local CAD capability did not become ready"),
      30000,
    );
    Promise.resolve()
      .then(async () => {
        sources = snapshotCadSources(before, after);
        await verifyCadSource(sources[0]);
        if (sources[1]) await verifyCadSource(sources[1]);
        return fetch("/viewer/cad/capability.json", {
          signal: controller.signal,
        });
      })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("The local CAD capability has not been built");
        const capability = await response.json();
        if (
          capability.name !== "concord-cad-integration" ||
          capability.version !== "1.7.3"
        )
          throw new Error("The local CAD capability version is unsupported");
        if (live)
          element.src = `/viewer/cad/index.html?token=${encodeURIComponent(token)}`;
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          fail(failure instanceof Error ? failure.message : String(failure));
      });
    return () => {
      live = false;
      controller.abort();
      clearTimeout(timer);
      closeRequests();
      window.removeEventListener("message", receive);
      send({ type: "dispose" });
      element.src = "about:blank";
    };
  }, [before, after]);
  useEffect(() => {
    if (!target || !activeClient || navigation.current !== activeClient) return;
    let live = true;
    // Initial and subsequent targets share the same request/lifetime fence.
    const current = () => live && navigation.current === activeClient;
    void activeClient
      .navigate(target)
      .then(() => {
        if (current()) setError("");
      })
      .catch((failure) => {
        if (current()) setError(String(failure.message || failure));
      });
    return () => {
      live = false;
    };
  }, [target, activeClient, before, after]);
  return (
    <section aria-label="CAD viewer">
      <p role={error ? "alert" : "status"}>{error || status}</p>
      <iframe
        ref={frame}
        title="Concord DXF viewer"
        style={{ width: "100%", height: "70vh", border: 0 }}
      />
    </section>
  );
}
