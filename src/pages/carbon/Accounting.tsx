// 6.2.1 碳核算工作台：核算边界 → 活动数据 → 质量校验 → 排放核算 → 报告归档（五步流程）。
// 数字全部来自 services/timeseries + data/factors；用户操作状态存 stores/accounting（nsKey 命名空间）。
// 演示主线 C：质量校验发现缺失(AN-008) → 锁定被阻止 → 补录估算值 → 重新试算 → 锁定 → 导出报告。
import dayjs from "dayjs";
import type { EChartsCoreOption } from "echarts";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  FileCode2,
  FileDown,
  FileText,
  Lock,
  PencilLine,
  ShieldCheck,
  Unlock,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { EChart } from "../../components/EChart";
import { Delta, EmptyState, Kpi, Modal, PageHead, Panel, Tag } from "../../components/kit";
import { anomalyById } from "../../data/anomalies";
import { mainBuildings } from "../../data/buildings";
import { demoAsOfDate, energyKindMeta } from "../../data/config";
import { activeFactors, factorById } from "../../data/factors";
import { canWrite, roleMeta } from "../../data/navigation";
import { unitNoise } from "../../data/rng";
import { dailyUsage, monthlySeries, sumUsage, toTce } from "../../services/timeseries";
import { useAccountingStore, type EstimateRecord, type TrialMonthRow, type TrialResult } from "../../stores/accounting";
import { useDemoStore } from "../../stores/demo";
import type { AnomalyChain, BuildingId, EnergyKind } from "../../types/core";

const PAGE_ID = "carbon-accounting";
const KINDS: EnergyKind[] = ["electricity", "gas", "heat", "water", "medgas"];

/** 品种 → 排放范围归属（合规口径：Scope1=气，Scope2=电+热；水/医气仅扩展演示） */
const KIND_SCOPE: Record<EnergyKind, { tag: string; tone: "info" | "ok" | "muted"; inCompliance: boolean; factorId: string }> = {
  electricity: { tag: "Scope2", tone: "info", inCompliance: true, factorId: "ef-grid-2023" },
  gas: { tag: "Scope1", tone: "ok", inCompliance: true, factorId: "ef-natgas" },
  heat: { tag: "Scope2", tone: "info", inCompliance: true, factorId: "ef-heat" },
  water: { tag: "扩展", tone: "muted", inCompliance: false, factorId: "ef-water-ext" },
  medgas: { tag: "扩展", tone: "muted", inCompliance: false, factorId: "ef-oxygen-ext" },
};

/** 扩展/Scope3 演示项（明确不入合规总量） */
const EXT_ITEMS = [
  { id: "commute", name: "员工通勤", baseT: 82, method: "3800 名职工 × 通勤距离抽样模型" },
  { id: "travel", name: "公务差旅", baseT: 15, method: "差旅台账 × 交通方式因子" },
  { id: "procurement", name: "采购（药品/耗材）", baseT: 405, method: "采购金额 × 行业投入产出因子" },
  { id: "medwaste", name: "医疗废物处置", baseT: 56, method: "医废转运联单量 × 处置因子" },
  { id: "sewage", name: "污水处理", baseT: 19, method: "污水处理量 × 电耗/药剂折算" },
  { id: "pharma", name: "药剂/麻醉气体", baseT: 27, method: "N2O/地氟烷领用量 × IPCC GWP" },
];

/** 合规核算实际使用的因子记录（展示版本/来源 URL/待核验标签） */
const COMPLIANCE_FACTOR_IDS = ["ef-grid-2023", "ef-natgas", "ef-heat"];

function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let m = dayjs(`${from}-01`);
  const end = dayjs(`${to}-01`);
  let guard = 0;
  while (!m.isAfter(end) && guard < 36) {
    out.push(m.format("YYYY-MM"));
    m = m.add(1, "month");
    guard += 1;
  }
  return out;
}

const MONTH_OPTIONS = monthRange("2025-09", "2026-08");

