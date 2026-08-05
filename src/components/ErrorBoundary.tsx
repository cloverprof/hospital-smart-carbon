// 根级错误边界：单个模块渲染异常时不整页白屏，给出可恢复的提示。
// 大屏长时间无人值守播放时，这是最后一道防线。
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[医碳智擎] 页面渲染异常：", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-0)", padding: 24 }}>
        <div className="pf-panel" style={{ maxWidth: 560 }}>
          <header><h3>页面渲染异常</h3></header>
          <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "0 0 10px" }}>
            当前页面遇到未预期的错误，其余模块不受影响。可返回登录页重新进入，或重置演示数据后重试。
          </p>
          <pre style={{ fontSize: 11, color: "var(--ink-3)", background: "rgba(6,13,27,0.6)", padding: "8px 10px", borderRadius: 6, overflowX: "auto", margin: "0 0 12px" }}>
            {this.state.error.message}
          </pre>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="pf-btn primary" onClick={() => { window.location.hash = "#/login"; this.setState({ error: null }); }}>
              返回登录页
            </button>
            <button className="pf-btn ghost" onClick={() => window.location.reload()}>重新加载</button>
          </div>
        </div>
      </div>
    );
  }
}
