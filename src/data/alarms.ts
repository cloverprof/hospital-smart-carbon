import type { Alarm } from "../types/core";
import { anomalyChains } from "./anomalies";

// 告警种子 = 10 条异常链派生 + 补充告警（凑齐 7 类：能源/设备/环境/数据/医气压力/洁净度/UPS）。
// 运行时状态修改保存在 demo store 的 overrides 中，这里只是初始状态。

const chainAlarms: Alarm[] = anomalyChains.map((a) => ({
  id: a.alarmId,
  title: a.title,
  category:
    a.id === "AN-005" ? "medgasPressure"
    : a.id === "AN-008" ? "data"
    : a.id === "AN-009" ? "cleanliness"
    : a.id === "AN-010" ? "data"
    : a.system === "medical" || a.system === "boiler" || a.system === "chiller" || a.system === "purification" ? "energy"
    : a.system === "water" ? "device"
    : "energy",
  level: a.level,
  status: a.status === "closed" ? "resolved" : a.status === "handling" ? "processing" : "pending",
  buildingId: a.buildingId,
  system: a.system,
  deviceId: a.deviceId,
  meterId: a.meterId,
  startAt: `${a.from} ${a.hours ? String(a.hours[0]).padStart(2, "0") + ":15" : "09:20"}`,
  detail: a.rootCause,
  owner: a.owner,
  ownerTeam: a.ownerTeam,
  workOrderId: a.workOrderId,
  anomalyId: a.id,
  extraCarbonKgPerDay: a.estReductionTPerYear > 0 ? Math.round((a.estReductionTPerYear * 1000) / 365) : undefined,
  extraEnergyPerDay: a.estSavingMwhPerYear > 0 ? `${Math.round((a.estSavingMwhPerYear * 1000) / 365)} kWh/日` : undefined,
}));

const extraAlarms: Alarm[] = [
  {
    id: "AL-2026-0811", title: "住院 A 楼 12F 病区温度超上限", category: "environment", level: "info", status: "pending",
    buildingId: "inpatientA", system: "hvac", deviceId: "DEV-IPA-ELE-01", startAt: "2026-08-04 11:05",
    detail: "12F 东病区室温 27.8℃（上限 27℃），冷冻水阀开度已达 95%", owner: "王工（暖通组）", ownerTeam: "暖通组",
  },
  {
    id: "AL-2026-0812", title: "急诊 UPS 电池组 SOH 低于阈值", category: "ups", level: "warning", status: "acknowledged",
    buildingId: "emergency", system: "power", deviceId: "DEV-EMG-UPS-01", startAt: "2026-08-03 16:40",
    detail: "UPS 电池组健康度 78%（阈值 80%），建议安排更换评估", owner: "郑工（配电班）", ownerTeam: "配电运行班",
  },
  {
    id: "AL-2026-0813", title: "手术部 II 级洁净走廊尘埃粒子临界", category: "cleanliness", level: "info", status: "resolved",
    buildingId: "surgical", system: "purification", deviceId: "DEV-SUR-AHU-01", startAt: "2026-08-01 08:12",
    detail: "0.5μm 粒子数接近级别上限，更换高效过滤器后恢复", owner: "王工（暖通组）", ownerTeam: "暖通组",
  },
  {
    id: "AL-2026-0814", title: "检验中心 -80℃ 冰箱温度波动", category: "device", level: "warning", status: "processing",
    buildingId: "lab", system: "hvac", startAt: "2026-08-04 07:52",
    detail: "3# 超低温冰箱温度 -74℃ 并伴随压缩机频繁启停", owner: "周工（医工科）", ownerTeam: "医学工程科",
  },
  {
    id: "AL-2026-0815", title: "门诊楼夜间基础负荷偏高", category: "energy", level: "info", status: "pending",
    buildingId: "outpatient", system: "lighting", deviceId: "DEV-OUT-LGT-01", startAt: "2026-08-03 23:30",
    detail: "23:00-05:00 平均负荷较近 30 日基线高 6.8%，疑似公共区照明未降档", owner: "钱工（电气组）", ownerTeam: "电气组",
  },
];

export const alarmSeeds: Alarm[] = [...chainAlarms, ...extraAlarms];
export const alarmById = Object.fromEntries(alarmSeeds.map((a) => [a.id, a]));

export const alarmCategoryMeta: Record<Alarm["category"], string> = {
  energy: "能源",
  device: "设备",
  environment: "环境",
  data: "数据",
  medgasPressure: "医用气体压力",
  cleanliness: "手术室洁净度",
  ups: "UPS 电池",
};

export const alarmLevelMeta = { critical: "严重", warning: "警告", info: "提示" } as const;
export const alarmStatusMeta = { pending: "待处理", processing: "处理中", acknowledged: "已确认", resolved: "已解决" } as const;
