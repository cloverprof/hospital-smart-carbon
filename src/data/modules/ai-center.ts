// AI 智能分析中心（ai-center）专用数据与确定性规则。
// 本模块不调用任何真实 AI 服务：预测=确定性引擎、问答=预置关键词匹配、风险=规则打分。
import dayjs from "dayjs";
import { anomalyById } from "../anomalies";
import { annualCarbonBudgetT, demoAsOfDate } from "../config";
import { deviceStats } from "../devices";
import { projectSeeds } from "../projects";
import { unitNoise } from "../rng";
import {
  dailyCarbonSeries,
  forecastDailyCarbon,
  monthlyCarbonSeries,
  outpatientVisits,
  realtimePowerKw,
} from "../../services/timeseries";
import type { AnomalyChain, Project, SeriesPoint } from "../../types/core";

const sum = (pts: SeriesPoint[]) => pts.reduce((s, p) => s + p.v, 0);
const r1 = (v: number) => Math.round(v * 10) / 10;

/** 预算日均线 tCO2e/日 */
export const dailyBudgetT = r1(annualCarbonBudgetT / 365);

// ---------- ① 预测事件（新设备投运 / 新科室 / 整改生效，叠加进预测曲线，保证图文一致） ----------

export interface ForecastEvent {
  date: string;
  label: string;
  deltaT: number; // tCO2e/日，自该日起叠加
  detail: string;
}

export const forecastEvents: ForecastEvent[] = [
  { date: "2026-08-18", label: "MRI-03 投运", deltaT: 0.9, detail: "影像中心 MRI-03（3.0T）计划投运，预计 +0.9 t/日" },
  { date: "2026-08-25", label: "setback 整改生效", deltaT: -1.4, detail: "手术部净化空调非术时段降风量（PRJ-2026-09）整改生效，预计 -1.4 t/日" },
  { date: "2026-09-01", label: "内镜中心启用", deltaT: 2.3, detail: "新科室内镜中心（门诊综合楼 8F）启用，预计 +2.3 t/日" },
];

let _adjForecast: SeriesPoint[] | null = null;

/** 预测（含事件叠加）：基线预测 + 各事件自生效日起的日增量 */
export function adjustedForecast(): SeriesPoint[] {
  if (_adjForecast) return _adjForecast;
  _adjForecast = forecastDailyCarbon().map((p) => {
    const delta = forecastEvents.reduce((s, e) => (p.t >= e.date ? s + e.deltaT : s), 0);
    return { t: p.t, v: r1(p.v + delta) };
  });
  return _adjForecast;
}

// ---------- ② 模拟实时数据流（预置事件池轮播，非真实采集） ----------

export interface StreamEvent {
  key: number;
  time: string;
  tag: string;
  tone: "info" | "warn" | "danger";
  text: string;
}

interface StreamPoolItem {
  tag: string;
  tone: StreamEvent["tone"];
  make: (tick: number) => string;
}

