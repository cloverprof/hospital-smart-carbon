// 确定性时序引擎：全站唯一数据来源。
// 关键不变量：
//  1) 同一 (buildingId, kind, date) 永远返回同一数值（seed 固定）；
//  2) 医院总量 = 各楼宇之和（按构造成立）；月度 = 日度之和；
//  3) 异常链在 anomalies.ts 声明，由本引擎统一注入，各页面看到一致形态。
import dayjs from "dayjs";
import { anomalyChains } from "../data/anomalies";
import { buildingById, mainBuildings } from "../data/buildings";
import { activeFactors } from "../data/factors";
import { demoAsOfDate, dailyHistoryStart, energyKindMeta, forecastEnd, historyStart, hourlyHistoryDays } from "../data/config";
import { hashSeed, mulberry32 } from "../data/rng";
import type { BuildingId, EnergyKind, SeriesPoint } from "../types/core";

// 结果缓存：入参确定 → 结果确定，可安全缓存（上限防泄漏）
const memo = new Map<string, unknown>();
function cached<T>(key: string, fn: () => T): T {
  if (memo.has(key)) return memo.get(key) as T;
  const v = fn();
  if (memo.size > 4000) memo.clear();
  memo.set(key, v);
  return v;
}

/** 合成气温（北方气候区演示曲线，℃） */
export function tempOfDate(date: string): number {
  const d = dayjs(date);
  const doy = Math.floor((d.valueOf() - dayjs(`${d.year()}-01-01`).valueOf()) / 86400000) + 1;
  const seasonal = -12 * Math.cos(((doy - 15) / 365) * Math.PI * 2);
  const noise = (mulberry32(hashSeed(`temp:${date}`))() - 0.5) * 6;
  return Math.round((14 + seasonal + noise) * 10) / 10;
}

/** 业务量：门诊人次/日 */
export function outpatientVisits(date: string): number {
  const d = dayjs(date);
  const dow = d.day();
  const weekend = dow === 0 || dow === 6 ? 0.45 : 1;
  const monday = dow === 1 ? 1.12 : 1;
  const seasonal = 1 + 0.06 * Math.sin(((d.month() + 1) / 12) * Math.PI * 2);
  const growth = 1 + 0.04 * (d.diff(dayjs(historyStart), "day") / 950);
  const noise = 1 + (mulberry32(hashSeed(`ov:${date}`))() - 0.5) * 0.12;
  return Math.round(8200 * weekend * monday * seasonal * growth * noise);
}

/** 业务量：手术台次/日 */
export function surgeryCount(date: string): number {
  const d = dayjs(date);
  const dow = d.day();
  const weekend = dow === 0 ? 0.18 : dow === 6 ? 0.35 : 1;
  const noise = 1 + (mulberry32(hashSeed(`sg:${date}`))() - 0.5) * 0.2;
  return Math.round(96 * weekend * noise);
}

/** 业务量：床位使用率 % */
export function bedOccupancy(date: string): number {
  const seasonal = 4 * Math.sin(((dayjs(date).month() + 1) / 12) * Math.PI * 2 + 1.1);
  const noise = (mulberry32(hashSeed(`bo:${date}`))() - 0.5) * 5;
  return Math.min(99, Math.round((88 + seasonal + noise) * 10) / 10);
}

function seasonFactor(kind: EnergyKind, date: string): number {
  const t = tempOfDate(date);
  if (kind === "electricity") return 1 + Math.max(0, (t - 22) / 30) * 0.55 + Math.max(0, (6 - t) / 30) * 0.18;
  if (kind === "gas" || kind === "heat") return 1 + Math.max(0, (8 - t) / 22) * 1.15 + (t > 22 ? -0.08 : 0);
  if (kind === "water") return 1 + Math.max(0, (t - 20) / 40) * 0.12;
  return 1;
}

