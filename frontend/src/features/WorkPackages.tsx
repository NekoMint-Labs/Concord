import type { Workspace } from "../api/client";
import { Status } from "../components/Status";

export function WorkPackages({
  workspace,
  onSelect,
}: {
  workspace: Workspace;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="content-view">
      <div className="view-heading">
        <div>
          <h2>Work packages</h2>
        </div>
        <span className="muted">Authoritative facts, not chat state</span>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Package / discipline</th>
            <th>Area</th>
            <th>Design</th>
            <th>Crew</th>
            <th>Readiness</th>
          </tr>
        </thead>
        <tbody>
          {workspace.state.work_packages.map((wp) => (
            <tr key={wp.id} onClick={() => onSelect(wp.id)}>
              <td>
                <button className="text-button" onClick={() => onSelect(wp.id)}>
                  {wp.name}
                </button>
                <small>
                  {wp.id} / {wp.discipline}
                </small>
              </td>
              <td>{wp.area_id}</td>
              <td>
                {wp.accepted_revision} / {wp.design_revision}
              </td>
              <td>
                {wp.available_workers} / {wp.required_workers}
              </td>
              <td>
                <Status
                  value={
                    workspace.stale
                      ? "STALE"
                      : (workspace.analysis?.readiness.find(
                          (r) => r.work_package_id === wp.id,
                        )?.status ?? "UNCHECKED")
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="view-heading">
        <h3>Recent audit</h3>
        <span className="muted">Append-oriented control history</span>
      </div>
      <div className="audit-list">
        {workspace.audit.slice(0, 12).map((row) => (
          <div key={row.id}>
            <span className="mono">
              {new Date(row.created_at ?? "").toLocaleTimeString()}
            </span>
            <strong>{row.action.replaceAll("_", " ")}</strong>
            <span>{row.actor}</span>
            {row.operation_id && <code>{row.operation_id.slice(0, 8)}</code>}
          </div>
        ))}
      </div>
    </div>
  );
}
