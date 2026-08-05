// 全站唯一的演示时间基准与全局常量。改 demoAsOfDate 即可整体平移演示日期。
import dayjs from "dayjs";

/** 演示数据基准日（"今天"） */
export const demoAsOfDate = "2026-08-04";

/** 月度历史起点 */
export const historyStart = "2024-01-01";

/** 日度历史至少 12 个月 */
export const dailyHistoryStart = dayjs(demoAsOfDate).subtract(14, "month").format("YYYY-MM-DD");

/** 小时级数据窗口（按需生成） */
export const hourlyHistoryDays = 90;

/** 预测终点（超过未来一个完整月） */
export const forecastEnd = "2026-09-30";

export const asOf = () => dayjs(demoAsOfDate);

/** localStorage 命名空间（带版本）。所有持久化 key 必须经由它拼接。 */
export const STORAGE_NS = "hospital-carbon-demo:v1";
export const nsKey = (key: string) => `${STORAGE_NS}:${key}`;

export const PRODUCT_NAME = "医碳智擎";
export const PRODUCT_FULL_NAME = "医碳智擎｜医院智慧能碳管理平台";
export const HOSPITAL_NAME = "某三级综合医院（Demo）";

/** 年度碳预算（内部碳预算/情景模拟口径，tCO2e） */
export const annualCarbonBudgetT = 52000;

/** 碳排目标：2026 年比 2024 年下降比例（演示口径） */
export const reductionTargetPct = 8;

export const energyKindMeta = {
  electricity: { name: "电力", unit: "kWh", bigUnit: "MWh", price: 0.72, priceUnit: "元/kWh", tcePerUnit: 0.1229 / 1000 },
  water: { name: "水", unit: "m³", bigUnit: "m³", price: 4.1, priceUnit: "元/m³", tcePerUnit: 0.0857 / 1000 },
  gas: { name: "天然气", unit: "m³", bigUnit: "万m³", price: 3.45, priceUnit: "元/m³", tcePerUnit: 1.33 / 1000 },
  heat: { name: "热力", unit: "GJ", bigUnit: "GJ", price: 68, priceUnit: "元/GJ", tcePerUnit: 0.03412 },
  medgas: { name: "医用气体", unit: "m³", bigUnit: "m³", price: 2.6, priceUnit: "元/m³", tcePerUnit: 0.0004 },
} as const;

export type EnergyKindMeta = typeof energyKindMeta;
