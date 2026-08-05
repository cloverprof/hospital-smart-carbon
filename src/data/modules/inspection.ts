// 6.5.2 巡检管理与能效联动：静态领域数据（计划 / 今日任务 / 问题-能效关联）。
// 影响量一律从 timeseries 数据层按异常注入系数反推，禁止手写互相矛盾的数字。
import { energyKindMeta } from "../config";
import { anomalyById } from "../anomalies";
import { deviceById } from "../devices";
import { activeFactors } from "../factors";
import { dailyUsage } from "../../services/timeseries";
import type { BuildingId, EnergyKind, SystemKind } from "../../types/core";

export type PlanFreq = "daily" | "weekly" | "monthly" | "quarterly";

export const freqMeta: Record<PlanFreq, { name: string; tone: "info" | "ok" | "warn" | "muted" }> = {
  daily: { name: "日巡", tone: "info" },
  weekly: { name: "周巡", tone: "ok" },
  monthly: { name: "月检", tone: "warn" },
  quarterly: { name: "季检", tone: "muted" },
};

export interface CheckItem {
  id: string;
  label: string;
  /** 判定标准（现场对照） */
  spec: string;
  /** 判异常后的处理建议（进入巡检报告） */
  abnormalAdvice: string;
}

export interface InspectionPlan {
  id: string;
  name: string;
  freq: PlanFreq;
  buildingIds: BuildingId[];
  system: SystemKind;
  systemLabel: string;
  team: string;
  points: number;
  durationMin: number;
  lastDone: string;
  nextDue: string;
  /** 是否属于 6.5.2 要求的重点覆盖对象 */
  keyArea?: boolean;
  medicalSafetyNote?: string;
  items: CheckItem[];
}