function businessFactor(buildingId: BuildingId, kind: EnergyKind, date: string): number {
  const ov = outpatientVisits(date) / 8200;
  const sg = surgeryCount(date) / 96;
  const bo = bedOccupancy(date) / 88;
  switch (buildingId) {
    case "outpatient": return 0.45 + 0.55 * ov;
    case "surgical": return kind === "medgas" ? 0.3 + 0.7 * sg : 0.55 + 0.45 * sg;
    case "imaging": return 0.5 + 0.5 * ov;
    case "lab": return 0.55 + 0.45 * ov;
    case "cssd": return 0.5 + 0.5 * sg;
    case "inpatientA":
    case "inpatientB":
    case "emergency": return 0.35 + 0.65 * bo;
    default: return 0.9 + 0.1 * bo;
  }
}

function anomalyDayFactor(buildingId: BuildingId, kind: EnergyKind, date: string): number {
  let f = 1;
  for (const a of anomalyChains) {
    if (a.buildingId !== buildingId || a.energyKind !== kind || a.factor === 1) continue;
    if (date < a.from || (a.to && date > a.to)) continue;
    if (a.hours) {
      const [s, e] = a.hours;
      const span = e > s ? e - s : 24 - s + e;
      f *= 1 + (a.factor - 1) * (span / 24);
    } else {
      f *= a.factor;
    }
  }
  return f;
}

/** 楼宇某日某品种用量（品种单位/日）。异常链在此注入。 */
export function dailyUsage(buildingId: BuildingId, kind: EnergyKind, date: string): number {
  const b = buildingById[buildingId];
  if (!b) return 0;
  const base = b.baseDaily[kind];
  if (!base) return 0;
  const noise = 1 + (mulberry32(hashSeed(`d:${buildingId}:${kind}:${date}`))() - 0.5) * 0.08;
  const v = base * seasonFactor(kind, date) * businessFactor(buildingId, kind, date) * anomalyDayFactor(buildingId, kind, date) * noise;
  return Math.round(v * 10) / 10;
}

/** 小时形状（占全天比例，24 项之和 = 1），含异常链的小时级注入 */
export function hourlyShape(buildingId: BuildingId, kind: EnergyKind, date: string): number[] {
  const isClinic = buildingId === "outpatient" || buildingId === "lab" || buildingId === "imaging";
  const inpatient = buildingId === "inpatientA" || buildingId === "inpatientB" || buildingId === "emergency";
  const raw: number[] = [];
  for (let h = 0; h < 24; h++) {
    let w: number;
    if (isClinic) w = h >= 7 && h < 18 ? 1 + 0.9 * Math.exp(-((h - 10.5) ** 2) / 14) : 0.28;
    else if (inpatient) w = 0.62 + 0.38 * Math.exp(-((h - 11) ** 2) / 40) + (h >= 19 && h < 22 ? 0.1 : 0);
    else if (buildingId === "surgical") w = h >= 8 && h < 19 ? 1.25 : 0.55;
    else if (buildingId === "power") w = 0.7 + 0.3 * Math.exp(-((h - 14) ** 2) / 36);
    else w = h >= 8 && h < 18 ? 1 : 0.3;
    const noise = 1 + (mulberry32(hashSeed(`h:${buildingId}:${kind}:${date}:${h}`))() - 0.5) * 0.1;
    let f = 1;
    for (const a of anomalyChains) {
      if (a.buildingId !== buildingId || a.energyKind !== kind || !a.hours || a.factor === 1) continue;
      if (date < a.from || (a.to && date > a.to)) continue;
      const [s, e] = a.hours;
      const inWin = e > s ? h >= s && h < e : h >= s || h < e;
      if (inWin) f = a.factor;
    }
    raw.push(w * noise * f);
  }
  const sum = raw.reduce((x, y) => x + y, 0);
  return raw.map((x) => x / sum);
}

/** 楼宇某日 24 小时序列（品种单位/时） */
export function hourlySeries(buildingId: BuildingId, kind: EnergyKind, date: string): SeriesPoint[] {
  const total = dailyUsage(buildingId, kind, date);
  return hourlyShape(buildingId, kind, date).map((share, h) => ({
    t: `${String(h).padStart(2, "0")}:00`,
    v: Math.round(total * share * 10) / 10,
  }));
}

