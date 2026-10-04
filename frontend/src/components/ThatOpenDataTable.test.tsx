import { fireEvent, render, waitFor } from "@testing-library/react";
import type { Button, Table, TableGroupData } from "@thatopen/ui";
import { html } from "lit";
import { expect, it, vi } from "vitest";
import { donorButton } from "../../tests/donor-dom";
import { ThatOpenDataTable } from "./ThatOpenDataTable";

type Row = { Name: string; Action: string; Id: string };

it("keeps action identity and focus while updating row data, active state and callbacks", async () => {
  const first = vi.fn();
  const next = vi.fn();
  const rows = (name: string): TableGroupData<Row>[] => [
    { id: "east", data: { Name: name, Action: "east", Id: "east" } },
  ];
  const table = (
    name: string,
    active: boolean,
    click: (id: string) => void,
  ) => (
    <ThatOpenDataTable<Row>
      aria-label="Sources"
      columns={[
        { name: "Name", width: "1fr" },
        { name: "Action", width: "64px" },
      ]}
      hiddenColumns={["Id"]}
      data={rows(name)}
      dataTransform={{
        Action: (id) =>
          html`<bim-button
            label="Open"
            aria-label="Open"
            .active=${active}
            @click=${() => click(String(id))}
          ></bim-button>`,
      }}
    />
  );
  const view = render(table("East", false, first));
  await waitFor(() =>
    expect(donorButton("Open", view.container)).toBeDefined(),
  );
  const action = donorButton("Open", view.container)! as Button;
  action.focus();
  expect(action.getRootNode()).toBeInstanceOf(ShadowRoot);
  expect((action.getRootNode() as ShadowRoot).activeElement).toBe(action);
  view.rerender(table("East revised", true, next));
  const host = view.container.querySelector<Table<Row>>("bim-table")!;
  await host.updateComplete;
  await waitFor(() => expect(action.active).toBe(true));
  expect(donorButton("Open", view.container)).toBe(action);
  expect((action.getRootNode() as ShadowRoot).activeElement).toBe(action);
  expect(action.isConnected).toBe(true);
  expect(host.data[0].data.Name).toBe("East revised");
  fireEvent.click(action);
  expect(first).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalledExactlyOnceWith("east");
  view.rerender(
    <ThatOpenDataTable<Row>
      aria-label="Sources"
      columns={host.columns}
      data={[]}
      dataTransform={{}}
    />,
  );
  await waitFor(() => expect(action.isConnected).toBe(false));
});