const streamPool: StreamPoolItem[] = [
  { tag: "净化空调", tone: "danger", make: () => "手术医技楼 AHU-03 当前功率 68.2 kW，较 setback 基线 +24%（AN-001 持续中）" },
  { tag: "冷站", tone: "warn", make: () => "冷冻水供回温差 2.9℃（设计 5℃），3# 泵仍工频运行，维持低温差判定（AN-002）" },
  { tag: "医气", tone: "danger", make: () => "氧气备用汇流排压力 8.2 bar，低于 9.5 bar 下限；保障优先，不做节能动作（AN-005）" },
  { tag: "电力", tone: "info", make: (tick) => `全院实时功率 ${realtimePowerKw(14 * 3600 + tick * 4).toLocaleString("zh-CN")} kW，处于同期正常区间` },
  { tag: "锅炉", tone: "warn", make: () => "2# 锅炉排烟温度 186℃、烟气含氧量 7.9%，燃烧效率偏低（AN-004）" },
  { tag: "给水", tone: "warn", make: () => "住院 B 5F 支路夜间最小流量 1.8 m³/h，维持泄漏判定（AN-003）" },
  { tag: "影像", tone: "info", make: () => "MRI-02 待机功率 20.7 kW（同型基线 13 kW），夜间节能待机未启用（AN-006）" },
  { tag: "预测", tone: "info", make: () => `明日碳排预测 ${adjustedForecast()[0]?.v ?? "-"} t，预算日均线 ${dailyBudgetT} t` },
  { tag: "蒸汽", tone: "warn", make: () => "消毒供应 7# 疏水阀出口温度 117℃，维持内漏判定（AN-007）" },
  { tag: "手术室", tone: "info", make: () => "3# 手术室压差 +7.8 Pa，感染控制指标正常（保障红线回路）" },
  { tag: "数据", tone: "info", make: () => "行政楼采集网关心跳正常，今日数据完整率 99.6%" },
  {
    tag: "碳预算", tone: "info",
    make: () => {
      const used = sum(dailyCarbonSeries("2026-08-01", demoAsOfDate));
      return `8 月预算进度：已用 ${Math.round(used).toLocaleString("zh-CN")} t / 进度线 ${Math.round(dailyBudgetT * 4).toLocaleString("zh-CN")} t`;
    },
  },
];

/** 由 tick 生成一条流事件（轮播 + 确定性时间戳，基准 14:00:00） */
export function makeStreamEvent(tick: number): StreamEvent {
  const item = streamPool[tick % streamPool.length];
  return {
    key: tick,
    time: dayjs(`${demoAsOfDate} 14:00:00`).add(tick * 4, "second").format("HH:mm:ss"),
    tag: item.tag,
    tone: item.tone,
    text: item.make(tick),
  };
}

// ---------- ③ 减排候选（AI/诊断建议）与投资情景 ----------

export interface AiCandidate {
  key: string;
  name: string;
  buildingIds: Project["buildingIds"];
  system: Project["system"];
  owner: string;
  investmentWanYuan: number;
  annualSavingMwh: number;
  annualSavingWanYuan: number;
  annualCarbonReductionT: number;
  paybackYears: number;
  anomalyId?: string;
  basis: string;
}

// 数字口径：收益/减碳沿用 anomalies.ts 的测算；投资为演示估算值，回收期 = 投资 / 年收益。
export const aiCandidates: AiCandidate[] = [
  {
    key: "boiler-tune", name: "2# 锅炉燃烧调试与受热面清灰", buildingIds: ["power"], system: "boiler",
    owner: "陈工（锅炉班）", investmentWanYuan: 15, annualSavingMwh: 0, annualSavingWanYuan: 11.2,
    annualCarbonReductionT: 86, paybackYears: 1.3, anomalyId: "AN-004",
    basis: "AN-004：排烟温度 +28℃、含氧量 8.1%，同蒸汽量燃气 +7%",
  },
  {
    key: "chiller-dt", name: "冷站低温差治理（变频压差 + 末端平衡）", buildingIds: ["power"], system: "chiller",
    owner: "刘工（冷站班）", investmentWanYuan: 28, annualSavingMwh: 126, annualSavingWanYuan: 9.1,
    annualCarbonReductionT: 70, paybackYears: 3.1, anomalyId: "AN-002",
    basis: "AN-002：供回温差 2.8℃（设计 5℃），COP 5.6→4.9",
  },
  {
    key: "led-or", name: "手术室无影灯 LED 化与随手关管理", buildingIds: ["surgical"], system: "lighting",
    owner: "钱工（电气组）", investmentWanYuan: 9, annualSavingMwh: 24, annualSavingWanYuan: 1.7,
    annualCarbonReductionT: 13, paybackYears: 5.3,
    basis: "参照 PRJ-2025-06 门诊照明改造节能率 26% 外推手术照明回路",
  },
  {
    key: "cssd-heat", name: "消毒供应灭菌冷凝水余热回收", buildingIds: ["cssd"], system: "boiler",
    owner: "陈工（锅炉班）", investmentWanYuan: 34, annualSavingMwh: 0, annualSavingWanYuan: 7.9,
    annualCarbonReductionT: 128, paybackYears: 4.3, anomalyId: "AN-007",
    basis: "灭菌批次余热约 1,160 GJ/年，回收预热锅炉补水",
  },
  {
    key: "chiller-maglev", name: "冷站二期：1# 冷机磁悬浮替换", buildingIds: ["power"], system: "chiller",
    owner: "刘工（冷站班）", investmentWanYuan: 260, annualSavingMwh: 539, annualSavingWanYuan: 38.8,
    annualCarbonReductionT: 300, paybackYears: 6.7,
    basis: "1# 离心机组投运 10 年、能效衰减 8%，替换为磁悬浮变频机组",
  },
  {
    key: "pv-roof", name: "屋顶分布式光伏 1.2 MWp", buildingIds: ["inpatientA", "inpatientB", "admin"], system: "power",
    owner: "郑工（配电班）", investmentWanYuan: 480, annualSavingMwh: 1300, annualSavingWanYuan: 93.6,
    annualCarbonReductionT: 724, paybackYears: 5.1,
    basis: "可用屋面约 1.4 万 m²，按年利用小时 1,080 h 测算",
  },
];

