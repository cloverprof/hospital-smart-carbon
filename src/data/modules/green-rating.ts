// 绿色低碳医院评价：评价体系静态定义（演示口径）。
// 全部阈值均为演示参数，待标准确认后方可用于正式判定（MASTER_SPEC 6.2.2）。
// 指标类条目（metric 字段）的现状值与判定由页面从数据层计算，本文件只放定义。

export type RatingTier = "L1" | "L2" | "L3" | "bonus";
export type DimensionId = "mgmt" | "energy" | "water" | "ghg" | "env" | "innov";
export type ItemState = "met" | "partial" | "unmet";
export type MetricKey = "areaEnergy" | "bedWater" | "areaCarbon" | "bedCarbon";
export type HospitalLevelId = "tier1" | "tier2" | "tier3";
export type ClimateZoneId = "severeCold" | "cold" | "hotSummerColdWinter" | "hotSummerWarmWinter" | "mild";

export const tierOrder: RatingTier[] = ["L1", "L2", "L3", "bonus"];

export const tierMeta: Record<RatingTier, { name: string; desc: string }> = {
  L1: { name: "L1 绿色医院基础", desc: "合规前置文件、管理体系、绿化与照明/空调能效、计量器具配备，是评价的准入层。" },
  L2: { name: "L2 能源与资源", desc: "单位面积能耗、床日耗水、数字化流程、绿色采购与雨水/中水回用。" },
  L3: { name: "L3 温室气体控制", desc: "范围1+2核查、排放强度、充电设施、光伏/绿电、自主减排与碳普惠。" },
  bonus: { name: "创新加分", desc: "储能应急、可持续发展报告、逸散性气体控制、污水沼气利用等引领性实践。" },
};

/** 雷达图六维 */
export const dimensions: { id: DimensionId; name: string }[] = [
  { id: "mgmt", name: "合规与管理" },
  { id: "energy", name: "能效水平" },
  { id: "water", name: "资源与水" },
  { id: "ghg", name: "温室气体" },
  { id: "env", name: "环境与绿建" },
  { id: "innov", name: "创新引领" },
];

export const stateMeta: Record<ItemState, { label: string; tone: "ok" | "warn" | "info" | "muted"; factor: number }> = {
  met: { label: "演示达标", tone: "ok", factor: 1 },
  partial: { label: "演示部分达标", tone: "warn", factor: 0.5 },
  unmet: { label: "演示未达标", tone: "muted", factor: 0 },
};

export interface RatingItemDef {
  id: string;
  tier: RatingTier;
  dimension: DimensionId;
  name: string;
  /** 要求文字（指标类条目由页面按当前演示参数动态生成） */
  requirement: string;
  /** 现状/证据摘要（指标类与项目联动类由页面动态生成） */
  current: string;
  maxScore: number;
  /** 非指标类条目的默认判定（指标类由计算得出） */
  defaultState: ItemState;
  /** 指标类：由数据层计算判定 */
  metric?: MetricKey;
  /** 引用需求文档参数（16 / 370 / 55 等），必须标"演示参数，待标准确认" */
  docParam?: boolean;
  /** 现状值联动项目库 */
  projectLinked?: boolean;
  evidence: string[];
}

