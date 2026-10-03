import { normalizeCadResult } from "./normalizeCadResult";
import {
  openCadSources,
  disposeCadViewer,
  cadElementCount,
  navigateCadEntity,
} from "./cadDonor";
import type { CadSource, CadNavigation } from "./cadTypes";
import { CAD_ENGINE } from "./cadTypes";
const parentOrigin = new URL(document.referrer || location.href).origin;
const token = new URLSearchParams(location.search).get("token");
const status = document.getElementById("status")!;
const viewer = document.getElementById("viewer")!;
let chain = Promise.resolve();
const send = (payload: object) =>
  parent.postMessage({ ...payload, token, engine: CAD_ENGINE }, parentOrigin);
window.addEventListener("concord-cad-timing", (event) =>
  send({ type: "timing", ...(event as CustomEvent).detail }),
);
window.addEventListener("message", (event) => {
  if (
    event.source !== parent ||
    event.origin !== parentOrigin ||
    event.data?.token !== token
  )
    return;
  const message = event.data as {
    type: string;
    before?: CadSource;
    after?: CadSource;
    requestId?: string;
    target?: CadNavigation;
  };
  const run = async () => {
    try {
      if (message.type === "dispose") {
        await disposeCadViewer();
        send({ type: "disposed" });
        return;
      }
      if (message.type === "navigate") {
        if (!message.target) throw new Error("CAD entity target is missing");
        const target = await navigateCadEntity(message.target);
        send({ type: "navigated", requestId: message.requestId, target });
        return;
      }
      if (message.type !== "open" || !message.before)
        throw new Error("Unsupported CAD request");
      status.textContent = "Opening DXF…";
      status.hidden = false;
      await disposeCadViewer();
      await openCadSources(
        viewer,
        message.before,
        message.after,
        (result) => {
          send({
            type: "comparison",
            requestId: message.requestId,
            result: message.after
              ? normalizeCadResult(result, message.before!, message.after)
              : undefined,
          });
        },
        (target) => send({ type: "selected", target }),
        (error) => {
          status.textContent = error.message;
          status.hidden = false;
          status.setAttribute("role", "alert");
          send({
            type: "error",
            requestId: message.requestId,
            message: error.message,
          });
        },
      );
      status.textContent =
        "DXF opened. Fonts must be supplied locally; missing glyphs require review.";
      send({
        type: "opened",
        requestId: message.requestId,
        elementCount: cadElementCount(),
      });
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : String(error);
      status.hidden = false;
      status.setAttribute("role", "alert");
      send({
        type: "error",
        requestId: message.requestId,
        message: status.textContent,
      });
    }
  };
  chain = chain.then(run, run);
});
window.addEventListener("pagehide", () => {
  void disposeCadViewer();
});
send({ type: "ready" });
