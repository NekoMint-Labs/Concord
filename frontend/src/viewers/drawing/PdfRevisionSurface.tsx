import { useEffect, useRef, useState } from "react";
import { comparePdfRevisions } from "./pdfDiffAdapter";
import type {
  DrawingSource,
  PdfDiffOptions,
  PdfDiffResult,
} from "./pdfDiffTypes";
import "./drawing.css";
export default function PdfRevisionSurface({
  before,
  after,
  options,
  onResult,
}: {
  before: DrawingSource;
  after: DrawingSource;
  options?: PdfDiffOptions;
  onResult?: (result: PdfDiffResult) => void;
}) {
  const resultCallback = useRef(onResult);
  resultCallback.current = onResult;
  const [result, setResult] = useState<PdfDiffResult>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    setError("");
    comparePdfRevisions(before, after, options, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setResult(value);
        resultCallback.current?.(value);
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error ? failure.message : String(failure),
          );
      });
    return () => controller.abort();
  }, [before, after, options]);
  if (error) return <p role="alert">PDF comparison unavailable: {error}</p>;
  if (!result) return <p role="status">Comparing PDF revisions…</p>;
  return (
    <section
      className="engineering-drawing"
      aria-label="PDF revision comparison"
    >
      <p>
        {result.artifact.pages.length} matched pages;{" "}
        {result.artifact.addedPages.length} added;{" "}
        {result.artifact.deletedPages.length} deleted.
        {result.cacheHit
          ? " Reused derived comparison."
          : ` ${Math.round(result.artifact.elapsedMs)} ms.`}
      </p>
      <details>
        <summary>Comparison quality and region coordinates</summary>
        <ul>
          {result.artifact.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </details>
      {result.artifact.pages.map((page) => (
        <div key={`${page.pageNumA}:${page.pageNumB}`}>
          <h3>
            Page {page.pageNumA} → {page.pageNumB}: {page.diffPixels} changed
            pixels
          </h3>
          <div className="engineering-diff-pair">
            <Overlay
              blob={page.overlayA}
              label={`Earlier page ${page.pageNumA}`}
            />
            <Overlay
              blob={page.overlayB}
              label={`Later page ${page.pageNumB}`}
            />
          </div>
        </div>
      ))}
    </section>
  );
}
function Overlay({ blob, label }: { blob: Blob; label: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const value = URL.createObjectURL(blob);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [blob]);
  return <img src={url || undefined} alt={label} />;
}
