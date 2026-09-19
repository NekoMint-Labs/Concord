import { useState, type ReactNode } from "react";
import { Building2 } from "lucide-react";
import { Button } from "../components/ui/button";

/**
 * The window before the workspace exists: connecting, or the report that the
 * local service is not there.
 *
 * What this surface must not do is teach the person using it how the product is
 * built. It used to open with "启动 Python API 后，使用已配置的访问令牌连接" and a
 * bearer-token field, which is a developer's note to themselves: a packaged
 * desktop build starts its own local service and hands the webview a per-launch
 * credential, so the ordinary Windows user has never seen a token and cannot act
 * on that sentence.
 *
 * So the copy states what failed and what can be done about it - 重新连接, then
 * the diagnostics - and the technical detail (the actual error, and the manual
 * credential entry that browser development still needs) sits behind 诊断信息,
 * where the person who can use it knows to look.
 */
export function StartupView({
  pending,
  message,
  desktop,
  connected = false,
  demoAvailable = true,
  onNewProject,
  onOpenDemo,
  onReconnect,
  onToken,
}: {
  pending: boolean;
  message?: string;
  desktop: boolean;
  connected?: boolean;
  demoAvailable?: boolean;
  onNewProject?: () => void;
  onOpenDemo?: () => void;
  onReconnect: () => void;
  onToken: (token: string) => void;
}) {
  const [token, setToken] = useState("");
  const [diagnostics, setDiagnostics] = useState(false);
  return (
    <div className="startup">
      <Building2 size={36} aria-hidden="true" />
      <h1>Concord</h1>
      {pending ? (
        <p>正在连接项目工作区…</p>
      ) : connected ? (
        <>
          <p>开始一个本地工程工作区。</p>
          <div className="startup-actions">
            <Button onClick={onNewProject}>新建项目</Button>
            <Button
              variant="secondary"
              disabled={!demoAvailable}
              onClick={onOpenDemo}
            >
              {demoAvailable ? "打开演示项目" : "正在准备演示项目…"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p role="alert">无法连接 Concord 本地服务。</p>
          <p>本地服务未能启动。请重新连接；如问题持续，可查看诊断信息。</p>
          <div className="startup-actions">
            <Button onClick={onReconnect}>重新连接</Button>
            <Button
              variant="secondary"
              aria-expanded={diagnostics}
              aria-controls="startup-diagnostics"
              onClick={() => setDiagnostics((open) => !open)}
            >
              查看诊断信息
            </Button>
          </div>
          {/*
            A plain expanded block, not the product's own disclosure: that
            disclosure animates its height, which is safe only because nothing
            disclosed anywhere else in this product holds a focusable control
            (frontend/src/components/ui/AppDisclosure.tsx states that contract).
            The credential field below is focusable, so the reasoning does not
            hold here and neither does the animated box.
          */}
          {diagnostics && (
            <div className="startup-diagnostics" id="startup-diagnostics">
              <Diagnostic label="错误信息">
                {message ?? "尚未初始化项目。"}
              </Diagnostic>
              {desktop ? (
                <Diagnostic label="连接方式">
                  桌面版会在启动时自动获取本地服务的访问凭据，无需手动填写。
                </Diagnostic>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    onToken(token);
                  }}
                >
                  <label className="form-label">
                    访问令牌（浏览器开发模式）
                    <input
                      type="password"
                      value={token}
                      onChange={(event) => setToken(event.target.value)}
                    />
                  </label>
                  <Button type="submit">连接</Button>
                </form>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Diagnostic({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="startup-diagnostic">
      <span className="fact-label">{label}</span>
      <span>{children}</span>
    </div>
  );
}
