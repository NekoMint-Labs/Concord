import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { StartupView } from "./StartupView";

/**
 * The startup surface, judged on what it teaches.
 *
 * A packaged desktop build starts its own local service and is handed a per-launch
 * credential, so the copy a Windows user sees must be about the service they
 * cannot reach and the two things they can do about it - not about a Python API or
 * a bearer token they have never held.
 */
it("reports an unreachable local service in product language on the desktop path", () => {
  render(
    <StartupView
      pending={false}
      message="connect ECONNREFUSED 127.0.0.1:8000"
      desktop
      onReconnect={() => {}}
      onToken={() => {}}
    />,
  );

  expect(screen.getByRole("alert")).toHaveTextContent(
    "无法连接 Concord 本地服务。",
  );
  expect(screen.getByRole("button", { name: "重新连接" })).toBeVisible();
  expect(screen.getByRole("button", { name: "查看诊断信息" })).toBeVisible();
  // The implementation is not the message.
  expect(document.body.textContent).not.toMatch(
    /Python API|bearer|API token|token/i,
  );
});

it("keeps the technical detail, and the manual credential, behind the diagnostics", () => {
  const onToken = vi.fn();
  render(
    <StartupView
      pending={false}
      message="connect ECONNREFUSED 127.0.0.1:8000"
      desktop={false}
      onReconnect={() => {}}
      onToken={onToken}
    />,
  );

  // Browser development still needs the manual path, so it is not deleted - it is
  // simply not the first thing the surface says.
  expect(screen.queryByLabelText(/访问令牌/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "查看诊断信息" }));

  expect(screen.getByText(/ECONNREFUSED/)).toBeVisible();
  const field = screen.getByLabelText("访问令牌（浏览器开发模式）");
  fireEvent.change(field, { target: { value: "local-demo-admin" } });
  fireEvent.click(screen.getByRole("button", { name: "连接" }));
  expect(onToken).toHaveBeenCalledWith("local-demo-admin");
});

it("says how the desktop build connects instead of asking for a credential", () => {
  render(
    <StartupView
      pending={false}
      desktop
      onReconnect={() => {}}
      onToken={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "查看诊断信息" }));

  expect(screen.getByText(/自动获取本地服务的访问凭据/)).toBeVisible();
  expect(screen.queryByLabelText(/访问令牌/)).toBeNull();
});

it("states that it is connecting rather than failing while it is connecting", () => {
  render(
    <StartupView pending desktop onReconnect={() => {}} onToken={() => {}} />,
  );
  expect(screen.getByText("正在连接项目工作区…")).toBeVisible();
  expect(screen.queryByRole("button", { name: "重新连接" })).toBeNull();
});

it("shows the connected no-project entry separately from a connection failure", () => {
  const onNewProject = vi.fn();
  const onOpenDemo = vi.fn();
  render(
    <StartupView
      pending={false}
      connected
      desktop={false}
      onNewProject={onNewProject}
      onOpenDemo={onOpenDemo}
      onReconnect={() => {}}
      onToken={() => {}}
    />,
  );

  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "新建项目" }));
  fireEvent.click(screen.getByRole("button", { name: "打开演示项目" }));
  expect(onNewProject).toHaveBeenCalledOnce();
  expect(onOpenDemo).toHaveBeenCalledOnce();
});
