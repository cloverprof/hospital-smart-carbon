// 领导驾驶舱（提示词 6.6.1）：战略决策支持中心。
// 30 秒回答：总量如何 / 是否偏离 / 未来风险 / 原因在哪 / 现在应投什么。
import dayjs from "dayjs";
import { AlarmClock, BadgeDollarSign, BrainCircuit, Target, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EChart } from "../../components/EChart";
import { Panel, Tag } from "../../components/kit";
import { anomalyChains } from "../../data/anomalies";
import { mainBuildings } from "../../data/buildings";
import { annualCarbonBudgetT, demoAsOfDate, reductionTargetPct } from "../../data/config";
import { CockpitShell } from "../../layouts/CockpitShell";
import { useDemoStore } from "../../stores/demo";
import {
  bedOccupancy,
  dailyCarbonSeries,
  forecastDailyCarbon,
  monthlyCarbonSeries,
  outpatientVisits,
  realtimePowerKw,
} from "../../services/timeseries";

const asOf = dayjs(demoAsOfDate);
const TOTAL_BEDS = mainBuildings.reduce((s, b) => s + b.beds, 0);

/** 六类排放源占比（对电/气/热碳排的确定性分配，见 docs/DATA_DICTIONARY.md） */
const EMISSION_SOURCES = [
  { name: "空调系统", share: 0.34, potential: 12 },
  { name: "照明系统", share: 0.13, potential: 8 },
  { name: "锅炉蒸汽", share: 0.22, potential: 9 },
  { name: "动力系统", share: 0.12, potential: 5 },
  { name: "医用/麻醉气体", share: 0.04, potential: 6 },
  { name: "大型医疗设备", share: 0.15, potential: 7 },
];

/** 模拟同级医院对标样本（无可信公开样本，标注模拟） */
const PEER_SAMPLE = [
  { name: "本院", intensity: 96, perBed: 37.0, green: 6, rank: [4, 3, 3] },
  { name: "同级样本 A", intensity: 88, perBed: 34.2, green: 12, rank: [2, 2, 2] },
  { name: "同级样本 B", intensity: 104, perBed: 41.5, green: 4, rank: [6, 6, 5] },
  { name: "同级样本均值", intensity: 95, perBed: 38.1, green: 8, rank: [4, 4, 4] },
];

