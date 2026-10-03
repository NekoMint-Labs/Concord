import {
  AcApDocManager,
  AcEdOpenMode,
  type AcApDocument,
} from "@mlightcad/cad-simple-viewer";
import { AcApDiffViewer } from "../vendor/AcApDiffViewer";
import { disposeCadComparisons, registerCadDatabase } from "./cadCompareClient";
import { AcDbEntity, AcGeBox2d } from "@mlightcad/data-model";
import type { CadNavigation } from "./cadTypes";
import { validateCadTarget, verifyCadSource } from "./cadTypes";
import type { CadSource } from "./cadTypes";
import type { AcApDiffCompareResult } from "../vendor/compare";
let viewer: AcApDiffViewer | undefined;
const bindings = new Map<
  string,
  { source: CadSource; document: AcApDocument }
>();
const disposers: (() => void)[] = [];
const opening = new Map<string, CadSource>();
export async function openCadSources(
  container: HTMLElement,
  before: CadSource,
  after: CadSource | undefined,
  onCompare: (result: AcApDiffCompareResult) => void,
  onSelection: (target: CadNavigation) => void,
  onComparisonFailure: (error: Error) => void,
) {
  await verifyCadSource(before);
  if (after) {
    await verifyCadSource(after);
    if (before.revisionId === after.revisionId)
      throw new Error("CAD revisions must be distinct");
  }
  if (!viewer) {
    viewer = new AcApDiffViewer({
      container,
      baseUrl: new URL("./", location.href).href,
      webworkerFileUrls: {
        mtextRender: new URL("./mtext-renderer-worker.js", location.href).href,
      },
      openDocumentDefaults: { mode: AcEdOpenMode.Read },
      events: {
        opened: (side, document) => {
          const source = opening.get(side);
          if (!source)
            throw new Error("A CAD source revision was not registered");
          registerCadDatabase(document.database, source);
          bindings.set(source.revisionId, { source, document });
          const session = AcApDocManager.instance.sessionFor(document);
          if (!session) throw new Error("CAD document session was not created");
          const events =
            session.context.view.selectionSet.events.selectionAdded;
          const selected = (args: { ids: string[] }) => {
            if (AcApDocManager.instance.curDocument !== document) return;
            for (const entityId of args.ids) {
              const entity =
                document.database.openObjectForRead<AcDbEntity>(entityId);
              if (!(entity instanceof AcDbEntity)) continue;
              onSelection({
                sourceRevisionId: source.revisionId,
                sourceHash: source.sourceHash,
                entityId,
              });
            }
          };
          events.addEventListener(selected);
          disposers.push(() => events.removeEventListener(selected));
        },
        compared: onCompare,
        comparisonFailed: onComparisonFailure,
        failed: (_side, file) => {
          throw new Error(`DXF could not open: ${file}`);
        },
      },
    });
    // Prevent donor controls from switching the revision outside Concord's source adapter.
    container.addEventListener(
      "drop",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true,
    );
    container
      .querySelectorAll('input[type="file"]')
      .forEach((input) => input.setAttribute("disabled", ""));
  }
  opening.set("left", before);
  if (
    !(await viewer.openDocument("left", before.name, before.data.slice(0), {
      mode: AcEdOpenMode.Read,
    }))
  )
    throw new Error("Earlier DXF failed to open");
  if (after) {
    opening.set("right", after);
    if (
      !(await viewer.openDocument("right", after.name, after.data.slice(0), {
        mode: AcEdOpenMode.Read,
      }))
    )
      throw new Error("Later DXF failed to open");
  }
}
export async function disposeCadViewer() {
  disposeCadComparisons();
  opening.clear();
  for (const dispose of disposers.splice(0)) dispose();
  bindings.clear();
  const previous = viewer;
  viewer = undefined;
  await previous?.destroy();
}
export function cadElementCount() {
  return Array.from(
    AcApDocManager.instance.curDocument.database.tables.blockTable.modelSpace.newIterator(),
  ).length;
}

/** Native database identity/selection/zoom; never use caller-supplied bounds. */
export async function navigateCadEntity(
  target: CadNavigation,
): Promise<CadNavigation> {
  validateCadTarget(target);
  const binding = bindings.get(target.sourceRevisionId);
  if (!viewer || !binding || binding.source.sourceHash !== target.sourceHash)
    throw new Error("CAD target revision is not loaded or its hash changed");
  const side = viewer.leftDocument === binding.document ? "left" : "right";
  await viewer.setViewMode("side-by-side");
  if (!(await viewer.activateSide(side)))
    throw new Error("CAD target document could not be activated");
  const entity = binding.document.database.openObjectForRead<AcDbEntity>(
    target.entityId,
  );
  if (!(entity instanceof AcDbEntity))
    throw new Error("CAD entity is absent from the requested source revision");
  const bounds = entity.geometricExtents;
  if (bounds.isEmpty()) throw new Error("CAD entity has no navigable geometry");
  const min = bounds.min,
    max = bounds.max;
  if (![min.x, min.y, max.x, max.y].every(Number.isFinite))
    throw new Error("CAD entity bounds are invalid");
  const view = AcApDocManager.instance.curView;
  const box = new AcGeBox2d();
  box.expandByPoint({ x: min.x, y: min.y });
  box.expandByPoint({ x: max.x, y: max.y });
  view.selectionSet.clear();
  view.selectionSet.add(entity.objectId);
  view.zoomTo(box, 1.5);
  return { ...target, entityId: entity.objectId };
}
