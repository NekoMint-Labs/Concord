import { useEffect, useRef, useState } from "react";
import { prepareDrawingSource } from "./drawingPreparation";
import { paintDrawingSheet } from "./paintDrawingSheet";
import type { DrawingArtifact } from "./drawingArtifactTypes";
import type { DrawingSource } from "./pdfDiffTypes";
/** All sheets are derived once per cache miss; the inactive surface retains no PDF SDK lifetime. */
export function useDrawingDocument(
  source: DrawingSource,
  pageNumber: number,
  zoom: number,
) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [artifact, setArtifact] = useState<DrawingArtifact>();
  const [pages, setPages] = useState(0);
  const [dimensions, setDimensions] = useState({ width: 1, height: 1 });
  const [status, setStatus] = useState("Opening drawing…");
  const [error, setError] = useState("");
  const [diagnostics, setDiagnostics] = useState<{
    cacheHit: boolean;
    preparationMs: number;
  }>();
  useEffect(() => {
    const abort = new AbortController();
    setArtifact(undefined);
    setPages(0);
    setError("");
    setDiagnostics(undefined);
    setStatus("Opening drawing…");
    void prepareDrawingSource(source, abort.signal, (page, total) => {
      if (!abort.signal.aborted)
        setStatus(`Preparing sheet ${page} of ${total}…`);
    })
      .then((result) => {
        if (abort.signal.aborted) return;
        setPages(result.artifact.sheets.length);
        setArtifact(result.artifact);
        setDiagnostics({
          cacheHit: result.cacheHit,
          preparationMs: result.artifact.preparationMs,
        });
      })
      .catch((failure) => {
        if (!abort.signal.aborted) {
          setError(String(failure?.message || failure));
          setStatus("");
        }
      });
    return () => abort.abort();
  }, [source]);
  useEffect(() => {
    if (!artifact) return;
    const abort = new AbortController();
    const element = canvas.current;
    setStatus("Rendering drawing…");
    setError("");
    void (async () => {
      if (
        !Number.isInteger(pageNumber) ||
        pageNumber < 1 ||
        pageNumber > artifact.sheets.length
      )
        throw new Error("Requested drawing page is unavailable");
      if (!element) throw new Error("Drawing canvas is unavailable");
      const sheet = artifact.sheets[pageNumber - 1];
      setDimensions({ width: sheet.width, height: sheet.height });
      await paintDrawingSheet(element, sheet, zoom, abort.signal);
      if (!abort.signal.aborted) setStatus("");
    })().catch((failure) => {
      if (!abort.signal.aborted) {
        setError(String(failure?.message || failure));
        setStatus("");
      }
    });
    return () => {
      abort.abort();
      if (element) {
        element.width = 0;
        element.height = 0;
      }
    };
  }, [artifact, pageNumber, zoom]);
  const readText = async () => {
    const sheet = artifact?.sheets[pageNumber - 1];
    if (!sheet)
      throw new Error("Drawing is not ready for native text selection");
    return structuredClone(sheet.textRuns);
  };
  return { canvas, pages, dimensions, status, error, readText, diagnostics };
}