// L1 满分 30 / L2 满分 35 / L3 满分 35 / 创新加分 10
export const ratingItems: RatingItemDef[] = [
  // ---------- L1 绿色医院基础（30 分） ----------
  {
    id: "L1-01", tier: "L1", dimension: "mgmt", name: "合规前置文件",
    requirement: "环评批复、排污许可、消防与竣工验收等前置文件齐全且在有效期内",
    current: "12 份前置文件在有效期内（演示台账，见合规凭证看板）",
    maxScore: 5, defaultState: "met",
    evidence: ["环评批复文件", "排污许可证", "消防验收意见书", "竣工验收备案表"],
  },
  {
    id: "L1-02", tier: "L1", dimension: "mgmt", name: "能碳管理体系",
    requirement: "设置专职能源管理机构，制度覆盖计量、统计、考核与碳管理",
    current: "能源管理办公室已设立，5 项制度文件发布（演示）",
    maxScore: 4, defaultState: "met",
    evidence: ["管理机构任命文件", "能源与碳管理制度汇编", "年度考核记录"],
  },
  {
    id: "L1-03", tier: "L1", dimension: "mgmt", name: "计量器具配备与检定",
    requirement: "一级表 100%、二级表 ≥95%、三级表 ≥90%，按期检定（演示阈值）",
    current: "配备率 98.7%，1,286 个有效测点（演示）",
    maxScore: 5, defaultState: "met",
    evidence: ["计量器具台账", "检定证书抽样", "计量网络图"],
  },
  {
    id: "L1-04", tier: "L1", dimension: "env", name: "绿化率",
    requirement: "绿化率 ≥30%（演示参数，待标准确认）",
    current: "32.6%（演示测绘值）",
    maxScore: 3, defaultState: "met",
    evidence: ["绿化面积测绘图", "植被养护记录"],
  },
  {
    id: "L1-05", tier: "L1", dimension: "energy", name: "高效照明覆盖",
    requirement: "LED 等高效光源覆盖 ≥80%，公共区域分区分时控制（演示阈值）",
    current: "LED 覆盖 76%，地下车库与走廊已分时控制（演示）",
    maxScore: 4, defaultState: "partial",
    evidence: ["照明改造清单", "照度检测报告", "分时控制策略记录"],
  },
  {
    id: "L1-06", tier: "L1", dimension: "energy", name: "空调与冷站能效",
    requirement: "冷站综合 COP ≥4.5 或机组能效达 2 级（演示阈值）",
    current: "冷站综合 COP 4.72（演示实测，见重点系统监测）",
    maxScore: 5, defaultState: "met",
    evidence: ["冷站群控能效报表", "机组能效铭牌", "第三方能效检测报告"],
  },
  {
    id: "L1-07", tier: "L1", dimension: "env", name: "围护结构与遮阳",
    requirement: "外窗遮阳与围护结构热工性能满足所在气候区要求（演示）",
    current: "3/10 栋楼宇完成外遮阳与门窗改造（演示）",
    maxScore: 2, defaultState: "partial",
    evidence: ["围护结构检测报告", "改造竣工资料"],
  },
  {
    id: "L1-08", tier: "L1", dimension: "mgmt", name: "培训与应急预案",
    requirement: "年度节能培训 ≥2 次，能源应急预案演练 ≥1 次（演示阈值）",
    current: "2025 年培训 3 次、应急演练 2 次（演示）",
    maxScore: 2, defaultState: "met",
    evidence: ["培训签到与课件", "应急演练总结"],
  },

  // ---------- L2 能源与资源（35 分） ----------
  {
    id: "L2-01", tier: "L2", dimension: "energy", name: "单位面积综合能耗",
    requirement: "（由演示参数动态生成）",
    current: "（由数据层测算）",
    maxScore: 8, defaultState: "unmet", metric: "areaEnergy", docParam: true,
    evidence: ["能耗分项计量报表", "折标煤计算底稿", "建筑面积台账"],
  },
  {
    id: "L2-02", tier: "L2", dimension: "water", name: "床日耗水量",
    requirement: "（由演示参数动态生成）",
    current: "（由数据层测算）",
    maxScore: 6, defaultState: "unmet", metric: "bedWater", docParam: true,
    evidence: ["水表分区台账", "占用床日统计报表"],
  },
  {
    id: "L2-03", tier: "L2", dimension: "mgmt", name: "数字化能碳流程",
    requirement: "能耗在线监测覆盖主要楼宇，核算与报表流程线上化",
    current: "10/10 栋楼宇在线计量，碳核算工作台已上线（演示）",
    maxScore: 5, defaultState: "met",
    evidence: ["测点覆盖清单", "平台流程截图"],
  },
  {
    id: "L2-04", tier: "L2", dimension: "mgmt", name: "绿色采购",
    requirement: "绿色采购制度发布并落地，节能产品优先采购（演示）",
    current: "制度已发布，2025 年绿色采购金额占比 41%（演示）",
    maxScore: 4, defaultState: "partial",
    evidence: ["绿色采购制度文件", "采购台账抽样"],
  },
  {
    id: "L2-05", tier: "L2", dimension: "water", name: "雨水/中水回用",
    requirement: "设置雨水或中水回用设施并稳定运行（演示）",
    current: "雨水回用于绿化浇灌，回用率 8.4%（演示）",
    maxScore: 5, defaultState: "partial",
    evidence: ["回用系统竣工图", "回用水量计量记录"],
  },
  {
    id: "L2-06", tier: "L2", dimension: "water", name: "节水器具普及率",
    requirement: "节水型器具普及率 ≥95%（演示阈值）",
    current: "96%（演示抽查）",
    maxScore: 3, defaultState: "met",
    evidence: ["器具抽查记录", "采购规格证明"],
  },
  {
    id: "L2-07", tier: "L2", dimension: "energy", name: "输配系统变频改造",
    requirement: "水泵、风机、电梯等主要动力设备完成变频或群控（演示）",
    current: "冷冻水泵群控 + 12 台电梯能量回馈（演示）",
    maxScore: 4, defaultState: "met",
    evidence: ["改造验收单", "运行节能对比报表"],
  },

  // ---------- L3 温室气体控制（35 分） ----------
  {
    id: "L3-01", tier: "L3", dimension: "ghg", name: "范围1+2 年度核查",
    requirement: "完成年度 Scope1+2 核算并留存 MRV 证据链",
    current: "2025 年度核算批次已归档（演示，见碳核算工作台）",
    maxScore: 6, defaultState: "met",
    evidence: ["年度核算报告", "MRV 证据包", "因子版本记录"],
  },
  {
    id: "L3-02", tier: "L3", dimension: "ghg", name: "单位面积碳排强度",
    requirement: "（由演示参数动态生成）",
    current: "（由数据层测算）",
    maxScore: 7, defaultState: "unmet", metric: "areaCarbon", docParam: true,
    evidence: ["碳核算底稿", "建筑面积台账"],
  },
  {
    id: "L3-03", tier: "L3", dimension: "ghg", name: "床日碳排强度",
    requirement: "（按医院等级×气候区演示阈值动态生成）",
    current: "（由数据层测算）",
    maxScore: 4, defaultState: "unmet", metric: "bedCarbon",
    evidence: ["碳核算底稿", "占用床日统计报表"],
  },
  {
    id: "L3-04", tier: "L3", dimension: "ghg", name: "新能源充电设施",
    requirement: "充电车位配建比 ≥10%（演示阈值）",
    current: "配建比 12%，48 个充电位（演示）",
    maxScore: 4, defaultState: "met",
    evidence: ["车位配建图", "充电桩验收资料"],
  },
  {
    id: "L3-05", tier: "L3", dimension: "ghg", name: "光伏与绿电",
    requirement: "光伏装机或绿电采购占比 ≥10%（演示阈值）",
    current: "光伏 380 kWp 并网，绿电占比 6.2%（演示）",
    maxScore: 6, defaultState: "partial",
    evidence: ["并网验收单", "绿电交易凭证"],
  },
  {
    id: "L3-06", tier: "L3", dimension: "ghg", name: "自主减排项目",
    requirement: "建立减排项目库并开展 M&V 核验（演示）",
    current: "（由项目库联动生成）",
    maxScore: 5, defaultState: "met", projectLinked: true,
    evidence: ["项目库台账", "M&V 核验报告"],
  },
  {
    id: "L3-07", tier: "L3", dimension: "innov", name: "碳普惠与行为减排",
    requirement: "开展职工/患者碳普惠或行为节能活动（演示）",
    current: "职工低碳积分小程序试点中（演示）",
    maxScore: 3, defaultState: "partial",
    evidence: ["活动方案", "参与人数统计"],
  },

  // ---------- 创新加分（10 分） ----------
  {
    id: "B-01", tier: "bonus", dimension: "innov", name: "储能与应急保障",
    requirement: "配置储能并纳入应急保障体系（演示）",
    current: "500 kWh 电化学储能在建，UPS 覆盖手术区（演示）",
    maxScore: 3, defaultState: "partial",
    evidence: ["储能项目立项文件", "应急保障预案"],
  },
  {
    id: "B-02", tier: "bonus", dimension: "innov", name: "可持续发展报告",
    requirement: "定期发布医院可持续发展/社会责任报告（演示）",
    current: "2025 年度可持续发展报告已发布（演示）",
    maxScore: 2, defaultState: "met",
    evidence: ["报告文本", "发布记录"],
  },
  {
    id: "B-03", tier: "bonus", dimension: "innov", name: "逸散性气体控制",
    requirement: "麻醉气体、制冷剂等逸散源建立台账并回收（演示，扩展边界）",
    current: "麻醉气体回收试点 2 间手术室（演示，不计入合规总量）",
    maxScore: 3, defaultState: "partial",
    evidence: ["逸散源台账", "回收装置运行记录"],
  },
  {
    id: "B-04", tier: "bonus", dimension: "innov", name: "污水处理沼气利用",
    requirement: "污水处理沼气回收利用（演示）",
    current: "未实施；动力中心污水站具备改造条件（演示）",
    maxScore: 2, defaultState: "unmet",
    evidence: ["可行性初判材料"],
  },
];