/** 情景比选池：在建/待建项目（项目库）+ AI 候选。运行期项目不参与新增投资比选。 */
export interface ScenarioItem {
  id: string;
  name: string;
  kind: "project" | "candidate";
  investmentWanYuan: number;
  annualSavingWanYuan: number;
  annualCarbonReductionT: number;
  paybackYears: number;
  candidateKey?: string;
}

export const scenarioPool: ScenarioItem[] = [
  ...projectSeeds
    .filter((p) => p.stage !== "operation")
    .map((p) => ({
      id: p.id, name: p.name, kind: "project" as const,
      investmentWanYuan: p.investmentWanYuan, annualSavingWanYuan: p.annualSavingWanYuan,
      annualCarbonReductionT: p.annualCarbonReductionT, paybackYears: p.paybackYears,
    })),
  ...aiCandidates.map((c) => ({
    id: c.key, name: c.name, kind: "candidate" as const, candidateKey: c.key,
    investmentWanYuan: c.investmentWanYuan, annualSavingWanYuan: c.annualSavingWanYuan,
    annualCarbonReductionT: c.annualCarbonReductionT, paybackYears: c.paybackYears,
  })),
];

export const budgetTiers = [100, 300, 600] as const;

/** 贪心组合：按「年减碳/投资」性价比降序装入预算 */
export function greedyPick(budgetWanYuan: number): { chosen: ScenarioItem[]; totalInvest: number; totalReduction: number; totalSaving: number } {
  const sorted = [...scenarioPool].sort(
    (a, b) => b.annualCarbonReductionT / b.investmentWanYuan - a.annualCarbonReductionT / a.investmentWanYuan,
  );
  const chosen: ScenarioItem[] = [];
  let invest = 0;
  for (const item of sorted) {
    if (invest + item.investmentWanYuan <= budgetWanYuan) {
      chosen.push(item);
      invest += item.investmentWanYuan;
    }
  }
  return {
    chosen,
    totalInvest: invest,
    totalReduction: Math.round(chosen.reduce((s, c) => s + c.annualCarbonReductionT, 0)),
    totalSaving: r1(chosen.reduce((s, c) => s + c.annualSavingWanYuan, 0)),
  };
}

/** 投资-收益路径：贪心顺序的累计投资 → 累计年减碳 */
export function investPath(): { name: string; cumInvest: number; cumReduction: number }[] {
  const sorted = [...scenarioPool].sort(
    (a, b) => b.annualCarbonReductionT / b.investmentWanYuan - a.annualCarbonReductionT / a.investmentWanYuan,
  );
  let invest = 0;
  let red = 0;
  return sorted.map((item) => {
    invest += item.investmentWanYuan;
    red += item.annualCarbonReductionT;
    return { name: item.name, cumInvest: invest, cumReduction: Math.round(red) };
  });
}