export const inspectionPlans: InspectionPlan[] = [
  {
    id: "IP-D01", name: "手术室净化空调日巡", freq: "daily", buildingIds: ["surgical"], system: "purification",
    systemLabel: "净化空调", team: "暖通组", points: 18, durationMin: 90, lastDone: "2026-08-03", nextDue: "2026-08-04", keyArea: true,
    medicalSafetyNote: "手术室压差与洁净度属感染控制红线，巡检只记录、不做任何自动控制",
    items: [
      { id: "s1", label: "高效过滤器压差", spec: "≤ 初阻力 2 倍", abnormalAdvice: "更换/清洗过滤器并复测风量与压差，避免风机长期高负荷" },
      { id: "s2", label: "机组皮带张紧与磨损", spec: "挠度 10–15 mm，无裂纹", abnormalAdvice: "调整张紧或更换皮带，防止打滑造成风量损失与电耗上升" },
      { id: "s3", label: "手术室正压压差", spec: "对相邻区域 ≥ +5 Pa", abnormalAdvice: "立即通知暖通值班复核，保障优先，禁止节能侧处置" },
      { id: "s4", label: "夜间 setback 策略执行", spec: "非手术时段降风量策略生效", abnormalAdvice: "恢复 setback 计划表，保留正压与换气下限，人工复核后生效" },
      { id: "s5", label: "表冷器进出水温差", spec: "4–6 ℃", abnormalAdvice: "检查水阀开度与换热面结垢，安排清洗计划" },
    ],
  },
  {
    id: "IP-D02", name: "ICU 换气与恒温恒湿日巡", freq: "daily", buildingIds: ["surgical"], system: "hvac",
    systemLabel: "ICU 换气", team: "暖通组", points: 12, durationMin: 60, lastDone: "2026-08-03", nextDue: "2026-08-04", keyArea: true,
    medicalSafetyNote: "ICU 换气次数与温湿度下限保持，异常只做人工处置",
    items: [
      { id: "i1", label: "换气次数", spec: "≥ 12 次/h", abnormalAdvice: "复核风机频率与过滤阻力，保障换气下限后再排查能耗" },
      { id: "i2", label: "温湿度", spec: "22–26 ℃ / 40–60 %RH", abnormalAdvice: "校核传感器并检查再热/加湿段运行" },
      { id: "i3", label: "初效过滤网", spec: "无明显积尘堵塞", abnormalAdvice: "清洗或更换过滤网，登记更换台账" },
      { id: "i4", label: "冷凝水盘与排水", spec: "无积水、无霉斑", abnormalAdvice: "疏通排水并消毒处理，防止二次污染" },
      { id: "i5", label: "送排风机运行电流", spec: "额定值 ±10% 以内", abnormalAdvice: "检查轴承与皮带，电流持续偏高转设备工单" },
    ],
  },
  {
    id: "IP-D03", name: "冷站机房日巡", freq: "daily", buildingIds: ["power"], system: "chiller",
    systemLabel: "冷站", team: "冷站运行班", points: 16, durationMin: 80, lastDone: "2026-08-03", nextDue: "2026-08-04", keyArea: true,
    items: [
      { id: "c1", label: "冷冻水供回温差", spec: "≥ 4.5 ℃", abnormalAdvice: "排查末端阀门开度与水泵变频，处理低温差综合征" },
      { id: "c2", label: "冷冻泵变频投入状态", spec: "压差控制自动投入", abnormalAdvice: "恢复变频压差控制，避免工频满转空耗" },
      { id: "c3", label: "冷机蒸发/冷凝压力", spec: "机组允许范围内", abnormalAdvice: "检查冷却水水质与流量，必要时安排清洗冷凝器" },
      { id: "c4", label: "冷却塔风机与布水", spec: "无偏振、布水均匀", abnormalAdvice: "校平衡并疏通布水器，列入周保养复查" },
      { id: "c5", label: "系统日补水量", spec: "≤ 系统容量 1%/日", abnormalAdvice: "联动给排水组分段查漏，核对补水表计" },
    ],
  },
  {
    id: "IP-D04", name: "锅炉房日巡", freq: "daily", buildingIds: ["power"], system: "boiler",
    systemLabel: "锅炉", team: "锅炉运行班", points: 14, durationMin: 70, lastDone: "2026-08-03", nextDue: "2026-08-04", keyArea: true,
    items: [
      { id: "b1", label: "排烟温度", spec: "≤ 基线 +15 ℃（参考 180 ℃）", abnormalAdvice: "安排燃烧调试并清灰，恢复排烟温度至基线" },
      { id: "b2", label: "烟气含氧量", spec: "3–5 %", abnormalAdvice: "校核风燃比与氧量探头，超限持续则转检修工单" },
      { id: "b3", label: "给水泵与阀组", spec: "无渗漏、无异音", abnormalAdvice: "紧固或更换密封件，渗漏点拍照留档" },
      { id: "b4", label: "安全阀与压力表", spec: "铅封完好、在检定期内", abnormalAdvice: "立即停用并联系特种设备检验机构，保障优先" },
      { id: "b5", label: "燃气报警器自检", spec: "自检通过、无报警记录", abnormalAdvice: "更换探头或标定，未恢复前加密人工巡查" },
    ],
  },
  {
    id: "IP-D05", name: "医用气体源站日巡", freq: "daily", buildingIds: ["surgical", "power"], system: "medgas",
    systemLabel: "医气", team: "医用气体组", points: 15, durationMin: 75, lastDone: "2026-08-03", nextDue: "2026-08-04", keyArea: true,
    medicalSafetyNote: "供氧冗余属生命保障红线，异常一律保障优先处置，不做供气侧节能动作",
    items: [
      { id: "m1", label: "液氧罐液位", spec: "≥ 40 %", abnormalAdvice: "启动补液流程并复核用量预测" },
      { id: "m2", label: "备用汇流排压力", spec: "≥ 9.5 bar", abnormalAdvice: "更换减压阀并复测主备切换，保障优先于一切节能动作" },
      { id: "m3", label: "医用空压机组", spec: "加卸载正常、露点达标", abnormalAdvice: "检查干燥机与排水器，露点超标转设备工单" },
      { id: "m4", label: "负压真空机组", spec: "真空度达标、无报警", abnormalAdvice: "切换备用泵并检修主泵" },
      { id: "m5", label: "病区末端压力抽测", spec: "0.40–0.45 MPa", abnormalAdvice: "排查管网泄漏点，联动泄漏检测模块复核" },
    ],
  },
  {
    id: "IP-W01", name: "给排水与阀门周巡", freq: "weekly", buildingIds: ["inpatientA", "inpatientB"], system: "water",
    systemLabel: "给排水", team: "给排水组", points: 26, durationMin: 120, lastDone: "2026-07-30", nextDue: "2026-08-06",
    items: [
      { id: "w1", label: "楼层支路夜间最小流量", spec: "≤ 0.5 m³/h", abnormalAdvice: "夜间分段关阀排查泄漏点，确认后安排停水检修" },
      { id: "w2", label: "关键阀门启闭与锈蚀", spec: "启闭灵活、无渗漏", abnormalAdvice: "除锈润滑或更换阀芯，更新阀门台账" },
      { id: "w3", label: "生活水箱与浮球阀", spec: "无溢流、水质封条完好", abnormalAdvice: "更换浮球阀并复核消毒记录" },
      { id: "w4", label: "加压泵组轮换运行", spec: "主备自动轮换正常", abnormalAdvice: "检修轮换逻辑，防止单泵长期运行" },
    ],
  },
  {
    id: "IP-W02", name: "电梯机房周巡", freq: "weekly", buildingIds: ["inpatientA", "outpatient"], system: "elevator",
    systemLabel: "电梯", team: "配电运行班", points: 10, durationMin: 60, lastDone: "2026-08-01", nextDue: "2026-08-08",
    items: [
      { id: "e1", label: "机房温度", spec: "≤ 35 ℃", abnormalAdvice: "检查机房通风/空调，高温加速电子件老化" },
      { id: "e2", label: "曳引机油位与异音", spec: "油位正常、无异音", abnormalAdvice: "补油并联系维保单位复检" },
      { id: "e3", label: "能量回馈装置状态", spec: "回馈投入、无故障灯", abnormalAdvice: "复位或报修回馈装置，恢复电能回收" },
    ],
  },
  {
    id: "IP-M01", name: "蒸汽疏水阀红外月检", freq: "monthly", buildingIds: ["cssd", "power"], system: "boiler",
    systemLabel: "蒸汽疏水", team: "锅炉运行班", points: 32, durationMin: 150, lastDone: "2026-07-15", nextDue: "2026-08-15",
    items: [
      { id: "t1", label: "疏水阀出口温度（红外）", spec: "< 100 ℃", abnormalAdvice: "更换内漏疏水阀并纳入季度红外复测清单" },
      { id: "t2", label: "凝结水回收率", spec: "≥ 85 %", abnormalAdvice: "排查回收管路与疏水器组，恢复回收率" },
      { id: "t3", label: "管道保温完好度", spec: "无破损、表温 ≤ 50 ℃", abnormalAdvice: "修补保温层，减少散热损失" },
    ],
  },
  {
    id: "IP-M02", name: "照明回路与计量月检", freq: "monthly", buildingIds: ["outpatient", "admin"], system: "lighting",
    systemLabel: "照明/计量", team: "能源计量组", points: 24, durationMin: 100, lastDone: "2026-07-21", nextDue: "2026-08-20",
    items: [
      { id: "l1", label: "公共区照明时控策略", spec: "按时段表执行", abnormalAdvice: "恢复时控策略并抽查回路" },
      { id: "l2", label: "分项计量表通讯", spec: "在线率 100 %", abnormalAdvice: "检修采集网关与总线，缺失区间标记估算值" },
      { id: "l3", label: "应急照明月自检", spec: "自检通过", abnormalAdvice: "更换故障灯具，保障优先" },
    ],
  },
  {
    id: "IP-Q01", name: "冷却塔填料与水质季检", freq: "quarterly", buildingIds: ["power"], system: "chiller",
    systemLabel: "冷站辅机", team: "冷站运行班", points: 8, durationMin: 180, lastDone: "2026-06-12", nextDue: "2026-09-10",
    items: [
      { id: "q1", label: "填料结垢与破损", spec: "无大面积结垢/塌陷", abnormalAdvice: "安排清洗或更换填料，恢复冷却效率" },
      { id: "q2", label: "循环水浓缩倍数", spec: "3–5 倍", abnormalAdvice: "调整排污与加药方案" },
    ],
  },
  {
    id: "IP-Q02", name: "大型医疗设备配电季检", freq: "quarterly", buildingIds: ["imaging"], system: "medical",
    systemLabel: "医疗设备配电", team: "医学工程科", points: 12, durationMin: 150, lastDone: "2026-06-25", nextDue: "2026-09-25",
    medicalSafetyNote: "MRI 磁体冷却回路禁止断电检查，仅做外观与表计核对",
    items: [
      { id: "g1", label: "配电柜触点温升（红外）", spec: "≤ 环境 +25 ℃", abnormalAdvice: "紧固触点并复测，超温转配电工单" },
      { id: "g2", label: "夜间待机功率抽测", spec: "≤ 同型设备基线 +20 %", abnormalAdvice: "与厂商确认安全前提下启用分级待机，禁止自动断电" },
    ],
  },
];

