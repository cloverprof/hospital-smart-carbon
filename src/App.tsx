import { useState } from "react";
import * as Icons from "lucide-react";
import { alarms, buildings, insights, kpis, navItems, systemRows, trend } from "./data/hospital";
import { CarbonWorkbench } from "./CarbonWorkbench";
import { ModulePage } from "./ModulePage";
import { modulePages } from "./data/module-pages";

type IconName = keyof typeof Icons;

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const C = Icons[name as IconName] as React.ComponentType<{ size?: number; strokeWidth?: number }>;
  return C ? <C size={size} strokeWidth={1.8} /> : null;
}

function Sparkline({ points, color = "#34d6e8" }: { points: number[]; color?: string }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const p = points.map((v, i) => `${(i / (points.length - 1)) * 100},${34 - ((v - min) / (max - min || 1)) * 28}`).join(" ");
  return <svg className="spark" viewBox="0 0 100 36" preserveAspectRatio="none"><polyline points={p} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>;
}

function TrendChart() {
  const line = (key: "energy" | "service" | "target") => trend.map((d, i) => `${44 + i * 61},${164 - d[key] * 9}`).join(" ");
  return (
    <div className="trend-chart">
      <div className="chart-legend"><span><i className="cyan" />能耗指数</span><span><i className="green" />医疗服务量指数</span><span><i className="dash" />预算基线</span></div>
      <svg viewBox="0 0 760 190" role="img" aria-label="能耗与医疗服务量趋势">
        {[35, 75, 115, 155].map(y => <line key={y} x1="40" y1={y} x2="730" y2={y} className="gridline" />)}
        <polyline points={line("target")} className="target-line" />
        <polyline points={line("service")} className="service-line" />
        <polyline points={line("energy")} className="energy-line" />
        {trend.map((d, i) => <g key={d.m}><circle cx={44 + i * 61} cy={164 - d.energy * 9} r="3" className="energy-dot" /><text x={44 + i * 61} y="184">{d.m}</text></g>)}
      </svg>
    </div>
  );
}

function HospitalMap() {
  return (
    <div className="hospital-map">
      <div className="map-grid" />
      <div className="campus-road r1" /><div className="campus-road r2" />
      {buildings.map((b, i) => (
        <button className="building" style={{ left: `${b.x}%`, top: `${b.y}%`, borderColor: b.color, "--accent": b.color } as React.CSSProperties} key={b.name}>
          <span className={`block b${i + 1}`} />
          <span className="pin"><Icons.Hospital size={13} /></span>
          <span className="building-tip"><strong>{b.name}</strong><em>{b.value} MWh</em><small>{b.status}</small></span>
        </button>
      ))}
      <div className="map-caption"><span>主院区能源态势</span><small>楼宇能耗分级 · 实时</small></div>
    </div>
  );
}

