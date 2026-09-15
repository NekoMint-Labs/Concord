import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { initializeConnection } from "./api/client";
import { Button } from "./components/ui/button";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000, retry: 1, refetchOnWindowFocus: false },
  },
});
const root = ReactDOM.createRoot(document.getElementById("root")!);

/*
 * The window before the window: the desktop host has to announce its local
 * endpoint and the credential it minted for this launch before there is an
 * application to mount, and until it does there is nothing to show but what is
 * happening.
 *
 * The failure branch says the same thing the application says when it cannot
 * reach the local service (frontend/src/app/StartupView.tsx), in the same
 * language, because the person reading it cannot tell the two apart and should
 * not have to. The technical reason is stated rather than hidden - there is no
 * product surface left to protect here, and it is the one fact that makes this
 * report actionable.
 */
const fatal = (reason: string) =>
  root.render(
    <div className="startup">
      <h1>Concord</h1>
      <p role="alert">无法连接 Concord 本地服务。</p>
      <p>本地服务未能启动。请重新连接；如问题持续，可查看诊断信息。</p>
      <div className="startup-diagnostics">
        <div className="startup-diagnostic">
          <span className="fact-label">错误信息</span>
          <span>{reason}</span>
        </div>
      </div>
      <div className="startup-actions">
        <Button onClick={() => location.reload()}>重新连接</Button>
      </div>
    </div>,
  );

root.render(
  <div className="startup">
    <h1>Concord</h1>
    <p>正在启动 Concord 本地服务…</p>
  </div>,
);
initializeConnection()
  .then(() =>
    root.render(
      <React.StrictMode>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </React.StrictMode>,
    ),
  )
  .catch((error) => fatal(String(error)));