export const planById = Object.fromEntries(inspectionPlans.map((p) => [p.id, p])) as Record<string, InspectionPlan>;

/* ---------------- 今日任务（基准日 2026-08-04：全部日巡 + 1 条工单复测） ---------------- */

export interface InspectionTask {
  id: string;
  planId?: string;
  title: string;
  type: "计划" | "复测";
  window: string;
  points: number;
  team: string;
  buildingIds: BuildingId[];
  system: SystemKind;
  items: CheckItem[];
  relatedWorkOrderId?: string;
  relatedAnomalyId?: string;
  medicalSafetyNote?: string;
}

function taskFromPlan(id: string, planId: string, window: string): InspectionTask {
  const p = planById[planId];
  return {
    id, planId, title: p.name, type: "计划", window, points: p.points, team: p.team,
    buildingIds: p.buildingIds, system: p.system, items: p.items, medicalSafetyNote: p.medicalSafetyNote,
  };
}

export const todayTasks: InspectionTask[] = [
  taskFromPlan("TSK-0804-01", "IP-D01", "08:00–10:00"),
  taskFromPlan("TSK-0804-02", "IP-D02", "10:00–11:30"),
  taskFromPlan("TSK-0804-03", "IP-D03", "09:00–11:00"),
  taskFromPlan("TSK-0804-04", "IP-D04", "08:00–09:30"),
  taskFromPlan("TSK-0804-05", "IP-D05", "07:30–09:00"),
  {
    id: "TSK-0804-06", title: "住院B 5F 夜间最小流量复测", type: "复测", window: "22:30–23:30（夜间流量窗口）",
    points: 3, team: "给排水组", buildingIds: ["inpatientB"], system: "water",
    relatedWorkOrderId: "WO-2026-0714", relatedAnomalyId: "AN-003",
    items: [
      { id: "r1", label: "5F 支路夜间最小流量", spec: "≤ 0.5 m³/h", abnormalAdvice: "维持关阀排查，锁定漏点后安排停水窗口检修" },
      { id: "r2", label: "分段关阀排查记录", spec: "完成 3 段排查并留痕", abnormalAdvice: "补做未完成分段，更新排查记录" },
      { id: "r3", label: "卫生间末端器具", spec: "无明漏、水箱无长流水", abnormalAdvice: "更换阀芯/浮球，复核夜间流量回落" },
    ],
  },
];

