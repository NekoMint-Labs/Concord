import { lazy, Suspense, useState, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { sha256 } from "../src/viewers/drawing/pdfDiffValidation";
import { comparePdfRevisions } from "../src/viewers/drawing/pdfDiffAdapter";
import type {
  DrawingSource,
  PdfDiffOptions,
  PdfDiffResult,
} from "../src/viewers/drawing/pdfDiffTypes";
import type { IfcSource } from "../src/viewers/ifc/ifcTypes";
const Document = lazy(() => import("../src/viewers/document/DocumentSurface"));
const Ifc = lazy(() => import("../src/viewers/ifc/IfcSurface"));
const Drawing = lazy(() => import("../src/viewers/drawing/DrawingSurface"));
const Cad = lazy(() => import("../src/viewers/cad/CadSurface"));
const Comparison = lazy(
  () => import("../src/viewers/drawing/PdfRevisionSurface"),
);
function Harness() {
  const [drawingTargetText, setDrawingTargetText] = useState("");
  const [bimTargetText, setBimTargetText] = useState("");
  const [bimTarget, setBimTarget] =
    useState<import("../src/viewers/ifc/ifcTypes").BimTarget>();
  const [viewerFailure, setViewerFailure] = useState<string | null>(null);
  const [drawingTarget, setDrawingTarget] =
    useState<import("../src/viewers/drawing/drawingContract").DrawingTarget>();
  const [before, setBefore] = useState<DrawingSource>();
  const [after, setAfter] = useState<DrawingSource>();
  const [view, setView] = useState("none");
  const [generation, setGeneration] = useState(0);
  const [options, setOptions] = useState<PdfDiffOptions>({
    scale: 1,
    maxShift: 1,
  });
  const [result, setResult] = useState<PdfDiffResult>();
  const [error, setError] = useState("");
  const ifcSources = useMemo(
    () => [before, after].filter(Boolean) as IfcSource[],
    [before, after],
  );
  const [ifcResult, setIfcResult] = useState<unknown>();
  const [selection, setSelection] = useState<unknown>();
  const [annotations, setAnnotations] = useState<unknown[]>([]);
  const [cadSelection, setCadSelection] = useState<unknown>();
  const [cadResult, setCadResult] = useState<unknown>();
  const [extracted, setExtracted] =
    useState<
      import("../src/viewers/document/documentTypes").ExtractedDocument
    >();
  const [documentSelection, setDocumentSelection] = useState<unknown>();
  const upload = async (file: File, side: "before" | "after") => {
    const data = await file.arrayBuffer();
    const source = {
      name: file.name,
      revisionId: `${side}:${file.name}`,
      sourceHash: await sha256(data),
      data,
    };
    if (side === "before") setBefore(source);
    else setAfter(source);
    setView("none");
    setResult(undefined);
  };
  return (
    <main>
      <pre data-testid="drawing-annotations">{JSON.stringify(annotations)}</pre>
      <h1>Isolated C-owned viewer qualification</h1>
      <label>
        Earlier source
        <input
          aria-label="Earlier source"
          type="file"
          accept=".pdf,.dxf,.dwg,.ifc"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file, "before");
          }}
        />
      </label>
      <label>
        Later source
        <input
          aria-label="Later source"
          type="file"
          accept=".pdf,.dxf,.dwg,.ifc"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file, "after");
          }}
        />
      </label>
      <p data-testid="source-state">
        {before && after ? "Ready" : "Choose sources"}
      </p>
      <label>
        Drawing target
        <textarea
          aria-label="Drawing target"
          value={drawingTargetText}
          onChange={(event) => setDrawingTargetText(event.target.value)}
        />
      </label>
      <button
        onClick={() => {
          try {
            setDrawingTarget(JSON.parse(drawingTargetText));
          } catch {
            setError("Invalid drawing target JSON");
          }
        }}
      >
        Navigate drawing
      </button>
      <label>
        BIM target
        <textarea
          aria-label="BIM target"
          value={bimTargetText}
          onChange={(event) => setBimTargetText(event.target.value)}
        />
      </label>
      <button
        onClick={() => {
          try {
            setBimTarget(JSON.parse(bimTargetText));
          } catch {
            setError("Invalid BIM target JSON");
          }
        }}
      >
        Navigate BIM
      </button>
      <pre data-testid="viewer-failure">{viewerFailure ?? "none"}</pre>
      <button disabled={!before} onClick={() => setView("drawing")}>
        Open drawing
      </button>
      <button
        disabled={!before || !after}
        onClick={() => {
          setGeneration((value) => value + 1);
          setResult(undefined);
          setView("diff");
        }}
      >
        Compare revisions
      </button>
      <button
        disabled={!before}
        onClick={() => {
          setCadResult(undefined);
          setView("cad");
        }}
      >
        Open CAD
      </button>
      <button
        disabled={!before}
        onClick={() => {
          setIfcResult(undefined);
          setSelection(undefined);
          setView("ifc");
        }}
      >
        Open IFC
      </button>
      <label>
        Qualified extraction
        <input
          aria-label="Qualified extraction"
          type="file"
          accept=".json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file)
              void file.text().then((text) => {
                setExtracted(JSON.parse(text));
                setView("none");
              });
          }}
        />
      </label>
      <button disabled={!extracted} onClick={() => setView("document")}>
        Open document
      </button>
      <button onClick={() => setView("none")}>Close viewer</button>
      <label>
        Diff options
        <textarea
          aria-label="Diff options"
          defaultValue={JSON.stringify(options)}
          onChange={(event) => {
            try {
              setOptions(JSON.parse(event.target.value));
              setError("");
            } catch {
              setError("Invalid options JSON");
            }
          }}
        />
      </label>
      <button
        disabled={!before || !after}
        onClick={() => {
          const controller = new AbortController();
          const promise = comparePdfRevisions(
            before!,
            after!,
            { scale: 0.5 },
            controller.signal,
          );
          controller.abort();
          promise.catch((failure) => setError(failure.name));
        }}
      >
        Cancel comparison
      </button>
      {error && <p role="alert">{error}</p>}
      <Suspense fallback={<p role="status">Loading engineering surface…</p>}>
        {view === "document" && extracted && (
          <Document
            source={extracted}
            onError={setViewerFailure}
            onSelection={setDocumentSelection}
            onReady={(controller) =>
              Object.assign(window, { documentSession: controller })
            }
          />
        )}
        {view === "drawing" && before && (
          <Drawing
            source={before}
            onError={setViewerFailure}
            target={drawingTarget}
            onAnnotations={setAnnotations}
          />
        )}
        {view === "diff" && before && after && (
          <Comparison
            key={generation}
            before={before}
            after={after}
            options={options}
            onResult={setResult}
          />
        )}
        {view === "cad" && before && (
          <Cad
            before={before as DrawingSource & { name: string }}
            after={after as DrawingSource & { name: string }}
            onError={setViewerFailure}
            onComparison={setCadResult}
            onSelection={setCadSelection}
            onReady={(controller) =>
              Object.assign(window, {
                cadSession: controller,
                setCadSourceHash: (hash: string) =>
                  setBefore((source) =>
                    source ? { ...source, sourceHash: hash } : source,
                  ),
              })
            }
          />
        )}
        {view === "ifc" && before && (
          <Ifc
            sources={ifcSources}
            target={bimTarget}
            onError={setViewerFailure}
            onSelection={setSelection}
            onReady={(adapter) => {
              Object.assign(window, { ifcSession: adapter });
              setIfcResult(adapter.summaries.slice());
            }}
          />
        )}
      </Suspense>
      {documentSelection && (
        <output data-testid="document-selection">
          {JSON.stringify(documentSelection)}
        </output>
      )}
      {ifcResult && (
        <output data-testid="ifc-result">{JSON.stringify(ifcResult)}</output>
      )}
      {selection && (
        <output data-testid="ifc-selection">{JSON.stringify(selection)}</output>
      )}
      {cadSelection && (
        <output data-testid="cad-selection">
          {JSON.stringify(cadSelection)}
        </output>
      )}
      {cadResult && (
        <output data-testid="cad-result">{JSON.stringify(cadResult)}</output>
      )}
      {result && (
        <output data-testid="diff-result">
          {JSON.stringify({
            cacheHit: result.cacheHit,
            elapsedMs: result.artifact.elapsedMs,
            changedPixels: result.artifact.pages.reduce(
              (sum, page) => sum + page.diffPixels,
              0,
            ),
            pages: result.artifact.pages.map((page) => ({
              pageA: page.pageNumA,
              pageB: page.pageNumB,
              boxes: page.boxes.length,
              words: page.wordHighlightsA.length,
              width: page.width,
              height: page.height,
              alignment: page.alignment,
            })),
            added: result.artifact.addedPages,
            deleted: result.artifact.deletedPages,
            warnings: result.artifact.warnings,
          })}
        </output>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
