import {
  openCadSources,
  disposeCadViewer,
  compareLoadedCadSources,
} from "./cadDonor";
import { normalizeCadResult } from "./normalizeCadResult";
import { snapshotCadOptions } from "./cadSnapshots";
import type { CadSource } from "./cadTypes";
import type {
  AcApDiffCompareResult,
  AcApDiffCompareOptions,
} from "../vendor/compare";
const origin = new URL(document.referrer || location.href).origin;
const token = new URLSearchParams(location.search).get("token");
const send = (value: object) => parent.postMessage({ ...value, token }, origin);
let chain = Promise.resolve();
window.addEventListener("message", (event) => {
  if (
    event.source !== parent ||
    event.origin !== origin ||
    event.data?.token !== token
  )
    return;
  const message = event.data as {
    type: string;
    before: CadSource;
    after: CadSource;
    options: AcApDiffCompareOptions;
  };
  chain = chain.then(async () => {
    try {
      if (message.type === "dispose") {
        await disposeCadViewer();
        send({ type: "disposed" });
        return;
      }
      if (message.type !== "open")
        throw new Error("Unsupported trusted CAD message");
      const options = snapshotCadOptions(message.options);
      for (const source of [message.before, message.after]) {
        // Cheap text-DXF envelope guard; parsing/entity semantics remain donor-owned.
        const bytes = new Uint8Array(source.data);
        const decoder = new TextDecoder();
        const start = decoder.decode(bytes.subarray(0, 1024)).trim();
        const end = decoder
          .decode(bytes.subarray(Math.max(0, bytes.length - 128)))
          .trim();
        if (
          !/^(?:999\s+[^\r\n]+\s+)*0\s+SECTION\b/.test(start) ||
          !/\b0\s+EOF$/.test(end)
        )
          throw new Error(
            "Trusted CAD source is not a complete text DXF artifact",
          );
      }
      let completed!: (result: AcApDiffCompareResult) => void;
      let failed!: (error: Error) => void;
      const initial = new Promise<AcApDiffCompareResult>((resolve, reject) => {
        completed = resolve;
        failed = reject;
      });
      // Attach a rejection observer before asynchronous native opening.
      void initial.catch(() => undefined);
      await openCadSources(
        document.getElementById("viewer")!,
        message.before,
        message.after,
        completed,
        () => undefined,
        failed,
      );
      const defaultResult = await initial;
      const result = Object.keys(options).length
        ? await compareLoadedCadSources(
            message.before.revisionId,
            message.after.revisionId,
            options,
          )
        : defaultResult;
      send({
        type: "comparison",
        result: normalizeCadResult(result, message.before, message.after),
      });
    } catch (error) {
      await disposeCadViewer();
      send({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
});
send({ type: "ready" });
