import { useState } from "react";
import { Button } from "../components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Status } from "../components/Status";

export function Capabilities() {
  const [probe, setProbe] = useState(false);
  const profile = useQuery({ queryKey: ["profile"], queryFn: api.profile });
  const capabilities = useQuery({
    queryKey: ["capabilities", probe],
    queryFn: () => api.capabilities(probe),
  });
  return (
    <div className="content-view">
      <div className="view-heading">
        <div>
          <h2>Capability health</h2>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setProbe(true);
            void capabilities.refetch();
          }}
        >
          Probe services
        </Button>
        <span className="profile-tag">
          {profile.data?.profile ?? "loading"} profile
        </span>
      </div>
      {profile.data && (
        <div className="profile-summary">
          <strong>{profile.data.runtime}</strong>
          <span>
            {profile.data.database} / {profile.data.storage} storage
          </span>
          <p>{profile.data.authentication}</p>
        </div>
      )}
      {capabilities.error && <p role="alert">Capability request failed.</p>}
      <table className="data-table capability-table">
        <thead>
          <tr>
            <th>Capability</th>
            <th>Implementation</th>
            <th>Status / reason</th>
          </tr>
        </thead>
        <tbody>
          {capabilities.data?.capabilities.map((cap) => (
            <tr key={cap.name}>
              <td>
                <strong>{cap.name}</strong>
              </td>
              <td>{cap.implementation}</td>
              <td>
                <Status value={cap.status} />
                <small>{cap.reason}</small>
                {cap.service_reachable === null && (
                  <small>External reachability not asserted</small>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
