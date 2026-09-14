import { lazy, Suspense, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { MousePointerClick } from "lucide-react";
import { api } from "../api/client";
import { useBIMSource } from "./useBIMSource";
import { Button } from "../components/ui/button";
import { notify } from "../components/ui/AppToaster";
import { AppDisclosure } from "../components/ui/AppDisclosure";
import { AppMenu, AppMenuItem, AppMenuLabel } from "../components/ui/AppMenu";
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
}: {
  project: string;
  impacted: readonly string[];
  condensed?: boolean;
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
  const { transition, variants } = useMotion();
  const item = elements.data?.find((e) => e.id === selected);
  const count = elements.data?.length ?? 0;
  const selectedImpacted = item ? impacted.includes(item.id) : false;
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
              <strong>{element.name}</strong>
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
        transition={transition()}
      >
        <div className="property-group">
          <span className="property-group-title">标识与类型</span>
          <dl className="bim-property-list">
            <dt>类型</dt>
            <dd>{item.type}</dd>
            <dt>标识</dt>
            <dd className="mono">{item.id}</dd>
            <dt>版本</dt>
            <dd className="mono">{item.revision}</dd>
          </dl>
        </div>
        <div className="property-group">
          <span className="property-group-title">位置</span>
          <dl className="property-values">
            <dt>楼层</dt>
            <dd>{item.storey ?? "未分配"}</dd>
            <dt>空间</dt>
            <dd>{item.space ?? "无"}</dd>
          </dl>
        </div>
        <div className="property-group">
          <span className="property-group-title">关系</span>
          <dl className="property-values">
            <dt>关联构件</dt>
            <dd>{item.related_ids.length} 个</dd>
            <dt>受影响</dt>
            <dd
              className={selectedImpacted ? "property-value is-attention" : ""}
            >
              {selectedImpacted ? "是" : "否"}
            </dd>
          </dl>
        </div>
      </motion.div>
      <AppDisclosure label="全部属性">
        <pre>{JSON.stringify(item, null, 2)}</pre>
      </AppDisclosure>
    </>
  ) : (
    /* Nothing selected is a state, not a hole: the pane states what it is
       waiting for at the origin its own values start from, in the register those
       values are written in, instead of as a placeholder centred in the space. */
    <div className="empty-pane">
      <MousePointerClick size={15} aria-hidden="true" />
      <p>选择左侧构件查看属性和关联关系</p>
    </div>
  );

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
                {item ? item.name : "构件"}
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
                {element.name}
              </AppMenuItem>
            ))}
          </AppMenu>
          {item && <span className="mono">{item.id}</span>}
        </header>
        <div className="pane-body">{properties}</div>
      </Pane>
    </PaneSplit>
  ) : (
    <PaneSplit id="bim" persist>
      {/* the floor is a collapse guard, not a target width: at 860px with
          the sidebar and the Inspector open this nested split has about
          340px to share between the list and the properties */}
      <Pane
        className="bim-element-list pane-stack"
        defaultSize="360px"
        minSize="150px"
        maxSize="46%"
      >
        <header className="pane-header">
          <span className="pane-header-label">构件</span>
          <span className="count">{count}</span>
        </header>
        {list}
      </Pane>
      <PaneDivider />
      <Pane className="bim-properties pane-stack">
        <header className="pane-header">
          <h3>{item ? item.name : "属性"}</h3>
          {item && <span className="mono">{item.id}</span>}
        </header>
        <div className="pane-body">{properties}</div>
      </Pane>
    </PaneSplit>
  );

  return (
    <section className="bim-workspace">
      <div className="view-toolbar">
        <h2>BIM</h2>
        <span className="viewer-toolbar-note">
          {file ? "本地 IFC / That Open Engine" : "结构化 BIM / 无需几何引擎"}
        </span>
        <div className="viewer-toolbar-actions">
          <label className="import-button">
            打开本地 IFC
            <input
              aria-label="Local IFC file"
              type="file"
              accept=".ifc"
              disabled={busy}
              onChange={(event) => {
                chooseFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void openImported()}
          >
            打开项目 IFC
          </Button>
          {file && (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void importSource()}
            >
              {busy ? "处理中…" : "导入项目"}
            </Button>
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
          {[notice, imported.data && `导入 ${imported.data.status}。`]
            .filter(Boolean)
            .join(" ")}
        </div>
      )}
      {imported.data?.error && (
        <div className="alert" role="alert">
          {imported.data.error}
        </div>
      )}
      {file ? (
        <Suspense
          fallback={
            <div className="loading-view">正在加载本地 IFC 渲染器…</div>
          }
        >
          <IFCViewer file={file} impacted={impacted} onSelected={setSelected} />
        </Suspense>
      ) : (
        <>
          {structured}
          <p className="viewer-note">
            结构化关系视图不是三维模型。打开 IFC
            文件可使用单独加载的几何查看器；打开文件仅停留在本机 Tauri
            WebView，导入项目才会显式发送到已配置的后端。
          </p>
        </>
      )}
    </section>
  );
}
