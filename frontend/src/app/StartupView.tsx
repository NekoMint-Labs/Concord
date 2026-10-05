import { useState, type ReactNode } from "react";
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
 *
 * The composition is the instrument's own front door rather than a card on the
 * window: the same charcoal frame the workspace shell wears, split into a title
 * column (what this is, and the one action that starts work) and a panel that
 * carries the state - connecting, the failed connection, or what the product
 * does to a project. Nothing is open yet, so there is no paper.
 */

/** The three things the product does to a project, in the order work arrives. */
const CAPABILITIES = [
  {
    index: "01",
    title: "项目来源与基线",
    note: "汇总图纸、模型与往来文件，确定这一版工作的依据。",
  },
  {
    index: "02",
    title: "变更发现与证据",
    note: "对比前后两版，指出差异并留下可复查的凭证。",
  },
  {
    index: "03",
    title: "协同与复核",
    note: "指派、跟踪、重新检查，直到问题闭环。",
  },
];

export function StartupView({
  pending,
  message,
  desktop,
  connected = false,
  demoAvailable = true,
  demoError,
  onNewProject,
  onOpenProject,
  onOpenDemo,
  onReconnect,
  onToken,
}: {
  pending: boolean;
  message?: string;
  desktop: boolean;
  connected?: boolean;
  demoAvailable?: boolean;
  demoError?: string;
  onNewProject?: () => void;
  onOpenProject?: () => void;
  onOpenDemo?: () => void;
  onReconnect: () => void;
  onToken: (token: string) => void;
}) {
  const [token, setToken] = useState("");
  const [diagnostics, setDiagnostics] = useState(false);
  return (
    <div className="entry">
      <div className="entry-window">
        {/*
          The title column: what this is, in one sentence, and the actions. The
          hierarchy is stated by the control faces - the committed action is the
          only filled one and its siblings are outlined.
        */}
        <section className="entry-title-block">
          {/*
            The eyebrow opens the column the way the panel's caption opens
            its own - one small mono label over one hairline - so the two rules
            read as a single top edge across the window, and the identity block
            can take the floor instead of floating in the middle.
          */}
          <p className="entry-eyebrow">工程协同工作台</p>
          <div className="entry-intro">
            <div className="entry-lockup">
              <span className="entry-mark" aria-hidden="true" />
              <h1 className="entry-wordmark">Concord</h1>
            </div>
            <p className="entry-position">
              把工程变更、依据与协同，收进同一份可追溯的项目记录。
            </p>
            <p className="entry-support">
              从设计变更到现场复核，每一次判断都有出处，也能被重新检查。
            </p>
          </div>
          {!pending && (
            <div className="entry-start">
              <p className="entry-step-label">
                {connected ? "开始工作" : "恢复连接"}
              </p>
              <div className="entry-actions">
                {connected ? (
                  <>
                    {onNewProject && (
                      <Button onClick={onNewProject}>新建项目</Button>
                    )}
                    {onOpenProject && (
                      <Button variant="secondary" onClick={onOpenProject}>
                        打开项目
                      </Button>
                    )}
                    {onOpenDemo && (
                      <Button
                        variant="secondary"
                        disabled={!demoAvailable}
                        onClick={onOpenDemo}
                      >
                        {demoAvailable ? "打开示例项目" : "正在准备示例项目…"}
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Button onClick={onReconnect}>重新连接</Button>
                    {onOpenProject && (
                      <Button variant="secondary" onClick={onOpenProject}>
                        打开项目
                      </Button>
                    )}
                  </>
                )}
              </div>
              {connected && demoError && (
                <p role="alert" className="entry-alert">
                  {demoError}
                </p>
              )}
            </div>
          )}
        </section>
        {/*
          The state panel: the same window with the connection stated, or - once
          there is one - the three things the product does.
        */}
        <aside className="entry-panel">
          <p className="entry-panel-label">
            {connected ? "Concord 能做什么" : "本地服务"}
          </p>
          {pending ? (
            <div className="entry-panel-body">
              <p role="status" className="entry-status">
                正在连接项目工作区…
              </p>
              <p className="entry-note">正在读取本机服务，并准备项目列表。</p>
            </div>
          ) : connected ? (
            <ol className="entry-capabilities">
              {CAPABILITIES.map((capability) => (
                <li key={capability.index}>
                  <span className="entry-capability-index">
                    {capability.index}
                  </span>
                  <span className="entry-capability-title">
                    {capability.title}
                  </span>
                  <span className="entry-capability-note">
                    {capability.note}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="entry-panel-body">
              <p role="alert" className="entry-alert">
                {onOpenProject
                  ? "无法打开项目工作区。"
                  : "无法连接 Concord 本地服务。"}
              </p>
              <p className="entry-note">
                {onOpenProject
                  ? "项目工作区未能加载。请重新连接，或打开其他项目；如问题持续，可查看诊断信息。"
                  : "本地服务未能启动。请重新连接；如问题持续，可查看诊断信息。"}
              </p>
              <Button
                variant="secondary"
                className="entry-diagnostics-toggle"
                aria-expanded={diagnostics}
                aria-controls="startup-diagnostics"
                onClick={() => setDiagnostics((open) => !open)}
              >
                查看诊断信息
              </Button>
              {/*
                A plain expanded block, not the product's own disclosure: that
                disclosure animates its height, which is safe only because nothing
                disclosed anywhere else in this product holds a focusable control
                (frontend/src/components/ui/AppDisclosure.tsx states that contract).
                The credential field below is focusable, so the reasoning does not
                hold here and neither does the animated box.
              */}
              {diagnostics && (
                <div className="entry-diagnostics" id="startup-diagnostics">
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
                      <label className="entry-field">
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
            </div>
          )}
          <p className="entry-panel-foot">本地运行 · 工程数据不离开本机。</p>
        </aside>
      </div>
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
    <div className="entry-diagnostic">
      <span className="entry-diagnostic-label">{label}</span>
      <span>{children}</span>
    </div>
  );
}