// ---------- ④ 医院专项减排路径五卡 ----------

export interface PathwayCard {
  key: string;
  name: string;
  measure: string;
  reductionT: number;
  statusText: string;
  tone: "ok" | "warn" | "info" | "muted";
  anomalyId?: string;
  projectId?: string;
  workOrderId?: string;
  candidateKey?: string;
  safety?: string;
}

export const pathwayCards: PathwayCard[] = [
  {
    key: "purification", name: "净化空调 setback", measure: "非术时段降风量，保压差与换气下限",
    reductionT: 101, statusText: "项目设计中", tone: "info",
    anomalyId: "AN-001", projectId: "PRJ-2026-09", workOrderId: "WO-2026-0712",
    safety: "手术室压差/洁净度红线保持，禁止自动断电",
  },
  {
    key: "shadowless", name: "无影灯与手术照明", measure: "无影灯 LED 化 + 术后随手关策略",
    reductionT: 13, statusText: "候选（未立项）", tone: "muted", candidateKey: "led-or",
  },
  {
    key: "booking", name: "大型设备预约错峰", measure: "影像设备预约制运行 + 分级待机",
    reductionT: 23, statusText: "项目立项", tone: "info",
    anomalyId: "AN-006", projectId: "PRJ-2026-11", workOrderId: "WO-2026-0717",
    safety: "MRI 磁体冷却保持，禁止自动断电",
  },
  {
    key: "medgas", name: "医气泄漏治理", measure: "管网泄漏排查 + 压力分区优化",
    reductionT: 11, statusText: "项目立项", tone: "info", projectId: "PRJ-2026-12",
    safety: "供氧冗余属生命保障红线，保障优先",
  },
  {
    key: "cssd-heat", name: "消毒供应余热回收", measure: "疏水阀更换（施工中）+ 余热回收候选",
    reductionT: 74, statusText: "项目施工中", tone: "warn",
    anomalyId: "AN-007", projectId: "PRJ-2026-10", workOrderId: "WO-2026-0718", candidateKey: "cssd-heat",
  },
];

// ---------- ⑤ 风险热力日历（确定性规则打分） ----------

export type RiskCategory = "budget" | "device" | "compliance" | "peak";

export const riskCategories: { id: RiskCategory; name: string }[] = [
  { id: "budget", name: "碳预算" },
  { id: "device", name: "设备" },
  { id: "compliance", name: "合规到期" },
  { id: "peak", name: "医疗高峰" },
];

const AUDIT_EXPIRE = "2026-09-15"; // AN-010 能源审计报告到期日

let _fcMap: Map<string, number> | null = null;
function forecastAt(date: string): number | undefined {
  if (!_fcMap) _fcMap = new Map(adjustedForecast().map((p) => [p.t, p.v]));
  return _fcMap.get(date);
}

/** 风险格：0 无 / 1 低 / 2 中 / 3 高，附规则说明 */
export function riskCell(cat: RiskCategory, date: string): { level: 0 | 1 | 2 | 3; reason: string } {
  if (cat === "budget") {
    const fc = forecastAt(date) ?? adjustedForecast().at(-1)?.v ?? dailyBudgetT;
    const ratio = fc / dailyBudgetT;
    const level = ratio >= 1.06 ? 3 : ratio >= 1 ? 2 : ratio >= 0.94 ? 1 : 0;
    return { level, reason: `预测 ${fc} t / 预算日均 ${dailyBudgetT} t（${Math.round(ratio * 100)}%）` };
  }
  if (cat === "device") {
    const faults = deviceStats().fault;
    if (date >= "2026-08-10" && date <= "2026-08-12") return { level: 2, reason: `冷却塔清洗维保窗口（WO-2026-0721），在障设备 ${faults} 台` };
    if (date >= "2026-09-08" && date <= "2026-09-10") return { level: 2, reason: `住院 A 电梯年检窗口（WO-2026-0722），在障设备 ${faults} 台` };
    const n = unitNoise(`risk:device:${date}`);
    const level = n > 0.9 ? 3 : n > 0.72 ? 2 : n > 0.45 ? 1 : 0;
    return { level, reason: `在障设备 ${faults} 台，按故障概率规则打分` };
  }
  if (cat === "compliance") {
    const dt = dayjs(AUDIT_EXPIRE).diff(dayjs(date), "day");
    if (dt < 0) return { level: 3, reason: `能源审计报告已于 ${AUDIT_EXPIRE} 过期（AN-010，演示）` };
    const level = dt <= 7 ? 3 : dt <= 21 ? 2 : dt <= 45 ? 1 : 0;
    return { level, reason: `能源审计报告 ${AUDIT_EXPIRE} 到期，剩余 ${dt} 天（AN-010）` };
  }
  const visits = outpatientVisits(date);
  const dow = dayjs(date).day();
  const level = visits >= 9300 ? 3 : dow === 1 ? 2 : dow === 0 || dow === 6 ? 0 : 1;
  return { level, reason: `预计门诊量 ${visits.toLocaleString("zh-CN")} 人次${dow === 1 ? "（周一高峰）" : ""}` };
}

