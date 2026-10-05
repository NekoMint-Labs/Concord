import { expect, it } from "vitest";
import {
  markupPatch,
  applyMarkupPatch,
} from "../../../vendor/opentakeoff/annotationTools.js";
import { recordCommand } from "../../../vendor/opentakeoff/recordCommand.js";
it("donor undo restores edited IDs and keeps unrelated annotations", () => {
  const before = [
    { id: "a", text: "Original" },
    { id: "b", text: "Other" },
  ];
  const after = [{ id: "a", text: "Edited" }, before[1]];
  const patch = markupPatch(before, after);
  const current = [...after, { id: "c", text: "Concurrent note" }];
  expect(applyMarkupPatch(current, patch, "before")).toEqual([
    ...before,
    current[2],
  ]);
  expect(applyMarkupPatch([...before, current[2]], patch, "after")).toEqual(
    current,
  );
});
it("donor undo preserves deletion order and discards a redo future on new edits", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const patch = markupPatch(rows, [rows[0], rows[2]]);
  expect(applyMarkupPatch([rows[0], rows[2]], patch, "before")).toEqual(rows);
  const history = recordCommand(
    Array.from({ length: 100 }, (_, i) => i),
    100,
  );
  expect(history.undo).toHaveLength(100);
  expect(history.undo[0]).toBe(1);
  expect(history.redo).toEqual([]);
});
