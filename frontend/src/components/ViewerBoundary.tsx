import { Component, type ReactNode } from "react";
import { WorkspaceState } from "./WorkspaceState";

/** A failed lazy viewer or WebGL render must not remove approval controls. */
export class ViewerBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <WorkspaceState
          kind="error"
          title="此工作区暂时无法加载"
          description="其他视图与审批操作仍可使用。请切换视图，检查连接后重试。"
        />
      );
    }
    return this.props.children;
  }
}