// ---------- ⑥ 政策时间线（全部待核验/演示口径） ----------

export interface PolicyItem {
  id: string;
  date: string;
  name: string;
  scope: string;
  gap: string;
  checklist: string[];
}

export const policyTimeline: PolicyItem[] = [
  {
    id: "PL-01", date: "2008-10", name: "《公共机构节能条例》",
    scope: "医院属公共机构：能源计量、能耗定额、能源审计、节能改造均受约束",
    gap: "三年周期能源审计将于 2026-09-15 到期（AN-010），新一轮审计尚未启动",
    checklist: ["分项计量覆盖楼宇/系统两级", "年度能耗定额已备案", "9 月前完成审计机构比选", "审计报告版本入合规凭证库"],
  },
  {
    id: "PL-02", date: "2020-09", name: "碳达峰碳中和目标（双碳）",
    scope: "确立 2030 前碳达峰、2060 前碳中和的总体约束，医院中长期碳预算依此设定",
    gap: "院级碳达峰路线图未编制；当前仅有年度预算 52,000 t 与 2026 较 2024 下降 8% 目标",
    checklist: ["年度碳预算已分解到月", "月度盘查机制运行中", "院级达峰路线图（未完成）", "范围三口径研究（未启动）"],
  },
  {
    id: "PL-03", date: "2021-02", name: "《碳排放权交易管理办法（试行）》",
    scope: "医院暂未纳入强制控排行业；MRV（监测-报告-核查）体系为潜在纳入预留",
    gap: "凭证台账与因子留痕已建立，第三方核查流程未演练",
    checklist: ["排放因子版本留痕", "活动数据可追溯", "第三方核查演练（未完成）"],
  },
  {
    id: "PL-04", date: "2021-10", name: "《关于推动公共机构率先实现碳达峰的意见》",
    scope: "对人均综合能耗、单位建筑面积能耗提出约束性指标",
    gap: "单位面积能耗对标行业先进值仍有约 6% 差距（见能源诊断中心三线对标）",
    checklist: ["人均/单位面积指标月度跟踪", "公共区照明改造完成", "数据中心/机房能效对标（未完成）"],
  },
  {
    id: "PL-05", date: "2024-05", name: "医疗机构绿色低碳评价指引（演示占位）",
    scope: "绿色低碳医院分级评价框架，对应本平台绿色低碳评价模块 L1/L2/L3",
    gap: "L3 层「可再生能源占比」指标缺口最大，屋顶光伏候选（480 万）未决策",
    checklist: ["L1 基础项自评完成", "L2 提升项自评完成", "可再生能源占比方案上会（未完成）"],
  },
];

// ---------- ⑦ 中文问答演示（预置 Q&A，关键词匹配） ----------

export interface QaAnswer {
  title: string;
  points: string[];
  cites: string[];
  calc: string[];
  confidencePct: number;
  boundary: string;
  action?: { label: string; route: string };
}