export const taskById = Object.fromEntries(todayTasks.map((t) => [t.id, t])) as Record<string, InspectionTask>;

/* ---------------- 巡检问题-能效关联（联动区） ---------------- */

export interface EfficiencyLink {
  id: string;
  /** 巡检发现描述 */
  finding: string;
  /** 图表横轴短名 */
  short: string;
  deviceId: string;
  kind: EnergyKind;
  anomalyId?: string;
  workOrderId?: string;
  /** 发现来源（计划/日期） */
  foundBy: string;
  /** 影响机理一句话 */
  mechanism: string;
  /** 无异常链时的固定工程估算（品种单位/日） */
  fixedExtraPerDay?: number;
  estimateNote?: string;
}

export const efficiencyLinks: EfficiencyLink[] = [
  {
    id: "LNK-01", finding: "净化空调过滤器阻力偏高 + 夜间未降风量", short: "过滤/降风",
    deviceId: "DEV-SUR-AHU-03", kind: "electricity", anomalyId: "AN-001", workOrderId: "WO-2026-0712",
    foundBy: "IP-D01 日巡 · 2026-07-19", mechanism: "夜间维持全风量运行，风机电耗高于 setback 基线",
  },
  {
    id: "LNK-02", finding: "3# 冷冻泵变频退出，低温差高流量", short: "泵变频",
    deviceId: "DEV-PWR-PUMP-03", kind: "electricity", anomalyId: "AN-002", workOrderId: "WO-2026-0713",
    foundBy: "IP-D03 日巡 · 2026-07-03", mechanism: "工频满转输送冗余流量，泵耗与冷机 COP 同时恶化",
  },
  {
    id: "LNK-03", finding: "住院B 5F 支路阀门/暗管泄漏", short: "阀门泄漏",
    deviceId: "DEV-IPB-VALVE-5F", kind: "water", anomalyId: "AN-003", workOrderId: "WO-2026-0714",
    foundBy: "IP-W01 周巡 · 2026-07-28", mechanism: "夜间最小流量抬升，泄漏水量直接计入楼层用水",
  },
  {
    id: "LNK-04", finding: "2# 锅炉风燃比漂移 + 受热面积灰", short: "锅炉燃烧",
    deviceId: "DEV-PWR-BLR-02", kind: "gas", anomalyId: "AN-004", workOrderId: "WO-2026-0715",
    foundBy: "IP-D04 日巡 · 2026-07-11", mechanism: "排烟温度与含氧量双高，同蒸汽量燃气消耗上升",
  },
  {
    id: "LNK-05", finding: "消供 7# 蒸汽疏水阀内漏", short: "疏水阀",
    deviceId: "DEV-CSD-TRAP-07", kind: "heat", anomalyId: "AN-007", workOrderId: "WO-2026-0718",
    foundBy: "IP-M01 红外月检 · 2026-07-06", mechanism: "蒸汽直排损失热量，凝结水回收率同步下降",
  },
  {
    id: "LNK-06", finding: "门诊组合式空调皮带松动打滑", short: "皮带松动",
    deviceId: "DEV-OUT-AHU-01", kind: "electricity",
    foundBy: "IP-D01 顺检 · 2026-08-02", mechanism: "皮带打滑导致风量下降、风机延时运行补偿",
    fixedExtraPerDay: Math.round(deviceById["DEV-OUT-AHU-01"].ratedPowerKw * 12 * 0.03 * 10) / 10,
    estimateNote: "按皮带打滑 3% × 日运行 12h × 额定功率工程估算",
  },
];

