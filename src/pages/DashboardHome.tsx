import { ChevronRight, Leaf, Sparkles } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { alarms, buildings, insights, kpis, systemRows, trend } from "../data/hospital";

function Sparkline({ points, color = "#34d6e8" }: { points: number[]; color?: string }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const chartPoints = points
    .map((value, index) => `${(index / (points.length - 1)) * 100},${34 - ((value - min) / (max - min || 1)) * 28}`)
    .join(" ");
  return <svg className="spark" viewBox="0 0 100 36" preserveAspectRatio="none"><polyline points={chartPoints} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>;
}

function TrendChart() {
  const line = (key: "energy" | "service" | "target") => trend.map((item, index) => `${44 + index * 61},${164 - item[key] * 9}`).join(" ");
  return <div className="trend-chart">
    <div className="chart-legend"><span><i className="cyan" />能耗指数</span><span><i className="green" />医疗服务量指数</span><span><i className="dash" />预算基线</span></div>
    <svg viewBox="0 0 760 190" role="img" aria-label="能耗与医疗服务量趋势">
      {[35, 75, 115, 155].map((y) => <line key={y} x1="40" y1={y} x2="730" y2={y} className="gridline" />)}
      <polyline points={line("target")} className="target-line" />
      <polyline points={line("service")} className="service-line" />
      <polyline points={line("energy")} className="energy-line" />
      {trend.map((item, index) => <g key={item.m}><circle cx={44 + index * 61} cy={164 - item.energy * 9} r="3" className="energy-dot" /><text x={44 + index * 61} y="184">{item.m}</text></g>)}
    </svg>
  </div>;
}

function HospitalMap() {
  const [selected, setSelected] = useState<string | null>(null);
  return <div className="hospital-map">
    <img className="campus-model" src="/dashboard/hospital-night-campus.webp" alt="医院院区夜景数字孪生模型" />
    <div className="campus-model-shade" />
    <svg className="building-overlay" viewBox="0 0 1672 941" preserveAspectRatio="xMidYMid slice" aria-label="医院楼宇能耗分级图">
      {buildings.map((building) => {
        const active = selected === building.name;
        const [markerX, markerY] = building.marker;
        return <g
          className={`building-shape ${active ? "is-selected" : ""}`}
          style={{ "--accent": building.color } as CSSProperties}
          key={building.name}
          role="button"
          tabIndex={0}
          aria-label={`${building.name}，${building.value} MWh，${building.status}`}
          onClick={() => setSelected(active ? null : building.name)}
          onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && setSelected(active ? null : building.name)}
        >
          <g className="building-surfaces">{building.surfaces.map((surface, index) => <path className={`building-surface ${surface.kind}`} d={surface.d} key={`${surface.kind}-${index}`} />)}</g>
          <g className="map-pin" transform={`translate(${markerX} ${markerY})`}><line y1="20" y2="47" /><circle r="25" /><path d="M-9 8V-8h7v-7h4v7h7V8M-4 8V2h8v6M-4-3h2M3-3h2" /></g>
          <g className="svg-building-tip" transform={`translate(${markerX + 34} ${markerY - 40})`}><rect width="190" height="88" /><text className="tip-name" x="15" y="25">{building.name}</text><text className="tip-value" x="15" y="52">{building.value} MWh</text><text className="tip-status" x="15" y="74">{building.status}</text></g>
        </g>;
      })}
    </svg>
    <div className="map-caption"><span>主院区能源态势</span><small>楼宇能耗分级 · 实时</small></div>
  </div>;
}

function PanelHead({ title, meta }: { title: string; meta: string }) {
  return <header className="panel-head"><h2>{title}</h2><span>{meta}</span></header>;
}

export function DashboardHome() {
  return <div className="legacy-dashboard">
    <section className="kpi-grid">
      {kpis.map((item, index) => <article className={`kpi-card ${item.tone}`} key={item.label}>
        <div className="kpi-top"><span>{item.label}</span><span className="delta">{item.delta}</span></div>
        <div className="kpi-value">{item.value}<small>{item.unit}</small></div>
        <Sparkline points={[4 + index, 6, 5 + index, 8, 7 + index, 10, 9 + index]} color={index === 2 ? "#45d49e" : "#34d6e8"} />
        <p>{item.note}</p>
      </article>)}
    </section>
    <section className="dashboard-grid">
      <article className="panel map-panel"><PanelHead title="院区能碳态势" meta="建筑面积 42.6 万㎡" /><HospitalMap /></article>
      <article className="panel resource-panel"><PanelHead title="能源结构" meta="本年度" /><div className="donut-row"><div className="donut"><div><b>64.2%</b><small>清洁能源占比</small></div></div><ul className="energy-list"><li><i className="e1" />电力 <b>62.4%</b></li><li><i className="e2" />天然气 <b>21.8%</b></li><li><i className="e3" />蒸汽 <b>10.6%</b></li><li><i className="e4" />可再生能源 <b>5.2%</b></li></ul></div><div className="resource-note"><Leaf size={17} /><span>光伏本年减排</span><b>1,286 tCO₂e</b></div></article>
      <article className="panel system-panel"><PanelHead title="重点系统运行" meta="4 个系统" /><div className="system-list">{systemRows.map((system) => <div className="system-row" key={system.name}><div><b>{system.name}</b><small>{system.metric}</small></div><strong>{system.value}</strong><div className="bar"><i style={{ width: `${system.load}%` }} /></div><span className={system.state === "关注" ? "warn" : ""}>{system.state}</span></div>)}</div></article>
      <article className="panel trend-panel"><PanelHead title="能耗与医疗服务量" meta="同比指数 · 基期=100" /><TrendChart /></article>
      <article className="panel ai-panel"><PanelHead title="AI 节能机会" meta="模拟诊断" /><div className="insight-list">{insights.map((insight, index) => <button key={insight.title}><span className="rank">0{index + 1}</span><span><b>{insight.title}</b><small>{insight.saving}</small></span><em>{insight.confidence}</em></button>)}</div><button className="primary-action"><Sparkles size={16} />进入 AI 诊断中心<ChevronRight size={14} /></button></article>
      <article className="panel alarm-panel"><PanelHead title="实时风险" meta="待处置 7" /><div className="alarm-list">{alarms.map((alarm) => <button key={alarm.title}><span className={`level l${alarm.level}`}>{alarm.level}</span><span><b>{alarm.title}</b><small>{alarm.time} · {alarm.owner}</small></span><ChevronRight size={15} /></button>)}</div></article>
    </section>
  </div>;
}
