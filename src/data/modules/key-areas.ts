// 重点区域能耗管理（key-areas）静态领域数据。
// 只放不随时间变化的资产参数与演示配置；所有时序数值一律走 services/timeseries。
// 分摊比例（PURIFICATION_SHARE / ICU_METER_SHARE）为演示估算常量，界面必须标注"演示分摊"。

/** 净化空调占手术医技楼电耗比（演示估算） */
export const PURIFICATION_SHARE = 0.46;
/** ICU 区域计量电耗占手术医技楼电耗比（演示估算） */
export const ICU_METER_SHARE = 0.08;
export const ICU_BEDS = 24;

/** AN-001（夜间未 setback）生效日 2026-07-18 之前的正常工作日，作对比基线 */
export const OR_BASELINE_DATE = "2026-07-10";

// ---------- 手术室 ----------

export interface CleanZone {
  id: string;
  /** 洁净级别（GB 50333 分级，演示配置） */
  level: string;
  /** 手术间数；0 = 辅助区域 */
  rooms: number;
  ahuDeviceId?: string;
  ahuLabel: string;
  /** 净化电耗分摊权重（按机组额定功率） */
  weight: number;
  airChangeStd: string;
  pressureStd: string;
  /** 当前环境读数（演示静态快照） */
  env: { tempC: number; rhPct: number; pressurePa: number; particleOk: boolean };
  envNote?: string;
}

export const cleanZones: CleanZone[] = [
  {
    id: "class100", level: "百级（Ⅰ 级）", rooms: 4,
    ahuDeviceId: "DEV-SUR-AHU-01", ahuLabel: "AHU-01", weight: 90,
    airChangeStd: "手术区断面风速 0.20-0.25 m/s", pressureStd: "对相邻 ≥ +8 Pa",
    env: { tempC: 22.6, rhPct: 48, pressurePa: 8.4, particleOk: true },
  },
  {
    id: "class10k", level: "万级（Ⅲ 级）", rooms: 8,
    ahuDeviceId: "DEV-SUR-AHU-03", ahuLabel: "AHU-03", weight: 75,
    airChangeStd: "换气 18-22 次/h", pressureStd: "对相邻 ≥ +5 Pa",
    env: { tempC: 23.9, rhPct: 61.8, pressurePa: 5.6, particleOk: true },
    envNote: "湿度超上限（40-60%），已通知暖通组核查表冷段",
  },
  {
    id: "orSwitch", level: "正负压转换（Ⅲ 级）", rooms: 1,
    ahuDeviceId: "DEV-SUR-OR-03", ahuLabel: "OR-03 专用机组", weight: 45,
    airChangeStd: "换气 18-22 次/h", pressureStd: "正压 +5 Pa / 负压 −5 Pa 可切换",
    env: { tempC: 23.2, rhPct: 54, pressurePa: 6.1, particleOk: true },
    envNote: "08-02 压差短时波动已闭环（AN-009）",
  },
  {
    id: "aux", level: "三十万级辅助区（Ⅳ 级）", rooms: 0,
    ahuLabel: "分散小机组", weight: 30,
    airChangeStd: "换气 12-15 次/h", pressureStd: "梯度正压 ≥ +5 Pa",
    env: { tempC: 24.5, rhPct: 55, pressurePa: 5.2, particleOk: true },
  },
];

/** 分时段定义（24h 制，[start, end)；end < start 表示跨零点） */
export const orPhases: { id: string; name: string; hours: [number, number] }[] = [
  { id: "pre", name: "术前准备", hours: [7, 9] },
  { id: "op", name: "手术中", hours: [9, 17] },
  { id: "post", name: "术后清洁", hours: [17, 20] },
  { id: "idle", name: "非使用时段", hours: [22, 6] },
];

export interface OrEquipCard {
  id: string;
  name: string;
  count: number;
  unitKw: number;
  /** 平均每台次手术使用小时数 */
  hoursPerSurgery: number;
  note: string;
  safety?: boolean;
}

