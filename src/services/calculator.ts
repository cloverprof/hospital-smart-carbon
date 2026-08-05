// 碳减排方案计算器（纯函数，UI 与测试共用）。
// 输入均为非负数；实现层保证不出现除零、NaN、负回收期。

export interface CalcInput {
  /** 基线能耗（MWh/年，电类）或其它品种折算后的年费用基数 */
  baselineMwh: number;
  /** 计划节能率 % (0-100) */
  savingRatePct: number;
  /** 排放因子 kgCO2e/kWh */
  factorKgPerKwh: number;
  /** 能源单价 元/kWh */
  pricePerKwh: number;
  /** 投资额 万元 */
  investmentWanYuan: number;
  /** 年运维成本 万元 */
  omWanYuanPerYear: number;
  /** 项目寿命 年 */
  lifeYears: number;
  /** 折现率 % */
  discountPct: number;
}

export interface CalcResult {
  annualSavingMwh: number;
  annualSavingWanYuan: number;
  annualReductionT: number;
  /** 静态回收期（年）；无法回收时为 null */
  paybackYears: number | null;
  /** 3 年累计净收益 万元 */
  net3yWanYuan: number;
  /** 净现值 万元（按寿命期） */
  npvWanYuan: number;
  /** 全寿命累计净收益 万元（不折现） */
  lifetimeNetWanYuan: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const safe = (v: number) => (Number.isFinite(v) ? v : 0);
const r1 = (v: number) => Math.round(v * 10) / 10;

export function calcReduction(input: CalcInput): CalcResult {
  const baseline = Math.max(0, safe(input.baselineMwh));
  const rate = clamp(safe(input.savingRatePct), 0, 100) / 100;
  const factor = Math.max(0, safe(input.factorKgPerKwh));
  const price = Math.max(0, safe(input.pricePerKwh));
  const invest = Math.max(0, safe(input.investmentWanYuan));
  const om = Math.max(0, safe(input.omWanYuanPerYear));
  const life = clamp(Math.round(safe(input.lifeYears)), 1, 40);
  const discount = clamp(safe(input.discountPct), 0, 30) / 100;

  const annualSavingMwh = baseline * rate;
  // MWh × 1000 kWh × 元/kWh ÷ 10000 = 万元
  const grossWanYuan = (annualSavingMwh * 1000 * price) / 10000;
  const annualSavingWanYuan = grossWanYuan - om;
  const annualReductionT = (annualSavingMwh * 1000 * factor) / 1000; // kWh × kg/kWh = kg → t

  const paybackYears = annualSavingWanYuan > 0 ? invest / annualSavingWanYuan : null;

  const net3yWanYuan = annualSavingWanYuan * Math.min(3, life) - invest;

  let npv = -invest;
  for (let y = 1; y <= life; y++) npv += annualSavingWanYuan / (1 + discount) ** y;

  return {
    annualSavingMwh: r1(annualSavingMwh),
    annualSavingWanYuan: r1(annualSavingWanYuan),
    annualReductionT: r1(annualReductionT),
    paybackYears: paybackYears === null ? null : r1(Math.min(paybackYears, 99)),
    net3yWanYuan: r1(net3yWanYuan),
    npvWanYuan: r1(npv),
    lifetimeNetWanYuan: r1(annualSavingWanYuan * life - invest),
  };
}

/** 计算器公式说明（UI 展示，标注 Demo 估算） */
export const calcFormulas = [
  "年节能量 (MWh) = 基线能耗 × 节能率",
  "年节省费用 (万元) = 年节能量 × 1000 × 单价 ÷ 10000 − 年运维成本",
  "年减碳量 (tCO2e) = 年节能量 × 1000 × 排放因子 ÷ 1000",
  "静态回收期 (年) = 投资额 ÷ 年净节省费用（净节省 ≤ 0 时不可回收）",
  "3 年累计净收益 = 年净节省 × min(3, 寿命) − 投资额",
  "NPV = −投资额 + Σ 年净节省 ÷ (1+折现率)^t，t = 1…寿命",
];