function LeaderDashboard() {
  return (
    <>
      <section className="kpi-grid">
        {kpis.map((k, i) => <article className={`kpi-card ${k.tone}`} key={k.label}>
          <div className="kpi-top"><span>{k.label}</span><span className="delta">{k.delta}</span></div>
          <div className="kpi-value">{k.value}<small>{k.unit}</small></div>
          <Sparkline points={[4 + i, 6, 5 + i, 8, 7 + i, 10, 9 + i]} color={i === 2 ? "#45d49e" : "#34d6e8"} />
          <p>{k.note}</p>
        </article>)}
      </section>
      <section className="dashboard-grid">
        <article className="panel map-panel"><PanelHead title="院区能碳态势" meta="建筑面积 42.6 万㎡" /><HospitalMap /></article>
        <article className="panel resource-panel"><PanelHead title="能源结构" meta="本年度" /><div className="donut-row"><div className="donut"><div><b>64.2%</b><small>清洁能源占比</small></div></div><ul className="energy-list"><li><i className="e1" />电力 <b>62.4%</b></li><li><i className="e2" />天然气 <b>21.8%</b></li><li><i className="e3" />蒸汽 <b>10.6%</b></li><li><i className="e4" />可再生能源 <b>5.2%</b></li></ul></div><div className="resource-note"><Icons.Leaf size={17}/><span>光伏本年减排</span><b>1,286 tCO₂e</b></div></article>
        <article className="panel system-panel"><PanelHead title="重点系统运行" meta="4 个系统" /><div className="system-list">{systemRows.map(s => <div className="system-row" key={s.name}><div><b>{s.name}</b><small>{s.metric}</small></div><strong>{s.value}</strong><div className="bar"><i style={{width:`${s.load}%`}} /></div><span className={s.state === "关注" ? "warn" : ""}>{s.state}</span></div>)}</div></article>
        <article className="panel trend-panel"><PanelHead title="能耗与医疗服务量" meta="同比指数 · 基期=100" /><TrendChart /></article>
        <article className="panel alarm-panel"><PanelHead title="实时风险" meta="待处置 7" /><div className="alarm-list">{alarms.map(a => <button key={a.title}><span className={`level l${a.level}`}>{a.level}</span><span><b>{a.title}</b><small>{a.time} · {a.owner}</small></span><Icons.ChevronRight size={15}/></button>)}</div></article>
        <article className="panel ai-panel"><PanelHead title="AI 节能机会" meta="模拟诊断" /><div className="insight-list">{insights.map((x, i) => <button key={x.title}><span className="rank">0{i+1}</span><span><b>{x.title}</b><small>{x.saving}</small></span><em>{x.confidence}</em></button>)}</div><button className="primary-action"><Icons.Sparkles size={16}/>进入 AI 诊断中心</button></article>
      </section>
    </>
  );
}

function PanelHead({ title, meta }: { title: string; meta: string }) {
  return <header className="panel-head"><h2>{title}</h2><span>{meta}</span></header>;
}

function Placeholder({ active }: { active: string }) {
  const item = navItems.find(n => n.id === active)!;
  return <div className="placeholder"><div className="placeholder-icon"><Icon name={item.icon} size={26}/></div><p>医院数智能碳管理平台</p><h1>{item.label}</h1><span>产品框架已接入 · 下一迭代继续完善业务详情与接口</span><div className="placeholder-cards"><div><b>12</b><small>核心指标</small></div><div><b>7</b><small>实时告警</small></div><div><b>98.7%</b><small>数据完整率</small></div></div></div>;
}

export default function App() {
  const [active, setActive] = useState("leader");
  const current = navItems.find(n => n.id === active)!;
  return (
    <div className="app-shell">
      <aside>
        <div className="brand-mark"><Icons.Cross size={23}/></div>
        <nav>{navItems.map(n => <button key={n.id} className={active === n.id ? "active" : ""} onClick={() => setActive(n.id)} title={n.label}><Icon name={n.icon}/><span>{n.label}</span></button>)}</nav>
        <button className="aside-help" title="帮助中心"><Icons.CircleHelp size={19}/></button>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="brand"><span>医碳智擎</span><i>HOSPITAL ENERGY & CARBON OS</i></div>
          <div className="page-title"><b>{current.label}</b><span>院级运营总览</span></div>
          <div className="top-actions"><button><Icons.MapPin size={15}/>主院区<Icons.ChevronDown size={14}/></button><button><Icons.CalendarDays size={15}/>2026 年度<Icons.ChevronDown size={14}/></button><button className="live"><i/>数据实时</button><button aria-label="通知"><Icons.Bell size={17}/><em>3</em></button><span className="avatar">能</span></div>
        </header>
        <main>
          <div className="content-head"><div><p>HOSPITAL ENERGY & CARBON COMMAND</p><h1>{current.label}</h1></div><div className="content-status"><span><i className="ok"/>系统运行正常</span><small>数据更新 14:32:18</small></div></div>
          {active === "leader" ? <LeaderDashboard /> : active === "carbon" ? <CarbonWorkbench /> : modulePages[active] ? <ModulePage key={active} config={modulePages[active]} /> : <Placeholder active={active} />}
        </main>
      </div>
    </div>
  );
}
