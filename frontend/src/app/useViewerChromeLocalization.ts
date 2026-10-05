import { useEffect, type RefObject } from "react";

/**
 * ── the host-side chrome bridge ──────────────────────────────────────────────
 *
 * The viewer integrations are byte-pinned donor code, so a few of their own English
 * labels survive into the product. This hook is the one B-owned bridge that swaps
 * them: after mount it walks *only* the B-owned evidence viewer slot, replaces the
 * known donor strings it finds in text nodes and `<option>` labels, and leaves
 * everything else alone.
 *
 * The map is explicit and narrow - one entry per string that has actually been
 * verified to render. A datum - a sheet number, a file name, a revision, an id - can
 * never match it. The single exception is the viewer's sheet-preparation line, whose
 * text carries the sheet count; it is matched by one fully-anchored pattern (see
 * `localizeNode`), not by a broad rule. Nothing outside the slot is read or written;
 * `aria-label`s, `data-*`, roles, names and event behaviour are never touched.
 * Replacements are idempotent - a translated node no longer matches its key - so
 * running on every mount and viewer swap is safe, and a MutationObserver keeps the
 * chrome translated when the viewer re-renders in place (arming a tool adds controls)
 * or remounts.
 */
export const viewerChrome: Readonly<Record<string, string>> = Object.freeze({
  /* the drawing viewer's sheet navigation and tools */
  "Previous sheet": "上一张",
  "Next sheet": "下一张",
  Sheet: "图纸",
  of: "/",
  "Fit sheet": "适配图纸",
  Tool: "工具",
  Navigate: "浏览",
  Calibrate: "校准",
  Distance: "距离",
  Area: "面积",
  "Revision cloud": "修订云线",
  Annotation: "标注",
  "Known length (m)": "已知长度 (m)",
  Finish: "完成",
  "Undo point": "撤销点",
  Cancel: "取消",
  /* the viewer's own measurement note */
  "Measurements require calibration for this sheet.":
    "本图纸需先校准方可测量；",
  "Calibrated in metres.": "已按米校准。",
  "Scroll to pan.": "滚动可平移。",
  /* the viewer's own load states, shown while a sheet is prepared */
  "Opening drawing…": "正在打开图纸…",
  "Rendering drawing…": "正在渲染图纸…",
  /* the CAD and BIM evidence surfaces' own host status lines (their inner chrome
     lives in a cross-document iframe or on a canvas and is not reachable here) */
  "Loading CAD capability…": "正在加载 CAD 查看器…",
  "Loading IFC capability…": "正在加载 IFC 查看器…",
  /* the annotation workbench */
  Annotate: "标注",
  Arrow: "箭头",
  Highlighter: "荧光笔",
  Callout: "引线标注",
  "Cloud + note": "云线批注",
  Sweep: "扫视",
  "Select markups": "选择批注",
  Favorites: "常用",
  "Undo annotation": "撤销标注",
  "Redo annotation": "重做标注",
  /* the workbench's tool properties, shown once a tool is armed */
  Weight: "线宽",
  Line: "线型",
  Head: "箭头",
  "Both ends": "两端",
  Width: "宽度",
  Opacity: "不透明度",
  Text: "文字",
  "Edit note": "编辑批注",
  "Apply note": "应用批注",
  "Save favorite": "保存常用",
  /* the document evidence surface, which is product-owned markup inside the slot */
  "Extracted document ·": "提取文档 ·",
  ". Consult the original source for its page layout.":
    "。请以原始来源为准查看其页面版式。",
  "Source row": "来源行",
  Cell: "单元格",
  "Extracted text": "提取文本",
  "Source spans": "来源跨度",
});

/**
 * Replace a known donor string in one text node, preserving its surrounding space.
 *
 * Exactly one donor string is a template rather than a fixed label - the sheet
 * preparation line - and it is matched by a full anchored pattern, so a sheet number
 * can never be caught by anything else.
 */
function localizeNode(node: Text): void {
  const value = node.nodeValue ?? "";
  const label = value.trim();
  const preparing = /^Preparing sheet (\d+) of (\d+)…$/.exec(label);
  if (preparing) {
    node.nodeValue = value.replace(
      label,
      `正在准备图纸 ${preparing[1]} / ${preparing[2]}…`,
    );
    return;
  }
  const replacement = viewerChrome[label];
  if (replacement === undefined || replacement === label) return;
  node.nodeValue = value.replace(label, replacement);
}

/**
 * Translate the known donor chrome inside one host-owned subtree, and keep it
 * translated as the viewer re-renders. Idempotent; touches nothing outside `slot`.
 */
export function useViewerChromeLocalization(
  slot: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const root = slot.current;
    if (!root) return;
    const walk = () => {
      const nodes = root.ownerDocument.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
      );
      for (let node = nodes.nextNode(); node; node = nodes.nextNode())
        localizeNode(node as Text);
    };
    walk();
    // React re-renders the viewer in place (arming a tool, selecting a markup), so the
    // chrome can reappear after the first pass. A no-op pass schedules no further work,
    // so the observer settles instead of looping.
    const observer = new MutationObserver(walk);
    observer.observe(root, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [slot]);
}
