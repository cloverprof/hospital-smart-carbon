import { useState } from "react";
import { Activity, ArrowDownRight, ChevronRight, CircleDot, Download, Filter, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import type { ModulePageConfig } from "./data/module-pages";
import "./module-page.css";

function AreaChart({ data }: { data: ModulePageConfig["series"] }) {
  const points = data.map((d,i)=>`${36+i*(610/(data.length-1))},${145-d.value*1.12}`).join(" ");
  return <div className="mp-chart"><svg viewBox="0 0 690 180" role="img" aria-label="指标趋势图">
    <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={data[0].color} stopOpacity=".28"/><stop offset="1" stopColor={data[0].color} stopOpacity="0"/></linearGradient></defs>
    {[34,72,110,148].map(y=><line key={y} x1="30" x2="665" y1={y} y2={y} className="mp-gridline"/>)}
    <polygon points={`36,150 ${points} 646,150`} fill="url(#area)"/><polyline points={points} fill="none" stroke={data[0].color} strokeWidth="2"/>
    {data.map((d,i)=><g key={d.label}><circle cx={36+i*(610/(data.length-1))} cy={145-d.value*1.12} r="3" fill="#07131c" stroke={d.color} strokeWidth="2"/><text x={36+i*(610/(data.length-1))} y="169">{d.label}</text></g>)}
  </svg></div>;
}

export function ModulePage({ config }: { config: ModulePageConfig }) {
  const [tab,setTab]=useState(config.tabs[0]);
  const [query,setQuery]=useState("");
  const filtered=config.rows.filter(r=>r.join(" ").includes(query));
  return <div className="module-page">
    <div className="mp-toolbar"><div className="mp-tabs">{config.tabs.map(t=><button className={tab===t?"active":""} onClick={()=>setTab(t)} key={t}>{t}</button>)}</div><span className="mp-scope"><CircleDot size={13}/>{config.scope}</span><button><RefreshCw size={14}/>刷新</button><button><Download size={14}/>导出</button></div>
    <section className="mp-kpis">{config.kpis.map((k,i)=><article key={k.label}><header><span>{k.label}</span><Activity size={14}/></header><strong>{k.value}<small>{k.unit}</small></strong><footer><em className={k.change.startsWith("+")&&i!==0?"warn":""}>{k.change}</em><span>{k.note}</span></footer></article>)}</section>
    <section className="mp-grid">
      <article className="mp-panel mp-primary"><header><h2>{config.primaryTitle}</h2><span>实时 · 已归一化</span></header><AreaChart data={config.series}/></article>
      <article className="mp-panel mp-rank"><header><h2>{config.rankingTitle}</h2><button><SlidersHorizontal size={13}/></button></header><div>{config.ranking.map((r,i)=><button key={r.name}><span className="mp-rank-no">{i+1}</span><span><b>{r.name}</b><small>{r.state}</small></span><span className="mp-rank-bar"><i style={{width:`${r.percent}%`}}/></span><strong>{r.value}</strong></button>)}</div></article>
      <article className="mp-panel mp-table"><header><h2>{config.tableTitle}</h2><div className="mp-search"><Search size={13}/><input aria-label="筛选列表" value={query} onChange={e=>setQuery(e.target.value)} placeholder="筛选当前列表"/></div><button><Filter size={13}/>筛选</button></header>
        <table><thead><tr>{config.columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{filtered.map((row,i)=><tr key={i}>{row.map((v,j)=><td key={j}>{j===row.length-1?<span className="mp-state">{v}</span>:v}</td>)}</tr>)}</tbody></table>
      </article>
      <article className="mp-panel mp-actions"><header><h2>{config.actionTitle}</h2><span>{config.actions.length} 项</span></header><div>{config.actions.map(a=><button key={a.title}><span className="mp-action-icon"><ArrowDownRight size={14}/></span><span><b>{a.title}</b><small>{a.meta}</small></span><em>{a.status}</em><ChevronRight size={14}/></button>)}</div></article>
    </section>
    <p className="mp-footnote">Demo 模拟数据 · 所有医疗保障相关策略仅提供决策辅助，不自动下发设备控制。</p>
  </div>;
}