/** 文档引用参数默认值（16 kgce/m²·a、370 L/床日、55 kgCO2/m²·a）——演示参数，待标准确认 */
export const docParamDefaults = { areaEnergy: 16, bedWater: 370, areaCarbon: 55 } as const;

export interface BenchmarkTriple {
  constraint: number;
  average: number;
  advanced: number;
}

export const hospitalLevels: { id: HospitalLevelId; name: string }[] = [
  { id: "tier3", name: "三级医院" },
  { id: "tier2", name: "二级医院" },
  { id: "tier1", name: "一级医院" },
];

export const climateZones: { id: ClimateZoneId; name: string; factor: number }[] = [
  { id: "severeCold", name: "严寒地区", factor: 1.15 },
  { id: "cold", name: "寒冷地区", factor: 1 },
  { id: "hotSummerColdWinter", name: "夏热冬冷地区", factor: 0.92 },
  { id: "hotSummerWarmWinter", name: "夏热冬暖地区", factor: 0.88 },
  { id: "mild", name: "温和地区", factor: 0.8 },
];

// 三线对标基准（寒冷地区口径，其余气候区按 factor 缩放）。均为演示参数，待标准确认。
const benchmarkBase: Record<HospitalLevelId, { areaCarbon: BenchmarkTriple; bedCarbon: BenchmarkTriple }> = {
  tier3: {
    areaCarbon: { constraint: 210, average: 172, advanced: 128 },
    bedCarbon: { constraint: 140, average: 118, advanced: 92 },
  },
  tier2: {
    areaCarbon: { constraint: 180, average: 150, advanced: 110 },
    bedCarbon: { constraint: 115, average: 95, advanced: 75 },
  },
  tier1: {
    areaCarbon: { constraint: 150, average: 120, advanced: 90 },
    bedCarbon: { constraint: 90, average: 75, advanced: 60 },
  },
};

/** 按医院等级 × 气候区生成三线阈值（演示映射） */
export function benchmarkFor(level: HospitalLevelId, zone: ClimateZoneId): { areaCarbon: BenchmarkTriple; bedCarbon: BenchmarkTriple } {
  const base = benchmarkBase[level] ?? benchmarkBase.tier3;
  const f = climateZones.find((z) => z.id === zone)?.factor ?? 1;
  const scale = (t: BenchmarkTriple): BenchmarkTriple => ({
    constraint: Math.round(t.constraint * f),
    average: Math.round(t.average * f),
    advanced: Math.round(t.advanced * f),
  });
  return { areaCarbon: scale(base.areaCarbon), bedCarbon: scale(base.bedCarbon) };
}

/** 演示评级（不构成合规结论） */
export function ratingOf(score: number): { label: string; tone: "ok" | "info" | "warn" } {
  if (score >= 90) return { label: "演示评级：三星", tone: "ok" };
  if (score >= 75) return { label: "演示评级：二星", tone: "ok" };
  if (score >= 60) return { label: "演示评级：一星", tone: "info" };
  return { label: "演示评级：未达星级", tone: "warn" };
}
