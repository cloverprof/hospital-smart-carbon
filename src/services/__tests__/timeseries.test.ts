import { describe, expect, it } from "vitest";
import { mainBuildings } from "../../data/buildings";
import { dailyHistoryStart, demoAsOfDate } from "../../data/config";
import { activeFactors } from "../../data/factors";
import {
  dailyCarbonKg,
  dailySeries,
  dailyUsage,
  forecastDailyCarbon,
  forecastHospitalHourlyElectricCarbonKg,
  forecastHospitalHourlySeries,
  hospitalDailyCarbonT,
  hospitalHourlyElectricCarbonKg,
  hospitalHourlySeries,
  hourlySeries,
  hourlyHistoryStart,
  monthlySeries,
  realtimeElectricCarbonKgPerHour,
  realtimePowerKw,
} from "../timeseries";

describe("确定性", () => {
  it("同一输入永远返回同一数值（无 Math.random 抖动）", () => {
    const a = dailyUsage("surgical", "electricity", "2026-07-20");
    const b = dailyUsage("surgical", "electricity", "2026-07-20");
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });
});

describe("层级一致性：上级总量 = 下级汇总", () => {
  it("全院日电耗 = 各楼宇之和", () => {
    const date = demoAsOfDate;
    const total = dailySeries("electricity", date, date)[0].v;
    const sum = mainBuildings.reduce((s, b) => s + dailyUsage(b.id, "electricity", date), 0);
    expect(Math.abs(total - sum)).toBeLessThan(1);
  });

  it("月度 = 该月日度之和", () => {
    const m = monthlySeries("electricity", "2026-07", "2026-07")[0].v;
    const days = dailySeries("electricity", "2026-07-01", "2026-07-31");
    const sum = days.reduce((s, p) => s + p.v, 0);
    expect(Math.abs(m - sum)).toBeLessThan(1);
  });

  it("楼宇 24 小时之和 = 该楼宇当日用量（±0.5%）", () => {
    const day = dailyUsage("outpatient", "electricity", "2026-08-01");
    const hours = hourlySeries("outpatient", "electricity", "2026-08-01");
    const sum = hours.reduce((s, p) => s + p.v, 0);
    expect(Math.abs(sum - day) / day).toBeLessThan(0.005);
  });

  it("全院 24 小时用量 = 各楼宇小时汇总，且约等于当日全院用量", () => {
    const date = demoAsOfDate;
    const hospital = hospitalHourlySeries("electricity", date);
    const buildingSum = Array.from({ length: 24 }, (_, hour) =>
      mainBuildings.reduce((sum, building) => sum + hourlySeries(building.id, "electricity", date)[hour].v, 0));
    expect(hospital).toHaveLength(24);
    expect(hospital.every((point, hour) => Math.abs(point.v - buildingSum[hour]) < 0.01)).toBe(true);
    const day = dailySeries("electricity", date, date)[0].v;
    expect(Math.abs(hospital.reduce((sum, point) => sum + point.v, 0) - day) / day).toBeLessThan(0.005);
  });

  it("全院日碳排(t) ≈ 各楼宇日碳排(kg)之和 ÷ 1000", () => {
    const date = "2026-08-02";
    const t = hospitalDailyCarbonT(date);
    const kg = mainBuildings.reduce((s, b) => s + dailyCarbonKg(b.id, date), 0);
    expect(Math.abs(t - kg / 1000)).toBeLessThan(0.2);
  });
});

describe("异常链注入", () => {
  it("手术楼 setback 异常期间夜间电耗高于异常前（AN-001，2026-07-18 起）", () => {
    const before = hourlySeries("surgical", "electricity", "2026-07-10");
    const during = hourlySeries("surgical", "electricity", "2026-07-25");
    const night = (pts: { v: number }[]) => pts.slice(0, 5).reduce((s, p) => s + p.v, 0) + pts.slice(22).reduce((s, p) => s + p.v, 0);
    // 归一化到全天，排除天气差异：夜间占比应显著升高
    const shareBefore = night(before) / before.reduce((s, p) => s + p.v, 0);
    const shareDuring = night(during) / during.reduce((s, p) => s + p.v, 0);
    expect(shareDuring).toBeGreaterThan(shareBefore * 1.05);
  });
});

describe("预测", () => {
  it("覆盖到 2026-09-30 且衔接历史（首值在近 14 日均值 ±25% 内）", () => {
    const fc = forecastDailyCarbon();
    expect(fc[fc.length - 1].t).toBe("2026-09-30");
    const recentAvg = hospitalDailyCarbonT(demoAsOfDate);
    expect(fc[0].v).toBeGreaterThan(recentAvg * 0.75);
    expect(fc[0].v).toBeLessThan(recentAvg * 1.25);
    expect(fc.every((p) => Number.isFinite(p.v) && p.v > 0)).toBe(true);
  });

  it("小时预测来自历史同星期数据，长度完整、为正且不复制目标日实际曲线", () => {
    const actual = hospitalHourlySeries("electricity", demoAsOfDate);
    const forecast = forecastHospitalHourlySeries("electricity", demoAsOfDate);
    expect(hourlyHistoryStart >= dailyHistoryStart).toBe(true);
    expect(forecast).toHaveLength(24);
    expect(forecast.every((point) => Number.isFinite(point.v) && point.v > 0)).toBe(true);
    expect(forecast.some((point, hour) => Math.abs(point.v - actual[hour].v) > 0.1)).toBe(true);
  });

  it("小时电力碳排的历史与预测均使用 activeFactors.electricity", () => {
    const historicalPower = hospitalHourlySeries("electricity", demoAsOfDate);
    const historicalCarbon = hospitalHourlyElectricCarbonKg(demoAsOfDate);
    const forecastPower = forecastHospitalHourlySeries("electricity", demoAsOfDate);
    const forecastCarbon = forecastHospitalHourlyElectricCarbonKg(demoAsOfDate);

    expect(historicalCarbon).toHaveLength(24);
    expect(forecastCarbon).toHaveLength(24);
    historicalCarbon.forEach((point, hour) => {
      expect(point.v).toBeCloseTo(historicalPower[hour].v * activeFactors.electricity, 1);
    });
    forecastCarbon.forEach((point, hour) => {
      expect(point.v).toBeCloseTo(forecastPower[hour].v * activeFactors.electricity, 1);
    });
  });
});

describe("实时碳排", () => {
  it("5 秒拍号会确定性改变实时功率与实时电力碳排", () => {
    const tick = 14.5 * 3600;
    const firstPower = realtimePowerKw(tick);
    const nextPower = realtimePowerKw(tick + 5);
    const firstCarbon = realtimeElectricCarbonKgPerHour(tick);
    const nextCarbon = realtimeElectricCarbonKgPerHour(tick + 5);

    expect(firstPower).not.toBe(nextPower);
    expect(firstCarbon).not.toBe(nextCarbon);
    expect(firstCarbon).toBeCloseTo(firstPower * activeFactors.electricity, 1);
    expect(nextCarbon).toBeCloseTo(nextPower * activeFactors.electricity, 1);
  });
});