/** 全院某品种 24 小时序列（品种单位/时），由楼宇小时数据汇总。 */
export function hospitalHourlySeries(kind: EnergyKind, date: string): SeriesPoint[] {
  return cached(`hhs:${kind}:${date}`, () =>
    Array.from({ length: 24 }, (_, hour) => ({
      t: `${String(hour).padStart(2, "0")}:00`,
      v: Math.round(mainBuildings.reduce((sum, building) => sum + hourlySeries(building.id, kind, date)[hour].v, 0) * 10) / 10,
    })),
  );
}

/**
 * 全院外购电力小时碳排速率（kgCO2e/h）。
 * 实时、历史和预测图均调用此口径：外购电力活动数据 × 已核验的 activeFactors.electricity。
 */
export function hospitalHourlyElectricCarbonKg(date: string): SeriesPoint[] {
  return cached(`hhec:${date}`, () =>
    hospitalHourlySeries("electricity", date).map((point) => ({
      t: point.t,
      v: Math.round(point.v * activeFactors.electricity * 10) / 10,
    })),
  );
}

/** 当前演示可调用的小时历史起点（含基准日在内 90 天）。 */
export const hourlyHistoryStart = dayjs(demoAsOfDate).subtract(hourlyHistoryDays - 1, "day").format("YYYY-MM-DD");

const FORECAST_WEEK_LOOKBACKS = [7, 14, 21, 28] as const;
const FORECAST_WEEK_WEIGHTS = [0.4, 0.3, 0.2, 0.1] as const;

/**
 * 全院小时活动数据预测：前四个同星期日的历史曲线加权，再依目标日天气和业务量修正。
 * 不读取目标日 actual 序列；异常、业务量和天气造成的差异因此可用于真实/预测偏差展示。
 */
export function forecastHospitalHourlySeries(kind: EnergyKind, date: string): SeriesPoint[] {
  return cached(`fhhs:${kind}:${date}`, () => {
    const historyDates = FORECAST_WEEK_LOOKBACKS.map((days) => dayjs(date).subtract(days, "day").format("YYYY-MM-DD"));

    return Array.from({ length: 24 }, (_, hour) => {
      const v = mainBuildings.reduce((hospitalTotal, building) => {
        const historicalValue = historyDates.reduce(
          (sum, historyDate, index) => sum + hourlySeries(building.id, kind, historyDate)[hour].v * FORECAST_WEEK_WEIGHTS[index],
          0,
        );
        const historicalDriver = historyDates.reduce(
          (sum, historyDate, index) => sum + seasonFactor(kind, historyDate) * businessFactor(building.id, kind, historyDate) * FORECAST_WEEK_WEIGHTS[index],
          0,
        );
        const targetDriver = seasonFactor(kind, date) * businessFactor(building.id, kind, date);
        const driverRatio = historicalDriver > 0 ? targetDriver / historicalDriver : 1;
        return hospitalTotal + historicalValue * driverRatio;
      }, 0);
      return { t: `${String(hour).padStart(2, "0")}:00`, v: Math.round(v * 10) / 10 };
    });
  });
}

/** 预测的全院外购电力小时碳排速率（kgCO2e/h），与历史/实时序列共用同一排放因子。 */
export function forecastHospitalHourlyElectricCarbonKg(date: string): SeriesPoint[] {
  return cached(`fhhec:${date}`, () =>
    forecastHospitalHourlySeries("electricity", date).map((point) => ({
      t: point.t,
      v: Math.round(point.v * activeFactors.electricity * 10) / 10,
    })),
  );
}

/** 日序列（含可选楼宇过滤；不填 = 全院合计，保证总量=分项和） */
export function dailySeries(kind: EnergyKind, from: string, to: string, buildingId?: BuildingId): SeriesPoint[] {
  return cached(`ds:${kind}:${from}:${to}:${buildingId ?? "all"}`, () => dailySeriesRaw(kind, from, to, buildingId));
}