export const orEquipCards: OrEquipCard[] = [
  { id: "shadowless", name: "无影灯（卤素）", count: 14, unitKw: 0.9, hoursPerSurgery: 2.1, note: "LED 改造后单台功率可降约 65%，已列入节能建议库" },
  { id: "anesthesia", name: "麻醉机", count: 16, unitKw: 0.35, hoursPerSurgery: 2.4, note: "含麻醉气体监测模块；术间待机约 0.08 kW" },
  { id: "monitor", name: "监护设备（手术部）", count: 18, unitKw: 0.15, hoursPerSurgery: 2.6, note: "生命支持相关，不列入任何节能调整范围", safety: true },
];

// ---------- ICU ----------

export type IcuTier = "life" | "treat" | "aux";

export interface IcuDeviceRow {
  tier: IcuTier;
  name: string;
  count: number;
  unitKw: number;
  /** 日运行小时（恒温恒湿机组为等效满负荷小时） */
  hoursPerDay: number;
  note?: string;
}

export const icuTierMeta: Record<IcuTier, { name: string; policy: string; tone: "danger" | "warn" | "ok" }> = {
  life: { name: "生命支持", policy: "禁止任何节能调整", tone: "danger" },
  treat: { name: "治疗设备", policy: "仅限医护批准的排程优化", tone: "warn" },
  aux: { name: "辅助设备", policy: "可优化（不触碰感染控制参数）", tone: "ok" },
};

export const icuDevices: IcuDeviceRow[] = [
  { tier: "life", name: "有创呼吸机", count: 18, unitKw: 0.32, hoursPerDay: 24 },
  { tier: "life", name: "ECMO", count: 2, unitKw: 1.5, hoursPerDay: 24 },
  { tier: "life", name: "CRRT 血液净化", count: 4, unitKw: 0.45, hoursPerDay: 20 },
  { tier: "life", name: "多参数监护仪", count: 24, unitKw: 0.15, hoursPerDay: 24 },
  { tier: "treat", name: "输液泵工作站", count: 48, unitKw: 0.04, hoursPerDay: 24 },
  { tier: "treat", name: "亚低温治疗仪", count: 3, unitKw: 1.2, hoursPerDay: 10 },
  { tier: "treat", name: "排痰/康复治疗设备", count: 6, unitKw: 0.25, hoursPerDay: 6 },
  { tier: "aux", name: "恒温恒湿机组（DEV-SUR-ICU-AHU）", count: 1, unitKw: 60, hoursPerDay: 13.9, note: "等效满负荷小时；独立冷热源" },
  { tier: "aux", name: "照明（夜间调光）", count: 1, unitKw: 4.5, hoursPerDay: 24 },
  { tier: "aux", name: "电动病床与气垫", count: 24, unitKw: 0.08, hoursPerDay: 24 },
];

/** ICU 环境与净化参数（演示静态快照） */
export const icuEnv = {
  airChangeDesign: 12,
  airChangeMeasured: 12.4,
  pressureDesignPa: 5,
  pressureMeasuredPa: 6.2,
  tempSetC: 24,
  tempMeasuredC: 23.8,
  rhSetPct: 55,
  rhMeasuredPct: 52,
  coolingSource: "独立风冷热泵 2 台（1 用 1 备，互为冗余）",
};

/** 温控模拟：制冷季每提高 1℃ 设定，恒温恒湿机组能耗变化比例（演示系数） */
export const ICU_TEMP_SAVING_PER_DEG = 0.06;
export const ICU_TEMP_MIN = 22;
export const ICU_TEMP_MAX = 26;
export const ICU_TEMP_DEFAULT = 24;

/** 余热利用评估参数（演示） */
export const icuWasteHeat = {
  condenserHeatRatio: 2.9, // 冷凝热 ≈ 压缩机电耗 × 该倍率
  recoveryRatio: 0.35,     // 可回收比例
  seasonDays: 150,         // 制冷季天数
  gasLhvGjPerM3: 0.038931, // 天然气低位热值 GJ/m³
  boilerEff: 0.9,
  investWanYuan: 18,
  confidencePct: 76,
};

// ---------- 大型医疗设备 ----------

