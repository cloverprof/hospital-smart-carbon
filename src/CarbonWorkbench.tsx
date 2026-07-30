import { useState } from "react";
import { Archive, Calculator, Check, ChevronRight, CircleAlert, ClipboardCheck, Database, Download, FileCheck2, RefreshCw, ShieldCheck } from "lucide-react";
import { carbonBatches, carbonRisks, carbonSteps, emissionSources, sourceProgress } from "./data/carbon-workbench";
import "./carbon-workbench.css";

function Ring({ value, label, color }: { value: number; label: string; color: string }) {
  return <div className="cw-ring" style={{ "--ring": color, "--value": `${value * 3.6}deg` } as React.CSSProperties}><div><b>{value}%</b><span>{label}</span></div></div>;
}

export function CarbonWorkbench() {
  const [standard, setStandard] = useState("GHG Protocol");
  const [period, setPeriod] = useState("2026 年度");

  return (
    <div className="carbon-workbench">
      <section className="cw-toolbar">
        <div><h2>医院温室气体核算</h2><p>组织边界：主院区及托管机构 · 运营控制法</p></div>
        <label>核算标准<select value={standard} onChange={e => setStandard(e.target.value)}><option>GHG Protocol</option><option>ISO 14064-1</option><option>公共机构碳排放核算指南</option></select></label>
        <label>核算周期<select value={period} onChange={e => setPeriod(e.target.value)}><option>2026 年度</option><option>2026 年 6 月</option><option>2026 年 5 月</option></select></label>
        <button className="cw-secondary"><RefreshCw size={15}/>重新校验</button>
        <button className="cw-primary"><Calculator size={15}/>执行试算</button>
      </section>

      <section className="cw-steps">
        {carbonSteps.map((step, index) => <div className={`cw-step ${step.status}`} key={step.id}>
          <span>{step.status === "done" ? <Check size={15}/> : step.id}</span>
          <div><b>{step.name}</b><small>{step.desc}</small></div>
          {index < carbonSteps.length - 1 && <ChevronRight size={16}/>}
        </div>)}
      </section>

      <section className="cw-overview">
        <article className="cw-metric"><span>年度排放总量</span><strong>31,755.2 <small>tCO₂e</small></strong><em>同比下降 5.6%</em></article>
        <article className="cw-metric"><span>Scope 1 直接排放</span><strong>7,500.8 <small>tCO₂e</small></strong><em>占比 23.6%</em></article>
        <article className="cw-metric"><span>Scope 2 能源间接排放</span><strong>21,894.0 <small>tCO₂e</small></strong><em>占比 68.9%</em></article>
        <article className="cw-metric"><span>单位床日排放</span><strong>46.2 <small>kgCO₂e/床日</small></strong><em>优于基线 3.8%</em></article>
        <article className="cw-quality"><Ring value={89} label="综合质量" color="#42d9ad"/><div><span><i/>完整性 88.5%</span><span><i/>及时性 92.3%</span><span><i/>准确性 94.1%</span></div></article>
      </section>

      <section className="cw-main-grid">
        <article className="cw-panel cw-sources">
          <header><div><Database size={17}/><h3>活动数据归集</h3></div><span>163 / 179 项已就绪</span></header>
          <div className="cw-progress-total"><b>91.1%</b><div><i style={{width:"91.1%"}}/></div><span>阻断项 3</span></div>
          <div className="cw-source-list">{sourceProgress.map(s => <button key={s.name}>
            <span className="cw-source-icon" style={{color:s.color}}><FileCheck2 size={17}/></span>
            <span><b>{s.name}</b><small>{s.detail}</small></span>
            <span className="cw-source-progress"><i><em style={{width:`${s.ready/s.total*100}%`,background:s.color}}/></i><small>{s.ready} / {s.total}</small></span>
            <ChevronRight size={15}/>
          </button>)}</div>
        </article>

        <article className="cw-panel cw-emission">
          <header><div><ShieldCheck size={17}/><h3>排放构成</h3></div><span>市场法</span></header>
          <div className="cw-emission-body">
            <div className="cw-emission-donut"><div><b>31,755</b><small>tCO₂e</small></div></div>
            <div className="cw-emission-list">{emissionSources.map(e => <div key={e.name}><i style={{background:e.color}}/><span><b>{e.name}</b><small>{e.scope}</small></span><strong>{e.value.toLocaleString()}</strong><em>{e.share}%</em></div>)}</div>
          </div>
        </article>

        <article className="cw-panel cw-risks">
          <header><div><CircleAlert size={17}/><h3>质量校验与阻断项</h3></div><button>查看全部 12 项</button></header>
          <table><thead><tr><th>等级</th><th>数据源</th><th>责任部门</th><th>问题说明</th><th>操作</th></tr></thead>
          <tbody>{carbonRisks.map(r => <tr key={r.source}><td><span className={`risk-${r.level}`}>{r.level}</span></td><td>{r.source}</td><td>{r.owner}</td><td>{r.issue}</td><td><button>{r.action}</button></td></tr>)}</tbody></table>
        </article>

        <article className="cw-panel cw-batches">
          <header><div><Archive size={17}/><h3>核算批次</h3></div><button className="cw-export"><Download size={14}/>导出核算报告</button></header>
          <div className="cw-batch-list">{carbonBatches.map((b, i) => <button key={b.name}>
            <span className="cw-batch-icon">{i === 0 ? <ClipboardCheck size={18}/> : <FileCheck2 size={18}/>}</span>
            <span><b>{b.name}</b><small>{b.standard} · {b.period}</small></span>
            <span><small>排放量</small><b>{b.emission} tCO₂e</b></span>
            <span><small>完整率 / 质量分</small><b>{b.complete}% / {b.quality}</b></span>
            <em>{b.status}</em><ChevronRight size={15}/>
          </button>)}</div>
        </article>
      </section>
      <p className="cw-footnote">Demo 模拟数据 · 结果仅用于产品演示，正式核算须经数据复核、因子确认及第三方核查。</p>
    </div>
  );
}