function dailySeriesRaw(kind: EnergyKind, from: string, to: string, buildingId?: BuildingId): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  let d = dayjs(from);
  const end = dayjs(to);
  while (!d.isAfter(end)) {
    const date = d.format("YYYY-MM-DD");
    const v = buildingId
      ? dailyUsage(buildingId, kind, date)
      : mainBuildings.reduce((s, b) => s + dailyUsage(b.id, kind, date), 0);
    out.push({ t: date, v: Math.round(v * 10) / 10 });
    d = d.add(1, "day");
  }
  return out;
}

/** 月序列（= 该月日度之和） */
export function monthlySeries(kind: EnergyKind, fromMonth: string, toMonth: string, buildingId?: BuildingId): SeriesPoint[] {
  return cached(`ms:${kind}:${fromMonth}:${toMonth}:${buildingId ?? "all"}`, () => monthlySeriesRaw(kind, fromMonth, toMonth, buildingId));
}

function monthlySeriesRaw(kind: EnergyKind, fromMonth: string, toMonth: string, buildingId?: BuildingId): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  let m = dayjs(`${fromMonth}-01`);
  const end = dayjs(`${toMonth}-01`);
  while (!m.isAfter(end)) {
    const mStart = m.format("YYYY-MM-01");
    const mEnd = m.endOf("month").isAfter(dayjs(demoAsOfDate)) ? demoAsOfDate : m.endOf("month").format("YYYY-MM-DD");
    const days = dailySeries(kind, mStart, mEnd, buildingId);
    out.push({ t: m.format("YYYY-MM"), v: Math.round(days.reduce((s, p) => s + p.v, 0)) });
    m = m.add(1, "month");
  }
  return out;
}

/** 楼宇日碳排 kgCO2e（合规口径 Scope1+2：电/气/热） */
export function dailyCarbonKg(buildingId: BuildingId, date: string): number {
  const e = dailyUsage(buildingId, "electricity", date) * activeFactors.electricity;
  const g = dailyUsage(buildingId, "gas", date) * activeFactors.gas;
  const h = dailyUsage(buildingId, "heat", date) * activeFactors.heat;
  return Math.round(e + g + h);
}

/** 全院日碳排 tCO2e */
export function hospitalDailyCarbonT(date: string): number {
  return Math.round(mainBuildings.reduce((s, b) => s + dailyCarbonKg(b.id, date), 0) / 100) / 10;
}

/** 日碳排序列（kg，楼宇）或（t，全院） */
export function dailyCarbonSeries(from: string, to: string, buildingId?: BuildingId): SeriesPoint[] {
  return cached(`dcs:${from}:${to}:${buildingId ?? "all"}`, () => dailyCarbonSeriesRaw(from, to, buildingId));
}

function dailyCarbonSeriesRaw(from: string, to: string, buildingId?: BuildingId): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  let d = dayjs(from);
  const end = dayjs(to);
  while (!d.isAfter(end)) {
    const date = d.format("YYYY-MM-DD");
    out.push({ t: date, v: buildingId ? dailyCarbonKg(buildingId, date) : hospitalDailyCarbonT(date) });
    d = d.add(1, "day");
  }
  return out;
}

/** 月碳排序列 tCO2e */
export function monthlyCarbonSeries(fromMonth: string, toMonth: string, buildingId?: BuildingId): SeriesPoint[] {
  return cached(`mcs:${fromMonth}:${toMonth}:${buildingId ?? "all"}`, () => monthlyCarbonSeriesRaw(fromMonth, toMonth, buildingId));
}

