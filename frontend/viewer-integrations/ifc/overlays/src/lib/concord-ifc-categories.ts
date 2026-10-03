import { IFC2X3, IFC4, IFC4X3 } from "web-ifc";

// The SDK's existing schema definitions provide names and inheritance. No WASM
// API is constructed and no source is opened to classify derived categories.
const names = new Map<string, string>();
const elements = new Set<string>();
for (const schema of [IFC2X3, IFC4, IFC4X3]) {
  for (const [name, constructor] of Object.entries(schema)) {
    if (typeof constructor !== "function" || !name.startsWith("Ifc")) continue;
    names.set(name.toUpperCase(), name);
    if (
      constructor === schema.IfcElement ||
      constructor.prototype instanceof schema.IfcElement
    )
      elements.add(name.toUpperCase());
  }
}
export function ifcClassName(category: string): string {
  return names.get(category.toUpperCase()) ?? category;
}
export const ELEMENT_CATEGORIES = new RegExp(
  `^(?:${[...elements].join("|")})$`,
  "i",
);
