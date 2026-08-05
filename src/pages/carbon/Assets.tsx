// 6.2.3 碳资产管理：内部碳预算/情景模拟、策略对比、履约任务与交易台账。
// 口径声明：医院当前未纳入全国碳市场强制履约（待核验），本页全部为内部预算与演示情景，非真实监管配额。
import dayjs from "dayjs";
import type { EChartsCoreOption } from "echarts";
import {
  AlertTriangle, ArrowRightLeft, Ban, Check, ChevronDown, ChevronRight, Download,
  ExternalLink, Landmark, Leaf, Plus, RotateCcw, ShieldAlert, ShoppingCart, Sparkles, TrendingDown,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EChart } from "../../components/EChart";
import { EmptyState, Kpi, Modal, PageHead, Panel, Tag } from "../../components/kit";
import { mainBuildings } from "../../data/buildings";
import { initialTransactions } from "../../data/carbon-platform";
import { annualCarbonBudgetT, demoAsOfDate } from "../../data/config";
import { activeFactors } from "../../data/factors";
import {
  carbonPriceSeries, financeTools, taskOwnerOptions, type AssetComplianceTask,
} from "../../data/modules/carbon-assets";
import { canWrite } from "../../data/navigation";
import { projectSeeds } from "../../data/projects";
import { dailyCarbonSeries, monthlyCarbonSeries, sumUsage } from "../../services/timeseries";
import { useCarbonAssetsStore } from "../../stores/carbon-assets";
import { useDemoStore } from "../../stores/demo";
import type { AssetTransaction } from "../../types/domain";

const MODULE_ID = "carbon-assets";
const YTD_FROM = "2026-01-01";
const fmt = (n: number) => Math.round(n).toLocaleString("zh-CN");
const wan = (yuan: number) => (yuan / 10000).toFixed(1);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const smallBtn: React.CSSProperties = { padding: "2px 8px", fontSize: 11 };
const noteStyle: React.CSSProperties = { fontSize: 11, color: "var(--ink-3)", lineHeight: 1.6, margin: "6px 0 0" };

function MiniBar({ pct, danger }: { pct: number; danger?: boolean }) {
  const color = danger ? "var(--red)" : pct >= 100 ? "var(--green)" : "var(--cyan)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 72, height: 6, borderRadius: 3, background: "rgba(157,180,214,0.16)", overflow: "hidden", display: "inline-block" }}>
        <span style={{ display: "block", width: `${clamp(pct, 0, 100)}%`, height: "100%", background: color }} />
      </span>
      <span className="num" style={{ fontSize: 11 }}>{pct}%</span>
    </span>
  );
}

function SliderRow({ label, value, min, max, unit, onChange }: {
  label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void;
}) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-2)", marginBottom: 4 }}>
        <b style={{ fontWeight: 600 }}>{label}</b>
        <em className="num" style={{ fontStyle: "normal", color: "var(--cyan)" }}>{value > 0 && label.includes("排放") ? "+" : ""}{value.toLocaleString("zh-CN")} {unit}</em>
      </span>
      <input type="range" min={min} max={max} step={1} value={value} style={{ width: "100%", accentColor: "var(--cyan)" }}
        onChange={(e) => onChange(Number(e.target.value))} />
      <span style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--ink-3)" }}>
        <i style={{ fontStyle: "normal" }}>{min.toLocaleString("zh-CN")}</i>
        <i style={{ fontStyle: "normal" }}>{max.toLocaleString("zh-CN")}</i>
      </span>
    </label>
  );
}

