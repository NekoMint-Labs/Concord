import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DocumentChunk,
  DocumentController,
  DocumentTarget,
  ExtractedDocument,
} from "./documentTypes";
import {
  documentCell,
  documentReference,
  resolveDocumentTarget,
  validateExtractedDocument,
} from "./documentNavigation";
/** C's extracted evidence surface. B owns composition; original Office layout is not reconstructed. */
export default function DocumentSurface({
  source,
  target,
  onReady,
  onSelection,
}: {
  source: ExtractedDocument;
  target?: DocumentTarget;
  onReady?: (controller: DocumentController) => void;
  onSelection?: (reference: DocumentTarget) => void;
}) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const controllerRef = useRef<DocumentController | undefined>(undefined);
  const callbacks = useRef({ onReady, onSelection });
  callbacks.current = { onReady, onSelection };
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const content = useMemo(() => {
    try {
      validateExtractedDocument(source);
      const tables = new Map<string, DocumentChunk[]>(),
        paragraphs: DocumentChunk[] = [];
      for (const chunk of source.chunks) {
        const cell = documentCell(chunk);
        if (cell) {
          const key = cell.group + "\0" + cell.tableId;
          const list = tables.get(key) ?? [];
          list.push(chunk);
          tables.set(key, list);
        } else paragraphs.push(chunk);
      }
      return { tables, paragraphs, error: "" };
    } catch (failure) {
      return {
        tables: new Map<string, DocumentChunk[]>(),
        paragraphs: [],
        error: String(failure instanceof Error ? failure.message : failure),
      };
    }
  }, [source]);
  useEffect(() => {
    let live = true;
    setSelected("");
    setError("");
    const navigate = async (reference: DocumentTarget) => {
      if (!live) throw new Error("Document viewer was closed");
      try {
        if (content.error) throw new Error(content.error);
        const chunk = resolveDocumentTarget(source, reference);
        const node = nodes.current.get(chunk.id);
        if (!node) throw new Error("Document excerpt is not mounted");
        const result = documentReference(source, chunk);
        setError("");
        setSelected(chunk.id);
        node.scrollIntoView?.({ block: "center", behavior: "auto" });
        node.focus({ preventScroll: true });
        callbacks.current.onSelection?.(result);
        return result;
      } catch (failure) {
        setSelected("");
        setError(failure instanceof Error ? failure.message : String(failure));
        throw failure;
      }
    };
    const controller = { navigate };
    controllerRef.current = controller;
    if (!content.error) callbacks.current.onReady?.(controller);
    return () => {
      live = false;
      controllerRef.current = undefined;
    };
  }, [source, content]);
  useEffect(() => {
    if (target) void controllerRef.current?.navigate(target).catch(() => {});
  }, [source, content, target]);
  const bind = (id: string) => (node: HTMLElement | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  };
  const choose = (chunk: DocumentChunk) => {
    try {
      const reference = documentReference(source, chunk);
      void controllerRef.current?.navigate(reference).catch(() => {});
    } catch (failure) {
      setSelected("");
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  if (content.error)
    return (
      <section aria-label="Document viewer">
        <p role="alert">{content.error}</p>
      </section>
    );
  return (
    <section aria-label="Document viewer">
      <h2>{source.filename}</h2>
      <p>
        Extracted document · {source.sourceRevisionId}. Consult the original
        source for its page layout.
      </p>
      {error && <p role="alert">{error}</p>}
      {content.paragraphs.map((chunk) => (
        <article
          key={chunk.id}
          ref={bind(chunk.id)}
          tabIndex={0}
          style={{
            outline: selected === chunk.id ? "2px solid #3573b7" : undefined,
            outlineOffset: 2,
          }}
          data-selected={selected === chunk.id || undefined}
          aria-label={`Excerpt ${chunk.id}`}
          onClick={() => choose(chunk)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              choose(chunk);
            }
          }}
        >
          <p>
            {chunk.page ? `Page ${chunk.page}` : "Page not supplied by source"}{" "}
            · {chunk.location || "Location not supplied by source"}
          </p>
          <p style={{ whiteSpace: "pre-wrap" }}>{chunk.text}</p>
          <small>{chunk.parser}</small>
        </article>
      ))}
      {[...content.tables].map(([group, chunks]) => (
        <table key={group}>
          <caption>{documentCell(chunks[0])!.group}</caption>
          <thead>
            <tr>
              <th>Source row</th>
              <th>Cell</th>
              <th>Extracted text</th>
              <th>Source spans</th>
            </tr>
          </thead>
          <tbody>
            {chunks.map((chunk) => {
              const cell = documentCell(chunk)!;
              return (
                <tr
                  key={chunk.id}
                  ref={bind(chunk.id)}
                  tabIndex={0}
                  style={{
                    outline:
                      selected === chunk.id ? "2px solid #3573b7" : undefined,
                    outlineOffset: 2,
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      choose(chunk);
                    }
                  }}
                  data-selected={selected === chunk.id || undefined}
                  aria-label={`Cell ${cell.address}, excerpt ${chunk.id}`}
                  onClick={() => choose(chunk)}
                >
                  <td>{cell.row}</td>
                  <th scope="row">{cell.address}</th>
                  <td style={{ whiteSpace: "pre-wrap" }}>{chunk.text}</td>
                  <td>
                    {cell.rowSpan} row(s), {cell.columnSpan} column(s)
                    {cell.columnHeader ? " · column header" : ""}
                    {cell.rowHeader ? " · row header" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
    </section>
  );
}
