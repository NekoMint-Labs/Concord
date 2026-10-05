import type { ReactNode } from "react";
import { WorkspaceState } from "./WorkspaceState";

/** Compact use of the existing product state grammar, with optional diagnostics. */
export function WorkspaceInlineState({
  title,
  children,
  diagnostic,
  action,
  alert = false,
}: {
  title: string;
  children?: ReactNode;
  diagnostic?: string;
  action?: ReactNode;
  alert?: boolean;
}) {
  return (
    <WorkspaceState
      compact
      kind={alert ? "error" : "info"}
      title={title}
      description={children}
      diagnostic={diagnostic}
      action={action}
    />
  );
}

/** Translate known rejection reasons without replacing the authoritative diagnostic. */
export function engineeringErrorMessage(diagnostic: string): string {
  if (
    /resolv|closure|close|关闭|依赖|binding|revision|snapshot|stale|conflict/i.test(
      diagnostic,
    )
  )
    return "当前依据或版本不满足此次判断的条件。请检查最新资料与复核结果后再提交。";
  if (/403|permission|forbidden|权限/i.test(diagnostic))
    return "当前账号无权执行此操作，请联系项目负责人。";
  if (/401|unauthorized|authentication|凭据/i.test(diagnostic))
    return "连接凭据已失效，请重新连接后重试。";
  if (/404|not found|unavailable|不可用|不存在/i.test(diagnostic))
    return "所选记录或工程能力暂不可用。请重新读取当前记录后重试。";
  return "此次操作未完成，原有记录保持不变。请检查连接与最新记录后重试。";
}