export function CarbonAssetsV2Page() {
  const { role, allPermissions, pageFilters, setPageFilter, pushToast } = useDemoStore();
  const {
    tasks, transactions, completeTask, reassignTask, addTask,
    addTransaction, approveTransaction, voidTransaction, resetModule,
  } = useCarbonAssetsStore();
  const writable = canWrite(MODULE_ID, role, allPermissions);
  const pf = pageFilters[MODULE_ID] ?? {};
  const taskStatusFilter = String(pf.taskStatus ?? "全部");
  const txTypeFilter = String(pf.txType ?? "全部");
  const budgetView = String(pf.budgetView ?? "month");

  // ---------- 预算与排放（全部来自数据层，确定性） ----------
  const budget = useMemo(() => {
    const ytd = monthlyCarbonSeries("2026-01", "2026-08"); // 8 月为 1-4 日部分值
    const usedT = Math.round(ytd.reduce((s, p) => s + p.v, 0));
    const m2025 = monthlyCarbonSeries("2025-01", "2025-12");
    const total2025 = m2025.reduce((s, p) => s + p.v, 0) || 1;
    const monthlyBudget = m2025.map((p) => Math.round((annualCarbonBudgetT * p.v) / total2025));
    // 年末预测：今年已发生 + 去年剩余期间 × 今年同比系数
    const same2025 = dailyCarbonSeries("2025-01-01", "2025-08-04").reduce((s, p) => s + p.v, 0) || 1;
    const rest2025 = dailyCarbonSeries("2025-08-05", "2025-12-31").reduce((s, p) => s + p.v, 0);
    const yoyRatio = usedT / same2025;
    const projectedT = Math.round(usedT + rest2025 * yoyRatio);
    const top5 = mainBuildings
      .map((b) => ({ name: b.shortName, v: Math.round(monthlyCarbonSeries("2026-01", "2026-08", b.id).reduce((s, p) => s + p.v, 0) * 10) / 10 }))
      .sort((a, b) => b.v - a.v)
      .slice(0, 5);
    const srcComp = [
      { name: "外购电力", value: Math.round(sumUsage("electricity", YTD_FROM, demoAsOfDate) * activeFactors.electricity) / 1000 },
      { name: "天然气", value: Math.round(sumUsage("gas", YTD_FROM, demoAsOfDate) * activeFactors.gas) / 1000 },
      { name: "外购热力", value: Math.round(sumUsage("heat", YTD_FROM, demoAsOfDate) * activeFactors.heat) / 1000 },
    ].map((x) => ({ ...x, value: Math.round(x.value * 10) / 10 }));
    return { ytd, usedT, monthlyBudget, projectedT, top5, srcComp, yoyPctVal: Math.round((yoyRatio - 1) * 1000) / 10 };
  }, []);

  const remainT = annualCarbonBudgetT - budget.usedT;
  const execPct = Math.round((budget.usedT / annualCarbonBudgetT) * 1000) / 10;
  const timePct = Math.round(((dayjs(demoAsOfDate).diff(dayjs(YTD_FROM), "day") + 1) / 365) * 1000) / 10;
  const projGap = budget.projectedT - annualCarbonBudgetT; // >0 缺口，<0 盈余

  // ---------- 情景模拟器 ----------
  const [simPrice, setSimPrice] = useState<number>(() => {
    const saved = Number(pf.simPrice);
    if (Number.isFinite(saved) && saved >= 30 && saved <= 150) return saved;
    return clamp(Math.round(carbonPriceSeries()[11].v), 30, 150);
  });
  const [simDelta, setSimDelta] = useState<number>(() => {
    const saved = Number(pf.simDelta);
    return Number.isFinite(saved) && Math.abs(saved) <= 15 ? Math.round(saved) : 0;
  });

  const scenario = useMemo(() => {
    const scenT = Math.round(budget.projectedT * (1 + simDelta / 100));
    const gapT = scenT - annualCarbonBudgetT;
    const gapPos = Math.max(0, gapT);
    const exposureWan = (gapPos * simPrice) / 10000;
    const surplusWan = (Math.max(0, -gapT) * simPrice) / 10000;
    const risk: "低" | "中" | "高" = gapT <= 0 ? "低" : gapT <= annualCarbonBudgetT * 0.05 ? "中" : "高";
    return { scenT, gapT, gapPos, exposureWan, surplusWan, risk };
  }, [budget, simPrice, simDelta]);

  // ---------- 三策略对比 + AI 推荐（规则演示） ----------
  const strategy = useMemo(() => {
    const pipeline = projectSeeds.filter((p) => p.stage !== "operation");
    const pipeReduction = Math.round(pipeline.reduce((s, p) => s + p.annualCarbonReductionT, 0));
    const pipeInvest = Math.round(pipeline.reduce((s, p) => s + p.investmentWanYuan, 0) * 10) / 10;
    const pipeSaving = Math.round(pipeline.reduce((s, p) => s + p.annualSavingWanYuan, 0) * 10) / 10;
    const ccerPrice = Math.round(simPrice * 0.82);
    const ccerCap = Math.round(annualCarbonBudgetT * 0.05);
    const gap = scenario.gapPos;

    const ccerCover = Math.min(gap, ccerCap);
    const ccerCostWan = (ccerCover * ccerPrice + (gap - ccerCover) * simPrice) / 10000;
    const quotaCostWan = (gap * simPrice) / 10000;
    const innerCover = Math.min(gap, pipeReduction);
    const innerNetAnnualWan = Math.max(0, pipeInvest / 10 - pipeSaving); // 投资按 10 年平摊，先用年节费抵扣
    const innerCostWan = innerNetAnnualWan + ((gap - innerCover) * simPrice) / 10000;

    const cards = [
      {
        id: "ccer", name: "CCER 抵销演示", icon: Leaf, costWan: ccerCostWan,
        lines: gap > 0
          ? [`CCER 覆盖 ${fmt(ccerCover)} t × ${ccerPrice} 元/t（演示价 = 碳价 × 0.82）`, gap > ccerCap ? `超出 5% 上限部分 ${fmt(gap - ccerCap)} t 按配额价 ${simPrice} 元/t 补足` : `未触及演示抵销上限 ${fmt(ccerCap)} t（预算 5%）`]
          : ["当前情景无缺口，无需抵销"],
        applicability: "全国碳市场 CCER 抵销上限为应清缴配额的 5%，此处按内部预算 5% 套用演示；医院未纳入强制履约（待核验）。",
      },
      {
        id: "quota", name: "购买配额演示", icon: ShoppingCart, costWan: quotaCostWan,
        lines: gap > 0
          ? [`缺口 ${fmt(gap)} t × 情景碳价 ${simPrice} 元/t`, "价格随碳价滑块实时联动"]
          : ["当前情景无缺口，无需购买"],
        applicability: "医院不是配额管控单位，无法直接在 CEA 市场购买（待核验）；仅用于估算若纳入履约的资金敞口。",
      },
      {
        id: "inner", name: "院内减排投资", icon: TrendingDown, costWan: innerCostWan,
        lines: [
          `在建/立项项目 ${pipeline.length} 个：年减排 ${fmt(pipeReduction)} t，总投资 ${pipeInvest} 万元`,
          `年节费 ${pipeSaving} 万元，已覆盖年化投资（${(pipeInvest / 10).toFixed(1)} 万/年）`,
          gap > pipeReduction ? `剩余缺口 ${fmt(gap - pipeReduction)} t 需按配额价补足` : gap > 0 ? "项目组合可全额覆盖当前缺口" : "无缺口，收益体现为节费与减排储备",
        ],
        applicability: "使用项目库立项数据（PRJ-2026-09/10/11/12）；减排量须经 M&V 核验后方可计入。",
      },
    ];
    const best = gap > 0 ? cards.reduce((a, b) => (b.costWan < a.costWan ? b : a)) : cards[2];
    const savingWan = gap > 0 ? Math.max(0, quotaCostWan - best.costWan) : 0;
    const savingPct = gap > 0 && quotaCostWan > 0 ? Math.round((savingWan / quotaCostWan) * 1000) / 10 : 0;
    const confidence = scenario.gapT <= 0 ? 88 : scenario.risk === "高" ? 76 : 82;
    return { cards, best, savingWan, savingPct, confidence, pipeReduction, ccerCap, ccerPrice, quotaCostWan };
  }, [scenario, simPrice]);

  // ---------- 履约任务 ----------
  const decoratedTasks = useMemo(() => {
    const rows = tasks.map((t) => {
      const overdue = t.status !== "已完成" && t.dueDate < demoAsOfDate;
      const days = dayjs(t.dueDate).diff(dayjs(demoAsOfDate), "day");
      return { ...t, overdue, days, showStatus: overdue ? "已逾期" : t.status };
    });
    rows.sort((a, b) => (a.status === "已完成" ? 1 : 0) - (b.status === "已完成" ? 1 : 0) || a.dueDate.localeCompare(b.dueDate));
    return rows;
  }, [tasks]);
  const filteredTasks = useMemo(
    () => decoratedTasks.filter((t) => taskStatusFilter === "全部" || t.showStatus === taskStatusFilter),
    [decoratedTasks, taskStatusFilter],
  );
  const overdueCount = decoratedTasks.filter((t) => t.overdue).length;

  const [reassignTarget, setReassignTarget] = useState<AssetComplianceTask | null>(null);
  const [reassignOwner, setReassignOwner] = useState(0);
  const doReassign = () => {
    if (!reassignTarget) return;
    const opt = taskOwnerOptions[reassignOwner];
    reassignTask(reassignTarget.id, opt.owner, opt.dept);
    pushToast("任务已转派", `「${reassignTarget.title}」责任人变更为 ${opt.owner}（${opt.dept}）`, "success");
    setReassignTarget(null);
  };

  // ---------- 交易台账 ----------
  const filteredTx = useMemo(
    () => transactions.filter((t) => txTypeFilter === "全部" || t.assetType === txTypeFilter),
    [transactions, txTypeFilter],
  );
  const holdings = useMemo(() => {
    const live = transactions.filter((t) => t.reviewStatus !== "已撤销");
    const net = (type: AssetTransaction["assetType"]) =>
      live.filter((t) => t.assetType === type).reduce((s, t) => s + (t.direction === "买入" ? t.quantity : -t.quantity), 0);
    const netValue = live.reduce((s, t) => s + (t.direction === "买入" ? t.amount : -t.amount), 0);
    const creditT = net("CCER") + net("碳信用") + net("内部碳配额");
    return { gec: net("绿证"), ccer: net("CCER"), credit: net("碳信用"), creditT, netValue };
  }, [transactions]);

  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txForm, setTxForm] = useState({
    assetType: "绿证" as AssetTransaction["assetType"], direction: "买入" as AssetTransaction["direction"],
    quantity: 100, unitPrice: 46, date: demoAsOfDate, counterparty: "", contractNo: "",
  });
  const [txErr, setTxErr] = useState<Record<string, string>>({});
  const saveTx = () => {
    const e: Record<string, string> = {};
    if (txForm.quantity <= 0) e.quantity = "数量必须大于 0";
    if (txForm.unitPrice <= 0) e.unitPrice = "单价必须大于 0";
    if (!txForm.counterparty.trim()) e.counterparty = "请填写交易对手";
    if (!txForm.contractNo.trim()) e.contractNo = "请填写合同编号";
    setTxErr(e);
    if (Object.keys(e).length) return;
    addTransaction({
      id: crypto.randomUUID(), ...txForm, amount: Math.round(txForm.quantity * txForm.unitPrice),
      operator: "当前用户", reviewStatus: "待审核",
    });
    pushToast("交易已登记", `${txForm.assetType} ${txForm.direction} ${fmt(txForm.quantity)}，待审核后计入持仓`, "success");
    setTxModalOpen(false);
  };

  // ---------- 合规雷达（由页面真实数据推导，演示口径） ----------
  const radarValues = useMemo(() => {
    const m3 = tasks.filter((t) => t.milestone === "M3");
    const live = transactions.filter((t) => t.reviewStatus !== "已撤销");
    return [
      { name: "预算达成", v: Math.round(clamp(100 - Math.max(0, execPct - timePct) * 4, 0, 100)) },
      { name: "任务及时", v: Math.round((1 - overdueCount / Math.max(1, tasks.length)) * 100) },
      { name: "资产充足", v: scenario.gapPos <= 0 ? 100 : Math.round(clamp((holdings.creditT / scenario.gapPos) * 100, 0, 100)) },
      { name: "凭证关联", v: Math.round((live.filter((t) => t.attachment).length / Math.max(1, live.length)) * 100) },
      { name: "核查准备", v: Math.round(m3.reduce((s, t) => s + t.progress, 0) / Math.max(1, m3.length)) },
      { name: "价格缓冲", v: Math.round(clamp(100 - ((simPrice - 30) / 120) * 100, 0, 100)) },
    ];
  }, [tasks, transactions, overdueCount, scenario, holdings, execPct, timePct, simPrice]);

  // ---------- 图表 options ----------
  const trendOption = useMemo<EChartsCoreOption>(() => {
    const isQ = budgetView === "quarter";
    const labels = isQ ? ["Q1", "Q2", "Q3", "Q4"] : Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
    const agg = (arr: (number | null)[], q: number) => {
      const seg = arr.slice(q * 3, q * 3 + 3).filter((x): x is number => x != null);
      return seg.length ? Math.round(seg.reduce((s, x) => s + x, 0)) : null;
    };
    const actualRaw: (number | null)[] = Array.from({ length: 12 }, (_, i) => (i < budget.ytd.length ? budget.ytd[i].v : null));
    const budgetArr = isQ ? [0, 1, 2, 3].map((q) => agg(budget.monthlyBudget, q)) : budget.monthlyBudget;
    const actualArr = isQ ? [0, 1, 2, 3].map((q) => agg(actualRaw, q)) : actualRaw;
    let cum = 0;
    const execLine = actualArr.map((v) => {
      if (v == null) return null;
      cum += v;
      return Math.round((cum / annualCarbonBudgetT) * 1000) / 10;
    });
    return {
      legend: { data: ["预算", "实际排放", "累计执行率"] },
      grid: { right: 44 },
      xAxis: { type: "category", data: labels },
      yAxis: [
        { type: "value", name: "tCO₂e" },
        { type: "value", name: "%", position: "right", splitLine: { show: false } },
      ],
      series: [
        { name: "预算", type: "bar", barWidth: isQ ? 26 : 9, data: budgetArr, itemStyle: { color: "rgba(41,211,232,0.42)", borderRadius: [3, 3, 0, 0] } },
        {
          name: "实际排放", type: "bar", barWidth: isQ ? 26 : 9,
          data: actualArr.map((v, i) => (v == null ? null : { value: v, itemStyle: { color: v > (budgetArr[i] ?? 0) ? "#f5a524" : "#35d399", borderRadius: [3, 3, 0, 0] } })),
        },
        { name: "累计执行率", type: "line", yAxisIndex: 1, smooth: true, showSymbol: false, data: execLine, lineStyle: { color: "#8b8df0", width: 2 }, itemStyle: { color: "#8b8df0" } },
      ],
    };
  }, [budget, budgetView]);

  const top5Option = useMemo<EChartsCoreOption>(() => ({
    legend: false,
    grid: { left: 66, right: 74 },
    xAxis: { type: "value", name: "tCO₂e" },
    yAxis: { type: "category", inverse: true, data: budget.top5.map((t) => t.name) },
    series: [{
      type: "bar", barWidth: 12, data: budget.top5.map((t) => t.v),
      label: {
        show: true, position: "right", color: "#9db4d6", fontSize: 10,
        formatter: (p: { value?: number | string }) => `${fmt(Number(p.value))} t · ${((Number(p.value) / Math.max(1, budget.usedT)) * 100).toFixed(1)}%`,
      },
      itemStyle: { color: "#29d3e8", borderRadius: [0, 3, 3, 0] },
    }],
  }), [budget]);

  const srcOption = useMemo<EChartsCoreOption>(() => ({
    legend: { bottom: 0, top: "auto" },
    tooltip: { trigger: "item", formatter: "{b}：{c} tCO₂e（{d}%）" },
    series: [{
      type: "pie", radius: ["44%", "68%"], center: ["50%", "46%"],
      label: { show: false }, data: budget.srcComp,
    }],
  }), [budget]);

  const scenarioOption = useMemo<EChartsCoreOption>(() => ({
    legend: false,
    grid: { left: 54 },
    xAxis: { type: "category", data: ["年度预算", "年末预测", "情景排放"] },
    yAxis: { type: "value", name: "tCO₂e", scale: true },
    series: [{
      type: "bar", barWidth: 32,
      data: [
        { value: annualCarbonBudgetT, itemStyle: { color: "rgba(41,211,232,0.5)", borderRadius: [3, 3, 0, 0] } },
        { value: budget.projectedT, itemStyle: { color: "#4da3ff", borderRadius: [3, 3, 0, 0] } },
        { value: scenario.scenT, itemStyle: { color: scenario.gapT > 0 ? "#f5a524" : "#35d399", borderRadius: [3, 3, 0, 0] } },
      ],
      label: { show: true, position: "top", color: "#9db4d6", fontSize: 10, formatter: (p: { value?: number | string }) => fmt(Number(p.value)) },
    }],
  }), [budget, scenario]);

  const priceOption = useMemo<EChartsCoreOption>(() => {
    const s = carbonPriceSeries();
    return {
      legend: false,
      grid: { left: 38, right: 16 },
      xAxis: { type: "category", data: s.map((p) => p.t.slice(2)) },
      yAxis: { type: "value", name: "元/t", scale: true },
      series: [{
        name: "演示碳价", type: "line", smooth: true, showSymbol: false,
        data: s.map((p) => p.v), lineStyle: { color: "#29d3e8", width: 2 }, itemStyle: { color: "#29d3e8" }, areaStyle: { opacity: 0.1 },
        markLine: {
          symbol: "none", data: [{ yAxis: simPrice }],
          label: { formatter: `情景 ${simPrice}`, color: "#f5a524", fontSize: 10 },
          lineStyle: { color: "#f5a524", type: "dashed" },
        },
      }],
    };
  }, [simPrice]);

  const radarOption = useMemo<EChartsCoreOption>(() => ({
    legend: false,
    tooltip: { trigger: "item" },
    radar: {
      indicator: radarValues.map((r) => ({ name: r.name, max: 100 })),
      radius: "64%", center: ["50%", "52%"],
      axisName: { color: "#9db4d6", fontSize: 10 },
      splitLine: { lineStyle: { color: "rgba(56,116,178,0.25)" } },
      splitArea: { areaStyle: { color: ["rgba(41,211,232,0.03)", "rgba(41,211,232,0.07)"] } },
      axisLine: { lineStyle: { color: "rgba(95,119,153,0.4)" } },
    },
    series: [{
      type: "radar",
      data: [{ value: radarValues.map((r) => r.v), name: "合规能力（演示）", areaStyle: { opacity: 0.22 } }],
      lineStyle: { color: "#29d3e8" }, itemStyle: { color: "#29d3e8" }, symbolSize: 3,
    }],
  }), [radarValues]);

  // ---------- 导出（与当前筛选一致） ----------
  const exportWorkbook = async () => {
    const { downloadWorkbook } = await import("../../utils/downloads");
    downloadWorkbook({
      预算概览: [
        { 指标: "年度碳预算（tCO₂e）", 数值: annualCarbonBudgetT },
        { 指标: "已消耗（1-1 至 8-4）", 数值: budget.usedT },
        { 指标: "剩余额度", 数值: remainT },
        { 指标: "年末预测", 数值: budget.projectedT },
        { 指标: "预算执行率（%）", 数值: execPct },
        { 指标: "时间进度（%）", 数值: timePct },
        { 指标: "情景碳价（元/t）", 数值: simPrice },
        { 指标: "情景排放（tCO₂e）", 数值: scenario.scenT },
        { 指标: scenario.gapT > 0 ? "情景缺口（tCO₂e）" : "情景盈余（tCO₂e）", 数值: Math.abs(scenario.gapT) },
      ],
      月度预算与排放: budget.monthlyBudget.map((b, i) => ({
        月份: `2026-${String(i + 1).padStart(2, "0")}`, 月度预算_t: b,
        实际排放_t: i < budget.ytd.length ? budget.ytd[i].v : "",
        备注: i === 7 ? "8 月为 1-4 日部分值" : "",
      })),
      履约任务: filteredTasks.map((t) => ({
        编号: t.id, 任务: t.title, 里程碑: t.milestone, 优先级: t.priority, 责任人: t.owner, 部门: t.dept,
        截止: t.dueDate, 状态: t.showStatus, 完成度: `${t.progress}%`, 备注: t.note,
      })),
      交易记录: filteredTx.map((t) => ({
        日期: t.date, 类型: t.assetType, 方向: t.direction, 数量: t.quantity, 单价_元: t.unitPrice, 金额_元: t.amount,
        交易对手: t.counterparty, 合同号: t.contractNo, 经办人: t.operator, 审核状态: t.reviewStatus,
      })),
    }, `碳资产管理台账_${demoAsOfDate}.xlsx`);
    pushToast("导出完成", "已按当前筛选导出预算概览、任务与交易台账（xlsx）", "success");
  };
  const exportTxCsv = async () => {
    const { downloadCsv } = await import("../../utils/downloads");
    if (!filteredTx.length) { pushToast("无可导出数据", "当前筛选下没有交易记录", "warning"); return; }
    downloadCsv(filteredTx.map((t) => ({
      日期: t.date, 类型: t.assetType, 方向: t.direction, 数量: t.quantity, 单价_元: t.unitPrice, 金额_元: t.amount,
      交易对手: t.counterparty, 合同号: t.contractNo, 经办人: t.operator, 审核状态: t.reviewStatus,
    })), `碳资产交易记录_${txTypeFilter}_${demoAsOfDate}.csv`);
    pushToast("导出完成", `已导出 ${filteredTx.length} 条交易记录（CSV，筛选：${txTypeFilter}）`, "success");
  };

  const adoptRecommendation = () => {
    if (tasks.some((t) => t.id.startsWith("CT-AI"))) {
      pushToast("已存在待办", "推荐策略任务已生成，请在履约任务表中跟进", "warning");
      return;
    }
    addTask({
      id: `CT-AI-${dayjs(demoAsOfDate).format("MMDD")}`,
      title: `落实推荐策略：${scenario.gapPos > 0 ? strategy.best.name : "盈余结转与资产盘点"}（模拟）`,
      milestone: "M4", dueDate: dayjs(demoAsOfDate).add(30, "day").format("YYYY-MM-DD"),
      owner: "周敏", dept: "财务资产部", progress: 0, status: "待开始", priority: "高",
      note: scenario.gapPos > 0
        ? `模拟诊断生成：情景缺口 ${fmt(scenario.gapPos)} t，预计较全额购买配额节省 ${strategy.savingWan.toFixed(1)} 万元`
        : `模拟诊断生成：情景盈余 ${fmt(-scenario.gapT)} t，盈余估值约 ${scenario.surplusWan.toFixed(1)} 万元`,
    });
    pushToast("建议已采纳（模拟）", "已生成履约任务并指派财务资产部，请人工确认执行细节", "success");
  };

  const [openTool, setOpenTool] = useState<string | null>(null);
  const priceLatest = carbonPriceSeries()[11].v;
  const pricePrev = carbonPriceSeries()[10].v;

  return (
    <>
      <PageHead
        title="碳资产管理"
        sub="内部碳预算 · 情景模拟 · 履约任务与交易台账（演示）"
        actions={
          <>
            <button className="pf-btn ghost" onClick={() => { resetModule(); pushToast("已重置", "本页任务与交易已恢复种子数据", "info"); }}>
              <RotateCcw size={13} style={{ marginRight: 4, verticalAlign: -2 }} />重置本页
            </button>
            <button className="pf-btn primary" onClick={exportWorkbook}>
              <Download size={13} style={{ marginRight: 4, verticalAlign: -2 }} />导出台账
            </button>
          </>
        }
      />

      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, margin: "2px 0 10px",
        border: "1px solid rgba(245,165,36,0.45)", background: "rgba(245,165,36,0.08)", color: "var(--amber)", fontSize: 12.5, fontWeight: 600,
      }}>
        <AlertTriangle size={16} style={{ flexShrink: 0 }} />
        <span>内部碳预算/情景模拟——医院当前未纳入全国碳市场强制履约（待核验），本页非真实监管配额。全部价格、策略与配额均为演示口径。</span>
      </div>

      <div className="grid cols-5">
        <Kpi label="年度碳预算" value={annualCarbonBudgetT} unit="tCO₂e" sub={<span>内部预算口径 · 2026</span>} />
        <Kpi label="已消耗（1-1 至 8-4）" value={budget.usedT} unit="tCO₂e" tone="cyan" sub={<span>预算执行率 <b className="num">{execPct}%</b></span>} />
        <Kpi label="剩余额度" value={remainT} unit="tCO₂e" tone={remainT > 0 ? "green" : "red"} sub={<span>时间进度 <b className="num">{timePct}%</b></span>} />
        <Kpi label="年末预测" value={budget.projectedT} unit="tCO₂e" tone="amber"
          sub={<span>同比 {budget.yoyPctVal >= 0 ? "+" : ""}{budget.yoyPctVal}% · 按去年剩余期外推</span>} />
        <Kpi label={projGap > 0 ? "预测缺口" : "预测盈余"} value={Math.abs(projGap)} unit="tCO₂e" tone={projGap > 0 ? "red" : "green"}
          sub={<Tag tone={projGap > 0 ? "danger" : "ok"}>{projGap > 0 ? "预算缺口风险" : "预算内运行"}</Tag>} />
      </div>

      <div className="grid cols-4" style={{ marginTop: 10 }}>
        <Panel title="预算 vs 排放趋势" style={{ gridColumn: "span 2" }} extra={
          <>
            <span>8 月为 1-4 日累计</span>
            {(["month", "quarter"] as const).map((v) => (
              <button key={v} className={`pf-btn ghost`} style={{ ...smallBtn, ...(budgetView === v ? { color: "var(--cyan)", borderColor: "var(--cyan)" } : {}) }}
                onClick={() => setPageFilter(MODULE_ID, { budgetView: v })}>
                {v === "month" ? "月度" : "季度"}
              </button>
            ))}
          </>
        }>
          <EChart height={228} option={trendOption} />
        </Panel>
        <Panel title="楼宇消耗 TOP5（当年累计）" extra={<span>占全院比例</span>}>
          <EChart height={228} option={top5Option} />
        </Panel>
        <Panel title="排放来源构成（当年）" extra={<Tag tone="muted">因子待标准确认（演示）</Tag>}>
          <EChart height={228} option={srcOption} />
        </Panel>
      </div>

      <div className="grid cols-3" style={{ marginTop: 10 }}>
        <Panel title="情景模拟器" style={{ gridColumn: "span 2" }} extra={<span>拖动滑块实时测算资金敞口与风险等级</span>}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 16 }}>
            <div>
              <SliderRow label="碳价" value={simPrice} min={30} max={150} unit="元/t"
                onChange={(v) => { setSimPrice(v); setPageFilter(MODULE_ID, { simPrice: v }); }} />
              <SliderRow label="全年排放调整" value={simDelta} min={-15} max={15} unit="%"
                onChange={(v) => { setSimDelta(v); setPageFilter(MODULE_ID, { simDelta: v }); }} />
              <p style={noteStyle}>
                排放调整以年末预测 {fmt(budget.projectedT)} t 为基准；情景排放 = 预测 × (1 + 调整%)。
                碳价滑块同时驱动右侧碳价趋势图的情景线与三张策略卡。
              </p>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                <span style={{ fontSize: 12, color: "var(--ink-2)" }}>风险等级</span>
                <Tag tone={scenario.risk === "低" ? "ok" : scenario.risk === "中" ? "warn" : "danger"}>
                  {scenario.risk}{scenario.risk === "低" ? "（盈余）" : scenario.risk === "中" ? "（缺口 ≤ 预算 5%）" : "（缺口 > 预算 5%）"}
                </Tag>
              </div>
            </div>
            <div>
              <div className="grid cols-3" style={{ marginBottom: 8 }}>
                <Kpi label="情景排放" value={scenario.scenT} unit="tCO₂e" />
                <Kpi label={scenario.gapT > 0 ? "情景缺口" : "情景盈余"} value={Math.abs(scenario.gapT)} unit="tCO₂e" tone={scenario.gapT > 0 ? "red" : "green"} />
                {scenario.gapT > 0
                  ? <Kpi label="资金敞口" value={scenario.exposureWan.toFixed(1)} unit="万元" tone="amber" sub={<span>缺口 × 情景碳价</span>} />
                  : <Kpi label="盈余估值" value={scenario.surplusWan.toFixed(1)} unit="万元" tone="green" sub={<span>盈余 × 情景碳价</span>} />}
              </div>
              <EChart height={150} option={scenarioOption} />
            </div>
          </div>
        </Panel>

        <Panel title="AI 推荐策略" extra={<Tag tone="warn">模拟诊断</Tag>}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            <Tag tone="info">置信度 {strategy.confidence}%（模拟）</Tag>
            <Tag tone="muted">规则引擎 · 非真实 AI</Tag>
          </div>
          {scenario.gapPos > 0 ? (
            <>
              <p style={{ fontSize: 13, color: "var(--ink-1)", fontWeight: 600, margin: "0 0 4px" }}>
                <Sparkles size={13} style={{ verticalAlign: -2, marginRight: 4, color: "var(--cyan)" }} />
                推荐：{strategy.best.name}
              </p>
              <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "0 0 8px" }}>
                较全额购买配额节省 <b className="num" style={{ color: "var(--green)" }}>{strategy.savingWan.toFixed(1)} 万元</b>，
                相对降幅 <b className="num" style={{ color: "var(--green)" }}>{strategy.savingPct}%</b>
                （基准 {strategy.quotaCostWan.toFixed(1)} 万元）。
              </p>
            </>
          ) : (
            <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "0 0 8px" }}>
              <Sparkles size={13} style={{ verticalAlign: -2, marginRight: 4, color: "var(--cyan)" }} />
              当前情景为盈余 {fmt(-scenario.gapT)} t：建议结转盈余、盘点冗余碳信用（盈余估值约 <b className="num">{scenario.surplusWan.toFixed(1)} 万元</b>），并继续推进院内减排项目储备。
            </p>
          )}
          <ul style={{ margin: "0 0 8px", paddingLeft: 16, fontSize: 11, color: "var(--ink-3)", lineHeight: 1.7 }}>
            <li>证据：情景缺口/盈余 {fmt(Math.abs(scenario.gapT))} t（预测 {fmt(budget.projectedT)} t，预算 {fmt(annualCarbonBudgetT)} t）</li>
            <li>证据：情景碳价 {simPrice} 元/t，CCER 演示价 {strategy.ccerPrice} 元/t，抵销上限 {fmt(strategy.ccerCap)} t</li>
            <li>证据：院内项目储备年减排 {fmt(strategy.pipeReduction)} t（项目库立项数据）</li>
          </ul>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="pf-btn primary" style={smallBtn} disabled={!writable} onClick={adoptRecommendation}>
              <Check size={12} style={{ verticalAlign: -2, marginRight: 3 }} />采纳建议（生成任务）
            </button>
            <button className="pf-btn ghost" style={smallBtn}
              onClick={() => pushToast("已标记人工复核", "推荐策略已转入人工复核队列（模拟）", "info")}>
              标记人工复核
            </button>
          </div>
          <p style={noteStyle}>策略仅涉及资金与指标安排，不影响医疗安全/保障优先。</p>
        </Panel>
      </div>

      <div className="grid cols-3" style={{ marginTop: 10 }}>
        {strategy.cards.map((c) => {
          const Icon = c.icon;
          const isBest = scenario.gapPos > 0 && c.id === strategy.best.id;
          return (
            <Panel key={c.id} title={c.name}
              style={isBest ? { borderColor: "rgba(53,211,153,0.55)" } : undefined}
              extra={
                <>
                  {isBest && <Tag tone="ok">AI 推荐</Tag>}
                  <Tag tone="warn">演示策略非法律建议</Tag>
                </>
              }>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                <Icon size={16} style={{ color: "var(--cyan)", alignSelf: "center" }} />
                <span className="num" style={{ fontSize: 22, fontWeight: 700, color: "var(--ink-1)" }}>
                  {scenario.gapPos > 0 || c.id === "inner" ? c.costWan.toFixed(1) : "0.0"}
                </span>
                <small style={{ fontSize: 11, color: "var(--ink-3)" }}>万元/年 · 情景成本</small>
              </div>
              <ul style={{ margin: "0 0 8px", paddingLeft: 16, fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.7 }}>
                {c.lines.map((l) => <li key={l}>{l}</li>)}
              </ul>
              <p style={noteStyle}><ShieldAlert size={11} style={{ verticalAlign: -1.5, marginRight: 3 }} />适用性：{c.applicability}</p>
            </Panel>
          );
        })}
      </div>

      <div className="grid cols-3" style={{ marginTop: 10 }}>
        <Panel title="年度履约任务" style={{ gridColumn: "span 2" }} extra={
          <>
            {overdueCount > 0 && <Tag tone="danger">{overdueCount} 项超期</Tag>}
            <select className="pf-select" style={{ fontSize: 11, padding: "3px 6px" }} value={taskStatusFilter}
              onChange={(e) => setPageFilter(MODULE_ID, { taskStatus: e.target.value })}>
              {["全部", "进行中", "待开始", "已完成", "已逾期"].map((s) => <option key={s}>{s}</option>)}
            </select>
          </>
        }>
          {filteredTasks.length === 0 ? <EmptyState text="当前筛选下没有任务" /> : (
            <div style={{ overflowX: "auto" }}>
              <table className="pf-table">
                <thead>
                  <tr><th>任务 / 里程碑</th><th>优先级</th><th>责任人</th><th>截止日期</th><th>倒计时</th><th>完成度</th><th>状态</th><th>操作</th></tr>
                </thead>
                <tbody>
                  {filteredTasks.map((t) => (
                    <tr key={t.id}>
                      <td style={t.overdue ? { color: "var(--red)" } : undefined}>
                        <b style={{ fontWeight: 600, color: t.overdue ? "var(--red)" : "var(--ink-1)" }}>{t.title}</b>
                        <span style={{ marginLeft: 6, fontSize: 10, color: "var(--ink-3)" }}>{t.milestone} · {t.note}</span>
                      </td>
                      <td><Tag tone={t.priority === "高" ? "danger" : t.priority === "中" ? "warn" : "muted"}>{t.priority}</Tag></td>
                      <td>{t.owner}<span style={{ color: "var(--ink-3)", fontSize: 10 }}>（{t.dept}）</span></td>
                      <td className="num" style={t.overdue ? { color: "var(--red)" } : undefined}>{t.dueDate}</td>
                      <td className="num" style={{ color: t.overdue ? "var(--red)" : t.status === "已完成" ? "var(--ink-3)" : t.days <= 14 ? "var(--amber)" : "var(--ink-2)" }}>
                        {t.status === "已完成" ? "—" : t.overdue ? `超期 ${Math.abs(t.days)} 天` : `剩余 ${t.days} 天`}
                      </td>
                      <td><MiniBar pct={t.progress} danger={t.overdue} /></td>
                      <td><Tag tone={t.showStatus === "已逾期" ? "danger" : t.showStatus === "已完成" ? "ok" : t.showStatus === "进行中" ? "info" : "muted"}>{t.showStatus}</Tag></td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="pf-btn ghost" style={smallBtn} disabled={!writable || t.status === "已完成"}
                            onClick={() => {
                              setReassignTarget(t);
                              setReassignOwner(Math.max(0, taskOwnerOptions.findIndex((o) => o.owner === t.owner)));
                            }}>
                            <ArrowRightLeft size={11} style={{ verticalAlign: -1.5, marginRight: 2 }} />转派
                          </button>
                          <button className="pf-btn" style={smallBtn} disabled={!writable || t.status === "已完成"}
                            onClick={() => { completeTask(t.id); pushToast("任务已完成", `「${t.title}」完成度置为 100%`, "success"); }}>
                            <Check size={11} style={{ verticalAlign: -1.5, marginRight: 2 }} />完成
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!writable && <p style={noteStyle}>当前角色对本模块只读，转派/完成按钮不可用（可在顶部切换角色或开启全部权限）。</p>}
        </Panel>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Panel title="合规能力雷达（演示推导）" extra={<span>由本页任务/持仓/预算实时推导</span>}>
            <EChart height={196} option={radarOption} />
          </Panel>
          <Panel title="碳价趋势（演示行情）" extra={
            <span className="num">
              最新 {priceLatest} 元/t（环比 {pricePrev ? `${priceLatest >= pricePrev ? "+" : ""}${(((priceLatest - pricePrev) / pricePrev) * 100).toFixed(1)}%` : "—"}）
            </span>
          }>
            <EChart height={140} option={priceOption} />
            <p style={noteStyle}>确定性伪随机生成的演示行情，非真实市场数据；虚线为情景模拟器当前碳价。</p>
          </Panel>
        </div>
      </div>

      <div className="grid cols-3" style={{ marginTop: 10, marginBottom: 12 }}>
        <Panel title="碳资产交易记录" style={{ gridColumn: "span 2" }} extra={
          <>
            <select className="pf-select" style={{ fontSize: 11, padding: "3px 6px" }} value={txTypeFilter}
              onChange={(e) => setPageFilter(MODULE_ID, { txType: e.target.value })}>
              {["全部", "绿证", "CCER", "碳信用", "绿电", "内部碳配额"].map((s) => <option key={s}>{s}</option>)}
            </select>
            <button className="pf-btn ghost" style={smallBtn} onClick={exportTxCsv}>
              <Download size={11} style={{ verticalAlign: -1.5, marginRight: 2 }} />CSV
            </button>
            <button className="pf-btn primary" style={smallBtn} disabled={!writable}
              onClick={() => { setTxErr({}); setTxModalOpen(true); }}>
              <Plus size={11} style={{ verticalAlign: -1.5, marginRight: 2 }} />新增交易
            </button>
          </>
        }>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11.5, color: "var(--ink-2)", marginBottom: 8 }}>
            <span>绿证净持仓 <b className="num" style={{ color: "var(--ink-1)" }}>{fmt(holdings.gec)}</b> 张</span>
            <span>CCER <b className="num" style={{ color: "var(--ink-1)" }}>{fmt(holdings.ccer)}</b> t</span>
            <span>碳信用 <b className="num" style={{ color: "var(--ink-1)" }}>{fmt(holdings.credit)}</b> t</span>
            <span>账面净值 <b className="num" style={{ color: "var(--ink-1)" }}>¥{wan(holdings.netValue)}</b> 万（不含已撤销）</span>
          </div>
          {filteredTx.length === 0 ? <EmptyState text="当前筛选下没有交易记录" /> : (
            <div style={{ overflowX: "auto" }}>
              <table className="pf-table">
                <thead>
                  <tr><th>日期</th><th>类型</th><th>方向</th><th>数量</th><th>单价</th><th>金额</th><th>交易对手</th><th>合同号</th><th>经办</th><th>审核</th><th>操作</th></tr>
                </thead>
                <tbody>
                  {filteredTx.map((t) => (
                    <tr key={t.id} style={t.reviewStatus === "已撤销" ? { opacity: 0.5 } : undefined}>
                      <td className="num">{t.date}</td>
                      <td><Tag tone="info">{t.assetType}</Tag></td>
                      <td style={{ color: t.direction === "买入" ? "var(--green)" : "var(--amber)" }}>{t.direction}</td>
                      <td className="num">{fmt(t.quantity)}</td>
                      <td className="num">¥{t.unitPrice}</td>
                      <td className="num" style={{ color: "var(--ink-1)" }}>¥{fmt(t.amount)}</td>
                      <td>{t.counterparty}</td>
                      <td className="num">{t.contractNo}</td>
                      <td>{t.operator}</td>
                      <td><Tag tone={t.reviewStatus === "已通过" ? "ok" : t.reviewStatus === "待审核" ? "warn" : "muted"}>{t.reviewStatus}</Tag></td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          {t.reviewStatus === "待审核" && (
                            <button className="pf-btn" style={smallBtn} disabled={!writable}
                              onClick={() => { approveTransaction(t.id); pushToast("审核通过", `${t.contractNo} 已计入持仓与账面净值`, "success"); }}>
                              <Check size={11} style={{ verticalAlign: -1.5 }} />通过
                            </button>
                          )}
                          {t.reviewStatus !== "已撤销" && (
                            <button className="pf-btn danger" style={smallBtn} disabled={!writable}
                              onClick={() => {
                                if (window.confirm(`确定撤销交易 ${t.contractNo}？撤销后不计入持仓。`)) {
                                  voidTransaction(t.id);
                                  pushToast("交易已撤销", `${t.contractNo} 已移出持仓与账面净值`, "warning");
                                }
                              }}>
                              <Ban size={11} style={{ verticalAlign: -1.5 }} />撤销
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="碳金融工具与 MRV 溯源" extra={<Tag tone="muted">知识性说明（演示）</Tag>}>
          <div>
            {financeTools.map((tool) => (
              <div key={tool.id} style={{ borderBottom: "1px solid rgba(56,116,178,0.14)" }}>
                <button
                  onClick={() => setOpenTool(openTool === tool.id ? null : tool.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left",
                    background: "none", border: "none", cursor: "pointer", padding: "7px 0",
                    color: "var(--ink-1)", fontSize: 12, fontWeight: 600,
                  }}>
                  {openTool === tool.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  <Landmark size={12} style={{ color: "var(--cyan)" }} />
                  <span style={{ flex: 1 }}>{tool.name}</span>
                  <Tag tone="muted">{tool.tag}</Tag>
                </button>
                {openTool === tool.id && (
                  <p style={{ fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.7, margin: "0 0 8px 19px" }}>
                    <b style={{ color: "var(--ink-1)" }}>{tool.brief}。</b>{tool.detail}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <Link to="/app/carbon/compliance" className="pf-btn ghost" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, textDecoration: "none" }}>
              <ExternalLink size={13} />MRV 数据溯源 · 前往合规凭证看板
            </Link>
            <p style={noteStyle}>交易凭证、能源审计报告（AN-010）等材料的版本与到期预警在合规凭证看板统一管理。</p>
          </div>
        </Panel>
      </div>

      {reassignTarget && (
        <Modal title={`转派任务：${reassignTarget.title}`} onClose={() => setReassignTarget(null)} width={420}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ fontSize: 12, color: "var(--ink-2)" }}>
              新责任人
              <select className="pf-select" style={{ width: "100%", marginTop: 4 }} value={reassignOwner}
                onChange={(e) => setReassignOwner(Number(e.target.value))}>
                {taskOwnerOptions.map((o, i) => <option key={o.owner} value={i}>{o.owner}（{o.dept}）</option>)}
              </select>
            </label>
            <p style={noteStyle}>当前责任人：{reassignTarget.owner}（{reassignTarget.dept}）· 截止 {reassignTarget.dueDate}</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="pf-btn ghost" onClick={() => setReassignTarget(null)}>取消</button>
              <button className="pf-btn primary" onClick={doReassign}>确认转派</button>
            </div>
          </div>
        </Modal>
      )}

      {txModalOpen && (
        <Modal title="新增碳资产交易（演示）" onClose={() => setTxModalOpen(false)} width={520}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ fontSize: 12, color: "var(--ink-2)" }}>资产类型
              <select className="pf-select" style={{ width: "100%", marginTop: 4 }} value={txForm.assetType}
                onChange={(e) => setTxForm({ ...txForm, assetType: e.target.value as AssetTransaction["assetType"] })}>
                {["绿证", "CCER", "碳信用", "绿电", "内部碳配额"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-2)" }}>方向
              <select className="pf-select" style={{ width: "100%", marginTop: 4 }} value={txForm.direction}
                onChange={(e) => setTxForm({ ...txForm, direction: e.target.value as AssetTransaction["direction"] })}>
                <option>买入</option><option>卖出</option>
              </select>
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-2)" }}>数量
              <input className="pf-input" type="number" min={1} style={{ width: "100%", marginTop: 4 }} value={txForm.quantity}
                onChange={(e) => setTxForm({ ...txForm, quantity: Number(e.target.value) })} />
              {txErr.quantity && <span style={{ color: "var(--red)", fontSize: 10 }}>{txErr.quantity}</span>}
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-2)" }}>单价（元）
              <input className="pf-input" type="number" min={0.01} step={0.01} style={{ width: "100%", marginTop: 4 }} value={txForm.unitPrice}
                onChange={(e) => setTxForm({ ...txForm, unitPrice: Number(e.target.value) })} />
              {txErr.unitPrice && <span style={{ color: "var(--red)", fontSize: 10 }}>{txErr.unitPrice}</span>}
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-2)" }}>交易日期
              <input className="pf-input" type="date" style={{ width: "100%", marginTop: 4 }} value={txForm.date}
                onChange={(e) => setTxForm({ ...txForm, date: e.target.value })} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-2)" }}>金额（自动）
              <input className="pf-input" readOnly style={{ width: "100%", marginTop: 4 }} value={`¥${fmt(txForm.quantity * txForm.unitPrice)}`} />
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-2)" }}>交易对手
              <input className="pf-input" style={{ width: "100%", marginTop: 4 }} value={txForm.counterparty} placeholder="如：华北绿色电力交易中心"
                onChange={(e) => setTxForm({ ...txForm, counterparty: e.target.value })} />
              {txErr.counterparty && <span style={{ color: "var(--red)", fontSize: 10 }}>{txErr.counterparty}</span>}
            </label>
            <label style={{ fontSize: 12, color: "var(--ink-2)" }}>合同编号
              <input className="pf-input" style={{ width: "100%", marginTop: 4 }} value={txForm.contractNo} placeholder="如：GEC-2026-0804"
                onChange={(e) => setTxForm({ ...txForm, contractNo: e.target.value })} />
              {txErr.contractNo && <span style={{ color: "var(--red)", fontSize: 10 }}>{txErr.contractNo}</span>}
            </label>
          </div>
          <p style={noteStyle}>提交后进入「待审核」状态，审核通过后计入净持仓与账面净值；种子数据共 {initialTransactions.length} 条。</p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
            <button className="pf-btn ghost" onClick={() => setTxModalOpen(false)}>取消</button>
            <button className="pf-btn primary" onClick={saveTx}>保存交易</button>
          </div>
        </Modal>
      )}
    </>
  );
}
