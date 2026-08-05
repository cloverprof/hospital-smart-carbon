// 6.1.2 能源诊断中心：六维能效评分、三线对标与节能潜力、能源桑基、AI 根因分析、
// 节能改造建议（可转项目）、季节/日型对比。数据全部来自 services/timeseries 与 data/*，
// 评分权重与对标阈值为演示配置（页面内可调、可见），标注"待标准确认"。
import dayjs from "dayjs";
import { Check, FileDown, FolderPlus, ListTree, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { EChart } from "../../components/EChart";
import { EmptyState, Kpi, Modal, PageHead, Panel, Tag } from "../../components/kit";
import { anomalyChains } from "../../data/anomalies";
import { buildingById, mainBuildings } from "../../data/buildings";
import { annualCarbonBudgetT, demoAsOfDate, energyKindMeta } from "../../data/config";
import { devices } from "../../data/devices";
import { activeFactors } from "../../data/factors";
import { canWrite } from "../../data/navigation";
import { bedOccupancy, dailySeries, outpatientVisits, sumUsage, surgeryCount, toTce } from "../../services/timeseries";
import { useDemoStore } from "../../stores/demo";
import type { AnomalyChain, BuildingId, EnergyKind, Project, SystemKind } from "../../types/core";

const PAGE_ID = "energy-diagnosis";
const KINDS: EnergyKind[] = ["electricity", "water", "gas", "heat", "medgas"];
/** 统计窗口：近 12 个完整月 */
const WIN_FROM = dayjs(demoAsOfDate).startOf("month").subtract(12, "month").format("YYYY-MM-DD");
const WIN_TO = dayjs(demoAsOfDate).startOf("month").subtract(1, "day").format("YYYY-MM-DD");
/** 桑基图窗口：近 30 日 */
const D30_FROM = dayjs(demoAsOfDate).subtract(29, "day").format("YYYY-MM-DD");
const EMPTY_FILTERS: Record<string, string | number | boolean> = {};

/** 六维评分定义（先进/约束为演示阈值）。得分映射：≤先进=100；先进→约束线性降到 60；约束→1.4×约束降到 0 */
const DIMS = [
  { key: "area", name: "单位面积能耗", unit: "kgce/m²·a", adv: 40, limit: 56, defW: 25, note: "近12个月综合能耗（折标煤）/ 总建筑面积 284,300 m²" },
  { key: "bed", name: "床日能耗", unit: "kgce/床日", adv: 27, limit: 40, defW: 20, note: "综合能耗 / 实际占用床日（编制床位 1,306 × 逐日使用率）" },
  { key: "visit", name: "门诊人次能耗", unit: "kgce/人次", adv: 4.4, limit: 6.6, defW: 15, note: "综合能耗 / 年门诊人次" },
  { key: "rev", name: "单位医疗收入能耗", unit: "kgce/万元", adv: 50, limit: 78, defW: 10, note: "收入按演示均次费用折算：门诊 480 元、床日 1,650 元、手术 9,800 元" },
  { key: "dev", name: "设备效率", unit: "% 平均衰减", adv: 2.5, limit: 7.5, defW: 15, note: "全院 29 台重点设备效率衰减均值（越低越好）" },
  { key: "biz", name: "医疗业务能效", unit: "kgce/业务当量", adv: 3.5, limit: 5.4, defW: 15, note: "业务当量 = 门诊 + 5×手术 + 1.5×床日（演示权重）" },
] as const;

function dimScore(value: number, adv: number, limit: number): number {
  if (value <= adv) return 100;
  if (value <= limit) return 100 - ((value - adv) / (limit - adv)) * 40;
  const hard = limit * 1.4;
  if (value >= hard) return 0;
  return 60 - ((value - limit) / (hard - limit)) * 60;
}

const GRADE_OPTS = [
  { id: "tier3", name: "三级综合", mul: 1 },
  { id: "tier2", name: "二级综合", mul: 0.88 },
];
const CLIMATE_OPTS = [
  { id: "cold", name: "寒冷地区", mul: 1 },
  { id: "severeCold", name: "严寒地区", mul: 1.08 },
  { id: "hswc", name: "夏热冬冷", mul: 0.95 },
  { id: "hsww", name: "夏热冬暖", mul: 0.9 },
];

/** 六类科室对标基准（kgce/m²·a，基准值 × 医院等级系数 × 气候区系数；演示阈值，待标准确认） */
const CATEGORY_BENCH: { id: string; name: string; buildings: BuildingId[]; adv: number; avg: number; limit: number }[] = [
  { id: "outp", name: "门诊", buildings: ["outpatient"], adv: 28, avg: 33, limit: 40 },
  { id: "inp", name: "急诊住院", buildings: ["inpatientA", "inpatientB", "emergency"], adv: 36, avg: 44, limit: 52 },
  { id: "surg", name: "手术医技", buildings: ["surgical"], adv: 40, avg: 46, limit: 56 },
  { id: "tech", name: "检验影像", buildings: ["lab", "imaging"], adv: 36, avg: 44, limit: 54 },
  { id: "logi", name: "后勤保障", buildings: ["cssd", "power"], adv: 95, avg: 130, limit: 185 },
  { id: "admin", name: "行政科研", buildings: ["admin"], adv: 24, avg: 30, limit: 38 },
];

const STATUS_META = {
  over: { text: "超约束", tone: "danger" as const, color: "#f4525f" },
  aboveAvg: { text: "高于平均", tone: "warn" as const, color: "#f5a524" },
  belowAvg: { text: "优于平均", tone: "info" as const, color: "#29d3e8" },
  adv: { text: "达先进", tone: "ok" as const, color: "#35d399" },
};
type BenchStatus = keyof typeof STATUS_META;

interface Suggestion {
  key: string; title: string; buildingIds: BuildingId[]; system: SystemKind;
  priority: "high" | "mid" | "low"; difficulty: "低" | "中" | "高";
  investWan: number; savingWan: number; savingMwh: number; carbonT: number; payback: number;
  owner: string; existingProjectId?: string; anomalyId?: string;
}
const SUGGESTIONS: Suggestion[] = [
  { key: "or-vav", title: "手术部净化空调非术时段变风量（setback）改造", buildingIds: ["surgical"], system: "purification", priority: "high", difficulty: "中", investWan: 68, savingWan: 13.1, savingMwh: 182, carbonT: 101, payback: 5.2, owner: "王工（暖通组）", existingProjectId: "PRJ-2026-09", anomalyId: "AN-001" },
  { key: "chiller-opt", title: "冷站低温差综合征治理与水泵变频恢复", buildingIds: ["power"], system: "chiller", priority: "high", difficulty: "低", investWan: 9, savingWan: 9.1, savingMwh: 126, carbonT: 70, payback: 1, owner: "刘工（冷站班）", anomalyId: "AN-002" },
  { key: "img-sched", title: "大型影像设备预约制运行与分级待机", buildingIds: ["imaging"], system: "medical", priority: "high", difficulty: "中", investWan: 12, savingWan: 3, savingMwh: 41, carbonT: 23, payback: 4, owner: "周工（医工科）", existingProjectId: "PRJ-2026-11", anomalyId: "AN-006" },
  { key: "medgas-leak", title: "医用气体管网泄漏排查与压力分区优化", buildingIds: ["surgical", "inpatientA", "inpatientB"], system: "medgas", priority: "high", difficulty: "中", investWan: 18, savingWan: 6.2, savingMwh: 0, carbonT: 11, payback: 2.9, owner: "孙工（医气组）", existingProjectId: "PRJ-2026-12" },
  { key: "cssd-heat", title: "消毒供应蒸汽冷凝水与余热回收", buildingIds: ["cssd"], system: "boiler", priority: "mid", difficulty: "中", investWan: 36, savingWan: 8.9, savingMwh: 0, carbonT: 71, payback: 4, owner: "陈工（锅炉班）", anomalyId: "AN-007" },
  { key: "or-led", title: "手术室 LED 无影灯与照明分区改造", buildingIds: ["surgical"], system: "lighting", priority: "mid", difficulty: "低", investWan: 24, savingWan: 6.8, savingMwh: 94, carbonT: 52, payback: 3.5, owner: "钱工（电气组）" },
  { key: "ward-light", title: "病区走廊照明感应分区调光", buildingIds: ["inpatientA", "inpatientB"], system: "lighting", priority: "low", difficulty: "低", investWan: 15, savingWan: 4.2, savingMwh: 58, carbonT: 32, payback: 3.6, owner: "钱工（电气组）" },
];
const PRIORITY_META = { high: { text: "高", tone: "danger" as const }, mid: { text: "中", tone: "warn" as const }, low: { text: "低", tone: "muted" as const } };

const GRADE_LEVEL = (total: number, cuts: { A: number; B: number; C: number }) =>
  total >= cuts.A
    ? { text: "优秀", tag: "ok" as const, kpi: "green" as const }
    : total >= cuts.B
      ? { text: "良好", tag: "info" as const, kpi: "cyan" as const }
      : total >= cuts.C
        ? { text: "合格", tag: "warn" as const, kpi: "amber" as const }
        : { text: "待改进", tag: "danger" as const, kpi: "red" as const };

const f1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("zh-CN", { minimumFractionDigits: 1 });
const f0 = (n: number) => Math.round(n).toLocaleString("zh-CN");

function nextProjectId(projects: Project[]): string {
  let max = 0;
  for (const p of projects) {
    const m = /^PRJ-\d{4}-(\d+)$/.exec(p.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `PRJ-2026-${String(max + 1).padStart(2, "0")}`;
}

const SEASON_LABEL = { cool: "制冷季", heat: "供暖季", trans: "过渡季" } as const;
const GROUP_ORDER = ["cool-wk", "cool-end", "heat-wk", "heat-end", "trans-wk", "trans-end"];
const METRIC_OPTS = [
  { id: "comp", name: "综合能耗", unit: "tce/日" },
  { id: "electricity", name: "电力", unit: "MWh/日" },
  { id: "gas", name: "天然气", unit: "m³/日" },
  { id: "heat", name: "热力", unit: "GJ/日" },
];

export function EnergyDiagnosisPage() {
  const { role, allPermissions, projects, addProject, pushToast, pageFilters, setPageFilter } = useDemoStore();
  const pf = pageFilters[PAGE_ID] ?? EMPTY_FILTERS;
  const writable = canWrite(PAGE_ID, role, allPermissions);
  const setPf = (patch: Record<string, string | number | boolean>) => setPageFilter(PAGE_ID, patch);
  const strPf = (k: string, d: string) => (typeof pf[k] === "string" ? (pf[k] as string) : d);

  const gradeId = strPf("grade", "tier3");
  const climateId = strPf("climate", "cold");
  const aiBuilding = strPf("aiBuilding", "all");
  const aiLevel = strPf("aiLevel", "all");
  const metric = strPf("metric", "comp");
  const [cfgOpen, setCfgOpen] = useState(false);
  const [evidenceId, setEvidenceId] = useState<string | null>(null);

  // ── 基础聚合（与筛选无关，确定性数据只算一次）─────────────────────────────
  const base = useMemo(() => {
    const perBuilding = mainBuildings.map((b) => {
      const native = {} as Record<EnergyKind, number>;
      const tce = {} as Record<EnergyKind, number>;
      let totalTce = 0;
      for (const k of KINDS) {
        const n = sumUsage(k, WIN_FROM, WIN_TO, b.id);
        native[k] = n;
        tce[k] = toTce(k, n);
        totalTce += tce[k];
      }
      return { b, native, tce, totalTce, intensity: (totalTce * 1000) / b.areaM2 };
    });
    const totalTce = perBuilding.reduce((s, p) => s + p.totalTce, 0);
    const totalArea = mainBuildings.reduce((s, b) => s + b.areaM2, 0);
    const beds = mainBuildings.reduce((s, b) => s + b.beds, 0);

    const kindDaily = KINDS.map((k) => [k, dailySeries(k, WIN_FROM, WIN_TO)] as const);
    const days = kindDaily[0][1].map((p) => p.t);
    let visits = 0, surgeries = 0, bedDays = 0;
    const groups = new Map<string, { n: number; tce: number; elec: number; gas: number; heat: number; visits: number; surg: number; occ: number }>();
    days.forEach((d, i) => {
      const m = Number(d.slice(5, 7));
      const season = m >= 6 && m <= 9 ? "cool" : m === 4 || m === 5 || m === 10 ? "trans" : "heat";
      const dow = dayjs(d).day();
      const key = `${season}-${dow === 0 || dow === 6 ? "end" : "wk"}`;
      const g = groups.get(key) ?? { n: 0, tce: 0, elec: 0, gas: 0, heat: 0, visits: 0, surg: 0, occ: 0 };
      let dayTce = 0;
      for (const [k, s] of kindDaily) dayTce += toTce(k, s[i].v);
      const ov = outpatientVisits(d), sg = surgeryCount(d), bo = bedOccupancy(d);
      g.n += 1; g.tce += dayTce;
      g.elec += kindDaily[0][1][i].v; g.gas += kindDaily[2][1][i].v; g.heat += kindDaily[3][1][i].v;
      g.visits += ov; g.surg += sg; g.occ += bo;
      groups.set(key, g);
      visits += ov; surgeries += sg; bedDays += (beds * bo) / 100;
    });

    const revenueWan = visits * 0.048 + bedDays * 0.165 + surgeries * 0.98;
    const equiv = visits + 5 * surgeries + 1.5 * bedDays;
    const decayAvg = devices.reduce((s, d) => s + d.efficiencyDecayPct, 0) / devices.length;
    const s30 = Object.fromEntries(KINDS.map((k) => [k, toTce(k, sumUsage(k, D30_FROM, demoAsOfDate))])) as Record<EnergyKind, number>;
    return { perBuilding, totalTce, totalArea, hospIntensity: (totalTce * 1000) / totalArea, visits, surgeries, bedDays, revenueWan, equiv, decayAvg, groups, s30 };
  }, []);

  // ── 六维评分（权重/等级阈值可配置，存 pageFilters）────────────────────────
  const scoring = useMemo(() => {
    const numPf = (k: string, d: number) => (typeof pf[k] === "number" ? (pf[k] as number) : d);
    const values: Record<string, number> = {
      area: base.hospIntensity,
      bed: (base.totalTce * 1000) / base.bedDays,
      visit: (base.totalTce * 1000) / base.visits,
      rev: (base.totalTce * 1000) / base.revenueWan,
      dev: base.decayAvg,
      biz: (base.totalTce * 1000) / base.equiv,
    };
    const rows = DIMS.map((d) => {
      const value = values[d.key];
      return { ...d, value, weight: numPf(`w_${d.key}`, d.defW), score: dimScore(value, d.adv, d.limit) };
    });
    const wSum = rows.reduce((s, r) => s + r.weight, 0) || 1;
    const total = rows.reduce((s, r) => s + r.score * r.weight, 0) / wSum;
    const cuts = { A: numPf("gA", 85), B: numPf("gB", 70), C: numPf("gC", 55) };
    return { rows, wSum, total, cuts, grade: GRADE_LEVEL(total, cuts) };
  }, [base, pf]);

  // ── 三线对标与节能潜力 ─────────────────────────────────────────────────────
  const bench = useMemo(() => {
    const mul = (GRADE_OPTS.find((g) => g.id === gradeId)?.mul ?? 1) * (CLIMATE_OPTS.find((c) => c.id === climateId)?.mul ?? 1);
    const rows = base.perBuilding.map((pb) => {
      const cat = CATEGORY_BENCH.find((c) => c.buildings.includes(pb.b.id)) ?? CATEGORY_BENCH[0];
      const adv = cat.adv * mul, avg = cat.avg * mul, limit = cat.limit * mul;
      const status: BenchStatus = pb.intensity > limit ? "over" : pb.intensity > avg ? "aboveAvg" : pb.intensity > adv ? "belowAvg" : "adv";
      const overAvgTce = (Math.max(0, pb.intensity - avg) * pb.b.areaM2) / 1000;
      return { ...pb, cat, adv, avg, limit, status, overAvgTce };
    });
    const overRows = rows.filter((r) => r.status === "over");
    const kindPot = Object.fromEntries(KINDS.map((k) => [k, { tce: 0, native: 0, moneyWan: 0, carbonT: 0 }])) as Record<EnergyKind, { tce: number; native: number; moneyWan: number; carbonT: number }>;
    for (const r of rows) {
      if (r.overAvgTce <= 0) continue;
      for (const k of KINDS) {
        const tceK = r.overAvgTce * (r.tce[k] / r.totalTce);
        const native = tceK / energyKindMeta[k].tcePerUnit;
        kindPot[k].tce += tceK;
        kindPot[k].native += native;
        kindPot[k].moneyWan += (native * energyKindMeta[k].price) / 10000;
        kindPot[k].carbonT += (native * activeFactors[k]) / 1000;
      }
    }
    const potTce = KINDS.reduce((s, k) => s + kindPot[k].tce, 0);
    const potMoney = KINDS.reduce((s, k) => s + kindPot[k].moneyWan, 0);
    const potCarbon = KINDS.reduce((s, k) => s + kindPot[k].carbonT, 0);
    const catRows = CATEGORY_BENCH.map((c) => ({ ...c, adv: c.adv * mul, avg: c.avg * mul, limit: c.limit * mul }));
    return { mul, rows, overRows, kindPot, potTce, potMoney, potCarbon, catRows };
  }, [base, gradeId, climateId]);

  // ── 能源桑基（近 30 日，折标煤 tce；分配比例为演示估计）────────────────────
  const sankey = useMemo(() => {
    const E = base.s30.electricity, G = base.s30.gas, H = base.s30.heat, M = base.s30.medgas;
    const links: { source: string; target: string; value: number }[] = [];
    let loss = 0;
    const add = (source: string, target: string, value: number) => {
      if (value <= 0.05) return;
      if (target === "损耗") loss += value;
      links.push({ source, target, value: Math.round(value * 10) / 10 });
    };
    // 电力：34% 冷机、5% 空压机、4% 制氧机、57% 直供末端
    add("电力", "冷机", E * 0.34); add("电力", "空压机", E * 0.05); add("电力", "制氧机", E * 0.04);
    const eDirect = E * 0.57;
    add("电力", "楼宇常规用能", eDirect * 0.34); add("电力", "手术净化", eDirect * 0.18);
    add("电力", "大型设备", eDirect * 0.22); add("电力", "照明", eDirect * 0.18); add("电力", "电梯", eDirect * 0.08);
    add("冷机", "楼宇常规用能", E * 0.34 * 0.92); add("冷机", "损耗", E * 0.34 * 0.08);
    add("空压机", "手术净化", E * 0.05 * 0.55); add("空压机", "消毒供应", E * 0.05 * 0.3); add("空压机", "损耗", E * 0.05 * 0.15);
    add("制氧机", "手术净化", E * 0.04 * 0.5); add("制氧机", "楼宇常规用能", E * 0.04 * 0.4); add("制氧机", "损耗", E * 0.04 * 0.1);
    // 天然气：90% 入锅炉，10% 食堂等直用
    add("天然气", "锅炉", G * 0.9); add("天然气", "楼宇常规用能", G * 0.1);
    add("锅炉", "消毒供应", G * 0.9 * 0.4); add("锅炉", "楼宇常规用能", G * 0.9 * 0.48); add("锅炉", "损耗", G * 0.9 * 0.12);
    // 外购热力：换热直供
    add("热力", "楼宇常规用能", H * 0.78); add("热力", "消毒供应", H * 0.16); add("热力", "损耗", H * 0.06);
    // 医用气体：管网直供（含泄漏损耗）
    add("医用气体", "手术净化", M * 0.55); add("医用气体", "楼宇常规用能", M * 0.42); add("医用气体", "损耗", M * 0.03);
    const input = E + G + H + M;
    const rIn = Math.round(input * 10) / 10;
    const rLoss = Math.round(loss * 10) / 10;
    const nodes = [
      { name: "电力", color: "#29d3e8" }, { name: "天然气", color: "#f5a524" }, { name: "热力", color: "#8b8df0" }, { name: "医用气体", color: "#35d399" },
      { name: "冷机", color: "#4da3ff" }, { name: "锅炉", color: "#e8b6ff" }, { name: "空压机", color: "#7ce7c4" }, { name: "制氧机", color: "#35d399" },
      { name: "楼宇常规用能", color: "#29d3e8" }, { name: "手术净化", color: "#e8b6ff" }, { name: "消毒供应", color: "#f5a524" },
      { name: "大型设备", color: "#4da3ff" }, { name: "照明", color: "#7ce7c4" }, { name: "电梯", color: "#8b8df0" }, { name: "损耗", color: "#5f7799" },
    ].map((n) => ({ name: n.name, itemStyle: { color: n.color } }));
    return { nodes, links, rIn, rLoss, rEnd: Math.round((rIn - rLoss) * 10) / 10, effPct: ((1 - loss / input) * 100).toFixed(1) };
  }, [base]);

  const sankeyOption = useMemo(
    () => ({
      tooltip: {
        trigger: "item",
        formatter: (p: { dataType?: string; name?: string; value?: number; data?: { source?: string; target?: string } }) =>
          p.dataType === "edge" ? `${p.data?.source} → ${p.data?.target}：${p.value} tce` : `${p.name}：${p.value} tce`,
      },
      legend: false,
      series: [{
        type: "sankey", nodeAlign: "justify", nodeWidth: 12, nodeGap: 10,
        left: 6, right: 90, top: 8, bottom: 8,
        data: sankey.nodes, links: sankey.links,
        label: { color: "#9db4d6", fontSize: 10 },
        lineStyle: { color: "gradient", opacity: 0.32, curveness: 0.5 },
        emphasis: { focus: "adjacency" },
      }],
    }),
    [sankey],
  );

  const benchOption = useMemo(() => {
    const names = bench.rows.map((r) => r.b.shortName);
    return {
      tooltip: { valueFormatter: (v: unknown) => `${v} kgce/m²·a` },
      legend: {},
      grid: { left: 46 },
      xAxis: { type: "category", data: names },
      yAxis: { type: "value", name: "kgce/m²·a", nameTextStyle: { color: "#5f7799", fontSize: 10 } },
      series: [
        { name: "实际强度", type: "bar", barWidth: 16, data: bench.rows.map((r) => ({ value: Math.round(r.intensity * 10) / 10, itemStyle: { color: STATUS_META[r.status].color } })) },
        { name: "约束值", type: "line", symbol: "rect", symbolSize: 5, lineStyle: { type: "dashed", width: 1.5, color: "#f4525f" }, itemStyle: { color: "#f4525f" }, data: bench.rows.map((r) => Math.round(r.limit * 10) / 10) },
        { name: "平均值", type: "line", symbol: "rect", symbolSize: 5, lineStyle: { type: "dashed", width: 1.5, color: "#f5a524" }, itemStyle: { color: "#f5a524" }, data: bench.rows.map((r) => Math.round(r.avg * 10) / 10) },
        { name: "先进值", type: "line", symbol: "rect", symbolSize: 5, lineStyle: { type: "dashed", width: 1.5, color: "#35d399" }, itemStyle: { color: "#35d399" }, data: bench.rows.map((r) => Math.round(r.adv * 10) / 10) },
      ],
    };
  }, [bench]);

  // ── 季节 × 日型对比 ────────────────────────────────────────────────────────
  const seasonRows = useMemo(
    () =>
      GROUP_ORDER.map((key) => {
        const g = base.groups.get(key);
        const [season, dt] = key.split("-");
        const label = `${SEASON_LABEL[season as keyof typeof SEASON_LABEL]}·${dt === "wk" ? "工作日" : "周末"}`;
        if (!g) return { key, label, n: 0, comp: 0, elec: 0, gas: 0, heat: 0, visits: 0, surg: 0, occ: 0, perVisit: 0 };
        return {
          key, label, n: g.n,
          comp: g.tce / g.n, elec: g.elec / g.n / 1000, gas: g.gas / g.n, heat: g.heat / g.n,
          visits: g.visits / g.n, surg: g.surg / g.n, occ: g.occ / g.n,
          perVisit: (g.tce * 1000) / g.visits,
        };
      }),
    [base],
  );

  const seasonOption = useMemo(() => {
    const m = METRIC_OPTS.find((x) => x.id === metric) ?? METRIC_OPTS[0];
    const barVals = seasonRows.map((r) => Math.round((m.id === "comp" ? r.comp : m.id === "electricity" ? r.elec : m.id === "gas" ? r.gas : r.heat) * 10) / 10);
    return {
      legend: {},
      tooltip: {
        formatter: (ps: { axisValue?: string; marker?: string; seriesName?: string; data?: number }[]) => {
          const row = seasonRows.find((r) => r.label === ps[0]?.axisValue);
          const lines = ps.map((p) => `${p.marker}${p.seriesName}：${p.data?.toLocaleString("zh-CN")} ${p.seriesName === "门诊人次" ? "人次/日" : m.unit}`);
          if (row) lines.push(`手术 ${f1(row.surg)} 台/日 · 床位率 ${f1(row.occ)}% · 样本 ${row.n} 天`);
          return `${ps[0]?.axisValue}<br/>${lines.join("<br/>")}`;
        },
      },
      grid: { left: 50, right: 52 },
      xAxis: { type: "category", data: seasonRows.map((r) => r.label), axisLabel: { color: "#5f7799", fontSize: 10, interval: 0 } },
      yAxis: [
        { type: "value", name: m.unit, nameTextStyle: { color: "#5f7799", fontSize: 10 } },
        { type: "value", name: "人次/日", nameTextStyle: { color: "#5f7799", fontSize: 10 }, splitLine: { show: false } },
      ],
      series: [
        { name: `${m.name}（${m.unit}）`, type: "bar", barWidth: 22, data: barVals, itemStyle: { color: "#29d3e8" } },
        { name: "门诊人次", type: "line", yAxisIndex: 1, symbolSize: 5, data: seasonRows.map((r) => Math.round(r.visits)), itemStyle: { color: "#f5a524" }, lineStyle: { color: "#f5a524" } },
      ],
    };
  }, [seasonRows, metric]);

  const gaugeOption = useMemo(() => {
    const { cuts } = scoring;
    return {
      legend: false,
      tooltip: { trigger: "item", formatter: () => `综合能效评分：${scoring.total.toFixed(1)} / 100` },
      series: [{
        type: "gauge", startAngle: 210, endAngle: -30, min: 0, max: 100, radius: "100%", center: ["50%", "60%"],
        axisLine: { lineStyle: { width: 10, color: [[cuts.C / 100, "#f4525f"], [cuts.B / 100, "#f5a524"], [cuts.A / 100, "#29d3e8"], [1, "#35d399"]] } },
        pointer: { length: "58%", width: 4, itemStyle: { color: "#e6f1ff" } },
        axisTick: { show: false }, splitLine: { show: false },
        axisLabel: { color: "#5f7799", fontSize: 9, distance: 14 },
        detail: { formatter: (v: number) => v.toFixed(1), color: "#e6f1ff", fontSize: 24, fontWeight: 700, offsetCenter: [0, "28%"] },
        title: { color: "#9db4d6", fontSize: 11, offsetCenter: [0, "62%"] },
        data: [{ value: Math.round(scoring.total * 10) / 10, name: "综合能效评分" }],
      }],
    };
  }, [scoring]);

  // ── AI 根因分析 ────────────────────────────────────────────────────────────
  const aiRows = useMemo(
    () => anomalyChains.filter((a) => (aiBuilding === "all" || a.buildingId === aiBuilding) && (aiLevel === "all" || a.level === aiLevel)),
    [aiBuilding, aiLevel],
  );
  const acked = (id: string) => pf[`ack_${id}`] === true;
  const confirmAnomaly = (a: AnomalyChain) => {
    setPf({ [`ack_${a.id}`]: true });
    pushToast("人工确认已记录", `${a.id} 的模拟诊断结论已由当前用户确认（演示，不下发控制）`, "success");
  };

  // ── 转项目 ─────────────────────────────────────────────────────────────────
  const linkedProjectId = (s: Suggestion) =>
    (s.existingProjectId && projects.some((p) => p.id === s.existingProjectId) ? s.existingProjectId : undefined) ?? projects.find((p) => p.name === s.title)?.id;
  const convertToProject = (s: Suggestion) => {
    const id = nextProjectId(projects);
    addProject({
      id, name: s.title, source: "diagnosis", buildingIds: s.buildingIds, system: s.system, stage: "initiation",
      owner: s.owner, investmentWanYuan: s.investWan, annualSavingMwh: s.savingMwh, annualSavingWanYuan: s.savingWan,
      annualCarbonReductionT: s.carbonT, paybackYears: s.payback, createdAt: demoAsOfDate, anomalyId: s.anomalyId,
    });
    pushToast("已转入项目库", `新项目 ${id}（立项阶段）已创建，可在「项目库管理」查看`, "success");
  };

  // ── 导出（与当前筛选一致）──────────────────────────────────────────────────
  const onExport = async () => {
    const { downloadWorkbook } = await import("../../utils/downloads");
    const gradeName = GRADE_OPTS.find((g) => g.id === gradeId)?.name ?? gradeId;
    const climateName = CLIMATE_OPTS.find((c) => c.id === climateId)?.name ?? climateId;
    downloadWorkbook(
      {
        能效评分: [
          ...scoring.rows.map((r) => ({ 维度: r.name, 实际值: Math.round(r.value * 100) / 100, 单位: r.unit, 先进值: r.adv, 约束值: r.limit, 权重: r.weight, 得分: Math.round(r.score * 10) / 10, 口径: r.note })),
          { 维度: "综合（加权）", 实际值: "", 单位: "", 先进值: "", 约束值: "", 权重: scoring.wSum, 得分: Math.round(scoring.total * 10) / 10, 口径: `等级 ${scoring.grade.text}（演示阈值）` },
        ],
        三线对标: bench.rows.map((r) => ({ 楼宇: r.b.name, 类别: r.cat.name, "强度kgce/m2a": Math.round(r.intensity * 10) / 10, 先进值: Math.round(r.adv * 10) / 10, 平均值: Math.round(r.avg * 10) / 10, 约束值: Math.round(r.limit * 10) / 10, 状态: STATUS_META[r.status].text, 超平均潜力tce: Math.round(r.overAvgTce), 口径: `${gradeName}/${climateName}（演示阈值，待标准确认）` })),
        节能潜力: KINDS.map((k) => ({ 品种: energyKindMeta[k].name, [`潜力(原单位)`]: Math.round(bench.kindPot[k].native), 单位: energyKindMeta[k].unit, 折标煤tce: Math.round(bench.kindPot[k].tce * 10) / 10, 年节省万元: Math.round(bench.kindPot[k].moneyWan * 10) / 10, 年减碳t: Math.round(bench.kindPot[k].carbonT * 10) / 10 })),
        AI根因诊断: aiRows.map((a) => ({ 编号: a.id, 标题: a.title, 楼宇: buildingById[a.buildingId].name, 级别: a.level, "置信度%": a.aiConfidencePct, 根因: a.rootCause, 建议: a.suggestion, 年节省万元: a.estSavingWanYuanPerYear, 年减碳t: a.estReductionTPerYear, 状态: a.status, 人工确认: acked(a.id) ? "已确认" : "未确认", 备注: "模拟诊断" })),
        改造建议: SUGGESTIONS.map((s) => ({ 方案: s.title, 楼宇: s.buildingIds.map((b) => buildingById[b].shortName).join("/"), 优先级: PRIORITY_META[s.priority].text, 难度: s.difficulty, 年节省万元: s.savingWan, 年减碳t: s.carbonT, 投资万元: s.investWan, 回收期年: s.payback, 状态: linkedProjectId(s) ?? "待立项" })),
        季节日型对比: seasonRows.map((r) => ({ 分组: r.label, 天数: r.n, "综合tce/日": Math.round(r.comp * 100) / 100, "电MWh/日": Math.round(r.elec * 10) / 10, "门诊人次/日": Math.round(r.visits), "手术台/日": Math.round(r.surg * 10) / 10, "床位率%": Math.round(r.occ * 10) / 10, "kgce/门诊人次": Math.round(r.perVisit * 100) / 100 })),
      },
      `能源诊断报告_${demoAsOfDate}.xlsx`,
    );
    pushToast("导出完成", "诊断报告（Excel 工作簿，6 个工作表）已下载，内容与当前筛选一致", "success");
  };

  const evidenceAnomaly = evidenceId ? anomalyChains.find((a) => a.id === evidenceId) : undefined;
  const gradeName = GRADE_OPTS.find((g) => g.id === gradeId)?.name ?? "";
  const climateName = CLIMATE_OPTS.find((c) => c.id === climateId)?.name ?? "";

  return (
    <>
      <PageHead
        title="能源诊断中心"
        sub={`统计窗口 ${WIN_FROM} ~ ${WIN_TO}（近 12 个月）· 数据基准日 ${demoAsOfDate} · 评分与对标阈值为演示口径，待标准确认`}
        actions={
          <>
            <select className="pf-select" value={gradeId} onChange={(e) => setPf({ grade: e.target.value })} title="对标医院等级">
              {GRADE_OPTS.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select className="pf-select" value={climateId} onChange={(e) => setPf({ climate: e.target.value })} title="对标气候区">
              {CLIMATE_OPTS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="pf-btn ghost" onClick={() => setCfgOpen(true)}><SlidersHorizontal size={14} /> 权重与阈值</button>
            <button className="pf-btn primary" onClick={onExport}><FileDown size={14} /> 导出诊断报告</button>
          </>
        }
      />

      <div className="grid cols-5">
        <Kpi label="综合能效评分" value={scoring.total.toFixed(1)} unit="分" tone={scoring.grade.kpi}
          sub={<><Tag tone={scoring.grade.tag}>{scoring.grade.text}</Tag><span>六维加权 · 演示口径</span></>} />
        <Kpi label="超标楼宇" value={bench.overRows.length} unit={`/ ${bench.rows.length} 栋`} tone={bench.overRows.length > 0 ? "red" : "green"}
          sub={`超标率 ${f0((bench.overRows.length / bench.rows.length) * 100)}% · 口径 ${gradeName}/${climateName}`} />
        <Kpi label="节能潜力（折标煤）" value={f0(bench.potTce)} unit="tce/年" tone="cyan"
          sub={`占近12月综合能耗 ${f1((bench.potTce / base.totalTce) * 100)}%（较同类平均）`} />
        <Kpi label="预计成本节省" value={f0(bench.potMoney)} unit="万元/年" tone="amber" sub="按现行单价折算（演示）" />
        <Kpi label="预计减碳量" value={f0(bench.potCarbon)} unit="tCO₂e/年" tone="green"
          sub={`占年度碳预算 ${f1((bench.potCarbon / annualCarbonBudgetT) * 100)}%`} />
      </div>

      <div className="grid cols-3" style={{ marginTop: 10 }}>
        <Panel title="综合能效评分 · 六维加权" extra={<Tag tone={scoring.grade.tag}>{scoring.grade.text} {scoring.total.toFixed(1)}</Tag>}>
          <EChart height={150} option={gaugeOption} />
          <table className="pf-table" style={{ marginTop: 6 }}>
            <thead><tr><th>维度</th><th className="num">实际</th><th className="num">先进</th><th className="num">约束</th><th className="num">权重</th><th className="num">得分</th></tr></thead>
            <tbody>
              {scoring.rows.map((r) => (
                <tr key={r.key} title={`${r.note} · 单位：${r.unit}`}>
                  <td>{r.name}</td>
                  <td className="num">{f1(r.value)}</td>
                  <td className="num">{r.adv}</td>
                  <td className="num">{r.limit}</td>
                  <td className="num">{r.weight}%</td>
                  <td className="num" style={{ color: r.score >= scoring.cuts.A ? "var(--green)" : r.score >= scoring.cuts.B ? "var(--cyan)" : r.score >= scoring.cuts.C ? "var(--amber)" : "var(--red)" }}>{r.score.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--ink-3)" }}>
            得分映射：≤先进=100；先进→约束线性降至 60；约束→1.4×约束降至 0。等级线 优{scoring.cuts.A}/良{scoring.cuts.B}/合格{scoring.cuts.C}（可在「权重与阈值」调整）。悬停行查看口径。
          </p>
        </Panel>

        <Panel title="三线对标 · 楼宇综合能耗强度" className="" style={{ gridColumn: "span 2" }}
          extra={<><Tag tone="muted">{gradeName} · {climateName} ×{bench.mul.toFixed(2)}</Tag><Tag tone="warn">演示阈值，待标准确认</Tag></>}>
          <EChart height={252} option={benchOption} />
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--ink-3)" }}>
            柱色=对标状态（红 超约束 / 橙 高于平均 / 青 优于平均 / 绿 达先进）。三线随左上方医院等级与气候区选择联动；超标判定 = 强度 &gt; 约束值。
          </p>
        </Panel>
      </div>

      <div className="grid cols-3" style={{ marginTop: 10 }}>
        <Panel title="对标基准与节能潜力构成" extra={<Tag tone="warn">演示阈值</Tag>}>
          <table className="pf-table">
            <thead><tr><th>科室类别</th><th>覆盖楼宇</th><th className="num">先进</th><th className="num">平均</th><th className="num">约束</th></tr></thead>
            <tbody>
              {bench.catRows.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td style={{ fontSize: 11 }}>{c.buildings.map((b) => buildingById[b].shortName).join("、")}</td>
                  <td className="num">{f1(c.adv)}</td><td className="num">{f1(c.avg)}</td><td className="num">{f1(c.limit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ margin: "4px 0 8px", fontSize: 11, color: "var(--ink-3)" }}>单位 kgce/m²·a，已乘等级/气候系数 ×{bench.mul.toFixed(2)}。潜力口径：强度超「平均值」部分 × 面积（理论潜力）。</p>
          <table className="pf-table">
            <thead><tr><th>品种</th><th className="num">潜力(原单位)</th><th className="num">tce/年</th><th className="num">万元/年</th><th className="num">减碳 t/年</th></tr></thead>
            <tbody>
              {KINDS.map((k) => {
                const p = bench.kindPot[k];
                return (
                  <tr key={k}>
                    <td>{energyKindMeta[k].name}</td>
                    <td className="num">{p.native > 0 ? `${f0(p.native)} ${energyKindMeta[k].unit}` : "—"}</td>
                    <td className="num">{p.tce > 0 ? f1(p.tce) : "—"}</td>
                    <td className="num">{p.moneyWan > 0 ? f1(p.moneyWan) : "—"}</td>
                    <td className="num">{p.carbonT > 0.05 ? f1(p.carbonT) : "—"}</td>
                  </tr>
                );
              })}
              <tr style={{ fontWeight: 600 }}>
                <td>合计</td><td className="num">—</td>
                <td className="num">{f0(bench.potTce)}</td><td className="num">{f0(bench.potMoney)}</td><td className="num">{f0(bench.potCarbon)}</td>
              </tr>
            </tbody>
          </table>
        </Panel>

        <Panel title="医院能源流向桑基图（近 30 日，折标煤）" style={{ gridColumn: "span 2" }}
          extra={<span className="num" style={{ fontSize: 11 }}>总输入 {f1(sankey.rIn)} = 末端 {f1(sankey.rEnd)} + 损耗 {f1(sankey.rLoss)} tce · 综合效率 {sankey.effPct}%</span>}>
          <EChart height={318} option={sankeyOption} />
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--ink-3)" }}>
            源头（电/气/热/医气）→ 转换设备（冷机/锅炉/空压机/制氧机）→ 末端（楼宇/手术净化/消毒供应/大型设备/照明/电梯）→ 损耗。
            总量取自计量数据（{D30_FROM} ~ {demoAsOfDate}），转换与分配比例为演示估计；水未计入能源流。
          </p>
        </Panel>
      </div>

      <Panel title="AI 根因分析" style={{ marginTop: 10 }}
        extra={
          <>
            <Tag tone="info">模拟诊断 · 须人工确认</Tag>
            <select className="pf-select" value={aiBuilding} onChange={(e) => setPf({ aiBuilding: e.target.value })}>
              <option value="all">全部楼宇</option>
              {mainBuildings.map((b) => <option key={b.id} value={b.id}>{b.shortName}</option>)}
            </select>
            <select className="pf-select" value={aiLevel} onChange={(e) => setPf({ aiLevel: e.target.value })}>
              <option value="all">全部级别</option><option value="critical">严重</option><option value="warning">警告</option><option value="info">提示</option>
            </select>
          </>
        }>
        {aiRows.length === 0 ? (
          <EmptyState text="当前筛选下无诊断结论，请调整楼宇或级别筛选" />
        ) : (
          <div className="grid cols-3">
            {aiRows.map((a) => (
              <div key={a.id} style={{ border: "1px solid var(--panel-border)", borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, background: "rgba(41, 211, 232, 0.02)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                  <b style={{ fontSize: 12.5, color: "var(--ink-1)", lineHeight: 1.35 }}>{a.title}</b>
                  <Tag tone={a.level === "critical" ? "danger" : a.level === "warning" ? "warn" : "info"}>{a.level === "critical" ? "严重" : a.level === "warning" ? "警告" : "提示"}</Tag>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 11 }}>
                  <Tag tone="muted">{buildingById[a.buildingId].shortName}</Tag>
                  <Tag tone={a.status === "closed" ? "ok" : a.status === "handling" ? "info" : "warn"}>{a.status === "closed" ? "已关闭" : a.status === "handling" ? "处理中" : "待处理"}</Tag>
                  {a.medicalSafetyNote && <Tag tone="warn"><ShieldAlert size={10} /> 保障优先</Tag>}
                  <span className="num" style={{ marginLeft: "auto", color: "var(--ink-2)" }}>置信度 {a.aiConfidencePct}%</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: "rgba(157,180,214,0.15)" }}>
                  <div style={{ height: 4, borderRadius: 2, width: `${a.aiConfidencePct}%`, background: a.aiConfidencePct >= 90 ? "var(--green)" : "var(--cyan)" }} />
                </div>
                <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.45 }}>根因：{a.rootCause}</p>
                <p style={{ margin: 0, fontSize: 11, color: "var(--ink-3)", lineHeight: 1.4 }}>建议：{a.suggestion}</p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", paddingTop: 4 }}>
                  <span className="num" style={{ fontSize: 11, color: "var(--ink-2)" }}>
                    {a.estSavingWanYuanPerYear > 0 ? `预计节省 ${a.estSavingWanYuanPerYear} 万元/年 · 减碳 ${a.estReductionTPerYear} t` : "无节能收益（保障/数据治理类）"}
                  </span>
                  <span style={{ display: "flex", gap: 6 }}>
                    <button className="pf-btn ghost" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => setEvidenceId(a.id)}><ListTree size={12} /> 证据链</button>
                    {acked(a.id) ? (
                      <Tag tone="ok">已人工确认</Tag>
                    ) : (
                      <button className="pf-btn" style={{ padding: "2px 8px", fontSize: 11 }} disabled={!writable} title={writable ? "确认该模拟诊断结论（演示）" : "当前角色无本模块写权限"} onClick={() => confirmAnomaly(a)}>
                        <Check size={12} /> 人工确认
                      </button>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="节能改造建议（医院专项方案）" style={{ marginTop: 10 }}
        extra={<span style={{ fontSize: 11 }}>共 {SUGGESTIONS.length} 项 · 合计年节省 {f1(SUGGESTIONS.reduce((s, x) => s + x.savingWan, 0))} 万元 / 减碳 {f0(SUGGESTIONS.reduce((s, x) => s + x.carbonT, 0))} t</span>}>
        <table className="pf-table">
          <thead>
            <tr><th>建议方案</th><th>位置</th><th>优先级</th><th>难度</th><th className="num">年节省(万元)</th><th className="num">年减碳(t)</th><th className="num">投资(万元)</th><th className="num">回收期(年)</th><th>状态 / 操作</th></tr>
          </thead>
          <tbody>
            {SUGGESTIONS.map((s) => {
              const pid = linkedProjectId(s);
              const stage = pid ? projects.find((p) => p.id === pid)?.stage : undefined;
              return (
                <tr key={s.key}>
                  <td style={{ color: "var(--ink-1)" }}>{s.title}{s.anomalyId && <span style={{ color: "var(--ink-3)", fontSize: 11 }}>（关联 {s.anomalyId}）</span>}</td>
                  <td>{s.buildingIds.map((b) => buildingById[b].shortName).join("、")}</td>
                  <td><Tag tone={PRIORITY_META[s.priority].tone}>{PRIORITY_META[s.priority].text}</Tag></td>
                  <td>{s.difficulty}</td>
                  <td className="num">{f1(s.savingWan)}</td>
                  <td className="num">{f0(s.carbonT)}</td>
                  <td className="num">{f0(s.investWan)}</td>
                  <td className="num">{f1(s.payback)}</td>
                  <td>
                    {pid ? (
                      <Tag tone="ok">{pid} · {stage === "operation" ? "运行" : stage === "construction" ? "施工" : stage === "design" ? "设计" : stage === "acceptance" ? "验收" : "立项"}</Tag>
                    ) : (
                      <button className="pf-btn" style={{ padding: "2px 8px", fontSize: 11 }} disabled={!writable} title={writable ? "创建立项阶段项目并写入项目库" : "当前角色无本模块写权限"} onClick={() => convertToProject(s)}>
                        <FolderPlus size={12} /> 转项目
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--ink-3)" }}>
          所有方案均不影响医疗安全：手术室/ICU 相关措施保持洁净度、压差、换气与生命支持冗余下限，保障优先于节能；投资与回收期为演示估算。
        </p>
      </Panel>

      <Panel title="季节 × 日型对比（叠加业务量）" style={{ marginTop: 10 }}
        extra={
          <>
            <span style={{ fontSize: 11 }}>制冷季 6-9 月 · 供暖季 11-3 月 · 过渡季 4/5/10 月</span>
            <select className="pf-select" value={metric} onChange={(e) => setPf({ metric: e.target.value })}>
              {METRIC_OPTS.map((m) => <option key={m.id} value={m.id}>{m.name}（{m.unit}）</option>)}
            </select>
          </>
        }>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "3 1 480px", minWidth: 380 }}>
            <EChart height={248} option={seasonOption} />
          </div>
          <div style={{ flex: "2 1 360px", minWidth: 320 }}>
            <table className="pf-table">
              <thead><tr><th>分组</th><th className="num">天数</th><th className="num">tce/日</th><th className="num">门诊/日</th><th className="num">手术/日</th><th className="num">床位率</th><th className="num">kgce/人次</th></tr></thead>
              <tbody>
                {seasonRows.map((r) => (
                  <tr key={r.key}>
                    <td>{r.label}</td>
                    <td className="num">{r.n}</td>
                    <td className="num">{f1(r.comp)}</td>
                    <td className="num">{f0(r.visits)}</td>
                    <td className="num">{f1(r.surg)}</td>
                    <td className="num">{f1(r.occ)}%</td>
                    <td className="num">{f1(r.perVisit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--ink-3)" }}>
              周末单位门诊能耗偏高属业务驱动型正常现象（住院/急诊基础负荷不随门诊量下降）。节假日与检修日历未建模（演示未尽项）。
            </p>
          </div>
        </div>
      </Panel>

      {cfgOpen && (
        <Modal title="能效评分：权重与等级阈值配置（演示）" onClose={() => setCfgOpen(false)} width={560}>
          <table className="pf-table">
            <thead><tr><th>维度</th><th>口径</th><th className="num">权重 %</th></tr></thead>
            <tbody>
              {scoring.rows.map((r) => (
                <tr key={r.key}>
                  <td style={{ whiteSpace: "nowrap" }}>{r.name}</td>
                  <td style={{ fontSize: 11 }}>{r.note}</td>
                  <td className="num" style={{ width: 84 }}>
                    <input className="pf-input" type="number" min={0} max={60} style={{ width: 68 }} value={r.weight}
                      onChange={(e) => setPf({ [`w_${r.key}`]: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "10px 0", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12 }}>等级阈值：</span>
            {(["A", "B", "C"] as const).map((g) => (
              <label key={g} style={{ fontSize: 12, display: "flex", gap: 4, alignItems: "center" }}>
                {g === "A" ? "优秀 ≥" : g === "B" ? "良好 ≥" : "合格 ≥"}
                <input className="pf-input" type="number" min={1} max={99} style={{ width: 60 }} value={scoring.cuts[g]}
                  onChange={(e) => setPf({ [`g${g}`]: Math.max(1, Math.min(99, Number(e.target.value) || 0)) })} />
              </label>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12 }}>
              权重合计 <b className="num">{scoring.wSum}%</b>
              {scoring.wSum !== 100 && <Tag tone="warn">≠100，计算时按比例归一</Tag>}
              <span style={{ color: "var(--ink-3)", marginLeft: 8 }}>当前综合 {scoring.total.toFixed(1)} 分（{scoring.grade.text}）</span>
            </span>
            <button className="pf-btn ghost" onClick={() => setPf({ w_area: 25, w_bed: 20, w_visit: 15, w_rev: 10, w_dev: 15, w_biz: 15, gA: 85, gB: 70, gC: 55 })}>恢复默认</button>
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 11, color: "var(--ink-3)" }}>先进/约束阈值为演示口径（待标准确认），配置随本页筛选持久化，「一键重置演示」可恢复。</p>
        </Modal>
      )}

      {evidenceAnomaly && (
        <Modal title={`证据链 · ${evidenceAnomaly.id}（模拟诊断）`} onClose={() => setEvidenceId(null)} width={640}>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--ink-1)", fontWeight: 600 }}>{evidenceAnomaly.title}</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            <Tag tone="muted">{buildingById[evidenceAnomaly.buildingId].name}</Tag>
            <Tag tone="info">置信度 {evidenceAnomaly.aiConfidencePct}%</Tag>
            <Tag tone="muted">责任人 {evidenceAnomaly.owner}</Tag>
            <Tag tone="muted">起始 {evidenceAnomaly.from}{evidenceAnomaly.to ? ` ~ ${evidenceAnomaly.to}` : " 起持续"}</Tag>
          </div>
          <ol style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.7 }}>
            {evidenceAnomaly.evidence.map((e, i) => <li key={i}>{e}</li>)}
          </ol>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--ink-2)" }}><b>根因推断：</b>{evidenceAnomaly.rootCause}</p>
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--ink-2)" }}><b>处置建议：</b>{evidenceAnomaly.suggestion}</p>
          {evidenceAnomaly.medicalSafetyNote && (
            <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--amber)", display: "flex", gap: 6, alignItems: "flex-start" }}>
              <ShieldAlert size={14} style={{ flexShrink: 0, marginTop: 1 }} /> 医疗安全：{evidenceAnomaly.medicalSafetyNote}
            </p>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            <Tag tone="muted">告警 {evidenceAnomaly.alarmId}</Tag>
            {evidenceAnomaly.workOrderId && <Tag tone="muted">工单 {evidenceAnomaly.workOrderId}</Tag>}
            {evidenceAnomaly.projectId && <Tag tone="muted">项目 {evidenceAnomaly.projectId}</Tag>}
            <Tag tone="muted">设备 {evidenceAnomaly.deviceId}</Tag>
            <Tag tone="muted">表计 {evidenceAnomaly.meterId}</Tag>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>模拟诊断结论，仅供演示；执行前须人工确认，不下发任何自动控制。</span>
            {acked(evidenceAnomaly.id) ? (
              <Tag tone="ok">已人工确认</Tag>
            ) : (
              <button className="pf-btn primary" disabled={!writable} title={writable ? undefined : "当前角色无本模块写权限"}
                onClick={() => { confirmAnomaly(evidenceAnomaly); setEvidenceId(null); }}>
                <Check size={14} /> 人工确认结论
              </button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
