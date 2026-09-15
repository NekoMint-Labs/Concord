import { Component, type ReactNode } from "react";

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
        <section className="loading-view" role="alert">
          <h2>此工作区视图无法加载</h2>
          <p>项目检查器、批准与其他视图仍可使用。</p>
          <p>请切换到其他视图。检查浏览器、网络连接与查看器资源后重新加载。</p>
        </section>
      );
    }
    return this.props.children;
  }
}
