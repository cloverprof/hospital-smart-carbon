import { AlertTriangle, Check, ChevronRight, CircleX, Info, LoaderCircle, LockKeyhole, LogIn, RotateCcw, X } from "lucide-react";
import { useEffect, type ButtonHTMLAttributes, type PropsWithChildren, type ReactNode } from "react";
import { usePlatformStore } from "../stores/platform";

export function Button({ variant = "secondary", className = "", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" | "gold" }) {
  return <button className={`btn btn-${variant} ${className}`} {...props}>{children}</button>;
}

export function Panel({ title, subtitle, action, className = "", children }: PropsWithChildren<{ title?: string; subtitle?: string; action?: ReactNode; className?: string }>) {
  return <section className={`panel-card ${className}`}>
    {(title || action) && <header className="panel-card-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action && <div className="panel-card-actions">{action}</div>}</header>}
    <div className="panel-card-body">{children}</div>
  </section>;
}

export function KpiCard({ label, value, unit, meta, tone = "blue", icon, onClick, active }: { label:string;value:string | number;unit?:string;meta?:ReactNode;tone?:"blue"|"cyan"|"green"|"orange"|"red"|"gold"|"purple";icon?:ReactNode;onClick?:()=>void;active?:boolean }) {
  const Component = onClick ? "button" : "article";
  return <Component className={`kpi-card-new tone-${tone} ${active ? "is-active" : ""}`} onClick={onClick as never}>
    <div className="kpi-card-label"><span>{icon}</span>{label}</div>
    <div className="kpi-card-value">{value}<small>{unit}</small></div>
    <div className="kpi-card-meta">{meta}</div>
  </Component>;
}

export function StatusBadge({ value }: { value: string }) {
  const tone = /完成|通过|正常|完整|已采集|高效|在线|已归档/.test(value) ? "success" : /异常|缺失|逾期|退回|错误|撤销|高风险/.test(value) ? "danger" : /关注|待|进行|估算|草稿|中/.test(value) ? "warning" : "info";
  return <span className={`status-badge status-${tone}`}>{value}</span>;
}

export function ProgressBar({ value, tone = "blue" }: { value: number; tone?: string }) {
  return <div className="progress-track"><i className={`progress-${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

export function Modal({ open, title, subtitle, size = "md", onClose, footer, children }: PropsWithChildren<{ open:boolean;title:string;subtitle?:string;size?:"sm"|"md"|"lg"|"xl";onClose:()=>void;footer?:ReactNode }>) {
  if (!open) return null;
  return <div className="overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
      <header><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-btn" aria-label="关闭" onClick={onClose}><X size={18}/></button></header>
      <div className="modal-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </section>
  </div>;
}

export function Drawer({ open, title, subtitle, width = 520, onClose, children, footer }: PropsWithChildren<{ open:boolean;title:string;subtitle?:string;width?:number;onClose:()=>void;footer?:ReactNode }>) {
  if (!open) return null;
  return <div className="drawer-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <aside className="drawer" style={{ width }} role="dialog" aria-modal="true" aria-label={title}>
      <header><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-btn" aria-label="关闭" onClick={onClose}><X size={18}/></button></header>
      <div className="drawer-body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </aside>
  </div>;
}

export function FormField({ label, required, error, children, hint }: PropsWithChildren<{ label:string;required?:boolean;error?:string;hint?:string }>) {
  return <label className={`form-field ${error ? "has-error" : ""}`}><span>{label}{required && <b>*</b>}</span>{children}{hint && <small>{hint}</small>}{error && <em>{error}</em>}</label>;
}

export function Segmented<T extends string>({ value, options, onChange }: { value:T;options:T[];onChange:(value:T)=>void }) {
  return <div className="segmented">{options.map((option)=><button key={option} className={value===option?"active":""} onClick={()=>onChange(option)}>{option}</button>)}</div>;
}

export function PageState({ children, onReset }: PropsWithChildren<{ onReset?:()=>void }>) {
  const demoState = usePlatformStore((state)=>state.demoState);
  const setDemoState = usePlatformStore((state)=>state.setDemoState);
  if (demoState === "normal") return <>{children}</>;
  if (demoState === "loading") return <div className="skeleton-page"><div className="skeleton-line wide"/><div className="skeleton-kpis">{[1,2,3,4,5].map((item)=><i key={item}/>)}</div><div className="skeleton-panels"><i/><i/></div></div>;
  const stateMap = {
    empty: { icon:<Info/>,title:"当前筛选条件下暂无数据",text:"可重置筛选或恢复医院演示数据。",action:"恢复数据" },
    error: { icon:<CircleX/>,title:"数据加载失败",text:"模拟接口返回 503，请检查数据源状态后重新加载。",action:"重新加载" },
    noPermission: { icon:<LockKeyhole/>,title:"暂无访问权限",text:"当前角色没有访问该业务页面的权限，请切换角色或联系管理员。",action:"返回正常状态" },
    unauthorized: { icon:<LogIn/>,title:"登录状态已失效",text:"演示会话已过期，请重新进入系统。",action:"重新登录" },
  } as const;
  const current = stateMap[demoState];
  return <div className="page-state">{current.icon}<h2>{current.title}</h2><p>{current.text}</p><Button variant="primary" onClick={()=>{setDemoState("normal");onReset?.();}}><RotateCcw size={15}/>{current.action}</Button></div>;
}

export function StepProgress({ steps, current }: { steps:string[];current:number }) {
  return <div className="step-progress">{steps.map((step,index)=><div key={step} className={index<current?"done":index===current?"active":""}><span>{index<current?<Check size={13}/>:index+1}</span><b>{step}</b>{index<steps.length-1&&<ChevronRight size={14}/>}</div>)}</div>;
}

export function ToastHost() {
  const toasts = usePlatformStore((state)=>state.toasts);
  const dismiss = usePlatformStore((state)=>state.dismissToast);
  useEffect(()=>{
    if (!toasts.length) return;
    const timeout = window.setTimeout(()=>dismiss(toasts[0].id),4200);
    return ()=>window.clearTimeout(timeout);
  },[toasts,dismiss]);
  const icons = { success:<Check/>,warning:<AlertTriangle/>,danger:<CircleX/>,info:<Info/> };
  return <div className="toast-host">{toasts.map((toast)=><button key={toast.id} className={`toast toast-${toast.tone}`} onClick={()=>dismiss(toast.id)}><span>{icons[toast.tone]}</span><span><b>{toast.title}</b><small>{toast.message}</small></span><X size={14}/></button>)}</div>;
}

export function InlineLoading({ label = "正在处理" }: { label?:string }) {
  return <span className="inline-loading"><LoaderCircle size={15}/>{label}</span>;
}
