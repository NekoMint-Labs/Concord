import { ClipboardCheck, Package, Users, Wrench } from "lucide-react";
import type { WorkPackage, Workspace } from "../api/client";
import { PropertyRow, PropertyTable } from "../components/PropertyTable";
import { AppDisclosure } from "../components/ui/AppDisclosure";
import { icon } from "../components/ui/icon";

export const availableResources = (values?: Record<string, boolean>) =>
  Object.values(values ?? {}).filter(Boolean).length;
export const definedResources = (values?: Record<string, boolean>) =>
  Object.keys(values ?? {}).length;

export function coordinationResources(workspace: Workspace, wp: WorkPackage) {
  const missingQualifications = (wp.required_qualifications ?? []).filter(
    (item) => !(wp.qualifications ?? []).includes(item),
  );
  const inspectionRecorded =
    workspace.state.project.id === "harbor-east" ||
    workspace.events.some(
      (event) => event.work_package_id === wp.id && event.kind === "inspection",
    );
  const metrics = [
    {
      label: "班组",
      value: `${wp.available_workers} / ${wp.required_workers} 人`,
      status:
        wp.required_workers === 0 && wp.available_workers === 0
          ? "未记录要求"
          : wp.available_workers >= wp.required_workers
            ? "已就绪"
            : "人员不足",
      ready:
        wp.required_workers > 0 && wp.available_workers >= wp.required_workers,
      icon: Users,
    },
    {
      label: "材料",
      value: `${availableResources(wp.materials)} / ${definedResources(wp.materials)} 可用`,
      status: definedResources(wp.materials)
        ? availableResources(wp.materials) === definedResources(wp.materials)
          ? "已就绪"
          : "待补充"
        : "未配置",
      ready:
        definedResources(wp.materials) > 0 &&
        availableResources(wp.materials) === definedResources(wp.materials),
      icon: Package,
    },
    {
      label: "设备",
      value: `${availableResources(wp.equipment)} / ${definedResources(wp.equipment)} 可用`,
      status: definedResources(wp.equipment)
        ? availableResources(wp.equipment) === definedResources(wp.equipment)
          ? "已就绪"
          : "待补充"
        : "未配置",
      ready:
        definedResources(wp.equipment) > 0 &&
        availableResources(wp.equipment) === definedResources(wp.equipment),
      icon: Wrench,
    },
    {
      label: "验收",
      value: !inspectionRecorded
        ? "未记录"
        : wp.inspection_passed
          ? "已通过"
          : "未通过",
      status: !inspectionRecorded
        ? "需要现场核验"
        : wp.inspection_passed
          ? "检查有效"
          : "需要处理",
      ready: inspectionRecorded && wp.inspection_passed,
      icon: ClipboardCheck,
    },
  ];
  return { missingQualifications, metrics };
}

export function CoordinationConditions({
  wp,
  resources,
}: {
  wp: WorkPackage;
  resources: ReturnType<typeof coordinationResources>;
}) {
  const { metrics, missingQualifications } = resources;
  return (
    <>
      <section className="construction-conditions">
        <header className="overview-section-header">
          <div>
            <span className="section-label">施工条件</span>
            <h2>现场准备状态</h2>
          </div>
        </header>
        <div className="condition-metrics">
          {metrics.map((metric) => {
            const MetricIcon = metric.icon;
            return (
              <article key={metric.label}>
                <MetricIcon {...icon} aria-hidden="true" />
                <div>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <small className={metric.ready ? "is-ready" : ""}>
                    {metric.status}
                  </small>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      <div className="construction-secondary">
        <AppDisclosure label="其他施工条件">
          <PropertyTable columns={2}>
            <PropertyRow
              label="前置工作包"
              value={
                wp.predecessors?.length ? wp.predecessors.join("、") : "无"
              }
            />
            <PropertyRow
              label="资质"
              value={
                missingQualifications.length
                  ? `缺少 ${missingQualifications.join("、")}`
                  : "齐备"
              }
              attention={missingQualifications.length > 0}
            />
            <PropertyRow
              label="工作包"
              value={wp.complete ? "已完成" : "进行中"}
            />
          </PropertyTable>
        </AppDisclosure>
      </div>
    </>
  );
}