export interface QaPreset {
  q: string;
  keywords: string[];
  build: () => QaAnswer;
}

export const qaPresets: QaPreset[] = [
  {
    q: "上月全院碳排是多少？",
    keywords: ["上月", "7月", "7 月", "七月", "上个月"],
    build: () => {
      const jul = monthlyCarbonSeries("2026-07", "2026-07")[0]?.v ?? 0;
      const julPrev = sum(dailyCarbonSeries("2025-07-01", "2025-07-31"));
      const yoy = julPrev ? Math.round(((jul - julPrev) / julPrev) * 1000) / 10 : 0;
      const julBudget = Math.round((annualCarbonBudgetT / 365) * 31);
      return {
        title: "2026 年 7 月全院碳排",
        points: [
          `7 月全院碳排 ${Math.round(jul).toLocaleString("zh-CN")} tCO₂e，同比${yoy >= 0 ? "上升" : "下降"} ${Math.abs(yoy)}%`,
          `对照月度预算线 ${julBudget.toLocaleString("zh-CN")} t，占 ${Math.round((jul / julBudget) * 100)}%`,
        ],
        cites: ["数据：dailyCarbonSeries 逐日汇总（电/天然气/外购热力）", "因子：电 0.6096 / 气 2.162 kgCO₂e/单位、热 110 kgCO₂e/GJ"],
        calc: [
          `月碳排 = Σ 日碳排（07-01…07-31）= ${Math.round(jul).toLocaleString("zh-CN")} t`,
          `同比 =（本期 − 2025 年同期 ${Math.round(julPrev).toLocaleString("zh-CN")} t）/ 同期 = ${yoy}%`,
        ],
        confidencePct: 99,
        boundary: "范围一+二（电/天然气/外购热力）合规口径，不含范围三与医气扩展边界",
        action: { label: "打开碳核算工作台", route: "/app/carbon/accounting" },
      };
    },
  },
  {
    q: "手术楼为什么高？",
    keywords: ["手术", "为什么高", "偏高"],
    build: () => {
      const a = anomalyById["AN-001"];
      const surgT = sum(dailyCarbonSeries("2026-07-01", "2026-07-31", "surgical")) / 1000;
      const totalT = monthlyCarbonSeries("2026-07", "2026-07")[0]?.v ?? 1;
      return {
        title: "手术医技楼碳排偏高归因",
        points: [
          `7 月手术医技楼碳排 ${Math.round(surgT).toLocaleString("zh-CN")} t，占全院 ${Math.round((surgT / totalT) * 100)}%`,
          `主因：${a.title}（${a.id}），22:00-06:00 净化空调功率较基线 +24%`,
          `根因：${a.rootCause}`,
        ],
        cites: [...a.evidence.map((e) => `证据：${e}`), `关联：告警 ${a.alarmId} / 工单 ${a.workOrderId} / 项目 ${a.projectId}`],
        calc: [`若恢复 setback：年节电 ${a.estSavingMwhPerYear} MWh ≈ 减碳 ${a.estReductionTPerYear} t/年（${a.estSavingWanYuanPerYear} 万元/年）`],
        confidencePct: a.aiConfidencePct,
        boundary: "归因基于分项计量与排班比对；手术室压差/洁净度红线保持，不做自动控制",
        action: { label: "查看能源诊断中心", route: "/app/energy/diagnosis" },
      };
    },
  },
  {
    q: "怎么降低碳排？",
    keywords: ["怎么降", "如何降", "降低", "减排", "建议"],
    build: () => {
      const s100 = greedyPick(100);
      const top = [...scenarioPool].sort(
        (a, b) => b.annualCarbonReductionT / b.investmentWanYuan - a.annualCarbonReductionT / a.investmentWanYuan,
      ).slice(0, 3);
      return {
        title: "减排路径建议（按性价比排序）",
        points: top.map(
          (t, i) => `${i + 1}. ${t.name}：投资 ${t.investmentWanYuan} 万，年减碳 ${t.annualCarbonReductionT} t，回收期 ${t.paybackYears} 年`,
        ),
        cites: ["数据：项目库在建/待建项目 + 异常链诊断候选（anomalies/projects 种子）"],
        calc: [`100 万预算贪心组合：投资 ${s100.totalInvest} 万 → 年减碳 ${s100.totalReduction} t、年收益 ${s100.totalSaving} 万`],
        confidencePct: 85,
        boundary: "测算基于演示因子与近 90 日基线，实施前需现场核实与 M&V 方案",
        action: { label: "打开项目库", route: "/app/operations/projects" },
      };
    },
  },
  {
    q: "今年会不会超预算？",
    keywords: ["预算", "超支", "超标", "会不会超"],
    build: () => {
      const ytd = sum(dailyCarbonSeries("2026-01-01", demoAsOfDate));
      const days = dayjs(demoAsOfDate).diff(dayjs("2026-01-01"), "day") + 1;
      const budgetToDate = (annualCarbonBudgetT / 365) * days;
      const diffPct = Math.round(((ytd - budgetToDate) / budgetToDate) * 1000) / 10;
      const toSep = sum(adjustedForecast());
      const daysToSep = dayjs("2026-09-30").diff(dayjs("2026-01-01"), "day") + 1;
      const budgetToSep = (annualCarbonBudgetT / 365) * daysToSep;
      const projSep = ytd + toSep;
      return {
        title: "年度碳预算执行研判",
        points: [
          `年初至今（${days} 天）实际 ${Math.round(ytd).toLocaleString("zh-CN")} t，进度线 ${Math.round(budgetToDate).toLocaleString("zh-CN")} t，偏差 ${diffPct >= 0 ? "+" : ""}${diffPct}%`,
          `预测到 9-30 累计 ${Math.round(projSep).toLocaleString("zh-CN")} t，对应进度线 ${Math.round(budgetToSep).toLocaleString("zh-CN")} t，${projSep <= budgetToSep ? "预计在进度内" : "预计超出进度线，需干预"}`,
        ],
        cites: ["数据：dailyCarbonSeries（01-01 至今）+ 预测曲线（含 3 个投运/整改事件叠加）"],
        calc: [`进度线 = 年预算 ${annualCarbonBudgetT.toLocaleString("zh-CN")} t ÷ 365 × 已过天数`],
        confidencePct: 80,
        boundary: "预测窗口仅到 9-30；Q4 采暖季波动未纳入，结论到 9 月底为止",
        action: { label: "打开碳资产管理", route: "/app/carbon/assets" },
      };
    },
  },
  {
    q: "医气泄漏怎么处理？",
    keywords: ["医气", "氧气", "泄漏", "医用气体"],
    build: () => {
      const a = anomalyById["AN-005"];
      return {
        title: "医用气体：安全处置优先，泄漏治理并行",
        points: [
          `安全异常 ${a.id}：${a.rootCause}；处置：${a.suggestion}`,
          "泄漏治理已立项 PRJ-2026-12（管网泄漏排查与压力分区优化）：投资 18 万，年收益 6.2 万，年减碳 11 t",
        ],
        cites: [...a.evidence.map((e) => `证据：${e}`), "项目：PRJ-2026-12（projects 种子）"],
        calc: ["泄漏收益 = 医气用量 62 万 m³/年 × 7% 泄漏率 × 2.6 元/m³ ≈ 11.3 万（保守取 6.2 万）"],
        confidencePct: a.aiConfidencePct,
        boundary: "供氧冗余属生命保障红线：先恢复备用汇流排，再做节能治理，顺序不可颠倒",
        action: { label: "打开医用气体管理", route: "/app/energy/medical-gas" },
      };
    },
  },
  {
    q: "本周有哪些风险？",
    keywords: ["风险", "本周", "预警"],
    build: () => {
      const hits: string[] = [];
      for (let i = 1; i <= 7; i++) {
        const date = dayjs(demoAsOfDate).add(i, "day").format("YYYY-MM-DD");
        for (const cat of riskCategories) {
          const cell = riskCell(cat.id, date);
          if (cell.level >= 2) hits.push(`${dayjs(date).format("MM-DD")} ${cat.name}：${cell.reason}`);
        }
      }
      return {
        title: "未来 7 天风险扫描（规则打分）",
        points: hits.length ? hits.slice(0, 6) : ["未来 7 天无中/高风险格"],
        cites: ["数据：风险热力日历同一规则引擎（碳预算/设备/合规/医疗高峰四类）"],
        calc: ["风险分级：预测/预算比值、维保窗口、凭证到期倒计时、门诊量阈值，均为确定性规则"],
        confidencePct: 88,
        boundary: "规则打分非概率预测；设备类风险以巡检与工单核实为准",
        action: { label: "打开设备工单", route: "/app/operations/workorders" },
      };
    },
  },
  {
    q: "碳排数据准不准？",
    keywords: ["数据", "质量", "缺失", "准确", "准不准"],
    build: () => {
      const a = anomalyById["AN-008"];
      return {
        title: "数据质量说明",
        points: [
          `唯一缺失事件 ${a.id}：行政楼网关离线 38 小时（07-30 起），缺失 152 个 15 分钟点位`,
          "处置：缺失区间按前后同型日插补并标记估算值；工单已关闭，核算完整率恢复",
        ],
        cites: [...a.evidence.map((e) => `证据：${e}`)],
        calc: ["完整率 = 实收点位 / 应收点位；中断期间最低 97.8%"],
        confidencePct: a.aiConfidencePct,
        boundary: "插补值在核算台账中单独标记「估算」，不与实测混同",
        action: { label: "打开合规凭证看板", route: "/app/carbon/compliance" },
      };
    },
  },
];