function useLeaderData() {
  return useMemo(() => {
    const yearStart = asOf.startOf("year").format("YYYY-MM-DD");
    const ytdSeries = dailyCarbonSeries(yearStart, demoAsOfDate);
    const ytd = ytdSeries.reduce((s, p) => s + p.v, 0);
    const lastYtd = dailyCarbonSeries(
      asOf.subtract(1, "year").startOf("year").format("YYYY-MM-DD"),
      asOf.subtract(1, "year").format("YYYY-MM-DD"),
    ).reduce((s, p) => s + p.v, 0);
    const forecast = forecastDailyCarbon();
    const fcAvg = forecast.reduce((s, p) => s + p.v, 0) / forecast.length;
    const remainDays = dayjs("2026-12-31").diff(asOf, "day");
    const yearEndEstimate = ytd + fcAvg * remainDays * 0.98; // 秋冬季节修正后的年末估计（演示口径）
    const budgetUsedPct = (ytd / annualCarbonBudgetT) * 100;
    const yoyPctVal = ((ytd - lastYtd) / lastYtd) * 100;

    const area = mainBuildings.reduce((s, b) => s + b.areaM2, 0);
    const bedDays = ytdSeries.length * TOTAL_BEDS * (bedOccupancy(demoAsOfDate) / 100);
    const visitsYtd = ytdSeries.reduce((s, p) => s + outpatientVisits(p.t), 0);

    // 实际曲线只画完整月份；8 月 = 已发生 + 预测余量，9 月 = 纯预测（虚线段）
    const monthly = monthlyCarbonSeries("2026-01", "2026-07");
    const augToDate = monthlyCarbonSeries("2026-08", "2026-08")[0].v;
    const augForecastRest = forecast.filter((p) => p.t.startsWith("2026-08")).reduce((s, p) => s + p.v, 0);
    const sepForecast = forecast.filter((p) => p.t.startsWith("2026-09")).reduce((s, p) => s + p.v, 0);
    const monthlyLastYear = monthlyCarbonSeries("2025-01", "2025-12");

    const buildingYtd = mainBuildings
      .map((b) => ({
        id: b.id,
        name: b.shortName,
        v: Math.round(dailyCarbonSeries(asOf.subtract(29, "day").format("YYYY-MM-DD"), demoAsOfDate, b.id).reduce((s, p) => s + p.v, 0) / 1000),
      }))
      .sort((a, b) => b.v - a.v);

    // 2024-2030 路径：实际 + 目标（2024 基线年 -reductionTargetPct% 到 2026，此后每年 -3%）
    const y2024 = monthlyCarbonSeries("2024-01", "2024-12").reduce((s, p) => s + p.v, 0);
    const y2025 = monthlyCarbonSeries("2025-01", "2025-12").reduce((s, p) => s + p.v, 0);
    const path: { year: string; actual?: number; target: number }[] = [];
    for (let y = 2024; y <= 2030; y++) {
      const target = y === 2024 ? y2024 : Math.round(y2024 * (1 - (reductionTargetPct / 100) * ((y - 2024) / 2)) * (y > 2026 ? 1 - 0.03 * (y - 2026) : 1));
      path.push({
        year: String(y),
        actual: y === 2024 ? Math.round(y2024) : y === 2025 ? Math.round(y2025) : y === 2026 ? Math.round(yearEndEstimate) : undefined,
        target,
      });
    }

    return {
      ytd, lastYtd, yoyPctVal, budgetUsedPct, yearEndEstimate,
      intensity: (ytd * 1000) / area,
      perBedKg: (ytd * 1000) / bedDays,
      perVisitKg: (ytd * 1000 * 0.42) / visitsYtd, // 门诊分摊 42%（演示口径，见数据字典）
      monthly, monthlyLastYear, forecast, buildingYtd, path,
      augEstimate: Math.round(augToDate + augForecastRest),
      sepEstimate: Math.round(sepForecast),
      dataCompleteness: 97.8, // AN-008 网关中断影响（与核算工作台一致）
    };
  }, []);
}

const CARBON_PRICE = 68; // 内部碳价（元/tCO2e，情景演示）

function KpiStrip({ d }: { d: ReturnType<typeof useLeaderData> }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => !document.hidden && setTick((x) => x + 1), 5000);
    return () => window.clearInterval(t);
  }, []);
  const kw = realtimePowerKw(14.5 * 3600 + tick * 5);
  const items = [
    { label: "年度碳排放", v: `${(d.ytd / 1000).toFixed(1)}k`, u: "tCO₂e", sub: `同比 ${d.yoyPctVal > 0 ? "+" : ""}${d.yoyPctVal.toFixed(1)}%`, warn: d.yoyPctVal > 0 },
    { label: "碳预算消耗", v: d.budgetUsedPct.toFixed(1), u: "%", sub: `预算 ${(annualCarbonBudgetT / 1000).toFixed(0)}k t`, warn: d.budgetUsedPct > 62 },
    { label: "剩余预算", v: `${((annualCarbonBudgetT - d.ytd) / 1000).toFixed(1)}k`, u: "tCO₂e", sub: `年末预估 ${(d.yearEndEstimate / 1000).toFixed(1)}k t`, warn: d.yearEndEstimate > annualCarbonBudgetT },
    { label: "排放强度", v: d.intensity.toFixed(1), u: "kg/m²", sub: "年累计口径", warn: false },
    { label: "数据完整率", v: d.dataCompleteness.toFixed(1), u: "%", sub: "1 处网关已修复", warn: d.dataCompleteness < 98 },
    { label: "床日碳排", v: d.perBedKg.toFixed(1), u: "kg/床日", sub: `实时负荷 ${(kw / 1000).toFixed(2)} MW`, warn: false },
    { label: "门诊人次碳排", v: d.perVisitKg.toFixed(1), u: "kg/人次", sub: "门诊分摊口径", warn: false },
  ];
  return (
    <div className="hud-kpis">
      {items.map((k) => (
        <div key={k.label} className="pf-kpi" style={{ padding: "7px 12px", minWidth: 118 }}>
          <span className="k-label" style={{ fontSize: 11 }}>{k.label}</span>
          <span className="k-value" style={{ fontSize: 19, color: k.warn ? "var(--amber)" : "var(--cyan)" }}>
            {k.v}<small>{k.u}</small>
          </span>
          <span className="k-sub" style={{ fontSize: 10 }}>{k.sub}</span>
        </div>
      ))}
    </div>
  );
}

