import { describe, expect, it } from "vitest";
import { calcReduction } from "../calculator";

const base = {
  baselineMwh: 1000,
  savingRatePct: 20,
  factorKgPerKwh: 0.5568,
  pricePerKwh: 0.72,
  investmentWanYuan: 60,
  omWanYuanPerYear: 2,
  lifeYears: 10,
  discountPct: 6,
};

describe("calcReduction", () => {
  it("常规输入：数值与单位换算正确", () => {
    const r = calcReduction(base);
    expect(r.annualSavingMwh).toBe(200); // 1000 × 20%
    expect(r.annualSavingWanYuan).toBeCloseTo(200 * 1000 * 0.72 / 10000 - 2, 1); // 12.4 万元
    expect(r.annualReductionT).toBeCloseTo(200 * 0.5568, 1); // 111.4 t
    expect(r.paybackYears).toBeCloseTo(60 / 12.4, 1);
    expect(r.net3yWanYuan).toBeCloseTo(12.4 * 3 - 60, 1);
  });

  it("零投资：回收期为 0 而不是 NaN", () => {
    const r = calcReduction({ ...base, investmentWanYuan: 0 });
    expect(r.paybackYears).toBe(0);
    expect(Number.isNaN(r.npvWanYuan)).toBe(false);
  });

  it("零节能率：无节省且不可回收（null，而非负数/Infinity）", () => {
    const r = calcReduction({ ...base, savingRatePct: 0, omWanYuanPerYear: 0 });
    expect(r.annualSavingMwh).toBe(0);
    expect(r.paybackYears).toBeNull();
    expect(r.npvWanYuan).toBe(-60);
  });

  it("运维成本超过毛节省：年净节省为负，回收期为 null", () => {
    const r = calcReduction({ ...base, omWanYuanPerYear: 999 });
    expect(r.annualSavingWanYuan).toBeLessThan(0);
    expect(r.paybackYears).toBeNull();
  });

  it("非法输入被钳制：负值、NaN、超范围节能率", () => {
    const r = calcReduction({
      baselineMwh: -5,
      savingRatePct: 180,
      factorKgPerKwh: Number.NaN,
      pricePerKwh: -1,
      investmentWanYuan: Number.POSITIVE_INFINITY,
      omWanYuanPerYear: -3,
      lifeYears: 0,
      discountPct: -8,
    });
    expect(r.annualSavingMwh).toBe(0);
    expect(r.annualReductionT).toBe(0);
    expect(Number.isFinite(r.npvWanYuan)).toBe(true);
    expect(r.paybackYears).toBeNull();
  });

  it("折现率为 0 时 NPV = 寿命净收益", () => {
    const r = calcReduction({ ...base, discountPct: 0 });
    expect(r.npvWanYuan).toBeCloseTo(r.lifetimeNetWanYuan, 1);
  });
});