/** 关键词匹配：命中关键词数最多的预置问答；全不命中返回 null */
export function matchQa(input: string): QaPreset | null {
  const text = input.trim();
  if (!text) return null;
  let best: QaPreset | null = null;
  let bestScore = 0;
  for (const p of qaPresets) {
    const score = p.keywords.reduce((s, k) => (text.includes(k) ? s + 1 : s), 0);
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}

// ---------- ⑧ 转为项目 ----------

/** 生成下一个项目 ID（PRJ-2026-NN 顺延，避免与既有冲突） */
export function nextProjectId(existing: Project[]): string {
  const nums = existing
    .map((p) => /^PRJ-2026-(\d+)$/.exec(p.id))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]));
  const n = Math.max(12, ...nums) + 1;
  return `PRJ-2026-${String(n).padStart(2, "0")}`;
}

export function buildProjectFromCandidate(c: AiCandidate, id: string): Project {
  return {
    id, name: c.name, source: "ai", buildingIds: c.buildingIds, system: c.system, stage: "initiation",
    owner: c.owner, investmentWanYuan: c.investmentWanYuan, annualSavingMwh: c.annualSavingMwh,
    annualSavingWanYuan: c.annualSavingWanYuan, annualCarbonReductionT: c.annualCarbonReductionT,
    paybackYears: c.paybackYears, createdAt: demoAsOfDate, anomalyId: c.anomalyId,
  };
}

/** 由异常链生成项目：投资按年收益 × 2.5 估算（演示口径，UI 需注明） */
export function buildProjectFromAnomaly(a: AnomalyChain, id: string): Project {
  const invest = Math.max(5, Math.round(a.estSavingWanYuanPerYear * 2.5));
  return {
    id, name: `${a.title} 治理项目`, source: "ai", buildingIds: [a.buildingId], system: a.system,
    stage: "initiation", owner: a.owner, investmentWanYuan: invest, annualSavingMwh: a.estSavingMwhPerYear,
    annualSavingWanYuan: a.estSavingWanYuanPerYear, annualCarbonReductionT: a.estReductionTPerYear,
    paybackYears: a.estSavingWanYuanPerYear > 0 ? r1(invest / a.estSavingWanYuanPerYear) : 0,
    createdAt: demoAsOfDate, workOrderId: a.workOrderId, anomalyId: a.id,
  };
}
