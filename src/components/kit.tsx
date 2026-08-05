// 共享 UI 组件（新信息架构）。禁止在页面里复制这些结构的硬编码版本。
import { Inbox, X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { useDemoStore } from "../stores/demo";

export function Panel({ title, extra, children, className = "", style }: {
  title: string; extra?: ReactNode; children: ReactNode; className?: string; style?: React.CSSProperties;
}) {
  return (
    <section className={`pf-panel ${className}`} style={style}>
      <header>
        <h3>{title}</h3>
        {extra && <div className="panel-extra">{extra}</div>}
      </header>
      {children}
    </section>
  );
}

export function Kpi({ label, value, unit, sub, tone, icon }: {
  label: string; value: string | number; unit?: string; sub?: ReactNode;
  tone?: "cyan" | "green" | "amber" | "red"; icon?: ReactNode;
}) {
  return (
    <div className={`pf-kpi ${tone ? `tone-${tone}` : ""}`}>
      <span className="k-label">{icon}{label}</span>
      <span className="k-value">{typeof value === "number" ? value.toLocaleString("zh-CN") : value}{unit && <small>{unit}</small>}</span>
      {sub && <span className="k-sub">{sub}</span>}
    </div>
  );
}

/** 同比/环比箭头。higherIsBad=true（能耗碳排类）时上升标红 */
export function Delta({ pct, label = "同比", higherIsBad = true }: { pct: number; label?: string; higherIsBad?: boolean }) {
  const up = pct > 0;
  const cls = up ? (higherIsBad ? "up" : "up good") : higherIsBad ? "down" : "down bad";
  return (
    <span className={cls}>
      {label} {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export function Tag({ tone = "info", children }: { tone?: "ok" | "warn" | "danger" | "info" | "muted"; children: ReactNode }) {
  return <span className={`pf-tag ${tone}`}>{children}</span>;
}

export function EmptyState({ text = "暂无数据" }: { text?: string }) {
  return (
    <div className="pf-empty">
      <Inbox size={24} strokeWidth={1.4} />
      <span>{text}</span>
    </div>
  );
}

export function Modal({ title, onClose, children, width }: {
  title: string; onClose: () => void; children: ReactNode; width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="pf-modal-mask" onClick={onClose}>
      <div className="pf-modal fadeup" style={width ? { width: `min(${width}px, 94vw)` } : undefined} onClick={(e) => e.stopPropagation()}>
        <header>
          <h3>{title}</h3>
          <button className="pf-btn ghost" onClick={onClose} aria-label="关闭"><X size={14} /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

/** 持续可见但不干扰阅读的 Demo 标注（提示词 4.9） */
export function DemoBadge() {
  return <div className="demo-badge">DEMO 模拟数据 · 非正式核算</div>;
}

export function ToastHost() {
  const { toasts, dismissToast } = useDemoStore();
  useEffect(() => {
    if (!toasts.length) return;
    const timer = window.setTimeout(() => dismissToast(toasts[0].id), 3600);
    return () => window.clearTimeout(timer);
  }, [toasts, dismissToast]);
  if (!toasts.length) return null;
  return (
    <div className="pf-toast-host">
      {toasts.slice(0, 4).map((t) => (
        <div key={t.id} className={`pf-toast ${t.tone} fadeup`} onClick={() => dismissToast(t.id)}>
          <b>{t.title}</b>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

/** 页面标题行 */
export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h2>{title}</h2>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {actions && <div className="head-actions">{actions}</div>}
    </div>
  );
}
