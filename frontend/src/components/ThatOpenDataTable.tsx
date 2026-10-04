import { createElement, useEffect, useRef } from "react";
import type {
  CellCreatedEventDetail,
  ColumnData,
  Table,
  TableCell,
  TableDataTransform,
  TableGroupData,
  TableRowData,
} from "@thatopen/ui";

/** Property-only React bridge; the donor owns rows, cells and rendering. */
export function ThatOpenDataTable<T extends TableRowData>({
  data,
  columns,
  dataTransform,
  hiddenColumns = [],
  className,
  "aria-label": ariaLabel,
}: {
  data: TableGroupData<T>[];
  columns: ColumnData<T>[];
  dataTransform: TableDataTransform<T>;
  hiddenColumns?: (keyof T)[];
  className?: string;
  "aria-label": string;
}) {
  const ref = useRef<Table<T>>(null);
  const cells = useRef(new Set<TableCell<T>>());
  const columnLayout = useRef("");
  useEffect(() => {
    const table = ref.current!;
    const created = (event: Event) =>
      cells.current.add(
        (event as CustomEvent<CellCreatedEventDetail<T>>).detail.cell,
      );
    table.addEventListener("cellcreated", created);
    return () => table.removeEventListener("cellcreated", created);
  }, []);
  useEffect(() => {
    const table = ref.current;
    if (!table) return;
    table.noIndentation = true;
    table.selectableRows = false;
    // Column setters rebuild donor cells even when the layout is unchanged.
    const nextLayout = JSON.stringify(columns);
    // The donor adds missing hidden columns, so compare the declared layout, not its expanded copy.
    if (columnLayout.current !== nextLayout) {
      table.columns = columns;
      columnLayout.current = nextLayout;
    }
    if (JSON.stringify(table.hiddenColumns) !== JSON.stringify(hiddenColumns))
      table.hiddenColumns = hiddenColumns;
    table.dataTransform = dataTransform;
    const previous = new Map(table.data.map((row) => [row.id, row]));
    table.data = data.map((next) => {
      const row = next.id === undefined ? undefined : previous.get(next.id);
      // Keep flat domain rows stable so donor reuse() does not rebuild their cells.
      if (!row || row.children?.length || next.children?.length)
        return { ...next };
      row.data = next.data;
      return row;
    });
    // Re-render existing cell templates in place: Lit retains the action DOM and
    // updates bindings/callbacks without removing the focused donor button.
    for (const cell of cells.current) {
      if (!cell.isConnected) cells.current.delete(cell);
      else {
        cell.rowData = cell.row!.data;
        cell.requestUpdate();
      }
    }
  }, [data, columns, dataTransform, hiddenColumns]);
  return createElement("bim-table", {
    ref,
    className,
    "aria-label": ariaLabel,
  });
}
