import type { Project } from "../types/core";

// 节能/减碳项目库种子。异常链 AN-001/006/007 分别关联 PRJ-2026-09/11/10。
export const projectSeeds: Project[] = [
  {
    id: "PRJ-2026-09", name: "手术部净化空调非术时段变风量（setback）改造", source: "diagnosis",
    buildingIds: ["surgical"], system: "purification", stage: "design", owner: "王工（暖通组）",
    investmentWanYuan: 68, annualSavingMwh: 181.9, annualSavingWanYuan: 11.6,
    annualCarbonReductionT: 110.9, paybackYears: 5.9, createdAt: "2026-07-25", workOrderId: "WO-2026-0712", anomalyId: "AN-001",
    calcParams: { baselineMwh: 758, savingRatePct: 24, factor: 0.6096, price: 0.72, investment: 68, omCost: 1.5, lifeYears: 10, discountPct: 6 },
  },
  {
    id: "PRJ-2026-10", name: "蒸汽疏水阀普查更换与凝结水回收提升", source: "diagnosis",
    buildingIds: ["cssd", "power"], system: "boiler", stage: "construction", owner: "陈工（锅炉班）",
    investmentWanYuan: 22, annualSavingMwh: 0, annualSavingWanYuan: 9.8, annualCarbonReductionT: 74,
    paybackYears: 2.2, createdAt: "2026-07-12", workOrderId: "WO-2026-0718", anomalyId: "AN-007",
    calcParams: { baselineGj: 8200, savingRatePct: 6, factorHeat: 110, priceGj: 68, investment: 22, omCost: 0.8, lifeYears: 8, discountPct: 6 },
  },
  {
    id: "PRJ-2026-11", name: "大型影像设备预约制运行与分级待机", source: "ai",
    buildingIds: ["imaging"], system: "medical", stage: "initiation", owner: "周工（医工科）",
    investmentWanYuan: 12, annualSavingMwh: 41, annualSavingWanYuan: 2.6, annualCarbonReductionT: 25,
    paybackYears: 4.5, createdAt: "2026-08-01", workOrderId: "WO-2026-0717", anomalyId: "AN-006",
    calcParams: { baselineMwh: 512, savingRatePct: 8, factor: 0.6096, price: 0.72, investment: 12, omCost: 0.3, lifeYears: 8, discountPct: 6 },
  },
  {
    id: "PRJ-2025-06", name: "门诊楼 LED 照明与智能调光改造（已投运）", source: "manual",
    buildingIds: ["outpatient"], system: "lighting", stage: "operation", owner: "钱工（电气组）",
    investmentWanYuan: 96, annualSavingMwh: 267.8, annualSavingWanYuan: 17.3, annualCarbonReductionT: 163.3,
    paybackYears: 5.6, createdAt: "2025-03-18",
    mv: { baseline: "2024-07 至 2025-02 照明回路计量", adjusted: "按门诊量与开诊时长修正", verifiedSavingMwh: 251, verifiedReductionT: 153.0, method: "IPMVP Option A（简化演示）" },
    calcParams: { baselineMwh: 1030, savingRatePct: 26, factor: 0.6096, price: 0.72, investment: 96, omCost: 2, lifeYears: 10, discountPct: 6 },
  },
  {
    id: "PRJ-2025-08", name: "冷站群控与水泵变频优化（EMC）", source: "manual",
    buildingIds: ["power"], system: "chiller", stage: "operation", owner: "刘工（冷站班）",
    investmentWanYuan: 210, annualSavingMwh: 619.8, annualSavingWanYuan: 38.6, annualCarbonReductionT: 377.8,
    paybackYears: 5.4, createdAt: "2025-05-20", isEmc: true,
    emc: { investor: "某节能服务公司（Demo）", sharePct: 65, contractYears: 6, sharedWanYuan: 29 },
    mv: { baseline: "2024 供冷季冷站总电耗", adjusted: "按冷量与室外湿球温度修正", verifiedSavingMwh: 584, verifiedReductionT: 356.0, method: "IPMVP Option C（简化演示）" },
    calcParams: { baselineMwh: 3350, savingRatePct: 18.5, factor: 0.6096, price: 0.72, investment: 210, omCost: 6, lifeYears: 12, discountPct: 6 },
  },
  {
    id: "PRJ-2026-12", name: "医用气体管网泄漏排查与压力分区优化", source: "diagnosis",
    buildingIds: ["surgical", "inpatientA", "inpatientB"], system: "medgas", stage: "initiation", owner: "孙工（医气组）",
    investmentWanYuan: 18, annualSavingMwh: 0, annualSavingWanYuan: 6.2, annualCarbonReductionT: 11,
    paybackYears: 2.9, createdAt: "2026-08-02",
    calcParams: { baselineM3: 620000, savingRatePct: 7, price: 2.6, investment: 18, omCost: 0.5, lifeYears: 6, discountPct: 6 },
  },
];

export const projectById = Object.fromEntries(projectSeeds.map((p) => [p.id, p]));

export const projectStageMeta: Record<Project["stage"], string> = {
  initiation: "立项",
  design: "设计",
  construction: "施工",
  acceptance: "验收",
  operation: "运行",
};