export interface LargeEquipSpec {
  deviceId: string;
  short: string;
  modality: string;
  /** 单次检查能耗估算 kWh（含重建/冷却增量，演示参数） */
  scanKwh: number;
  scanMin: number;
  /** 同型设备待机功率基线 kW */
  baselineStandbyKw: number;
  /** 基准业务日检查次数 */
  dailyExamBase: number;
}

export const largeEquipSpecs: LargeEquipSpec[] = [
  { deviceId: "DEV-IMG-CT-01", short: "CT-01", modality: "CT（128 层 · 2021）", scanKwh: 2.6, scanMin: 8, baselineStandbyKw: 6, dailyExamBase: 118 },
  { deviceId: "DEV-IMG-CT-02", short: "CT-02", modality: "CT（64 层 · 2017）", scanKwh: 3.4, scanMin: 10, baselineStandbyKw: 7, dailyExamBase: 76 },
  { deviceId: "DEV-IMG-MRI-01", short: "MRI-01", modality: "MRI（3.0T · 2022）", scanKwh: 16, scanMin: 35, baselineStandbyKw: 12, dailyExamBase: 42 },
  { deviceId: "DEV-IMG-MRI-02", short: "MRI-02", modality: "MRI（1.5T · 2016）", scanKwh: 19, scanMin: 40, baselineStandbyKw: 13, dailyExamBase: 31 },
  { deviceId: "DEV-IMG-DSA-01", short: "DSA-01", modality: "DSA（介入 · 2019）", scanKwh: 8.5, scanMin: 45, baselineStandbyKw: 4, dailyExamBase: 14 },
  { deviceId: "DEV-IMG-LA-01", short: "LA-01", modality: "直线加速器（2021）", scanKwh: 12, scanMin: 15, baselineStandbyKw: 9, dailyExamBase: 38 },
];

export interface SleepStrategy {
  id: string;
  name: string;
  targets: string;
  savingMwhPerYear: number;
  risk: "low" | "medium";
  safetyNote: string;
  status: string;
}

export const sleepStrategies: SleepStrategy[] = [
  { id: "nightSleep", name: "夜间分级休眠", targets: "CT-01 / CT-02 / DSA-01", savingMwhPerYear: 18.6, risk: "low", safetyNote: "MRI 除外：磁体冷却禁止断电，仅可用厂商节能待机模式", status: "试点中" },
  { id: "appointment", name: "预约制集中运行", targets: "MRI-01 / MRI-02 / LA-01", savingMwhPerYear: 12.4, risk: "low", safetyNote: "急诊绿色通道保留即时开机能力", status: "评估中" },
  { id: "gapIdle", name: "检查间隙自动降功耗", targets: "CT-01 / CT-02", savingMwhPerYear: 6.8, risk: "medium", safetyNote: "复位时间 ≤ 90 秒，不影响预约节奏", status: "评估中" },
];

// ---------- 旁路 / 冗余（只读展示） ----------

export interface RedundancyRow {
  area: string;
  main: string;
  backup: string;
  status: "ok" | "bypass" | "fault";
  lastTest: string;
  result: string;
}

export const redundancyRows: RedundancyRow[] = [
  { area: "手术部净化配电（一级负荷）", main: "市电 A 段", backup: "市电 B 段 + 柴油发电机（15s 自启）", status: "ok", lastTest: "2026-07-15", result: "切换测试通过" },
  { area: "手术部 AHU-03 净化机组", main: "AHU-03（故障检修中）", backup: "备用机组旁路供风", status: "bypass", lastTest: "2026-08-03", result: "旁路运行中，压差保持达标" },
  { area: "ICU 双回路 + UPS", main: "双回路自动切换（ATS）", backup: "在线式 UPS（电池 SOH 91%）", status: "ok", lastTest: "2026-06-30", result: "切换测试通过" },
  { area: "影像中心 MRI 冷却保障电源", main: "专用回路", backup: "UPS + 冷头保持电源", status: "ok", lastTest: "2026-07-20", result: "切换测试通过" },
  { area: "氧气备用汇流排（医气冗余）", main: "液氧罐主供", backup: "备用汇流排", status: "fault", lastTest: "2026-08-01", result: "切换测试未通过（AN-005 处置中）" },
];