export interface LinkImpact {
  /** 额外用量（品种单位/日） */
  extraUsage: number;
  /** 额外碳排 kgCO2e/日（合规口径，水/医气为 0） */
  extraCarbonKg: number;
  /** 额外成本 元/日 */
  extraCostYuan: number;
  active: boolean;
}

/** 按异常注入系数与当日实际用量反推该问题的额外能耗/碳排/成本（模拟诊断口径） */
export function linkImpact(link: EfficiencyLink, date: string): LinkImpact {
  let extra = 0;
  let active = true;
  if (link.anomalyId) {
    const a = anomalyById[link.anomalyId];
    if (!a || a.factor === 1 || date < a.from || (a.to && date > a.to)) {
      active = false;
    } else {
      const span = a.hours ? (a.hours[1] > a.hours[0] ? a.hours[1] - a.hours[0] : 24 - a.hours[0] + a.hours[1]) : 24;
      const dayFactor = a.hours ? 1 + (a.factor - 1) * (span / 24) : a.factor;
      const usage = dailyUsage(a.buildingId, a.energyKind, date);
      extra = usage * (1 - 1 / dayFactor);
    }
  } else {
    extra = link.fixedExtraPerDay ?? 0;
  }
  const extraCarbonKg = extra * activeFactors[link.kind];
  const extraCostYuan = extra * energyKindMeta[link.kind].price;
  return {
    extraUsage: Math.round(extra * 10) / 10,
    extraCarbonKg: Math.round(extraCarbonKg * 10) / 10,
    extraCostYuan: Math.round(extraCostYuan),
    active,
  };
}

