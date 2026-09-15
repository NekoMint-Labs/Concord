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
          <h2>能力状态</h2>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setProbe(true);
            void capabilities.refetch();
          }}
        >
          探测服务
        </Button>
        <span className="profile-tag">
          配置档案：{profile.data?.profile ?? "加载中"}
        </span>
      </div>
      {profile.data && (
        <div className="profile-summary">
          <strong>{profile.data.runtime}</strong>
          <span>
            存储 {profile.data.database} / {profile.data.storage}
          </span>
          <p>{profile.data.authentication}</p>
        </div>
      )}
      {capabilities.error && <p role="alert">能力请求失败。</p>}
      <table className="data-table capability-table">
        <thead>
          <tr>
            <th>能力</th>
            <th>实现</th>
            <th>状态 / 原因</th>
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
                  <small>未断言外部可达性</small>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