function monthlyCarbonSeriesRaw(fromMonth: string, toMonth: string, buildingId?: BuildingId): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  let m = dayjs(`${fromMonth}-01`);
  const end = dayjs(`${toMonth}-01`);
  while (!m.isAfter(end)) {
    const mEnd = m.endOf("month").isAfter(dayjs(demoAsOfDate)) ? demoAsOfDate : m.endOf("month").format("YYYY-MM-DD");
    const days = dailyCarbonSeries(m.format("YYYY-MM-01"), mEnd, buildingId);
    const sum = days.reduce((s, p) => s + p.v, 0);
    out.push({ t: m.format("YYYY-MM"), v: buildingId ? Math.round(sum / 100) / 10 : Math.round(sum * 10) / 10 });
    m = m.add(1, "month");
  }
  return out;
}

/** 预测：日碳排（全院，t）或品种用量。衔接历史末值 + 业务/天气趋势 + 轻微收敛到目标 */
export function forecastDailyCarbon(from = dayjs(demoAsOfDate).add(1, "day").format("YYYY-MM-DD"), to = forecastEnd): SeriesPoint[] {
  const baseWindow = dailyCarbonSeries(dayjs(demoAsOfDate).subtract(13, "day").format("YYYY-MM-DD"), demoAsOfDate);
  const baseAvg = baseWindow.reduce((s, p) => s + p.v, 0) / baseWindow.length;
  const out: SeriesPoint[] = [];
  let d = dayjs(from);
  const end = dayjs(to);
  while (!d.isAfter(end)) {
    const date = d.format("YYYY-MM-DD");
    const season = seasonFactor("electricity", date) / seasonFactor("electricity", demoAsOfDate);
    const dow = d.day() === 0 || d.day() === 6 ? 0.93 : 1.01;
    const improve = 1 - 0.0004 * d.diff(dayjs(demoAsOfDate), "day"); // 假设整改逐步生效
    const noise = 1 + (mulberry32(hashSeed(`fc:${date}`))() - 0.5) * 0.05;
    out.push({ t: date, v: Math.round(baseAvg * season * dow * improve * noise * 10) / 10 });
    d = d.add(1, "day");
  }
  return out;
}

/** “实时”功率演示：基准日 24h 曲线 + 以 5 秒为步长的确定性轻微抖动（kW） */
export function realtimePowerKw(nowTick: number, buildingId?: BuildingId): number {
  const date = demoAsOfDate;
  const hourIdx = Math.floor((nowTick / 3600) % 24);
  const ids = buildingId ? [buildingId] : mainBuildings.map((b) => b.id);
  let kw = 0;
  for (const id of ids) {
    const day = dailyUsage(id, "electricity", date);
    const share = hourlyShape(id, "electricity", date)[hourIdx];
    kw += day * share; // kWh/h = kW
  }
  const jitter = 1 + (mulberry32(hashSeed(`rt:${Math.floor(nowTick / 5)}`))() - 0.5) * 0.03;
  return Math.round(kw * jitter);
}

/** “实时”外购电力碳排速率（kgCO2e/h），和 realtimePowerKw 同步按 5 秒拍号变化。 */
export function realtimeElectricCarbonKgPerHour(nowTick: number, buildingId?: BuildingId): number {
  return Math.round(realtimePowerKw(nowTick, buildingId) * activeFactors.electricity * 10) / 10;
}

/** 单位指标：折标煤 tce */
export function toTce(kind: EnergyKind, amount: number): number {
  return amount * energyKindMeta[kind].tcePerUnit;
}

/** 常用聚合：某期间楼宇/全院用量合计 */
export function sumUsage(kind: EnergyKind, from: string, to: string, buildingId?: BuildingId): number {
  return Math.round(dailySeries(kind, from, to, buildingId).reduce((s, p) => s + p.v, 0));
}

/** 同比：给定期间与去年同期的合计对比，返回 % 变化（保留 1 位） */
export function yoyPct(kind: EnergyKind, from: string, to: string, buildingId?: BuildingId): number {
  const cur = sumUsage(kind, from, to, buildingId);
  const prev = sumUsage(
    kind,
    dayjs(from).subtract(1, "year").format("YYYY-MM-DD"),
    dayjs(to).subtract(1, "year").format("YYYY-MM-DD"),
    buildingId,
  );
  if (!prev) return 0;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

export { dailyHistoryStart };
