import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import maplibregl from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { api } from "../api/client";
import { demoWorkPackageName } from "../ui/demo/demoPresentation";

/*
 * MapLibre's built-in controls and its own map element carry English tooltips and
 * accessibility names. The `locale` option patches exactly those string ids, so
 * the controls stay MapLibre's and are read in the product's own language rather
 * than being replaced just to translate them.
 */
const MAP_LOCALE: Record<string, string> = {
  "Map.Title": "现场地图",
  "NavigationControl.ZoomIn": "放大",
  "NavigationControl.ZoomOut": "缩小",
  "NavigationControl.ResetBearing": "重置方位",
  "Popup.Close": "关闭",
};

/**
 * The work package's own name for the current selection. The fixture emits English
 * names, so the deterministic demo names are localized through the demo boundary;
 * an unknown id keeps its own fallback text.
 */
function packageLabel(data: FeatureCollection | undefined, id: string): string {
  const point = data?.features.find(
    (feature) =>
      feature.geometry?.type === "Point" &&
      feature.properties?.work_package_id === id,
  );
  const fallback =
    typeof point?.properties?.name === "string" ? point.properties.name : id;
  return demoWorkPackageName(id, fallback);
}

export default function GISWorkspace({
  project,
  selected,
  onSelected,
}: {
  project: string;
  selected: string;
  onSelected: (id: string) => void;
}) {
  const target = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const selection = useRef(onSelected);
  selection.current = onSelected;
  const data = useQuery({
    queryKey: ["geo", project],
    queryFn: () => api.geo(project),
  });
  const failed = Boolean(error || data.error);
  useEffect(() => {
    if (!target.current || !data.data) return;
    let instance: maplibregl.Map | undefined;
    let observer: ResizeObserver | undefined;
    let disposed = false;
    setReady(false);
    setError("");
    const fail = (cause: unknown) => {
      if (!disposed) {
        setReady(false);
        setError(cause instanceof Error ? cause.message : "WebGL 渲染不可用");
      }
    };
    const dispose = () => {
      disposed = true;
      observer?.disconnect();
      if (map.current === instance) map.current = null;
      instance?.remove();
    };
    try {
      const created = new maplibregl.Map({
        container: target.current,
        center: [120.36, 36.07],
        zoom: 17,
        attributionControl: false,
        locale: MAP_LOCALE,
        style: {
          version: 8,
          sources: {},
          layers: [
            {
              id: "background",
              type: "background",
              paint: { "background-color": "#eef2ef" },
            },
          ],
        },
      });
      instance = created;
      map.current = created;
      created.addControl(new maplibregl.NavigationControl(), "top-right");
      created.on("load", () => {
        if (disposed) return;
        try {
          created.addSource("site", { type: "geojson", data: data.data! });
          created.addLayer({
            id: "areas",
            type: "fill",
            source: "site",
            filter: ["==", ["geometry-type"], "Polygon"],
            paint: { "fill-color": "#b3d0c4", "fill-opacity": 0.6 },
          });
          created.addLayer({
            id: "outline",
            type: "line",
            source: "site",
            filter: ["==", ["geometry-type"], "Polygon"],
            paint: { "line-color": "#5f8f7e", "line-width": 2 },
          });
          created.addLayer({
            id: "packages",
            type: "circle",
            source: "site",
            filter: ["==", ["geometry-type"], "Point"],
            paint: {
              "circle-radius": 8,
              "circle-color": "#236f61",
              "circle-stroke-color": "#fff",
              "circle-stroke-width": 3,
            },
          });
          created.on("click", "packages", (event) => {
            if (disposed) return;
            const feature = event.features?.[0];
            if (!feature) return;
            const properties = feature.properties ?? {};
            const workPackage =
              typeof properties.work_package_id === "string"
                ? properties.work_package_id
                : "";
            if (workPackage) selection.current(workPackage);
            const rawName =
              typeof properties.name === "string" ? properties.name : "";
            const label = workPackage
              ? demoWorkPackageName(workPackage, rawName || workPackage)
              : rawName || "现场位置";
            new maplibregl.Popup()
              .setLngLat(event.lngLat)
              .setText(label)
              .addTo(created);
          });
          setReady(true);
        } catch (cause) {
          fail(cause);
        }
      });
      created.on("error", (event) => fail(event.error));
      observer = new ResizeObserver(() => {
        if (!disposed) created.resize();
      });
      observer.observe(target.current);
    } catch (cause) {
      fail(cause);
      // Construction may succeed before a control/observer fails. Do not leak
      // its canvas, WebGL context or worker when the effect has no normal return.
      dispose();
      return;
    }
    return dispose;
  }, [data.data]);
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    if (instance.getLayer("packages"))
      instance.setPaintProperty("packages", "circle-radius", [
        "case",
        ["==", ["get", "work_package_id"], selected],
        12,
        8,
      ]);
  }, [selected, data.data, ready]);
  return (
    <section className="gis-workspace">
      <div className="viewer-toolbar">
        <strong>现场地图</strong>
        <span>项目现场与工作包位置</span>
        <span role="status">
          {failed ? "地图不可用" : ready ? "地图已就绪" : "正在加载地图"}
        </span>
      </div>
      {/* Minimum context so a reader can tell what they are looking at: what the
          polygon is, what the points are, and which work package is current. Not
          a dashboard. */}
      <div className="gis-context">
        <ul className="gis-legend">
          <li>
            <span className="gis-legend-swatch is-area" aria-hidden="true" />
            作业区域
          </li>
          <li>
            <span className="gis-legend-swatch is-point" aria-hidden="true" />
            工作包位置
          </li>
        </ul>
        <p className="gis-selected">
          <span>当前工作包</span>
          {selected ? (
            <>
              <strong className="mono">{selected}</strong>
              <span aria-hidden="true">·</span>
              <span>{packageLabel(data.data, selected)}</span>
            </>
          ) : (
            <span>未选择</span>
          )}
        </p>
      </div>
      <div className="map-stage" ref={target} aria-label="项目现场地图" />
      <p className="viewer-note">
        数据来源：本地 GeoJSON 合成位置，未接入商业地图瓦片。
      </p>
      {failed && (
        <div className="viewer-message" role="alert">
          {`地图不可用：${error || data.error?.message}。工作包仍可在“工作包”视图中查看。`}
        </div>
      )}
    </section>
  );
}
