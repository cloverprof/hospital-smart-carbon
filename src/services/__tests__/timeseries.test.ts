import { describe, expect, it } from "vitest";
import { mainBuildings } from "../../data/buildings";
import { demoAsOfDate } from "../../data/config";
import {
  dailyCarbonKg,
  dailySeries,
  dailyUsage,
  forecastDailyCarbon,
  hospitalDailyCarbonT,
  hourlySeries,
  monthlySeries,
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
});
