import { lazy, Suspense, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { FolderOpen, MousePointerClick, PackageOpen } from "lucide-react";
import { icon } from "../components/ui/icon";
import { api } from "../api/client";
import { useBIMSource } from "./useBIMSource";
import { OTHER_PROPERTIES_TITLE, propertySections } from "./bimProperties";
import { statusLabel } from "../ui/labels";
import { demoElementName } from "../ui/demo/demoPresentation";
import {
  PropertyGroup,
  PropertyRow,
  PropertyTable,
} from "../components/PropertyTable";
import { Button } from "../components/ui/button";
import { notify } from "../components/ui/AppToaster";
import { AppDisclosure } from "../components/ui/AppDisclosure";
import { AppMenu, AppMenuItem, AppMenuLabel } from "../components/ui/AppMenu";
import { AppTooltip } from "../components/ui/AppTooltip";
import { Pane, PaneDivider, PaneSplit } from "../layout/PaneSplit";
import { useMotion } from "../motion";
const IFCViewer = lazy(() => import("./IFCViewer"));

/**
 * Structured BIM browsing: an engineering list of elements beside the selected
 * element's properties, as one adjustable split. The geometry engine stays in the
 * separately loaded viewer, so structured mode never requires an IFC SDK.
 *
 * Each pane states its own identity with a header band. When the Inspector has
 * taken the column a third pane would need (`condensed`), the element list stops
 * being a pane and is reached from the properties header as a menu instead.
 */
export default function BIMWorkspace({
  project,
  impacted,
  condensed = false,
  externalFile,
  hideSourceActions = false,
  onViewerSelected,
}: {
  project: string;
  impacted: readonly string[];
  condensed?: boolean;
  externalFile?: File | null;
  hideSourceActions?: boolean;
  onViewerSelected?: (id: string) => void;
}) {
  const elements = useQuery({
    queryKey: ["bim", project],
    queryFn: () => api.bim(project),
  });
  const {
    selected,
    setSelected,
    file,
    setFile,
    error,
    notice,
    busy,
    imported,
    importSource,
    openImported,
    chooseFile,
  } = useBIMSource(project);
  const viewFile = externalFile === undefined ? file : externalFile;
  const { transition, variants } = useMotion();
  const fileInput = useRef<HTMLInputElement>(null);
  const item = elements.data?.find((e) => e.id === selected);
  const count = elements.data?.length ?? 0;
  const selectedImpacted = item ? impacted.includes(item.id) : false;
  /* The full condition set, structured as rows rather than printed as JSON
     source (see ./bimProperties.ts, which owns the label and format logic). */
  const attributeSections = item ? propertySections(item.properties) : [];
  useEffect(() => {
    if (
      elements.data?.length &&
      !elements.data.some((element) => element.id === selected)
    ) {
      setSelected(elements.data[0].id);
    }
  }, [elements.data, selected, setSelected]);

  // The import notice stays in the pane's chrome; the toast only reports that
  // the job the user started has finished.
  useEffect(() => {
    if (imported.data?.status === "COMPLETED") notify.success("IFC 导入完成");
    if (imported.data?.status === "FAILED")
      notify.error("IFC 导入失败", imported.data.error ?? undefined);
  }, [imported.data?.status, imported.data?.error]);

  /*
   * The element list carries its rows as the pane's own body, so the body owns
   * the inset and the row rhythm. Selection is the accent-tinted surface the
   * sidebar and the source list use, so the three master/detail lists in the
   * application answer "where am I" identically.
   */
  const list = (
    <div className="pane-body">
      {elements.data?.map((element) => {
        const isImpacted = impacted.includes(element.id);
        return (
          <button
            key={element.id}
            className={`bim-element ${isImpacted ? "impacted" : ""} ${element.id === selected ? "selected" : ""}`}
            onClick={() => setSelected(element.id)}
          >
            <span className="bim-element-name">
              <strong>{demoElementName(element.id, element.name)}</strong>
              {isImpacted && <span className="bim-element-impact">受影响</span>}
            </span>
            <small>
              {element.type} · {element.storey ?? "未分配楼层"}
            </small>
            <small className="mono">{element.id}</small>
          </button>
        );
      })}
      {elements.data?.length === 0 && (
        <p className="quiet-message pane-empty">当前项目没有结构化构件。</p>
      )}
    </div>
  );

  /*
   * The property sheet, grouped into the few sets a reader scans rather than one
   * flat run of six values at equal weight. Amber is spent only when the element
   * is actually in the impacted set, because an always-amber row would make the
   * exception colour decoration.
   */
  const properties = item ? (
    <>
      {/* Keyed so a new selection mounts new values rather than mutating them
          in place, which is what makes the change of subject legible. The
          disclosure below stays outside the key: it holds open state, and
          resetting a disclosure in order to animate would trade a real
          interaction for a decoration. */}
      <motion.div
        className="bim-property-summary"
        key={item.id}
        variants={variants.detailSwap}
        initial="hidden"
        animate="visible"
        transition={transition("fast")}
      >
        <PropertyGroup
          className="property-group"
          title={<span className="property-group-title">标识与类型</span>}
        >
          <PropertyTable>
            <PropertyRow label="类型" value={item.type} />
            <PropertyRow label="标识" value={item.id} mono />
            <PropertyRow label="版本" value={item.revision} mono />
          </PropertyTable>
        </PropertyGroup>
        <PropertyGroup
          className="property-group"
          title={<span className="property-group-title">位置</span>}
        >
          <PropertyTable>
            <PropertyRow label="楼层" value={item.storey ?? "未分配"} />
            <PropertyRow label="空间" value={item.space ?? "无"} />
          </PropertyTable>
        </PropertyGroup>
        <PropertyGroup
          className="property-group"
          title={<span className="property-group-title">关系</span>}
        >
          <PropertyTable>
            <PropertyRow label="关联构件" value={`${item.related_ids.length} 个`} />
            <PropertyRow
              label="受影响"
              value={selectedImpacted ? "是" : "否"}
              attention={selectedImpacted}
            />
          </PropertyTable>
        </PropertyGroup>
      </motion.div>
      <AppDisclosure label="全部属性">
        {attributeSections.length > 0 ? (
          attributeSections.map((section, sectionIndex) => (
            <PropertyGroup
              className="property-group"
              key={section.title ?? `own-${sectionIndex}`}
              title={
                <span className="property-group-title">
                  {section.title ?? OTHER_PROPERTIES_TITLE}
                </span>
              }
            >
              <PropertyTable>
                {section.fields.map((field, fieldIndex) => (
                  <PropertyRow
                    key={`${field.label}-${fieldIndex}`}
                    label={field.label}
                    value={field.value}
                  />
                ))}
              </PropertyTable>
            </PropertyGroup>
          ))
        ) : (
          <p className="quiet-message">该构件没有附加属性。</p>
        )}
      </AppDisclosure>
    </>
  ) : (
    /*
     * Nothing selected is a state, not a hole - and not a blank panel with a
     * caption pinned to its own top edge either, which is what one line at the
     * pane's origin looked like: a workspace that had not finished loading, with
     * a sentence in the corner where the first property value would be.
     *
     * The instruction is composed instead, with the hierarchy it actually has: the
     * existing functional mark, what to do, and what doing it gets you. It sits
     * about a third of the way down the pane it is waiting in, so it reads as
     * workspace guidance rather than as a heading for an empty document
     * (styles/viewers.css owns the placement, and states why it is a spacer and
     * not a margin). No card, no illustration, no call to action: the pane is
     * waiting for a choice, and the choice is in the column beside it.
     */
    <div className="empty-pane">
      <MousePointerClick {...icon} />
      <span>
        <strong>选择一个构件</strong>
        <small>查看其属性和关联关系</small>
      </span>
    </div>
  );

  /*
   * The property pane is *waiting* when there is nothing to show, and it states
   * that as a class of its own rather than through a `:has()` on the DOM: the
   * placement of the empty state belongs to the pane, not to the element inside
   * it, and both the wide and the condensed branch render the same pane.
   */
  const propertiesClass = item ? "pane-body" : "pane-body is-waiting";

  /*
   * Condensed: the Inspector has taken the column the element list would have
   * needed, so the list yields and is reached from the properties header as a
   * menu. The column changed, not the pane.
   */
  const structured = condensed ? (
    <PaneSplit id="bim-condensed">
      <Pane className="bim-properties pane-stack">
        <header className="pane-header">
          {/*
            Condensed: the element list has yielded its column, so the same
            objects are reached from this header as a menu - and the menu trigger
            carries the selected element's own name, so the pane still states
            what it is showing instead of only offering to change it.
          */}
          <AppMenu
            label="构件"
            triggerClassName="pane-header-menu"
            trigger={
              <>
                {item ? demoElementName(item.id, item.name) : "构件"}
                <span className="count">{count}</span>
              </>
            }
          >
            <AppMenuLabel>构件</AppMenuLabel>
            {elements.data?.map((element) => (
              <AppMenuItem
                key={element.id}
                active={element.id === selected}
                onSelect={() => setSelected(element.id)}
                hint={
                  <>
                    {element.type} · {element.storey ?? "未分配楼层"}
                  </>
                }
              >
                {demoElementName(element.id, element.name)}
              </AppMenuItem>
            ))}
          </AppMenu>
          {item && <span className="mono">{item.id}</span>}
        </header>
        <div className={propertiesClass}>{properties}</div>
      </Pane>
    </PaneSplit>
  ) : (
    <PaneSplit id="bim" persist>
      {/*
        The browser column is 264px, the same proportion the Documents source
        list already uses and reads well at. It used to open at 360px, which is
        *wider than the application's own sidebar* - so the browser was the
        largest single column on the BIM screen and had to be read as a second
        navigation rail rather than as a local object list beside the property
        sheet it belongs to. Its plane did the rest of that work in the surface
        pass: it now takes the quiet local-object-list plane rather than the
        Inspector's recessed one, which is what lets it sit *inside* this workspace
        instead of beside it (frontend/src/styles/viewers.css states the
        assignment, frontend/src/styles/base.css owns the ladder).
      */}
      <Pane
        className="bim-element-list pane-stack"
        defaultSize="264px"
        minSize="180px"
        /* The ceiling is a pixel width, like the pane itself: a 34% ceiling
           shrinks with the window, so at a narrow window it bound a column the
           user had chosen by hand and then carried the clamped width back to the
           wider window (frontend/src/features/Documents.tsx states the
           arithmetic). 410px is 34% of the 1440px window this layout is drawn
           at. */
        maxSize="410px"
      >
        <header className="pane-header">
          <span className="pane-header-label">构件</span>
          <span className="count">{count}</span>
        </header>
        {list}
      </Pane>
      <PaneDivider label="调整构件列表宽度" />
      <Pane className="bim-properties pane-stack">
        <header className="pane-header">
          <h3>{item ? demoElementName(item.id, item.name) : "属性"}</h3>
          {item && <span className="mono">{item.id}</span>}
        </header>
        <div className={propertiesClass}>{properties}</div>
      </Pane>
    </PaneSplit>
  );

  return (
    <section className="bim-workspace">
      <div className="view-toolbar">
        <h2>BIM</h2>
        <span className="viewer-toolbar-note">
          {viewFile ? "项目 IFC 几何视图" : `结构化构件 · ${count} 项`}
        </span>
        {!hideSourceActions && (
          <div className="viewer-toolbar-actions">
            {/*
            The two ways into geometry, marked and explained.

            They stay labelled: "local file" and "the project's own IFC" are a
            domain distinction that no pair of glyphs carries on its own, so the
            mark only tells the two apart at a glance once the labels have taught
            it. What teaches it is the tooltip, which says the difference in one
            clause each - and which is not the only place the difference exists:
            the note under the panes states it in full, which is what keeps this
            inside AppTooltip's contract rather than making product meaning
            tooltip-only.

            The local-file control is a button that opens a hidden file input
            rather than a label wrapping one. A label is not focusable, so the one
            control here that leads somewhere local was the one control in the
            product that Tab could not reach; a real button is tabbable, takes the
            shared focus ring, and is what lets its own tooltip open on focus.
          */}
            <AppTooltip label="在本机打开 IFC 文件，不导入项目">
              <button
                type="button"
                className="import-button"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                <FolderOpen {...icon} />
                打开本机 IFC
              </button>
            </AppTooltip>
            <input
              ref={fileInput}
              hidden
              type="file"
              accept=".ifc"
              disabled={busy}
              aria-label="本地 IFC 文件"
              onChange={(event) => {
                chooseFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <AppTooltip label="打开已导入当前项目的 IFC 文件">
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void openImported()}
              >
                <PackageOpen {...icon} />
                打开项目 IFC
              </Button>
            </AppTooltip>
            {file && (
              <AppTooltip label="把本地 IFC 发送到已配置的后端并导入当前项目">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void importSource()}
                >
                  {busy ? "处理中…" : "导入项目"}
                </Button>
              </AppTooltip>
            )}
            {file && (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setFile(null);
                  setSelected("");
                }}
              >
                结构化视图
              </Button>
            )}
          </div>
        )}
      </div>
      {(error || imported.error) && (
        <div className="alert" role="alert">
          {error || imported.error?.message}
        </div>
      )}
      {elements.error && (
        <div className="alert" role="alert">
          {elements.error.message}
        </div>
      )}
      {(notice || imported.data) && (
        <div className="viewer-status" role="status">
          {[
            notice,
            imported.data && `导入 ${statusLabel(imported.data.status)}。`,
          ]
            .filter(Boolean)
            .join(" ")}
        </div>
      )}
      {imported.data?.error && (
        <div className="alert" role="alert">
          {imported.data.error}
        </div>
      )}
      {viewFile ? (
        <Suspense
          fallback={
            <div className="loading-view">正在加载本地 IFC 渲染器…</div>
          }
        >
          <IFCViewer
            file={viewFile}
            impacted={impacted}
            onSelected={(id) => {
              setSelected(id);
              onViewerSelected?.(id);
            }}
          />
        </Suspense>
      ) : (
        <>
          {structured}
          <p className="viewer-note">
            打开 IFC 文件可进入几何视图；文件默认仅在本机 Tauri WebView
            中处理，只有“导入项目”会发送到已配置的后端。
          </p>
        </>
      )}
    </section>
  );
}