/* ---------------- 执行记录（类型 + 种子，供 stores/inspection.ts 使用） ---------------- */

export const DEMO_GPS = "北纬 39.9066°，东经 116.3812°（院区固定演示坐标，未调用真实定位）";

export interface InspectItemResult {
  itemId: string;
  result: "" | "normal" | "abnormal";
  note: string;
}

export interface SimPhoto {
  id: string;
  label: string;
  at: string;
  origin: "sim" | "file";
  meta?: string;
}

export interface SimAudio {
  id: string;
  durationSec: number;
  at: string;
  origin: "sim" | "file";
  meta?: string;
}

export interface TaskRecord {
  taskId: string;
  status: "claimed" | "done";
  claimedBy: string;
  claimedAt: string;
  items: InspectItemResult[];
  photos: SimPhoto[];
  audios: SimAudio[];
  gps?: string;
  submittedAt?: string;
}

/** 种子：两条已完成记录，与异常链 AN-004 / AN-005 的证据保持一致 */
export const seedInspectionRecords: Record<string, TaskRecord> = {
  "TSK-0804-04": {
    taskId: "TSK-0804-04", status: "done", claimedBy: "陈工（锅炉班）", claimedAt: "2026-08-04 08:05",
    items: [
      { itemId: "b1", result: "abnormal", note: "排烟温度 208 ℃，较基线高约 28 ℃" },
      { itemId: "b2", result: "abnormal", note: "烟气含氧量 8.1%，超出 3–5% 目标区间" },
      { itemId: "b3", result: "normal", note: "" },
      { itemId: "b4", result: "normal", note: "" },
      { itemId: "b5", result: "normal", note: "" },
    ],
    photos: [
      { id: "IMG_20260804_01", label: "2# 锅炉烟温表计（模拟占位）", at: "08:31", origin: "sim" },
      { id: "IMG_20260804_02", label: "燃烧器风门刻度（模拟占位）", at: "08:36", origin: "sim" },
    ],
    audios: [{ id: "REC_20260804_01", durationSec: 52, at: "08:40", origin: "sim" }],
    gps: DEMO_GPS,
    submittedAt: "2026-08-04 09:12",
  },
  "TSK-0804-05": {
    taskId: "TSK-0804-05", status: "done", claimedBy: "孙工（医气组）", claimedAt: "2026-08-04 07:40",
    items: [
      { itemId: "m1", result: "normal", note: "" },
      { itemId: "m2", result: "abnormal", note: "备用汇流排 8.2 bar，低于 9.5 bar 下限，已联动工单 WO-2026-0716" },
      { itemId: "m3", result: "normal", note: "" },
      { itemId: "m4", result: "normal", note: "" },
      { itemId: "m5", result: "normal", note: "" },
    ],
    photos: [{ id: "IMG_20260804_03", label: "备用汇流排压力表（模拟占位）", at: "08:02", origin: "sim" }],
    audios: [],
    gps: DEMO_GPS,
    submittedAt: "2026-08-04 08:30",
  },
};