export function LeaderCockpit() {
  const d = useLeaderData();
  // 项目取自 store，转项目后领导舱 ROI 与收益同步更新（演示主线 A 末环）
  const projects = useDemoStore((s) => s.projects);
  const [leftTab, setLeftTab] = useState<"risk" | "peer">("risk");
  const [rightTab, setRightTab] = useState<"roi" | "scenario" | "ai">("roi");
  const [bottomTab, setBottomTab] = useState<"trend" | "path" | "campus">("trend");
  const [srcMode, setSrcMode] = useState<"total" | "perBed">("total");

  const gapRisk = d.yearEndEstimate > annualCarbonBudgetT;
  const overspend = Math.max(0, d.yearEndEstimate - annualCarbonBudgetT);
  const openAnomalies = anomalyChains.filter((a) => a.status !== "closed");
  const savingPool = projects.filter((p) => p.stage !== "operation");
  const operating = projects.filter((p) => p.stage === "operation");

  return (
    <CockpitShell name="领导驾驶舱" variant="leader">
      <KpiStrip d={d} />
      <div className="hud-cols" style={{ paddingTop: 86 }}>
        {/* 左列：经济 / 排放源 / 风险与对标 */}
        <div className="hud-col">
          <Panel title="经济控制" extra={<BadgeDollarSign size={13} />}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11 }}>
              <div><p style={{ margin: 0, color: "var(--ink-3)" }}>年度进度（时间 {Math.round((asOf.diff(asOf.startOf("year"), "day") / 365) * 100)}%）</p>
                <b className="num" style={{ fontSize: 16, color: d.budgetUsedPct > 60 ? "var(--amber)" : "var(--green)" }}>预算 {d.budgetUsedPct.toFixed(1)}%</b></div>
              <div><p style={{ margin: 0, color: "var(--ink-3)" }}>年底预测</p>
                <b className="num" style={{ fontSize: 16, color: gapRisk ? "var(--red)" : "var(--green)" }}>{(d.yearEndEstimate / 1000).toFixed(1)}k t</b></div>
              <div><p style={{ margin: 0, color: "var(--ink-3)" }}>资金敞口（内部碳价 {CARBON_PRICE} 元/t）</p>
                <b className="num" style={{ fontSize: 14 }}>{gapRisk ? `${(overspend * CARBON_PRICE / 10000).toFixed(1)} 万元` : "无缺口"}</b></div>
              <div><p style={{ margin: 0, color: "var(--ink-3)" }}>减排成本效率</p>
                <b className="num" style={{ fontSize: 14 }}>{(projects.reduce((s, p) => s + p.investmentWanYuan, 0) * 10000 / Math.max(1, projects.reduce((s, p) => s + p.annualCarbonReductionT, 0)) / 1000).toFixed(1)}k 元/t·a</b></div>
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 10, color: "var(--ink-3)" }}>
              碳资产收益（EMC 分享+核验节能）年化约 {(projects.filter((p) => p.mv).reduce((s, p) => s + p.annualSavingWanYuan, 0)).toFixed(0)} 万元 · 内部碳预算口径（情景模拟）
            </p>
          </Panel>

          <Panel title="六类排放源" extra={
            <div className="cockpit-tabs">
              <button className={srcMode === "total" ? "active" : ""} onClick={() => setSrcMode("total")}>总量</button>
              <button className={srcMode === "perBed" ? "active" : ""} onClick={() => setSrcMode("perBed")}>床均</button>
            </div>
          }>
            <EChart
              height="clamp(120px, 16vh, 200px)"
              option={{
                legend: false,
                grid: { left: 86, right: 30, top: 6, bottom: 18 },
                xAxis: { type: "value", axisLabel: { fontSize: 9 } },
                yAxis: { type: "category", data: EMISSION_SOURCES.map((s) => s.name).reverse(), axisLabel: { fontSize: 10 } },
                tooltip: { valueFormatter: (v: unknown) => `${Number(v).toLocaleString()} ${srcMode === "total" ? "tCO₂e" : "kg/床"}` },
                series: [{
                  type: "bar", barWidth: 9,
                  data: EMISSION_SOURCES.map((s) => srcMode === "total"
                    ? Math.round(d.ytd * s.share)
                    : Math.round((d.ytd * s.share * 1000) / TOTAL_BEDS)).reverse(),
                  itemStyle: { color: "#29d3e8", borderRadius: 3 },
                }],
              }}
            />
            <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--ink-3)" }}>
              减排潜力最高：空调系统（约 {Math.round(d.ytd * 0.34 * 0.12)} t/a，12%）· 同比升幅主因：净化空调夜间基荷
            </p>
          </Panel>

          <Panel
            title={leftTab === "risk" ? "风险与预警" : "同类医院对标"}
            extra={
              <div className="cockpit-tabs">
                <button className={leftTab === "risk" ? "active" : ""} onClick={() => setLeftTab("risk")}>风险</button>
                <button className={leftTab === "peer" ? "active" : ""} onClick={() => setLeftTab("peer")}>对标</button>
              </div>
            }
          >
            {leftTab === "risk" ? (
              <div style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Tag tone={gapRisk ? "danger" : "ok"}>{gapRisk ? `预算缺口风险 ${(overspend / 1000).toFixed(1)}k t` : "预算内运行"}</Tag>
                  <Tag tone="warn">异常楼宇 {new Set(openAnomalies.map((a) => a.buildingId)).size} 栋</Tag>
                  <Tag tone="warn">进行中异常 {openAnomalies.length} 项</Tag>
                </div>
                <EChart
                  height="clamp(80px, 10vh, 140px)"
                  option={{
                    legend: false,
                    grid: { left: 34, right: 8, top: 8, bottom: 16 },
                    xAxis: { type: "category", data: dailyCarbonSeries(asOf.subtract(29, "day").format("YYYY-MM-DD"), demoAsOfDate).map((p) => p.t.slice(5)), axisLabel: { interval: 8, fontSize: 9 } },
                    yAxis: { type: "value", axisLabel: { fontSize: 9 } },
                    tooltip: { valueFormatter: (v: unknown) => `${v} tCO₂e/日` },
                    series: [{ type: "line", data: dailyCarbonSeries(asOf.subtract(29, "day").format("YYYY-MM-DD"), demoAsOfDate).map((p) => p.v), symbol: "none", smooth: true, lineStyle: { color: "#f5a524", width: 1.5 }, areaStyle: { color: "#f5a524", opacity: 0.1 } }],
                  }}
                />
                <p style={{ margin: 0, color: "var(--ink-2)" }}>
                  <BrainCircuit size={11} style={{ verticalAlign: -2 }} /> AI 建议（模拟诊断）：优先恢复手术楼净化空调 setback（月省约 15 t）、批复冷站变频优化，可消除 68% 缺口风险。
                </p>
              </div>
            ) : (
              <table className="pf-table">
                <thead><tr><th>对象</th><th>强度 kg/m²</th><th>床均 t</th><th>绿电%</th></tr></thead>
                <tbody>
                  {PEER_SAMPLE.map((p) => (
                    <tr key={p.name} style={p.name === "本院" ? { color: "var(--cyan)" } : undefined}>
                      <td>{p.name}</td><td className="num">{p.intensity}</td><td className="num">{p.perBed}</td><td className="num">{p.green}%</td>
                    </tr>
                  ))}
                  <tr><td colSpan={4} style={{ fontSize: 10, color: "var(--ink-3)" }}>模拟同级医院样本 · 近 3 年排名：强度 4/8 → 3/8 → 3/8</td></tr>
                </tbody>
              </table>
            )}
          </Panel>
        </div>

        {/* 中列：底部趋势面板 */}
        <div className="hud-col center">
          <div style={{ width: "min(760px, 100%)", pointerEvents: "auto" }}>
            <Panel
              title={bottomTab === "trend" ? "月度累计碳排：实际 / 目标 / 预测" : bottomTab === "path" ? "2024-2030 减排路径" : "多院区对比"}
              extra={
                <div className="cockpit-tabs">
                  <button className={bottomTab === "trend" ? "active" : ""} onClick={() => setBottomTab("trend")}>趋势</button>
                  <button className={bottomTab === "path" ? "active" : ""} onClick={() => setBottomTab("path")}>路径</button>
                  <button className={bottomTab === "campus" ? "active" : ""} onClick={() => setBottomTab("campus")}>院区</button>
                </div>
              }
            >
              {bottomTab === "trend" && (
                <EChart
                  height="clamp(130px, 17vh, 210px)"
                  option={{
                    grid: { left: 46, right: 12, top: 24, bottom: 20 },
                    legend: { data: ["2026 实际", "2025 同期", "月度目标", "预测"] },
                    xAxis: { type: "category", data: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"] },
                    yAxis: { type: "value", name: "tCO₂e/月", nameTextStyle: { fontSize: 9 } },
                    series: [
                      { name: "2026 实际", type: "line", data: d.monthly.map((p) => p.v), symbol: "circle", symbolSize: 4, lineStyle: { width: 2, color: "#29d3e8" } },
                      { name: "2025 同期", type: "line", data: d.monthlyLastYear.map((p) => p.v), symbol: "none", lineStyle: { width: 1, color: "#5f7799" } },
                      { name: "月度目标", type: "line", data: Array.from({ length: 12 }, (_, i) => Math.round(annualCarbonBudgetT / 12 * (i >= 5 && i <= 8 ? 1.22 : 0.93))), symbol: "none", lineStyle: { width: 1, type: "dashed", color: "#35d399" } },
                      { name: "预测", type: "line", data: [...Array(6).fill(null), d.monthly[6].v, d.augEstimate, d.sepEstimate], symbol: "circle", symbolSize: 3, lineStyle: { width: 1.5, type: "dotted", color: "#f5a524" } },
                    ],
                  }}
                />
              )}
              {bottomTab === "path" && (
                <EChart
                  height="clamp(130px, 17vh, 210px)"
                  option={{
                    grid: { left: 50, right: 12, top: 24, bottom: 20 },
                    legend: { data: ["实际/预估", "目标路径"] },
                    xAxis: { type: "category", data: d.path.map((p) => p.year) },
                    yAxis: { type: "value", name: "tCO₂e/年", nameTextStyle: { fontSize: 9 }, min: 30000 },
                    series: [
                      { name: "实际/预估", type: "bar", barWidth: 16, data: d.path.map((p) => p.actual ?? null), itemStyle: { color: "#29d3e8", borderRadius: 3 } },
                      { name: "目标路径", type: "line", data: d.path.map((p) => p.target), symbol: "diamond", lineStyle: { color: "#35d399", type: "dashed" } },
                    ],
                  }}
                />
              )}
              {bottomTab === "campus" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11, padding: "6px 0" }}>
                  <div className="pf-kpi"><span className="k-label">主院区（本舱数据）</span><span className="k-value" style={{ fontSize: 18 }}>{(d.ytd / 1000).toFixed(1)}k<small>tCO₂e</small></span><span className="k-sub">强度 {d.intensity.toFixed(1)} kg/m²</span></div>
                  <div className="pf-kpi"><span className="k-label">东院区（筹建接入）</span><span className="k-value" style={{ fontSize: 18 }}>—</span><span className="k-sub">演示占位：等待真实数据/资产/接口</span></div>
                  <p style={{ gridColumn: "1 / -1", margin: 0, color: "var(--ink-3)", fontSize: 10 }}>多院区对比在东院区表计接入后启用；当前全部指标为主院区口径。</p>
                </div>
              )}
              <p style={{ margin: "4px 0 0", fontSize: 10, color: "var(--ink-3)" }}>
                {bottomTab === "path"
                  ? `2026 年度目标完成率预估 ${Math.round((d.path[2].target / d.yearEndEstimate) * 100)}% · 目标：较 2024 基线降 ${reductionTargetPct}%（2026）后每年再降 3% · 主要贡献楼宇：门诊、手术医技、动力中心`
                  : "供冷季（6-9 月）月度目标上浮 22% · 预测衔接近 14 日实际并计入整改收益"}
              </p>
            </Panel>
          </div>
        </div>

        {/* 右列：履约 / 资源与TOP5 / 投资决策 */}
        <div className="hud-col">
          <Panel title="年度履约与里程碑" extra={<AlarmClock size={13} />}>
            <table className="pf-table">
              <tbody>
                {[
                  { t: "能源审计报告更新", due: "2026-09-15", owner: "李科长", pct: 20, late: false },
                  { t: "年度碳核算批次锁定", due: "2026-09-30", owner: "能源管理员", pct: 65, late: false },
                  { t: "绿电采购协议续签", due: "2026-08-20", owner: "总务处", pct: 45, late: false },
                  { t: "上半年节能整改验收", due: "2026-07-31", owner: "后勤负责人", pct: 90, late: true },
                ].map((m) => (
                  <tr key={m.t}>
                    <td style={{ fontSize: 11 }}>{m.t}<br /><span style={{ fontSize: 9, color: "var(--ink-3)" }}>{m.owner} · 截止 {m.due} · 剩 {dayjs(m.due).diff(asOf, "day")} 天</span></td>
                    <td style={{ width: 64 }}>
                      <Tag tone={m.late ? "danger" : m.pct > 60 ? "ok" : "warn"}>{m.late ? "已逾期" : `${m.pct}%`}</Tag>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel title="资源消耗与楼宇 TOP5" extra={<TrendingUp size={13} />}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 5, marginBottom: 6, fontSize: 10 }}>
              {[
                { n: "碳", v: `${(d.ytd / 1000).toFixed(1)}k t`, per: `${d.perBedKg.toFixed(0)} kg/床日` },
                { n: "电", v: "28.1 GWh", per: "首年计量" },
                { n: "水", v: "218k m³", per: "370L/床日 内" },
                { n: "医气", v: "672k m³", per: "O₂ 为主" },
              ].map((r) => (
                <div key={r.n} style={{ background: "rgba(41,211,232,0.05)", border: "1px solid var(--panel-border)", borderRadius: 6, padding: "4px 6px" }}>
                  <p style={{ margin: 0, color: "var(--ink-3)" }}>{r.n}</p>
                  <b className="num" style={{ fontSize: 11 }}>{r.v}</b>
                  <p style={{ margin: 0, color: "var(--ink-3)", fontSize: 9 }}>{r.per}</p>
                </div>
              ))}
            </div>
            <EChart
              height="clamp(90px, 11vh, 150px)"
              option={{
                legend: false,
                grid: { left: 64, right: 30, top: 4, bottom: 16 },
                xAxis: { type: "value", axisLabel: { fontSize: 9 } },
                yAxis: { type: "category", data: d.buildingYtd.slice(0, 5).map((b) => b.name).reverse(), axisLabel: { fontSize: 10 } },
                tooltip: { valueFormatter: (v: unknown) => `${v} tCO₂e / 近30日` },
                series: [{ type: "bar", barWidth: 8, data: d.buildingYtd.slice(0, 5).map((b) => b.v).reverse(), itemStyle: { color: "#8b8df0", borderRadius: 3 } }],
              }}
            />
          </Panel>

          <Panel
            title={rightTab === "roi" ? "减排投资 ROI" : rightTab === "scenario" ? "3 年情景模拟" : "AI 决策助手"}
            extra={
              <div className="cockpit-tabs">
                <button className={rightTab === "roi" ? "active" : ""} onClick={() => setRightTab("roi")}>ROI</button>
                <button className={rightTab === "scenario" ? "active" : ""} onClick={() => setRightTab("scenario")}>情景</button>
                <button className={rightTab === "ai" ? "active" : ""} onClick={() => setRightTab("ai")}>建议</button>
              </div>
            }
          >
            {rightTab === "roi" && (
              <EChart
                height="clamp(110px, 14vh, 180px)"
                option={{
                  legend: false,
                  grid: { left: 40, right: 16, top: 20, bottom: 26 },
                  xAxis: { type: "value", name: "投资(万元)", nameTextStyle: { fontSize: 9 }, axisLabel: { fontSize: 9 } },
                  yAxis: { type: "value", name: "年减碳(t)", nameTextStyle: { fontSize: 9 }, axisLabel: { fontSize: 9 } },
                  tooltip: {
                    trigger: "item",
                    formatter: (p: { data: number[]; dataIndex: number }) =>
                      `${savingPool.concat(operating)[p.dataIndex]?.name}<br/>投资 ${p.data[0]} 万 · 减碳 ${p.data[1]} t/a · 回收 ${p.data[2]} 年`,
                  },
                  series: [{
                    type: "scatter",
                    symbolSize: (v: number[]) => Math.max(10, 34 - v[2] * 4),
                    data: savingPool.concat(operating).map((p) => [p.investmentWanYuan, p.annualCarbonReductionT, p.paybackYears]),
                    itemStyle: { color: "#29d3e8", opacity: 0.8 },
                  }],
                }}
              />
            )}
            {rightTab === "scenario" && (
              <table className="pf-table">
                <thead><tr><th>情景</th><th>3 年投资</th><th>3 年减碳</th><th>2029 强度</th></tr></thead>
                <tbody>
                  {[
                    { n: "保守（仅运维优化）", i: "80 万", r: "620 t", s: "93 kg/m²" },
                    { n: "均衡（推荐）", i: "310 万", r: "1,860 t", s: "86 kg/m²" },
                    { n: "进取（含光伏储能）", i: "980 万", r: "3,400 t", s: "78 kg/m²" },
                  ].map((r, i) => (
                    <tr key={r.n} style={i === 1 ? { color: "var(--cyan)" } : undefined}>
                      <td style={{ fontSize: 11 }}>{r.n}</td><td className="num">{r.i}</td><td className="num">{r.r}</td><td className="num">{r.s}</td>
                    </tr>
                  ))}
                  <tr><td colSpan={4} style={{ fontSize: 9, color: "var(--ink-3)" }}>Demo 估算 · 碳资产/绿证/CCER 仅作情景演示，适用性以主管部门规则为准</td></tr>
                </tbody>
              </table>
            )}
            {rightTab === "ai" && (
              <ol style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: "var(--ink-2)", display: "flex", flexDirection: "column", gap: 5 }}>
                <li>批准 <b>净化空调 setback 改造</b>（PRJ-2026-09）：投资 68 万，年减 101 t，回收 5.2 年 · 证据：夜间基荷 +24%（置信度 92%）</li>
                <li>将 <b>疏水阀普查</b>（PRJ-2026-10）提级为季度例行：回收期仅 2.2 年</li>
                <li>Q4 启动 <b>大型设备预约制</b> 试点（影像中心），先行 MRI-02 待机治理</li>
                <li>绿电采购比例提升至 12% 可再降强度 4.1 kg/m²（待电价谈判）</li>
                <li style={{ color: "var(--ink-3)", fontSize: 10 }}>模拟诊断 · 全部建议需人工确认，不影响医疗安全</li>
              </ol>
            )}
          </Panel>
        </div>
      </div>
      <div style={{ position: "absolute", left: 16, bottom: 12, zIndex: 12, fontSize: 10, color: "var(--ink-3)" }}>
        <Target size={10} style={{ verticalAlign: -1 }} /> 战略视图 · 点击楼宇名牌查看碳排与 30 日趋势 · 政策/披露详情见 AI 分析与合规凭证模块
      </div>
    </CockpitShell>
  );
}