const fmt = (n: number, digits = 0) =>
  n.toLocaleString("zh-CN", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** 扩展项某月估算排放 t（确定性伪随机 ±8%） */
function extMonthlyT(id: string, baseT: number, month: string): number {
  return Math.round(baseT * (1 + (unitNoise(`ext:${id}:${month}`) - 0.5) * 0.16) * 10) / 10;
}

interface MissingSeg {
  id: string;
  segFrom: string;
  segTo: string;
  byMonth: Record<string, number>;
  suggested: number;
}

interface QualityIssue {
  id: string;
  type: "缺失" | "突变" | "超限" | "凭证";
  level: "danger" | "warn" | "info";
  target: string;
  detail: string;
  blocking: boolean;
  resolved: boolean;
  resolvedNote: string;
  canBackfill?: boolean;
}

interface ExtRow {
  id: string;
  name: string;
  method: string;
  t: number;
}

interface Model {
  months: string[];
  ids: BuildingId[];
  allSelected: boolean;
  usage: Record<EnergyKind, Record<string, number>>;
  missing: MissingSeg | null;
  estimate: EstimateRecord | null;
  estimateApplied: boolean;
  missingUnresolved: boolean;
  rows: { kind: EnergyKind; total: number; yoy: number }[];
  tceByMonth: Record<string, number>;
  tceTotal: number;
  perMonth: TrialMonthRow[];
  scope1T: number;
  scope2T: number;
  ext: ExtRow[];
  extT: number;
  issues: QualityIssue[];
}

/** 纯函数：由边界/周期/补录状态推导全部展示与核算数字（同参同值） */
function buildModel(
  fromMonth: string,
  toMonth: string,
  selKey: string,
  estimates: Record<string, EstimateRecord>,
  extOn: boolean,
  extOffKey: string,
): Model {
  const months = monthRange(fromMonth, toMonth);
  const ids = (selKey ? selKey.split(",") : []) as BuildingId[];
  const allSelected = ids.length === mainBuildings.length;
  const fromDate = `${fromMonth}-01`;
  const monthEnd = dayjs(`${toMonth}-01`).endOf("month").format("YYYY-MM-DD");
  const toDateEff = monthEnd > demoAsOfDate ? demoAsOfDate : monthEnd;

  // ---- 活动数据基表：品种 × 月份（全选走全院聚合，等于分楼宇之和） ----
  const usage: Record<EnergyKind, Record<string, number>> = { electricity: {}, water: {}, gas: {}, heat: {}, medgas: {} };
  for (const kind of KINDS) {
    for (const m of months) {
      usage[kind][m] = allSelected
        ? monthlySeries(kind, m, m)[0]?.v ?? 0
        : Math.round(ids.reduce((s, id) => s + (monthlySeries(kind, m, m, id)[0]?.v ?? 0), 0));
    }
  }

  // ---- AN-008 缺失区间（行政科研楼电表通讯中断）与当前边界/周期的交集 ----
  const an008 = anomalyById["AN-008"] as AnomalyChain | undefined;
  let missing: MissingSeg | null = null;
  if (an008 && ids.includes("admin")) {
    const segFrom = an008.from < fromDate ? fromDate : an008.from;
    const rawTo = an008.to ?? an008.from;
    const segTo = rawTo > toDateEff ? toDateEff : rawTo;
    if (segFrom <= segTo) {
      const byMonth: Record<string, number> = {};
      let total = 0;
      let d = dayjs(segFrom);
      const e = dayjs(segTo);
      while (!d.isAfter(e)) {
        const date = d.format("YYYY-MM-DD");
        const v = dailyUsage("admin", "electricity", date);
        const mk = d.format("YYYY-MM");
        byMonth[mk] = Math.round(((byMonth[mk] ?? 0) + v) * 10) / 10;
        total += v;
        d = d.add(1, "day");
      }
      missing = { id: `AN-008:${segFrom}:${segTo}`, segFrom, segTo, byMonth, suggested: Math.round(total) };
    }
  }
  const estimate = missing ? estimates[missing.id] ?? null : null;
  const estimateApplied = Boolean(missing && estimate);
  const missingUnresolved = Boolean(missing && !estimate);

  // ---- 补录修正：把（人工估算值 - 系统插补参考值）按月分摊到电力 ----
  if (missing && estimate) {
    const delta = estimate.value - missing.suggested;
    for (const [m, sys] of Object.entries(missing.byMonth)) {
      if (usage.electricity[m] !== undefined) {
        usage.electricity[m] = Math.round(usage.electricity[m] + delta * (sys / (missing.suggested || 1)));
      }
    }
  }

  // ---- 行合计与同比 ----
  const prevFrom = dayjs(fromDate).subtract(1, "year").format("YYYY-MM-DD");
  const prevTo = dayjs(toDateEff).subtract(1, "year").format("YYYY-MM-DD");
  const rows = KINDS.map((kind) => {
    const total = months.reduce((s, m) => s + (usage[kind][m] ?? 0), 0);
    const prev = allSelected
      ? sumUsage(kind, prevFrom, prevTo)
      : ids.reduce((s, id) => s + sumUsage(kind, prevFrom, prevTo, id), 0);
    const yoy = prev ? Math.round(((total - prev) / prev) * 1000) / 10 : 0;
    return { kind, total: Math.round(total), yoy };
  });

  // ---- 折标煤 ----
  const tceByMonth: Record<string, number> = {};
  for (const m of months) {
    tceByMonth[m] = Math.round(KINDS.reduce((s, kind) => s + toTce(kind, usage[kind][m] ?? 0), 0) * 10) / 10;
  }
  const tceTotal = Math.round(months.reduce((s, m) => s + tceByMonth[m], 0) * 10) / 10;

  // ---- 合规口径逐月排放（Scope1=气，Scope2=电+热；kg → t） ----
  const perMonth: TrialMonthRow[] = months.map((m) => ({
    month: m,
    s1: Math.round(((usage.gas[m] ?? 0) * activeFactors.gas) / 100) / 10,
    s2e: Math.round(((usage.electricity[m] ?? 0) * activeFactors.electricity) / 100) / 10,
    s2h: Math.round(((usage.heat[m] ?? 0) * activeFactors.heat) / 100) / 10,
  }));
  const scope1T = Math.round(perMonth.reduce((s, r) => s + r.s1, 0) * 10) / 10;
  const scope2T = Math.round(perMonth.reduce((s, r) => s + r.s2e + r.s2h, 0) * 10) / 10;

  // ---- 扩展/Scope3 演示项（不入合规总量） ----
  const extOffIds = new Set(extOffKey ? extOffKey.split(",") : []);
  const ext: ExtRow[] = extOn
    ? EXT_ITEMS.filter((i) => !extOffIds.has(i.id)).map((i) => ({
        id: i.id,
        name: i.name,
        method: i.method,
        t: Math.round(months.reduce((s, m) => s + extMonthlyT(i.id, i.baseT, m), 0) * 10) / 10,
      }))
    : [];
  const extT = Math.round(ext.reduce((s, r) => s + r.t, 0) * 10) / 10;

  // ---- 质量校验：缺失 / 突变 / 超限 / 凭证 ----
  const issues: QualityIssue[] = [];
  if (missing && an008) {
    issues.push({
      id: missing.id,
      type: "缺失",
      level: estimateApplied ? "warn" : "danger",
      target: "行政科研楼 · 电力（AN-008）",
      detail: `采集网关离线，缺失区间 ${missing.segFrom} ~ ${missing.segTo}（38 小时 / 152 个 15 分钟点位），核算完整率降至 97.8%`,
      blocking: true,
      resolved: estimateApplied,
      resolvedNote: estimateApplied
        ? `已补录估算值 ${fmt(estimate?.value ?? 0)} kWh（插补参考 ${fmt(missing.suggested)} kWh）`
        : "锁定批次前必须补录估算值",
      canBackfill: true,
    });
  }
  for (const kind of KINDS) {
    let worst: { month: string; pct: number } | null = null;
    for (let i = 1; i < months.length; i++) {
      const prev = usage[kind][months[i - 1]] ?? 0;
      const cur = usage[kind][months[i]] ?? 0;
      if (!prev) continue;
      const pct = Math.round(((cur - prev) / prev) * 1000) / 10;
      if (Math.abs(pct) >= 25 && (!worst || Math.abs(pct) > Math.abs(worst.pct))) worst = { month: months[i], pct };
    }
    if (worst) {
      const seasonal = kind === "gas" || kind === "heat";
      issues.push({
        id: `mut-${kind}`,
        type: "突变",
        level: "warn",
        target: `${energyKindMeta[kind].name} · ${worst.month}`,
        detail: `环比${worst.pct > 0 ? "+" : ""}${worst.pct}%（阈值 ±25%）`,
        blocking: false,
        resolved: seasonal,
        resolvedNote: seasonal ? "供暖/季节切换可解释（自动核验）" : "需人工关注：与业务量记录核对",
      });
    }
  }
  for (const row of rows) {
    if (!KIND_SCOPE[row.kind].inCompliance || row.yoy <= 0) continue;
    issues.push({
      id: `lim-${row.kind}`,
      type: "超限",
      level: row.yoy > 8 ? "warn" : "info",
      target: `${energyKindMeta[row.kind].name} · 期间同比`,
      detail: `同比 +${row.yoy}%，未达年度下降 8% 目标口径`,
      blocking: false,
      resolved: false,
      resolvedNote: "纳入能源诊断跟踪，不阻断核算",
    });
  }
  issues.push({
    id: "voucher",
    type: "凭证",
    level: "info",
    target: `${months.length} 个月 × 电/气/热结算单`,
    detail: `${months.length * 3} 份凭证已关联；${toMonth} 热力结算单对账中（金额偏差 0.8%，容差内）`,
    blocking: false,
    resolved: true,
    resolvedNote: "凭证一致性检查通过（演示核验）",
  });

  return {
    months, ids, allSelected, usage, missing,
    estimate, estimateApplied, missingUnresolved,
    rows, tceByMonth, tceTotal, perMonth, scope1T, scope2T, ext, extT, issues,
  };
}

const STEP_NAMES = ["核算边界", "活动数据", "质量校验", "排放核算", "报告归档"];

export function CarbonAccountingV2Page() {
  const { role, allPermissions, pageFilters, setPageFilter, pushToast } = useDemoStore();
  const acc = useAccountingStore();
  const writable = canWrite(PAGE_ID, role, allPermissions);
  const actor = roleMeta[role].name;

  // ---- 周期筛选（持久化到 pageFilters） ----
  const pf = pageFilters[PAGE_ID] ?? {};
  const fromMonth = typeof pf.fromMonth === "string" ? pf.fromMonth : "2026-02";
  const toMonth = typeof pf.toMonth === "string" ? pf.toMonth : "2026-07";
  const setFrom = (v: string) => setPageFilter(PAGE_ID, v > toMonth ? { fromMonth: v, toMonth: v } : { fromMonth: v });
  const setTo = (v: string) => setPageFilter(PAGE_ID, v < fromMonth ? { fromMonth: v, toMonth: v } : { toMonth: v });

  const selKey = mainBuildings.filter((b) => !acc.buildingsOff[b.id]).map((b) => b.id).join(",");
  const extOffKey = EXT_ITEMS.filter((i) => acc.extOff[i.id]).map((i) => i.id).join(",");

  const model = useMemo(
    () => buildModel(fromMonth, toMonth, selKey, acc.estimates, acc.extOn, extOffKey),
    [fromMonth, toMonth, selKey, acc.estimates, acc.extOn, extOffKey],
  );

  const estKey = model.missing && model.estimate ? `${model.missing.id}=${model.estimate.value}` : "-";
  const signature = [fromMonth, toMonth, selKey, acc.scope1On, acc.scope2On, acc.extOn, extOffKey, estKey].join("|");
  const trialFresh = Boolean(acc.trial && acc.trial.signature === signature);
  const unresolvedCount = model.issues.filter((i) => !i.resolved).length;
  const grade = model.missingUnresolved ? "B" : model.estimateApplied ? "A-" : "A";
  const reviewedCount = KINDS.filter((k) => acc.reviews[k]).length;
  const batchLabel = acc.lockInfo?.batchId ?? `${fromMonth}~${toMonth}-DRAFT`;
  const missingMonths = model.missing ? Object.keys(model.missing.byMonth) : [];

  // ---- 步骤条与分区滚动 ----
  const [activeStep, setActiveStep] = useState(1);
  const sectionRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const goStep = (n: number) => {
    setActiveStep(n);
    sectionRefs.current[n]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // ---- 弹窗状态 ----
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [backfillVal, setBackfillVal] = useState("");
  const [backfillNote, setBackfillNote] = useState("按前后同型日插补，已与门禁/照明回路旁证核对");
  const [lockOpen, setLockOpen] = useState(false);
  const [lockConfirm, setLockConfirm] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");

  const openBackfill = () => {
    if (!model.missing) return;
    setBackfillVal(String(model.estimate?.value ?? model.missing.suggested));
    setBackfillOpen(true);
  };

  const saveBackfill = () => {
    if (!model.missing) return;
    const v = Number(backfillVal);
    if (!Number.isFinite(v) || v <= 0) {
      pushToast("补录失败", "估算值必须为正数", "warning");
      return;
    }
    if (Math.abs(v - model.missing.suggested) / model.missing.suggested > 0.3) {
      pushToast("补录被拒绝", "估算值偏离插补参考值超过 ±30%，请复核后再提交", "warning");
      return;
    }
    if (!backfillNote.trim()) {
      pushToast("补录失败", "必须填写估算依据说明（进入审计日志）", "warning");
      return;
    }
    acc.saveEstimate(
      { id: model.missing.id, value: Math.round(v), suggested: model.missing.suggested, unit: "kWh", note: backfillNote.trim(), at: new Date().toLocaleString("zh-CN", { hour12: false }), months: model.missing.byMonth },
      actor,
    );
    setBackfillOpen(false);
    pushToast("补录完成", "缺失区间已标记为估算值，请重新执行一键试算", "success");
  };

  const runTrial = () => {
    if (acc.locked) {
      pushToast("批次已锁定", "锁定批次不允许重新试算，请先申请解锁", "warning");
      return;
    }
    if (!model.ids.length || !model.months.length) {
      pushToast("无法试算", "核算边界内没有楼宇或月份", "warning");
      return;
    }
    const trial: TrialResult = {
      at: new Date().toLocaleString("zh-CN", { hour12: false }),
      signature,
      months: model.perMonth,
      includeS1: acc.scope1On,
      includeS2: acc.scope2On,
      scope1T: acc.scope1On ? model.scope1T : 0,
      scope2T: acc.scope2On ? model.scope2T : 0,
      totalT: Math.round(((acc.scope1On ? model.scope1T : 0) + (acc.scope2On ? model.scope2T : 0)) * 10) / 10,
      extItems: model.ext.map((r) => ({ id: r.id, name: r.name, t: r.t })),
      extT: model.extT,
      hasUnresolvedMissing: model.missingUnresolved,
      estimatedApplied: model.estimateApplied,
    };
    acc.setTrial(trial, actor);
    if (model.missingUnresolved) {
      pushToast("试算完成（草稿）", "存在未补录缺失（AN-008），结果不可锁定，请先在质量校验步骤补录", "warning");
      goStep(3);
    } else {
      pushToast("试算完成", `Scope1+2 合计 ${fmt(trial.totalT, 1)} tCO2e，可进入锁定与归档`, "success");
      goStep(4);
    }
  };

  const lockBlockReason = (): { reason: string; step: number } | null => {
    if (!acc.trial) return { reason: "请先执行一键试算", step: 4 };
    if (!trialFresh) return { reason: "边界或数据已变化，试算结果已过期，请重新试算", step: 4 };
    if (model.missingUnresolved) return { reason: "存在缺失数据未补录（AN-008 行政科研楼电表），锁定被阻止", step: 3 };
    if (!acc.scope1On || !acc.scope2On) return { reason: "合规批次必须同时纳入 Scope1 与 Scope2", step: 1 };
    return null;
  };

  const onLockClick = () => {
    if (acc.locked) {
      setUnlockReason("");
      setUnlockOpen(true);
      return;
    }
    const block = lockBlockReason();
    if (block) {
      pushToast("锁定被阻止", block.reason, "danger");
      goStep(block.step);
      return;
    }
    setLockConfirm(false);
    setLockOpen(true);
  };

  const confirmLock = () => {
    const batchId = acc.lockBatch(`${fromMonth}~${toMonth}`, actor);
    setLockOpen(false);
    pushToast("批次已锁定", `${batchId} 已锁定，活动数据表转为只读，可导出归档`, "success");
    goStep(5);
  };

  const confirmUnlock = () => {
    if (!unlockReason.trim()) {
      pushToast("请填写解锁原因", "解锁原因将写入审计日志", "warning");
      return;
    }
    acc.unlockBatch(unlockReason.trim(), actor);
    setUnlockOpen(false);
    pushToast("已解锁（演示自动审批）", "批次恢复可编辑，正式环境需管理员审批", "success");
  };

  const doReview = () => {
    const kinds = KINDS.filter((k) => checked[k]);
    if (!kinds.length) {
      pushToast("未选择数据", "请先在活动数据表勾选需要复核的品种行", "warning");
      return;
    }
    acc.setReviewed(kinds, actor);
    setChecked({});
    pushToast("批量复核完成", `${kinds.length} 个品种行已标记复核通过`, "success");
  };

  // ---- 导出 ----
  const activityRows = (): Record<string, unknown>[] => {
    const rows: Record<string, unknown>[] = model.rows.map((r) => {
      const meta = energyKindMeta[r.kind];
      const row: Record<string, unknown> = { 品种: meta.name, 单位: meta.unit, 排放范围: KIND_SCOPE[r.kind].tag };
      model.months.forEach((m) => {
        row[m] = model.usage[r.kind][m] ?? 0;
      });
      row["期间合计"] = r.total;
      row["同比%"] = r.yoy;
      row["数据标记"] = r.kind === "electricity" && model.missing ? (model.estimateApplied ? "含人工估算(AN-008)" : "含缺失区间(AN-008)") : "实测";
      row["复核状态"] = acc.reviews[r.kind] ? `已复核 ${acc.reviews[r.kind]}` : "待复核";
      return row;
    });
    const tceRow: Record<string, unknown> = { 品种: "综合能耗折标", 单位: "tce", 排放范围: "—" };
    model.months.forEach((m) => {
      tceRow[m] = model.tceByMonth[m];
    });
    tceRow["期间合计"] = model.tceTotal;
    tceRow["同比%"] = "—";
    tceRow["数据标记"] = "计算值";
    tceRow["复核状态"] = "—";
    rows.push(tceRow);
    return rows;
  };

  const exportActivityCsv = async () => {
    const { downloadCsv } = await import("../../utils/downloads");
    const file = `碳核算_活动数据_${fromMonth}_${toMonth}.csv`;
    downloadCsv(activityRows(), file);
    acc.addArchive("CSV", file, `边界 ${model.ids.length} 楼宇 / ${model.months.length} 个月`, actor);
    pushToast("已导出", `${file} 已按当前边界与补录状态生成`, "success");
  };

  const exportResultCsv = async () => {
    const t = acc.trial;
    if (!t || !trialFresh) return;
    const { downloadCsv } = await import("../../utils/downloads");
    const rows: Record<string, unknown>[] = t.months.map((r) => ({
      月份: r.month,
      "Scope1_天然气_tCO2e": t.includeS1 ? r.s1 : 0,
      "Scope2_电力_tCO2e": t.includeS2 ? r.s2e : 0,
      "Scope2_热力_tCO2e": t.includeS2 ? r.s2h : 0,
      "合计_tCO2e": Math.round(((t.includeS1 ? r.s1 : 0) + (t.includeS2 ? r.s2e + r.s2h : 0)) * 10) / 10,
      备注: "",
    }));
    rows.push({ 月份: "期间合计", "Scope1_天然气_tCO2e": t.scope1T, "Scope2_电力_tCO2e": "—", "Scope2_热力_tCO2e": "—", "合计_tCO2e": t.totalT, 备注: t.estimatedApplied ? "含 1 处人工估算(AN-008)" : "无估算标记" });
    COMPLIANCE_FACTOR_IDS.forEach((id) => {
      const f = factorById[id];
      if (f) rows.push({ 月份: `因子：${f.name}`, "Scope1_天然气_tCO2e": "—", "Scope2_电力_tCO2e": "—", "Scope2_热力_tCO2e": "—", "合计_tCO2e": `${f.value} ${f.unit}`, 备注: `${f.version}｜${f.sourceUrl}｜待标准确认（演示）` });
    });
    const file = `碳核算_结果_${batchLabel}.csv`;
    downloadCsv(rows, file);
    acc.addArchive("CSV", file, `批次 ${batchLabel}，合计 ${fmt(t.totalT, 1)} tCO2e`, actor);
    pushToast("已导出", `${file} 已生成`, "success");
  };

  const exportXml = async () => {
    const t = acc.trial;
    if (!t || !trialFresh) return;
    const { downloadBlob } = await import("../../utils/downloads");
    const xml = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<!-- Demo 模拟导出：演示环境本地生成，未接入国管局/主管部门报送接口，不构成正式报送 -->`,
      `<GHGReport demo="true" generatedAt="${new Date().toISOString()}" batch="${batchLabel}" locked="${acc.locked}">`,
      `  <Boundary campuses="主院区${acc.eastIncluded ? "+东院区(无计量楼宇)" : ""}" buildings="${model.ids.join(",")}" period="${fromMonth}/${toMonth}"/>`,
      `  <Scopes scope1="${t.includeS1}" scope2="${t.includeS2}" extensionDemo="${acc.extOn}"/>`,
      `  <Totals unit="tCO2e" scope1="${t.scope1T}" scope2="${t.scope2T}" total="${t.totalT}" extensionNotInCompliance="${t.extT}"/>`,
      ...t.months.map((r) => `  <Month id="${r.month}" s1="${r.s1}" s2e="${r.s2e}" s2h="${r.s2h}"/>`),
      ...COMPLIANCE_FACTOR_IDS.map((id) => {
        const f = factorById[id];
        return f ? `  <Factor id="${f.id}" value="${f.value}" unit="${f.unit}" version="${f.version}" sourceUrl="${f.sourceUrl}" verified="false"/>` : "";
      }).filter(Boolean),
      `  <DataQuality grade="${grade}" rawCompleteness="97.8" estimated="${t.estimatedApplied ? 1 : 0}"/>`,
      `</GHGReport>`,
    ].join("\n");
    const file = `碳核算_报送样例_${batchLabel}_Demo模拟.xml`;
    downloadBlob(new Blob([xml], { type: "application/xml;charset=utf-8" }), file);
    acc.addArchive("XML（Demo 模拟）", file, "报送样例占位，非正式报送", actor);
    pushToast("已导出", "XML 报送样例已生成（Demo 模拟，非正式报送）", "success");
  };

  const exportPdf = async () => {
    const t = acc.trial;
    if (!t || !trialFresh) return;
    const { downloadBlob } = await import("../../utils/downloads");
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>碳核算报告（Demo 模拟）</title>
<style>body{font-family:"Microsoft YaHei",sans-serif;margin:44px;color:#142033;position:relative}
.wm{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;font-size:84px;color:rgba(200,40,40,.12);transform:rotate(-24deg);pointer-events:none}
h1{font-size:24px;border-bottom:3px solid #1268e8;padding-bottom:10px}h2{margin-top:26px;color:#16488c;font-size:16px}
table{border-collapse:collapse;width:100%;margin:10px 0}th,td{border:1px solid #cad4e3;padding:8px;text-align:left;font-size:13px}
.note{background:#fff7e6;border:1px solid #f0c36d;padding:10px;font-size:12px}</style></head><body>
<div class="wm">Demo 模拟</div>
<h1>医院温室气体排放核算报告（Demo 模拟）</h1>
<p class="note">本文件为前端演示环境生成的 PDF 占位（HTML 文本）。未接入国管局或主管部门系统，不构成正式报送；正式报告应由服务端渲染并经第三方核查。</p>
<h2>一、批次与边界</h2><p>批次：${batchLabel}（${acc.locked ? "已锁定" : "草稿"}）｜周期：${fromMonth} ~ ${toMonth}｜边界：主院区 ${model.ids.length} 栋楼宇</p>
<h2>二、核算结果（合规口径 Scope1+2）</h2>
<table><tr><th>范围</th><th>排放量（tCO2e）</th></tr>
<tr><td>Scope1 天然气直接排放</td><td>${fmt(t.scope1T, 1)}</td></tr>
<tr><td>Scope2 外购电力 + 外购热力</td><td>${fmt(t.scope2T, 1)}</td></tr>
<tr><td><b>合计</b></td><td><b>${fmt(t.totalT, 1)}</b></td></tr></table>
<h2>三、扩展边界演示（不计入合规总量）</h2>
<table><tr><th>项目</th><th>tCO2e</th></tr>${t.extItems.map((r) => `<tr><td>${r.name}</td><td>${fmt(r.t, 1)}</td></tr>`).join("")}<tr><td><b>扩展合计</b></td><td><b>${fmt(t.extT, 1)}</b></td></tr></table>
<h2>四、数据质量</h2><p>原始采集完整率 97.8%（AN-008 通讯中断）；${t.estimatedApplied ? "缺失区间已补录人工估算值并单独标识" : "无人工估算"}；数据质量等级 ${grade}。</p>
<h2>五、排放因子</h2><table><tr><th>因子</th><th>数值</th><th>版本/来源</th></tr>${COMPLIANCE_FACTOR_IDS.map((id) => { const f = factorById[id]; return f ? `<tr><td>${f.name}</td><td>${f.value} ${f.unit}</td><td>${f.version}｜${f.sourceUrl}｜待标准确认（演示）</td></tr>` : ""; }).join("")}</table>
</body></html>`;
    const file = `碳核算报告_${batchLabel}_Demo模拟.html`;
    downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), file);
    acc.addArchive("PDF 占位（Demo 模拟）", file, "HTML 文本占位，带 Demo 水印", actor);
    pushToast("已导出", "PDF 报告占位已生成（HTML 文本，Demo 模拟水印）", "success");
  };

  // ---- 图表（使用试算快照，保证图数一致） ----
  const barOption = useMemo<EChartsCoreOption | null>(() => {
    const t = acc.trial;
    if (!t || !t.months.length) return null;
    const series: object[] = [];
    if (t.includeS1) series.push({ name: "Scope1 天然气", type: "bar", stack: "total", data: t.months.map((r) => r.s1), barMaxWidth: 26 });
    if (t.includeS2) {
      series.push({ name: "Scope2 电力", type: "bar", stack: "total", data: t.months.map((r) => r.s2e), barMaxWidth: 26 });
      series.push({ name: "Scope2 热力", type: "bar", stack: "total", data: t.months.map((r) => r.s2h), barMaxWidth: 26 });
    }
    return {
      grid: { left: 52 },
      legend: {},
      tooltip: { valueFormatter: (v: unknown) => `${v} tCO2e` },
      xAxis: { type: "category", data: t.months.map((r) => r.month) },
      yAxis: { type: "value", name: "tCO2e" },
      series,
    };
  }, [acc.trial]);

  const pieOption = useMemo<EChartsCoreOption | null>(() => {
    const t = acc.trial;
    if (!t) return null;
    const data: { name: string; value: number }[] = [];
    if (t.includeS1) data.push({ name: "Scope1 天然气", value: Math.round(t.months.reduce((s, r) => s + r.s1, 0) * 10) / 10 });
    if (t.includeS2) {
      data.push({ name: "Scope2 电力", value: Math.round(t.months.reduce((s, r) => s + r.s2e, 0) * 10) / 10 });
      data.push({ name: "Scope2 热力", value: Math.round(t.months.reduce((s, r) => s + r.s2h, 0) * 10) / 10 });
    }
    if (!data.length) return null;
    return {
      legend: { orient: "vertical", left: 0, top: "middle" },
      tooltip: { trigger: "item", valueFormatter: (v: unknown) => `${v} tCO2e` },
      series: [{ type: "pie", radius: ["42%", "70%"], center: ["62%", "52%"], data, label: { color: "#9db4d6", fontSize: 11, formatter: "{b}\n{d}%" } }],
    };
  }, [acc.trial]);

  // ---- 步骤条数据 ----
  const steps = [
    { id: 1, info: `${model.ids.length} 楼宇 · ${model.months.length} 个月 · S1${acc.scope1On ? "✓" : "✕"} S2${acc.scope2On ? "✓" : "✕"}`, warn: !model.ids.length || !acc.scope1On || !acc.scope2On },
    { id: 2, info: model.missing ? (model.estimateApplied ? `${KINDS.length} 品种 · 1 处估算值` : `${KINDS.length} 品种 · 1 处缺失`) : `${KINDS.length} 品种 · 无缺失`, warn: model.missingUnresolved },
    { id: 3, info: `${unresolvedCount} 项待处理 · 等级 ${grade}`, warn: model.missingUnresolved },
    { id: 4, info: acc.trial ? (trialFresh ? `合计 ${fmt(acc.trial.totalT, 1)} tCO2e` : "结果已过期") : "待试算", warn: !trialFresh },
    { id: 5, info: acc.locked ? `${acc.lockInfo?.batchId ?? ""} 已锁定` : "待锁定批次", warn: !acc.locked },
  ];

  const disabledTitle = !writable ? "当前角色无碳核算写权限" : acc.locked ? "批次已锁定，表格只读" : undefined;
  const editable = writable && !acc.locked;

  return (
    <>
      <PageHead
        title="碳核算工作台"
        sub={`核算周期 ${fromMonth} ~ ${toMonth} · ${roleMeta[role].name} · ${acc.locked ? `批次 ${acc.lockInfo?.batchId} 已锁定` : "草稿批次"}`}
        actions={
          <>
            <button className="pf-btn primary" onClick={runTrial} disabled={!writable || acc.locked} title={disabledTitle}>
              <Calculator size={13} /> 一键试算
            </button>
            <button className="pf-btn" onClick={onLockClick} disabled={!writable} title={!writable ? disabledTitle : undefined}>
              {acc.locked ? <Unlock size={13} /> : <Lock size={13} />} {acc.locked ? "申请解锁" : "锁定批次"}
            </button>
          </>
        }
      />

      {/* KPI 行 */}
      <div className="grid cols-4">
        <Kpi
          label="合规试算总量 Scope1+2"
          value={acc.trial ? fmt(acc.trial.totalT, 1) : "—"}
          unit="tCO2e"
          tone="cyan"
          icon={<Calculator size={13} />}
          sub={acc.trial ? `S1 ${fmt(acc.trial.scope1T, 1)} · S2 ${fmt(acc.trial.scope2T, 1)}${trialFresh ? "" : " · 已过期"}` : "尚未试算"}
        />
        <Kpi
          label="采集完整率"
          value={model.missing ? "97.8" : "100"}
          unit="%"
          tone={model.missing ? (model.estimateApplied ? "green" : "amber") : "green"}
          icon={<ShieldCheck size={13} />}
          sub={model.missing ? (model.estimateApplied ? "补录后核算覆盖率 100%" : "AN-008 缺失区间待补录") : "边界内计量完整"}
        />
        <Kpi
          label="数据质量等级"
          value={grade}
          tone={grade === "B" ? "amber" : "green"}
          icon={<AlertTriangle size={13} />}
          sub={`${unresolvedCount} 项检查待处理 · ${model.estimateApplied ? "含 1 处人工估算" : "无人工估算"}`}
        />
        <Kpi
          label="批次状态"
          value={acc.locked ? "已锁定" : "草稿"}
          tone={acc.locked ? "green" : "amber"}
          icon={acc.locked ? <Lock size={13} /> : <ClipboardCheck size={13} />}
          sub={acc.locked ? `${acc.lockInfo?.batchId} · ${acc.lockInfo?.at}` : `复核率 ${reviewedCount}/${KINDS.length} 品种`}
        />
      </div>

      {/* 五步流程步骤条 */}
      <div style={{ display: "flex", gap: 8, margin: "10px 0 12px" }}>
        {steps.map((s, i) => (
          <button
            key={s.id}
            className="pf-btn ghost"
            onClick={() => goStep(s.id)}
            style={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
              padding: "8px 10px", height: "auto",
              borderColor: activeStep === s.id ? "var(--cyan)" : undefined,
            }}
          >
            <span style={{ fontSize: 10, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 4 }}>
              STEP {s.id}
              {s.warn ? <AlertTriangle size={11} color="var(--amber)" /> : <CheckCircle2 size={11} color="var(--green)" />}
            </span>
            <b style={{ fontSize: 12, color: activeStep === s.id ? "var(--cyan)" : "var(--ink-1)" }}>{STEP_NAMES[i]}</b>
            <span style={{ fontSize: 10, color: "var(--ink-3)", textAlign: "left" }}>{s.info}</span>
          </button>
        ))}
      </div>

      {/* STEP 1 核算边界 */}
      <div ref={(el) => { sectionRefs.current[1] = el; }}>
        <Panel title="Step 1 · 核算边界" extra={<Tag tone={acc.locked ? "muted" : "info"}>{acc.locked ? "批次已锁定，边界只读" : "组织边界：运营控制法"}</Tag>}>
          <div className="grid cols-3">
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--ink-2)" }}>核算周期（月度）</p>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <select className="pf-select" value={fromMonth} onChange={(e) => setFrom(e.target.value)} disabled={!editable} title={disabledTitle}>
                  {MONTH_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <span style={{ color: "var(--ink-3)", fontSize: 12 }}>至</span>
                <select className="pf-select" value={toMonth} onChange={(e) => setTo(e.target.value)} disabled={!editable} title={disabledTitle}>
                  {MONTH_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--ink-3)" }}>
                共 {model.months.length} 个月{model.months.includes("2026-08") ? "；2026-08 为不完整月（数据截至 08-04）" : ""}
              </p>
            </div>
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--ink-2)" }}>院区与合规范围</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "var(--ink-2)" }}>
                <label><input type="checkbox" checked readOnly disabled /> 主院区（10 栋计量楼宇，固定纳入）</label>
                <label title={disabledTitle}>
                  <input type="checkbox" checked={acc.eastIncluded} disabled={!editable} onChange={(e) => acc.setEastIncluded(e.target.checked)} />
                  {" "}东院区 <Tag tone="muted">无计量楼宇（未接入，纳入不改变数值）</Tag>
                </label>
                <label title={disabledTitle}>
                  <input type="checkbox" checked={acc.scope1On} disabled={!editable} onChange={(e) => acc.setScope1On(e.target.checked)} />
                  {" "}Scope1 直接排放（天然气燃烧）
                </label>
                <label title={disabledTitle}>
                  <input type="checkbox" checked={acc.scope2On} disabled={!editable} onChange={(e) => acc.setScope2On(e.target.checked)} />
                  {" "}Scope2 间接排放（外购电力 + 外购热力）
                </label>
                {(!acc.scope1On || !acc.scope2On) && <Tag tone="danger">非合规口径：Scope1/2 未全部纳入，无法锁定批次</Tag>}
              </div>
            </div>
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--ink-2)" }}>扩展 / Scope3 演示（独立开关）</p>
              <label style={{ fontSize: 12, color: "var(--ink-2)" }} title={disabledTitle}>
                <input type="checkbox" checked={acc.extOn} disabled={!editable} onChange={(e) => acc.setExtOn(e.target.checked)} />
                {" "}启用扩展边界演示核算
              </label>
              <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--amber)" }}>
                通勤/差旅/采购/医废/污水/药剂为前瞻性预留边界，<b>不计入 Scope1+2 合规总量</b>，导出时单独列示。
              </p>
            </div>
          </div>

          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--ink-2)" }}>楼宇边界（{model.ids.length}/{mainBuildings.length}）：</span>
            {mainBuildings.map((b) => {
              const on = !acc.buildingsOff[b.id];
              return (
                <button
                  key={b.id}
                  className="pf-btn ghost"
                  disabled={!editable}
                  title={disabledTitle ?? b.functionLabel}
                  onClick={() => acc.toggleBuilding(b.id)}
                  style={{ padding: "3px 8px", fontSize: 11, color: on ? "var(--cyan)" : "var(--ink-3)", borderColor: on ? "rgba(41,211,232,0.5)" : undefined }}
                >
                  {on ? "✓ " : ""}{b.shortName}
                </button>
              );
            })}
            <button className="pf-btn ghost" style={{ padding: "3px 8px", fontSize: 11 }} disabled={!editable} title={disabledTitle} onClick={() => acc.setAllBuildings(true, mainBuildings.map((b) => b.id))}>全选</button>
            {!model.ids.includes("admin") && model.months.some((m) => m === "2026-07" || m === "2026-08") && (
              <Tag tone="muted">行政科研楼未纳入边界，AN-008 缺失不影响本批次</Tag>
            )}
          </div>

          {acc.extOn && (
            <div style={{ marginTop: 10, overflowX: "auto" }}>
              <table className="pf-table">
                <thead>
                  <tr><th style={{ width: 30 }}>纳入</th><th>扩展演示项</th><th>估算方法（演示）</th><th style={{ textAlign: "right" }}>月均估算 tCO2e</th><th>口径</th></tr>
                </thead>
                <tbody>
                  {EXT_ITEMS.map((i) => {
                    const on = !acc.extOff[i.id];
                    const avg = model.months.length
                      ? Math.round((model.months.reduce((s, m) => s + extMonthlyT(i.id, i.baseT, m), 0) / model.months.length) * 10) / 10
                      : 0;
                    return (
                      <tr key={i.id}>
                        <td><input type="checkbox" checked={on} disabled={!editable} title={disabledTitle} onChange={() => acc.toggleExtItem(i.id)} /></td>
                        <td style={{ color: on ? "var(--ink-1)" : "var(--ink-3)" }}>{i.name}</td>
                        <td>{i.method}</td>
                        <td className="num" style={{ textAlign: "right" }}>{on ? fmt(avg, 1) : "—"}</td>
                        <td><Tag tone="muted">不入合规总量</Tag></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* STEP 2 活动数据 */}
      <div ref={(el) => { sectionRefs.current[2] = el; }} style={{ marginTop: 10 }}>
        <Panel
          title="Step 2 · 活动数据（品种 × 月份用量）"
          extra={
            <>
              {acc.locked && <Tag tone="muted">批次已锁定，表格只读</Tag>}
              <span>复核率 {reviewedCount}/{KINDS.length}</span>
              <button className="pf-btn" style={{ padding: "3px 8px", fontSize: 11 }} onClick={doReview} disabled={!editable} title={disabledTitle}>
                <ClipboardCheck size={12} /> 批量复核
              </button>
            </>
          }
        >
          {model.ids.length === 0 || model.months.length === 0 ? (
            <EmptyState text="核算边界内没有楼宇或月份，请回到 Step 1 调整" />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="pf-table">
                <thead>
                  <tr>
                    <th style={{ width: 26 }}>
                      <input
                        type="checkbox"
                        checked={KINDS.every((k) => checked[k])}
                        disabled={!editable}
                        title={disabledTitle}
                        onChange={(e) => setChecked(e.target.checked ? Object.fromEntries(KINDS.map((k) => [k, true])) : {})}
                      />
                    </th>
                    <th>品种</th>
                    <th>范围</th>
                    {model.months.map((m) => <th key={m} style={{ textAlign: "right" }}>{m}{m === "2026-08" ? "（至08-04）" : ""}</th>)}
                    <th style={{ textAlign: "right" }}>期间合计</th>
                    <th>同比</th>
                    <th>复核</th>
                  </tr>
                </thead>
                <tbody>
                  {model.rows.map((r) => {
                    const meta = energyKindMeta[r.kind];
                    return (
                      <tr key={r.kind}>
                        <td>
                          <input type="checkbox" checked={Boolean(checked[r.kind])} disabled={!editable} title={disabledTitle}
                            onChange={(e) => setChecked((c) => ({ ...c, [r.kind]: e.target.checked }))} />
                        </td>
                        <td style={{ whiteSpace: "nowrap", color: "var(--ink-1)" }}>{meta.name}<small style={{ color: "var(--ink-3)" }}>（{meta.unit}）</small></td>
                        <td><Tag tone={KIND_SCOPE[r.kind].tone}>{KIND_SCOPE[r.kind].tag}</Tag></td>
                        {model.months.map((m) => {
                          const isMissingCell = r.kind === "electricity" && missingMonths.includes(m);
                          return (
                            <td key={m} className="num" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                              {fmt(model.usage[r.kind][m] ?? 0)}
                              {isMissingCell && (
                                model.estimateApplied
                                  ? <> <Tag tone="warn">估算值</Tag></>
                                  : (
                                    <>
                                      {" "}<Tag tone="danger">缺失</Tag>
                                      {editable && (
                                        <button className="pf-btn ghost" style={{ padding: "1px 5px", fontSize: 10, marginLeft: 3 }} title="补录估算值" onClick={openBackfill}>
                                          <PencilLine size={11} />
                                        </button>
                                      )}
                                    </>
                                  )
                              )}
                            </td>
                          );
                        })}
                        <td className="num" style={{ textAlign: "right" }}>{fmt(r.total)}</td>
                        <td><Delta pct={r.yoy} /></td>
                        <td>{acc.reviews[r.kind] ? <Tag tone="ok">已复核</Tag> : <Tag tone="muted">待复核</Tag>}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td /><td style={{ color: "var(--ink-1)" }}>综合折标<small style={{ color: "var(--ink-3)" }}>（tce）</small></td><td><Tag tone="muted">计算值</Tag></td>
                    {model.months.map((m) => <td key={m} className="num" style={{ textAlign: "right" }}>{fmt(model.tceByMonth[m] ?? 0, 1)}</td>)}
                    <td className="num" style={{ textAlign: "right" }}>{fmt(model.tceTotal, 1)}</td>
                    <td colSpan={2} style={{ fontSize: 11, color: "var(--ink-3)" }}>折标系数见 config.energyKindMeta</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--ink-3)" }}>
            用量来自平台确定性时序引擎（总量 = 分楼宇之和）；水/医用气体仅扩展参考，不进入 Scope1+2 合规核算。
            {model.missing && !model.estimateApplied && " 电力行含 AN-008 缺失区间，锁定前必须补录估算值。"}
          </p>
        </Panel>
      </div>

      {/* STEP 3 质量校验 */}
      <div ref={(el) => { sectionRefs.current[3] = el; }} style={{ marginTop: 10 }}>
        <Panel
          title="Step 3 · 数据质量校验"
          extra={
            <>
              <span>原始采集完整率 <b className="num" style={{ color: model.missing ? "var(--amber)" : "var(--green)" }}>{model.missing ? "97.8%" : "100%"}</b></span>
              <Tag tone={grade === "B" ? "warn" : "ok"}>质量等级 {grade}</Tag>
            </>
          }
        >
          <div className="grid cols-4">
            {(["缺失", "突变", "超限", "凭证"] as const).map((type) => {
              const list = model.issues.filter((i) => i.type === type);
              const open = list.filter((i) => !i.resolved).length;
              const tone = type === "缺失" ? (open ? "red" : "green") : open ? "amber" : "green";
              const label = type === "缺失" ? "缺失检查" : type === "突变" ? "突变检查" : type === "超限" ? "超限/目标偏差" : "凭证一致性";
              return (
                <Kpi
                  key={type}
                  label={label}
                  value={list.length}
                  unit="项"
                  tone={tone}
                  sub={open ? `${open} 项待处理` : list.length ? "全部已核验/可解释" : "未发现问题"}
                />
              );
            })}
          </div>
          <div style={{ marginTop: 10, overflowX: "auto" }}>
            <table className="pf-table">
              <thead>
                <tr><th>类型</th><th>对象</th><th>检查结果</th><th>处置</th><th style={{ width: 110 }}>操作</th></tr>
              </thead>
              <tbody>
                {model.issues.map((i) => (
                  <tr key={i.id}>
                    <td><Tag tone={i.level === "danger" ? "danger" : i.level === "warn" ? "warn" : "info"}>{i.type}</Tag></td>
                    <td style={{ whiteSpace: "nowrap" }}>{i.target}</td>
                    <td>{i.detail}</td>
                    <td style={{ fontSize: 11, color: i.resolved ? "var(--green)" : "var(--ink-2)" }}>{i.resolvedNote}</td>
                    <td>
                      {i.canBackfill && !i.resolved ? (
                        <button className="pf-btn" style={{ padding: "3px 8px", fontSize: 11 }} disabled={!editable} title={disabledTitle} onClick={openBackfill}>
                          <PencilLine size={12} /> 补录估算值
                        </button>
                      ) : i.canBackfill && i.resolved ? (
                        <button className="pf-btn ghost" style={{ padding: "3px 8px", fontSize: 11 }} disabled={!editable} title={disabledTitle} onClick={openBackfill}>
                          调整估算
                        </button>
                      ) : (
                        <Tag tone={i.resolved ? "ok" : "muted"}>{i.resolved ? "已处置" : "跟踪中"}</Tag>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--ink-3)" }}>
            质量等级规则：存在未补录缺失 = B（禁止锁定）；缺失已补录为估算值 = A-；无缺失 = A。突变/超限为提示项，不阻断核算。
          </p>
        </Panel>
      </div>

      {/* STEP 4 排放核算 */}
      <div ref={(el) => { sectionRefs.current[4] = el; }} style={{ marginTop: 10 }}>
        <div className="grid cols-2">
          <Panel
            title="Step 4 · 排放核算与批次控制"
            extra={acc.trial ? <Tag tone={trialFresh ? "ok" : "warn"}>{trialFresh ? `试算于 ${acc.trial.at}` : "边界/数据已变化，结果已过期"}</Tag> : <Tag tone="muted">待试算</Tag>}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="pf-btn primary" onClick={runTrial} disabled={!writable || acc.locked} title={disabledTitle}>
                <Calculator size={13} /> 一键试算
              </button>
              <button className="pf-btn" onClick={() => goStep(2)}>
                <ClipboardCheck size={13} /> 批量复核（去活动数据表勾选）
              </button>
              <button className="pf-btn" onClick={onLockClick} disabled={!writable} title={!writable ? disabledTitle : undefined}>
                {acc.locked ? <Unlock size={13} /> : <Lock size={13} />} {acc.locked ? "申请解锁" : "锁定批次"}
              </button>
            </div>
            <div className="grid cols-3" style={{ marginTop: 10 }}>
              <Kpi label="Scope1 天然气" value={acc.trial ? fmt(acc.trial.scope1T, 1) : "—"} unit="tCO2e" sub="直接排放（燃烧）" />
              <Kpi label="Scope2 电力+热力" value={acc.trial ? fmt(acc.trial.scope2T, 1) : "—"} unit="tCO2e" sub="外购能源间接排放" />
              <Kpi label="扩展演示合计" value={acc.trial ? fmt(acc.trial.extT, 1) : "—"} unit="tCO2e" tone="amber" sub="不计入合规总量" />
            </div>
            {acc.trial && (!acc.trial.includeS1 || !acc.trial.includeS2) && (
              <p style={{ margin: "8px 0 0" }}><Tag tone="danger">非合规口径：本次试算未包含全部 Scope1/2</Tag></p>
            )}
            <div style={{ marginTop: 10, overflowX: "auto" }}>
              <table className="pf-table">
                <thead>
                  <tr><th>排放因子</th><th style={{ textAlign: "right" }}>数值</th><th>版本 / 适用</th><th>来源 URL</th><th>状态</th></tr>
                </thead>
                <tbody>
                  {COMPLIANCE_FACTOR_IDS.map((id) => {
                    const f = factorById[id];
                    if (!f) return null;
                    return (
                      <tr key={id}>
                        <td style={{ whiteSpace: "nowrap" }}>{f.name}</td>
                        <td className="num" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{f.value} {f.unit}</td>
                        <td style={{ fontSize: 11 }}>{f.version}<br /><span style={{ color: "var(--ink-3)" }}>{f.applicableYear}</span></td>
                        <td style={{ fontSize: 11, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {f.sourceUrl ? <a href={f.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "var(--cyan)" }}>{f.sourceUrl}</a> : "—"}
                        </td>
                        <td>{f.verified ? <Tag tone="ok">已核验</Tag> : <Tag tone="warn">待标准确认（演示）</Tag>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="月度排放构成（试算快照）" extra={<span>tCO2e</span>}>
            {barOption ? <EChart height={272} option={barOption} /> : <EmptyState text="尚未试算：点击「一键试算」生成月度排放构成" />}
          </Panel>
        </div>

        <div className="grid cols-2" style={{ marginTop: 10 }}>
          <Panel title="排放范围构成（试算快照）">
            {pieOption ? <EChart height={220} option={pieOption} /> : <EmptyState text="尚未试算" />}
          </Panel>
          <Panel title="扩展 / Scope3 演示结果" extra={<Tag tone="warn">不计入合规总量</Tag>}>
            {!acc.extOn ? (
              <EmptyState text="扩展边界演示已关闭（Step 1 可开启）" />
            ) : !acc.trial ? (
              <EmptyState text="尚未试算" />
            ) : acc.trial.extItems.length === 0 ? (
              <EmptyState text="所有扩展演示项均未纳入" />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="pf-table">
                  <thead><tr><th>项目</th><th style={{ textAlign: "right" }}>期间估算 tCO2e</th><th>口径说明</th></tr></thead>
                  <tbody>
                    {acc.trial.extItems.map((r) => (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td className="num" style={{ textAlign: "right" }}>{fmt(r.t, 1)}</td>
                        <td style={{ fontSize: 11, color: "var(--ink-3)" }}>前瞻性预留边界 · 演示估算</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ color: "var(--ink-1)" }}><b>扩展合计</b></td>
                      <td className="num" style={{ textAlign: "right", color: "var(--amber)" }}><b>{fmt(acc.trial.extT, 1)}</b></td>
                      <td style={{ fontSize: 11, color: "var(--amber)" }}>与 Scope1+2 合规总量分开列示</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* STEP 5 报告归档 */}
      <div ref={(el) => { sectionRefs.current[5] = el; }} style={{ marginTop: 10 }}>
        <Panel
          title="Step 5 · 报告归档与导出"
          extra={<Tag tone={acc.locked ? "ok" : "muted"}>{acc.locked ? `批次 ${acc.lockInfo?.batchId}` : "建议锁定批次后归档"}</Tag>}
        >
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="pf-btn" onClick={exportActivityCsv}>
              <FileDown size={13} /> 导出活动数据 CSV
            </button>
            <button className="pf-btn" onClick={exportResultCsv} disabled={!acc.trial || !trialFresh} title={!acc.trial ? "请先试算" : !trialFresh ? "试算结果已过期，请重新试算" : undefined}>
              <FileDown size={13} /> 导出核算结果 CSV
            </button>
            <button className="pf-btn" onClick={exportXml} disabled={!acc.trial || !trialFresh} title={!acc.trial ? "请先试算" : !trialFresh ? "试算结果已过期，请重新试算" : undefined}>
              <FileCode2 size={13} /> XML 报送样例（Demo 模拟）
            </button>
            <button className="pf-btn" onClick={exportPdf} disabled={!acc.trial || !trialFresh} title={!acc.trial ? "请先试算" : !trialFresh ? "试算结果已过期，请重新试算" : undefined}>
              <FileText size={13} /> PDF 报告占位（Demo 模拟）
            </button>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--amber)" }}>
            XML/PDF 为 Demo 模拟占位（本地 Blob 生成，PDF 以带水印 HTML 文本代替）：未接入国管局或主管部门系统，不构成正式报送。CSV 内容与当前边界、补录状态一致。
          </p>
          <div className="grid cols-2" style={{ marginTop: 10 }}>
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--ink-2)" }}>导出/归档记录</p>
              {acc.archives.length === 0 ? (
                <EmptyState text="尚无归档记录" />
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="pf-table">
                    <thead><tr><th>编号</th><th>时间</th><th>格式</th><th>文件</th><th>说明</th></tr></thead>
                    <tbody>
                      {acc.archives.map((a) => (
                        <tr key={a.id}>
                          <td className="num">{a.id}</td>
                          <td style={{ whiteSpace: "nowrap", fontSize: 11 }}>{a.at}</td>
                          <td>{a.format.includes("Demo") ? <Tag tone="warn">{a.format}</Tag> : <Tag tone="info">{a.format}</Tag>}</td>
                          <td style={{ fontSize: 11 }}>{a.file}</td>
                          <td style={{ fontSize: 11, color: "var(--ink-3)" }}>{a.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--ink-2)" }}>审计日志（最近 {Math.min(acc.logs.length, 8)} 条）</p>
              {acc.logs.length === 0 ? (
                <EmptyState text="尚无操作记录" />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {acc.logs.slice(0, 8).map((l, i) => (
                    <div key={`${l.at}-${i}`} style={{ fontSize: 11, color: "var(--ink-2)", borderLeft: "2px solid rgba(41,211,232,0.4)", paddingLeft: 8 }}>
                      <span style={{ color: "var(--ink-3)" }}>{l.at}</span> · <b style={{ color: "var(--ink-1)" }}>{l.action}</b>（{l.actor}）
                      <br /><span style={{ color: "var(--ink-3)" }}>{l.detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Panel>
      </div>

      {/* 补录估算值弹窗 */}
      {backfillOpen && model.missing && (
        <Modal title="补录缺失区间估算值（AN-008）" onClose={() => setBackfillOpen(false)} width={520}>
          <div style={{ fontSize: 12, color: "var(--ink-2)", display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ margin: 0 }}>
              行政科研楼电表采集网关离线：缺失区间 <b className="num">{model.missing.segFrom} ~ {model.missing.segTo}</b>（38 小时 / 152 个 15 分钟点位）。
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, color: "var(--ink-3)" }}>
              {(anomalyById["AN-008"] as AnomalyChain | undefined)?.evidence.map((e) => <li key={e}>{e}</li>)}
            </ul>
            <p style={{ margin: 0 }}>
              系统插补参考值（前后同型日）：<b className="num" style={{ color: "var(--cyan)" }}>{fmt(model.missing.suggested)} kWh</b>
            </p>
            <label>
              采用估算值（kWh，允许偏离参考值 ±30%）
              <input className="pf-input" style={{ width: "100%", marginTop: 4 }} type="number" min={0} value={backfillVal} onChange={(e) => setBackfillVal(e.target.value)} />
            </label>
            <label>
              估算依据说明（写入审计日志）
              <textarea className="pf-input" style={{ width: "100%", marginTop: 4, minHeight: 56, resize: "vertical" }} value={backfillNote} onChange={(e) => setBackfillNote(e.target.value)} />
            </label>
            <p style={{ margin: 0, fontSize: 11, color: "var(--amber)" }}>补录后该月电力用量将标记为「估算值」，需重新执行一键试算后才可锁定批次。</p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="pf-btn ghost" onClick={() => setBackfillOpen(false)}>取消</button>
              <button className="pf-btn primary" onClick={saveBackfill}><PencilLine size={13} /> 保存估算值</button>
            </div>
          </div>
        </Modal>
      )}

      {/* 锁定批次二次确认 */}
      {lockOpen && acc.trial && (
        <Modal title="锁定核算批次（二次确认）" onClose={() => setLockOpen(false)} width={480}>
          <div style={{ fontSize: 12, color: "var(--ink-2)", display: "flex", flexDirection: "column", gap: 8 }}>
            <table className="pf-table">
              <tbody>
                <tr><td>核算周期</td><td className="num">{fromMonth} ~ {toMonth}（{model.months.length} 个月）</td></tr>
                <tr><td>边界</td><td>主院区 {model.ids.length} 栋楼宇{acc.eastIncluded ? " + 东院区（无计量）" : ""}</td></tr>
                <tr><td>合规总量</td><td className="num" style={{ color: "var(--cyan)" }}>{fmt(acc.trial.totalT, 1)} tCO2e（S1 {fmt(acc.trial.scope1T, 1)} / S2 {fmt(acc.trial.scope2T, 1)}）</td></tr>
                <tr><td>估算标记</td><td>{acc.trial.estimatedApplied ? "1 处（AN-008 缺失区间人工估算）" : "无"}</td></tr>
                <tr><td>数据质量</td><td>等级 {grade} · 复核率 {reviewedCount}/{KINDS.length}</td></tr>
              </tbody>
            </table>
            <label>
              <input type="checkbox" checked={lockConfirm} onChange={(e) => setLockConfirm(e.target.checked)} />
              {" "}我已确认边界、活动数据与试算结果，同意锁定本批次（锁定后表格只读，解锁需申请）
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="pf-btn ghost" onClick={() => setLockOpen(false)}>取消</button>
              <button className="pf-btn primary" disabled={!lockConfirm} onClick={confirmLock}><Lock size={13} /> 确认锁定</button>
            </div>
          </div>
        </Modal>
      )}

      {/* 申请解锁 */}
      {unlockOpen && (
        <Modal title="申请解锁批次" onClose={() => setUnlockOpen(false)} width={440}>
          <div style={{ fontSize: 12, color: "var(--ink-2)", display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ margin: 0 }}>批次 <b className="num">{acc.lockInfo?.batchId}</b> 当前为只读状态。解锁原因将写入审计日志；演示环境自动审批通过，正式环境需管理员审批。</p>
            <textarea
              className="pf-input"
              style={{ width: "100%", minHeight: 64, resize: "vertical" }}
              placeholder="例如：第三方核查要求补充 7 月热力结算凭证"
              value={unlockReason}
              onChange={(e) => setUnlockReason(e.target.value)}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="pf-btn ghost" onClick={() => setUnlockOpen(false)}>取消</button>
              <button className="pf-btn danger" onClick={confirmUnlock}><Unlock size={13} /> 提交解锁申请</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
