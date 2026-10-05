import type { PDFDocumentProxy } from "pdfjs-dist";
import type {
  PdfDiffOptions,
  PdfDiffPage,
} from "../../src/viewers/drawing/pdfDiffTypes";
export default class PDFDiffViewer {
  constructor(
    container: object,
    options: PdfDiffOptions & { workerSrc: string },
  );
  _findPageMappings(
    a: PDFDocumentProxy,
    b: PDFDocumentProxy,
  ): Promise<{ pageA: number; pageB: number; similarity: number }[]>;
  _comparePagePair(
    a: PDFDocumentProxy,
    b: PDFDocumentProxy,
    pageA: number,
    pageB: number,
  ): Promise<PdfDiffPage>;
}

export function releaseCanvases(): void;
