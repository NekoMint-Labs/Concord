import { motion } from "motion/react";
import { Ellipsis } from "lucide-react";
import { AppMenu, AppMenuItem } from "../components/ui/AppMenu";
import { icon } from "../components/ui/icon";
import { useMotion } from "../motion";

/**
 * The view strip: the one place the window says which work surface is on screen.
 *
 * What a destination has to be to appear here is the point of this pass. The
 * strip is the product's workflow - the places a coordinator works - and it had
 * grown to include the engineering diagnostics (运行, 能力) as peers of 协调 and
 * BIM. Two screens that report whether the OR-Tools extra is installed are not
 * two of the five places this product's work happens, and stating them as equals
 * of the coordination workspace misrepresented what the product is for.
 *
 * So the strip carries three tiers, in order:
 *
 *   协调 / BIM / 文档      the workflow
 *   更多                 影响关系 / 工作包 / 现场地图
 *   高级                 reached from the window's own actions band, and named
 *                         here only while one of them is on screen
 *
 * The three lists live here rather than inside the workspace renderer so that
 * what counts as navigation is stated once, in the file that is the navigation.
 */
export const primaryTabs = [
  { id: "coordination", label: "协调" },
  { id: "bim", label: "BIM" },
  { id: "documents", label: "文档" },
] as const;

/**
 * Secondary workflow destinations. 现场地图 rather than 现场: the destination
 * opens a map, and "现场" alone could as easily have been the work-package list
 * or a photo log - a user should know what opens before clicking it.
 */
export const secondaryTabs = [
  { id: "impact", label: "影响关系" },
  { id: "packages", label: "工作包" },
  { id: "gis", label: "现场地图" },
] as const;

/**
 * Advanced surfaces: real destinations, not first-line workflow ones. They are
 * reached from the 高级 entry in the window's actions band (frontend/src/app/
 * AdvancedMenu.tsx), which is also where their temporary containment is
 * documented.
 */
export const advancedTabs = [
  { id: "operations", label: "运行记录" },
  { id: "capabilities", label: "能力诊断" },
] as const;

const tabs = [...primaryTabs, ...secondaryTabs, ...advancedTabs] as const;
export type WorkspaceTab = (typeof tabs)[number]["id"];

export function WorkspaceTabs({
  tab,
  onTab,
}: {
  tab: WorkspaceTab;
  onTab: (tab: WorkspaceTab) => void;
}) {
  const { transition } = useMotion();
  const advanced = advancedTabs.find((item) => item.id === tab);
  return (
    <nav className="workspace-tabs" aria-label="工作区视图">
      {primaryTabs.map(({ id, label }) => (
        <button
          key={id}
          className={tab === id ? "active" : ""}
          aria-current={tab === id ? "page" : undefined}
          onClick={() => onTab(id)}
        >
          <span className="tab-label">{label}</span>
          {/*
            One surface element shared across the strip. `layoutId` makes Motion
            move it between the tabs it belongs to, so the active view is an
            object the user watched arrive rather than a rule that switched on
            somewhere new - and it says what every selected row in this
            application says, in area rather than in a 2px underline.
          */}
          {tab === id && (
            <motion.span
              className="tab-surface"
              layoutId="workspace-view-surface"
              transition={transition()}
            />
          )}
        </button>
      ))}
      <div className="more-views">
        {/*
          The secondary destinations keep their label. This is the only route to
          half the product's views, and an ellipsis that has to be guessed at is
          a worse trade than four characters of chrome - the mark is here to say
          "this opens a list", not to replace the word that names it.
        */}
        <AppMenu
          label="更多"
          trigger={
            <>
              <Ellipsis {...icon} />
              更多
            </>
          }
        >
          {secondaryTabs.map(({ id, label }) => (
            <AppMenuItem
              key={id}
              active={tab === id}
              onSelect={() => onTab(id)}
            >
              {label}
            </AppMenuItem>
          ))}
        </AppMenu>
      </div>
      {/*
        An advanced view states itself where every other view states itself: as
        the current destination. It is a statement rather than a destination -
        the strip lists where work happens, and a diagnostic is not on that list -
        so it carries the 高级 word beside it to say which door it came through,
        and leaves the way back to the workflow tabs where it already was.
      */}
      {advanced && (
        <span className="advanced-view-chip" aria-current="page">
          <span className="advanced-view-eyebrow">高级</span>
          {advanced.label}
        </span>
      )}
    </nav>
  );
}
