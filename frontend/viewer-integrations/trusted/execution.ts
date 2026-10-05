import { comparePdfRevisions } from "../../src/viewers/drawing/pdfDiffAdapter";
import { PDF_DIFF_ENGINE } from "../../src/viewers/drawing/pdfDiffTypes";
import { CAD_ENGINE } from "../../src/viewers/cad/cadTypes";
import type { CadComparison } from "../../src/viewers/cad/cadTypes";
import type {
  DrawingSource,
  PdfDiffOptions,
} from "../../src/viewers/drawing/pdfDiffTypes";

interface Input {
  kind: string;
  sources: {
    revisionId: string;
    sourceHash: string;
    name: string;
    bytes: string;
  }[];
  options: PdfDiffOptions;
}
function source(value: Input["sources"][number]) {
  const bytes = Uint8Array.from(atob(value.bytes), (char) =>
    char.charCodeAt(0),
  );
  return { ...value, data: bytes.buffer };
}
async function cad(
  before: DrawingSource,
  after: DrawingSource,
  options: object,
): Promise<CadComparison> {
  const frame = document.createElement("iframe");
  frame.style.cssText = "width:1280px;height:800px";
  const token = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const finish = (result?: CadComparison, error?: Error) => {
      clearTimeout(timer);
      window.removeEventListener("message", receive);
      frame.remove();
      if (error) reject(error);
      else resolve(result!);
    };
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.contentWindow ||
        event.origin !== location.origin ||
        event.data?.token !== token
      )
        return;
      const message = event.data;
      if (message.type === "ready")
        frame.contentWindow!.postMessage(
          { type: "open", token, before, after, options, requestId: token },
          location.origin,
        );
      if (message.type === "comparison" && message.result) {
        frame.contentWindow!.postMessage(
          { type: "dispose", token },
          location.origin,
        );
        result = message.result;
      }
      if (message.type === "disposed" && result) finish(result);
      if (message.type === "error")
        finish(undefined, new Error(message.message));
    };
    let result: CadComparison | undefined;
    const timer = setTimeout(
      () => finish(undefined, new Error("Trusted CAD comparison timed out")),
      125000,
    );
    window.addEventListener("message", receive);
    frame.src = `/viewer/cad/trusted.html?token=${token}`;
    document.body.append(frame);
  });
}
export async function execute(input: Input) {
  if (input.sources.length !== 2)
    throw new Error("Two ordered originals required");
  const [before, after] = input.sources.map(source);
  if (input.kind === "pdf_comparison") {
    const result = await comparePdfRevisions(before, after, input.options);
    // Retain measured engine output; raster overlays stay outside the 8 MiB fact artifact.
    const artifact = {
      ...result.artifact,
      // Elapsed time is measured by the caller, outside content-addressed facts.
      elapsedMs: 0,
      pages: result.artifact.pages.map(
        ({ overlayA: _a, overlayB: _b, ...page }) => page,
      ),
    };
    return {
      schema: 1,
      kind: input.kind,
      engine: PDF_DIFF_ENGINE,
      options: input.options,
      result: { ...result, artifact },
    };
  }
  if (input.kind === "cad_comparison") {
    return {
      schema: 1,
      kind: input.kind,
      engine: CAD_ENGINE,
      options: input.options,
      result: await cad(before, after, input.options),
    };
  }
  throw new Error("Unsupported trusted comparison kind");
}
Object.assign(window, { executeTrustedComparison: execute });
