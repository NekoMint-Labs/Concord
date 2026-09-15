import { Fragment } from "react";
import { AppDisclosure } from "../components/ui/AppDisclosure";
import { Button } from "../components/ui/button";
import { propertySections } from "./bimProperties";
import { useIFCViewer } from "./useIFCViewer";

/** All SDK objects stay inside this lazy boundary, never in server/domain DTOs. */
export default function IFCViewer({
  file,
  impacted,
  onSelected,
}: {
  file: File;
  impacted: readonly string[];
  onSelected: (id: string) => void;
}) {
  const { container, ready, message, error, properties, busy, act } =
    useIFCViewer(file, impacted, onSelected);
  /*
   * The selected element's attributes are rendered as the property sheet renders
   * them everywhere else in this product (frontend/src/viewers/bimProperties.ts).
   * They used to be printed as JSON, which made the geometry viewer the second
   * place a normal user was handed source instead of a value.
   */
  const sections = properties === null ? [] : propertySections(properties);
  return (
    <div className="bim-stage" ref={container} aria-label="IFC 模型查看器">
      <div className="viewer-actions">
        <Button
          disabled={!ready || busy}
          size="sm"
          variant="secondary"
          onClick={() => void act("focus")}
        >
          聚焦
        </Button>
        <Button
          disabled={!ready || busy}
          size="sm"
          variant="secondary"
          onClick={() => void act("isolate")}
        >
          隔离
        </Button>
        <Button
          disabled={!ready || busy}
          size="sm"
          variant="secondary"
          onClick={() => void act("showAll")}
        >
          显示全部
        </Button>
      </div>
      <div className="viewer-message" role={error ? "alert" : "status"}>
        {error
          ? `3D 查看器不可用：${error}。结构化 BIM 数据仍可使用。`
          : message}
        {properties !== null && (
          <AppDisclosure label="所选构件属性">
            {sections.length ? (
              <div className="bim-property-summary">
                {sections.map((section, index) => (
                  <div className="property-group" key={section.title ?? index}>
                    <span className="property-group-title">
                      {section.title ?? "构件属性"}
                    </span>
                    <dl className="property-values">
                      {section.fields.map((field, fieldIndex) => (
                        <Fragment key={`${field.label}-${fieldIndex}`}>
                          <dt>{field.label}</dt>
                          <dd>{field.value}</dd>
                        </Fragment>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            ) : (
              <p className="quiet-message">该构件没有可显示的属性。</p>
            )}
          </AppDisclosure>
        )}
      </div>
    </div>
  );
}
