/* Stage contracts for the Concord workspace.
 *
 * The root composition is the OpenTakeoff workspace (vendor/opentakeoff/): one
 * chrome, a navigator, a tool rail, a single dominant central stage and one
 * contextual inspector. These types are the seam between the shell (App) and
 * the central stage surfaces, so a stage surface never owns navigation and the
 * shell never owns engineering content.
 */
import type { WorkspaceTab } from "./destinations";

/** One engineering object, whatever its kind. Keys are opaque and round-trip. */
export type StageObject =
  | { kind: "source"; id: string }
  | { kind: "revision"; id: string; sourceId: string }
  | { kind: "document"; id: string }
  | { kind: "finding"; id: string }
  | { kind: "work-package"; id: string }
  | { kind: "work-package-model"; id: string };

/** A navigator row: the donor's WorkspaceNavigator item shape. */
export type StageNavigatorItem = {
  key: string;
  label: string;
  file: string;
  count?: number;
  group?: string;
  /*
   * Which class of object the row is, so the navigator can express a hierarchy
   * instead of printing every object at one weight. A revision is a child of the
   * source it came from, and the rail has to be able to say so in the row itself
   * rather than in the strings inside it.
   */
  kind?: StageObject["kind"];
};

export const stageKey = (object: StageObject): string => {
  switch (object.kind) {
    case "revision":
      return `revision:${object.sourceId}:${object.id}`;
    case "work-package-model":
      return `work-package-model:${object.id}`;
    default:
      return `${object.kind}:${object.id}`;
  }
};

export function stageObject(key: string | undefined): StageObject | null {
  if (!key) return null;
  const [kind, ...rest] = key.split(":");
  switch (kind) {
    case "source":
    case "document":
    case "finding":
    case "work-package":
    case "work-package-model":
      return rest[0] ? { kind, id: rest[0] } : null;
    case "revision":
      return rest[0] && rest[1]
        ? { kind: "revision", sourceId: rest[0], id: rest[1] }
        : null;
    default:
      return null;
  }
}

/** What the stage and the inspector agree on: one selected object, one tab. */
export type StageSelection = {
  tab: WorkspaceTab;
  object: StageObject | null;
};
