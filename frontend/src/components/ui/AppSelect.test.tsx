import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { AppSelect } from "./AppSelect";

const options = [
  { value: "design_revision", label: "设计修订" },
  { value: "workforce", label: "班组人员不足" },
  { value: "material", label: "材料不可用" },
];

it("maps the selected value and accessible name to the closed trigger", () => {
  render(
    <AppSelect
      label="变更类型"
      value="design_revision"
      onChange={() => {}}
      options={options}
    />,
  );

  expect(screen.getByRole("combobox", { name: "变更类型" })).toHaveTextContent(
    "设计修订",
  );
});
