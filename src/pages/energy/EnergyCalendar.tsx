// 用能日历与排班联动（moduleId: energy-calendar，MASTER_SPEC 6.1.5）
// 数据全部来自 src/services/timeseries.ts 确定性引擎；节假日与检修窗口是本页演示配置。
// 分档阈值 +8/+3/-3/-6 按 12 个月窗口实测偏差分布校准（p95≈+5.3%，极值 +11.8%/-7.7%）。
import dayjs from "dayjs";
import type { EChartsCoreOption, ECElementEvent } from "echarts";
import { BadgeCheck, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { useMemo, type CSSProperties } from "react";
import { EChart } from "../../components/EChart";
import { Delta, EmptyState, Kpi, PageHead, Panel, Tag } from "../../components/kit";
import { alarmLevelMeta, alarmStatusMeta } from "../../data/alarms";
import { anomalyChains } from "../../data/anomalies";
import { buildingName, mainBuildings } from "../../data/buildings";
import { demoAsOfDate, energyKindMeta } from "../../data/config";
import { canWrite } from "../../data/navigation";
import {
  bedOccupancy, dailySeries, hospitalDailyCarbonT, hourlySeries,
  outpatientVisits, sumUsage, surgeryCount, tempOfDate, toTce,
} from "../../services/timeseries";
import { useDemoStore } from "../../stores/demo";
import type { EnergyKind } from "../../types/core";

const MODULE_ID = "energy-calendar";
const KINDS: EnergyKind[] = ["electricity", "water", "gas", "heat", "medgas"];
const WINDOW_START = dayjs(demoAsOfDate).subtract(12, "month").add(1, "day").format("YYYY-MM-DD");
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
/** 业务量解释触发阈值（提示词：偏差 >10%）；异常档日即使未到 10% 也给判读 */
const JUDGE_PCT = 10;

const MONTHS: string[] = (() => {
  const list: string[] = [];
  let m = dayjs(WINDOW_START).startOf("month");
  const end = dayjs(demoAsOfDate).startOf("month");
  while (!m.isAfter(end)) { list.push(m.format("YYYY-MM")); m = m.add(1, "month"); }
  return list;
})();

interface TierDef { name: string; label: string; color: string }
const TIERS: TierDef[] = [
  { name: "异常偏高", label: "≥+8%", color: "#f4525f" },
  { name: "偏高", label: "+3~8%", color: "#f5a524" },
  { name: "正常", label: "±3%", color: "#35d399" },
  { name: "偏低", label: "-6~-3%", color: "#4da3ff" },
  { name: "异常偏低", label: "≤-6%", color: "#8b8df0" },
];
function tierOf(dev: number): TierDef {
  if (dev >= 8) return TIERS[0];
  if (dev >= 3) return TIERS[1];
  if (dev > -3) return TIERS[2];
  if (dev > -6) return TIERS[3];
  return TIERS[4];
}

/** 2025H2-2026 主要法定节假日（演示配置数组，非官方放假安排） */
const HOLIDAYS: { from: string; to: string; name: string }[] = [
  { from: "2025-10-01", to: "2025-10-08", name: "国庆·中秋" },
  { from: "2026-01-01", to: "2026-01-03", name: "元旦" },
  { from: "2026-02-16", to: "2026-02-22", name: "春节" },
  { from: "2026-04-04", to: "2026-04-06", name: "清明" },
  { from: "2026-05-01", to: "2026-05-05", name: "劳动节" },
  { from: "2026-06-19", to: "2026-06-21", name: "端午" },
];
/** 设备检修窗口（演示配置，关联设备台账 status=maintenance 的 DSA-01） */
const MAINTENANCE: { from: string; to: string; name: string; deviceId: string }[] = [
  { from: "2026-08-02", to: "2026-08-06", name: "DSA-01（介入）年度维护", deviceId: "DEV-IMG-DSA-01" },
];
const holidayOf = (date: string) => HOLIDAYS.find((h) => date >= h.from && date <= h.to)?.name ?? null;
const maintOf = (date: string) => MAINTENANCE.find((m) => date >= m.from && date <= m.to)?.name ?? null;

function hexA(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
const fmtPct = (x: number) => `${x > 0 ? "+" : ""}${x.toFixed(1)}%`;
function quantile(values: number[], q: number): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
}
/** 对同星期基线（前后 4 周同星期均值）的相对偏差 %（保留 1 位） */
function buildDevs(values: number[]): number[] {
  return values.map((v, i) => {
    const peers: number[] = [];
    for (const off of [-28, -21, -14, -7, 7, 14, 21, 28]) {
      const j = i + off;
      if (j >= 0 && j < values.length) peers.push(values[j]);
    }
    const base = peers.reduce((s, x) => s + x, 0) / peers.length;
    return base ? Math.round(((v - base) / base) * 1000) / 10 : 0;
  });
}
/** 对同星期基线的绝对差（气温用） */
function buildDeltas(values: number[]): number[] {
  return values.map((v, i) => {
    const peers: number[] = [];
    for (const off of [-28, -21, -14, -7, 7, 14, 21, 28]) {
      const j = i + off;
      if (j >= 0 && j < values.length) peers.push(values[j]);
    }
    return Math.round((v - peers.reduce((s, x) => s + x, 0) / peers.length) * 10) / 10;
  });
}
const devColor = (d: number) => (Math.abs(d) < 3 ? "var(--ink-3)" : tierOf(d).color);

function MarkBadge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{ fontSize: 9, lineHeight: "13px", padding: "0 3px", borderRadius: 3, background: hexA(color, 0.16), border: `1px solid ${hexA(color, 0.45)}`, color }}>
      {text}
    </span>
  );
}

const secTitle: CSSProperties = { fontSize: 11, color: "var(--ink-3)", margin: "10px 0 4px", letterSpacing: 1 };
const rightAlign: CSSProperties = { textAlign: "right" };

interface CellView {
  date: string; day: number; selectable: boolean; future: boolean;
  tier: TierDef | null; tce: number; dev: number;
  holiday: string | null; maint: string | null; ovPeak: boolean; sgPeak: boolean;
}

export function EnergyCalendarPage() {
  const { role, allPermissions, alarms, pageFilters, setPageFilter, pushToast } = useDemoStore();
  const writable = canWrite(MODULE_ID, role, allPermissions);
  const pf = pageFilters[MODULE_ID] ?? {};

  // ---------- 12 个月数据窗口（确定性，只算一次） ----------
  const win = useMemo(() => {
    const seriesByKind = KINDS.map((k) => dailySeries(k, WINDOW_START, demoAsOfDate));
    const dates = seriesByKind[0].map((p) => p.t);
    const kindVals = seriesByKind.map((s) => s.map((p) => p.v));
    const tce = dates.map((_, i) => KINDS.reduce((s, k, ki) => s + toTce(k, kindVals[ki][i]), 0));
    const dev = buildDevs(tce);
    const kindDevs = kindVals.map(buildDevs);
    const ov = dates.map(outpatientVisits);
    const sg = dates.map(surgeryCount);
    const bo = dates.map(bedOccupancy);
    const temps = dates.map(tempOfDate);
    return {
      dates, idx: new Map(dates.map((dt, i) => [dt, i])), tce, dev, kindVals, kindDevs,
      ov, sg, bo, temps,
      ovDev: buildDevs(ov), sgDev: buildDevs(sg), boDev: buildDevs(bo), tempDelta: buildDeltas(temps),
      ovPeakTh: quantile(ov, 0.86), sgPeakTh: quantile(sg, 0.88),
    };
  }, []);

  // ---------- 页面筛选（持久化） ----------
  const month = typeof pf.month === "string" && MONTHS.includes(pf.month) ? pf.month : dayjs(demoAsOfDate).format("YYYY-MM");
  const mi = MONTHS.indexOf(month);
  const selDate = typeof pf.date === "string" && win.idx.has(pf.date) ? pf.date : demoAsOfDate;
  const inWindow = (d: unknown): d is string => typeof d === "string" && win.idx.has(d);
  const cmpA = inWindow(pf.cmpA) ? pf.cmpA : "2026-07-21";
  const cmpB = inWindow(pf.cmpB) ? pf.cmpB : "2026-01-20";
  const cmpKind = (KINDS as string[]).includes(String(pf.cmpKind)) ? (pf.cmpKind as EnergyKind) : "electricity";
  const confirmed = typeof pf.confirmed === "string" ? pf.confirmed.split(",").filter(Boolean) : [];

  // ---------- KPI ----------
  const kpi = useMemo(() => {
    const last30From = dayjs(demoAsOfDate).subtract(29, "day").format("YYYY-MM-DD");
    const tceRange = (from: string, to: string) => KINDS.reduce((s, k) => s + toTce(k, sumUsage(k, from, to)), 0);
    const cur30 = tceRange(last30From, demoAsOfDate);
    const prev30 = tceRange(
      dayjs(last30From).subtract(1, "year").format("YYYY-MM-DD"),
      dayjs(demoAsOfDate).subtract(1, "year").format("YYYY-MM-DD"),
    );
    let veryHighDays = 0, veryLowDays = 0, normalDays = 0, lastVeryHigh = "";
    win.dates.forEach((dt, i) => {
      const t = tierOf(win.dev[i]);
      if (t === TIERS[0]) { veryHighDays++; lastVeryHigh = dt; }
      else if (t === TIERS[4]) veryLowDays++;
      else if (t === TIERS[2]) normalDays++;
    });
    return {
      cur30, yoy30: prev30 ? Math.round(((cur30 - prev30) / prev30) * 1000) / 10 : 0,
      veryHighDays, veryLowDays, lastVeryHigh,
      offNormalPct: Math.round(((win.dates.length - normalDays) / win.dates.length) * 1000) / 10,
      holidayDays: win.dates.filter((dt) => holidayOf(dt)).length,
      maintDays: win.dates.filter((dt) => maintOf(dt)).length,
      ovPeakDays: win.ov.filter((v) => v >= win.ovPeakTh).length,
      sgPeakDays: win.sg.filter((v) => v >= win.sgPeakTh).length,
    };
  }, [win]);

  // ---------- 近 12 个月热力日历 ----------
  const heatOption = useMemo<EChartsCoreOption>(() => {
    const data = win.dates.map((dt, i) => [dt, win.dev[i], Math.round(win.tce[i] * 10) / 10]);
    const holidayDots: { name: string; value: [string, number] }[] = [];
    const maintDots: { name: string; value: [string, number] }[] = [];
    win.dates.forEach((dt) => {
      const h = holidayOf(dt);
      if (h) holidayDots.push({ name: h, value: [dt, 0] });
      const m = maintOf(dt);
      if (m) maintDots.push({ name: m, value: [dt, 0] });
    });
    return {
      legend: false,
      tooltip: {
        trigger: "item",
        formatter: (raw: unknown) => {
          const p = raw as { seriesIndex: number; name?: string; value?: [string, number, number] };
          const dt = p.value?.[0];
          if (!dt) return "";
          const head = `<b>${dt}（周${WEEKDAYS[dayjs(dt).day()]}）</b>`;
          if (p.seriesIndex === 1) return `${head}<br/>节假日：${p.name}`;
          if (p.seriesIndex === 2) return `${head}<br/>设备检修：${p.name}`;
          const marks = [holidayOf(dt), maintOf(dt)].filter(Boolean).join(" · ");
          return `${head}<br/>综合能耗 ${p.value![2]} tce<br/>较同星期基线 ${fmtPct(p.value![1])} · ${tierOf(p.value![1]).name}${marks ? `<br/>${marks}` : ""}<br/><span style="color:#5f7799">点击查看当日详情</span>`;
        },
      },
      visualMap: {
        type: "piecewise", dimension: 1, seriesIndex: 0,
        orient: "horizontal", left: "center", bottom: 0,
        itemWidth: 12, itemHeight: 8, textGap: 4, itemGap: 12,
        textStyle: { color: "#9db4d6", fontSize: 10 },
        pieces: [
          { min: 8, label: `异常偏高 ≥+8%`, color: hexA(TIERS[0].color, 0.9) },
          { min: 3, max: 8, label: "偏高 +3~8%", color: hexA(TIERS[1].color, 0.8) },
          { min: -3, max: 3, label: "正常 ±3%", color: hexA(TIERS[2].color, 0.42) },
          { min: -6, max: -3, label: "偏低 -6~-3%", color: hexA(TIERS[3].color, 0.65) },
          { max: -6, label: "异常偏低 ≤-6%", color: hexA(TIERS[4].color, 0.9) },
        ],
      },
      calendar: {
        top: 24, left: 46, right: 8, cellSize: ["auto", 14],
        range: [WINDOW_START, demoAsOfDate],
        splitLine: { lineStyle: { color: "rgba(95,119,153,0.5)", width: 1 } },
        itemStyle: { color: "rgba(13,27,50,0.35)", borderColor: "rgba(9,19,38,0.9)", borderWidth: 1 },
        dayLabel: { firstDay: 1, nameMap: "ZH", color: "#5f7799", fontSize: 9 },
        monthLabel: { nameMap: "ZH", color: "#9db4d6", fontSize: 10 },
        yearLabel: { show: false },
      },
      series: [
        { type: "heatmap", coordinateSystem: "calendar", data },
        { type: "scatter", coordinateSystem: "calendar", data: holidayDots, symbolSize: 4, itemStyle: { color: "#f5a524" }, z: 3 },
        { type: "scatter", coordinateSystem: "calendar", data: maintDots, symbol: "diamond", symbolSize: 6, itemStyle: { color: "#29d3e8" }, z: 3 },
      ],
    };
  }, [win]);

  const onHeatClick = (p: ECElementEvent) => {
    const v = (p as { value?: unknown }).value;
    if (Array.isArray(v) && typeof v[0] === "string" && win.idx.has(v[0])) {
      setPageFilter(MODULE_ID, { date: v[0], month: v[0].slice(0, 7) });
    }
  };

  // ---------- 月视图 ----------
  const monthView = useMemo(() => {
    const m = dayjs(`${month}-01`);
    const cells: (CellView | null)[] = Array.from({ length: (m.day() + 6) % 7 }, () => null);
    const stat = { days: 0, tce: 0, carbon: 0, veryHigh: 0, holidays: 0, maint: 0, ovPeaks: 0, sgPeaks: 0 };
    for (let day = 1; day <= m.daysInMonth(); day++) {
      const date = m.date(day).format("YYYY-MM-DD");
      const i = win.idx.get(date);
      const holiday = holidayOf(date);
      const maint = maintOf(date);
      if (i === undefined) {
        cells.push({ date, day, selectable: false, future: date > demoAsOfDate, tier: null, tce: 0, dev: 0, holiday, maint, ovPeak: false, sgPeak: false });
        continue;
      }
      const dev = win.dev[i];
      const tier = tierOf(dev);
      const ovPeak = win.ov[i] >= win.ovPeakTh;
      const sgPeak = win.sg[i] >= win.sgPeakTh;
      stat.days++; stat.tce += win.tce[i]; stat.carbon += hospitalDailyCarbonT(date);
      if (tier === TIERS[0]) stat.veryHigh++;
      if (holiday) stat.holidays++;
      if (maint) stat.maint++;
      if (ovPeak) stat.ovPeaks++;
      if (sgPeak) stat.sgPeaks++;
      cells.push({ date, day, selectable: true, future: false, tier, tce: win.tce[i], dev, holiday, maint, ovPeak, sgPeak });
    }
    while (cells.length % 7) cells.push(null);
    return { cells, stat };
  }, [month, win]);

  // ---------- 选中日详情与自动判读 ----------
  const detail = useMemo(() => {
    const i = win.idx.get(selDate)!;
    const dev = win.dev[i];
    const tier = tierOf(dev);
    const perKind = KINDS.map((k, ki) => ({
      kind: k, name: energyKindMeta[k].name, unit: energyKindMeta[k].unit,
      usage: win.kindVals[ki][i], tce: toTce(k, win.kindVals[ki][i]), dev: win.kindDevs[ki][i],
    }));
    const dayAlarms = alarms.filter((a) => a.startAt.slice(0, 10) === selDate);
    const activeAnomalies = anomalyChains.filter((a) => a.from <= selDate && selDate <= (a.to ?? demoAsOfDate));
    const ovD = win.ovDev[i], sgD = win.sgDev[i], boD = win.boDev[i], tD = win.tempDelta[i];
    const temp = win.temps[i];
    // 判读：偏差 >10% 或落入异常档时，自动拉取业务量区分业务驱动与运行异常
    let judge: null | { kind: "business" | "abnormal"; title: string; confidence: number; reasons: string[] } = null;
    if (Math.abs(dev) > JUDGE_PCT || tier === TIERS[0] || tier === TIERS[4]) {
      const up = dev > 0;
      const mo = dayjs(selDate).month() + 1;
      const heating = mo >= 11 || mo <= 3;
      const cooling = mo >= 5 && mo <= 9;
      const drivers: string[] = [];
      if (up ? ovD >= 6 : ovD <= -6) drivers.push(`门诊 ${win.ov[i].toLocaleString("zh-CN")} 人次，较同星期基线 ${fmtPct(ovD)}`);
      if (up ? sgD >= 8 : sgD <= -8) drivers.push(`手术 ${win.sg[i]} 台，较同星期基线 ${fmtPct(sgD)}`);
      if (up ? boD >= 3 : boD <= -3) drivers.push(`床位使用率 ${win.bo[i]}%，较同星期基线 ${fmtPct(boD)}`);
      const weatherUp = (heating && tD <= -2.5) || (cooling && tD >= 2.5);
      const weatherDown = (heating && tD >= 2.5) || (cooling && tD <= -2.5);
      if (up && weatherUp) drivers.push(`气温 ${temp}℃，较同星期基线${tD > 0 ? "高" : "低"} ${Math.abs(tD).toFixed(1)}℃，${heating ? "供暖" : "制冷"}负荷抬升（季节性）`);
      if (!up && weatherDown) drivers.push(`气温 ${temp}℃，较同星期基线${tD > 0 ? "高" : "低"} ${Math.abs(tD).toFixed(1)}℃，${heating ? "供暖" : "制冷"}负荷回落（季节性）`);
      const chains = activeAnomalies.filter((c) => c.factor !== 1 && c.factor > 1 === up);
      const head = `综合折标煤较同星期基线 ${fmtPct(dev)}（判读触发：>±${JUDGE_PCT}% 或异常档）`;
      if (drivers.length) {
        judge = {
          kind: "business", title: "业务驱动型正常波动",
          confidence: Math.min(94, 68 + drivers.length * 8 - (chains.length ? 6 : 0)),
          reasons: [head, ...drivers, ...(chains.length ? [`注意：同期仍有 ${chains.length} 条进行中异常链，剔除业务/天气因素后建议复核`] : [])],
        };
      } else {
        judge = {
          kind: "abnormal", title: "疑似运行异常",
          confidence: chains.length ? 89 : 74,
          reasons: [
            head,
            `业务量不足以解释：门诊 ${fmtPct(ovD)}、手术 ${fmtPct(sgD)}、床位 ${fmtPct(boD)}、气温偏差 ${tD > 0 ? "+" : ""}${tD.toFixed(1)}℃，均在正常带内`,
            ...chains.slice(0, 3).map((c) => `疑似关联异常链 ${c.id}：${c.title}（${buildingName(c.buildingId)}，${energyKindMeta[c.energyKind].name} ${fmtPct((c.factor - 1) * 100)}）`),
            ...(chains.length ? [] : ["未匹配到进行中异常链，建议排查表计数据质量与临时性用能"]),
          ],
        };
      }
    }
    return {
      i, dev, tier, perKind, dayAlarms, activeAnomalies, judge, temp,
      tceDay: win.tce[i], carbon: hospitalDailyCarbonT(selDate),
      ov: win.ov[i], sg: win.sg[i], bo: win.bo[i], ovD, sgD, boD,
      holiday: holidayOf(selDate), maint: maintOf(selDate),
      ovPeak: win.ov[i] >= win.ovPeakTh, sgPeak: win.sg[i] >= win.sgPeakTh,
    };
  }, [selDate, win, alarms]);

  const isConfirmed = confirmed.includes(selDate);
  const confirmJudge = () => {
    if (!detail.judge || isConfirmed) return;
    setPageFilter(MODULE_ID, { confirmed: [...confirmed, selDate].join(",") });
    pushToast("人工确认完成", `${selDate} 判定「${detail.judge.title}」已人工确认`, "success");
  };

  // ---------- 季节 / 典型日对比 ----------
  const cmp = useMemo(() => {
    const stats = (date: string) => {
      const kinds = KINDS.map((k) => sumUsage(k, date, date));
      return {
        date, wd: WEEKDAYS[dayjs(date).day()], holiday: holidayOf(date),
        tce: KINDS.reduce((s, k, ki) => s + toTce(k, kinds[ki]), 0),
        carbon: hospitalDailyCarbonT(date), kinds,
        ov: outpatientVisits(date), sg: surgeryCount(date), bo: bedOccupancy(date), temp: tempOfDate(date),
      };
    };
    const hourly = (date: string) => {
      const arr = Array.from({ length: 24 }, () => 0);
      mainBuildings.forEach((b) => hourlySeries(b.id, cmpKind, date).forEach((p, h) => { arr[h] += p.v; }));
      return arr.map((v) => Math.round(v * 10) / 10);
    };
    return { a: stats(cmpA), b: stats(cmpB), hoursA: hourly(cmpA), hoursB: hourly(cmpB) };
  }, [cmpA, cmpB, cmpKind]);

  const cmpOption = useMemo<EChartsCoreOption>(() => {
    const nameA = `A ${cmpA}（周${cmp.a.wd}）`;
    const nameB = `B ${cmpB}（周${cmp.b.wd}）`;
    return {
      tooltip: { valueFormatter: (v: unknown) => `${v} ${energyKindMeta[cmpKind].unit}` },
      grid: { left: 58, right: 14, top: 30, bottom: 24 },
      xAxis: { type: "category", data: Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`) },
      yAxis: { type: "value", name: energyKindMeta[cmpKind].unit, nameTextStyle: { color: "#5f7799" } },
      series: [
        { name: nameA, type: "line", smooth: true, symbol: "none", data: cmp.hoursA, areaStyle: { opacity: 0.1 } },
        { name: nameB, type: "line", smooth: true, symbol: "none", data: cmp.hoursB, lineStyle: { type: "dashed" } },
      ],
    };
  }, [cmp, cmpA, cmpB, cmpKind]);

  const cmpRows: { label: string; a: number; b: number; digits?: number; abs?: boolean; absUnit?: string }[] = [
    { label: "综合折标煤（tce）", a: cmp.a.tce, b: cmp.b.tce, digits: 1 },
    { label: "碳排放（tCO₂e）", a: cmp.a.carbon, b: cmp.b.carbon, digits: 1 },
    ...KINDS.map((k, ki) => ({ label: `${energyKindMeta[k].name}（${energyKindMeta[k].unit}）`, a: cmp.a.kinds[ki], b: cmp.b.kinds[ki] })),
    { label: "门诊（人次）", a: cmp.a.ov, b: cmp.b.ov },
    { label: "手术（台）", a: cmp.a.sg, b: cmp.b.sg },
    { label: "床位使用率（%）", a: cmp.a.bo, b: cmp.b.bo, digits: 1, abs: true, absUnit: "pp" },
    { label: "平均气温（℃）", a: cmp.a.temp, b: cmp.b.temp, digits: 1, abs: true, absUnit: "℃" },
  ];

  const setCmpPreset = (a: string, b: string) => {
    if (!win.idx.has(a) || !win.idx.has(b)) {
      pushToast("超出数据窗口", `对比日期须在 ${WINDOW_START} ~ ${demoAsOfDate} 内`, "warning");
      return;
    }
    setPageFilter(MODULE_ID, { cmpA: a, cmpB: b });
  };

  // ---------- 导出（与当前月视图一致） ----------
  const exportMonth = async () => {
    const rows = monthView.cells
      .filter((c): c is CellView => !!c && c.selectable)
      .map((c) => {
        const i = win.idx.get(c.date)!;
        const marks = [
          c.holiday && `节假日:${c.holiday}`, c.maint && `检修:${c.maint}`,
          c.ovPeak && "门诊高峰", c.sgPeak && "手术高峰",
        ].filter(Boolean).join(" / ");
        return {
          日期: c.date, 星期: `周${WEEKDAYS[dayjs(c.date).day()]}`,
          "综合折标煤(tce)": c.tce.toFixed(2), "较同星期基线(%)": c.dev.toFixed(1), 分档: c.tier?.name ?? "",
          "电力(kWh)": win.kindVals[0][i], "水(m³)": win.kindVals[1][i], "天然气(m³)": win.kindVals[2][i],
          "热力(GJ)": win.kindVals[3][i], "医用气体(m³)": win.kindVals[4][i],
          "碳排(tCO₂e)": hospitalDailyCarbonT(c.date),
          "门诊(人次)": win.ov[i], "手术(台)": win.sg[i], "床位使用率(%)": win.bo[i], "平均气温(℃)": win.temps[i],
          标注: marks,
        };
      });
    if (!rows.length) {
      pushToast("无可导出数据", "当月没有落在数据窗口内的日期", "warning");
      return;
    }
    const { downloadCsv } = await import("../../utils/downloads");
    downloadCsv(rows, `用能日历_${month}_Demo模拟.csv`);
    pushToast("导出完成", `已导出 ${month} 逐日明细 ${rows.length} 行（Demo 模拟数据）`, "success");
  };

  const selectDate = (date: string) => setPageFilter(MODULE_ID, { date });
  const setMonth = (m: string) => setPageFilter(MODULE_ID, { month: m });
  const goToday = () => setPageFilter(MODULE_ID, { date: demoAsOfDate, month: dayjs(demoAsOfDate).format("YYYY-MM") });

  return (
    <>
      <PageHead
        title="用能日历与排班联动"
        sub={`逐日折标煤热力日历 · 门诊/手术/床位业务联动判读 · 数据窗口 ${WINDOW_START} ~ ${demoAsOfDate}`}
        actions={
          <>
            <button className="pf-btn ghost" onClick={goToday}>回到今天</button>
            <button className="pf-btn" onClick={exportMonth}><Download size={13} /> 导出当月明细 CSV</button>
          </>
        }
      />

      <div className="grid cols-5">
        <Kpi label="近 30 日综合折标煤" value={Math.round(kpi.cur30).toLocaleString("zh-CN")} unit="tce" sub={<Delta pct={kpi.yoy30} />} />
        <Kpi label={`当月累计（${month}）`} value={Math.round(monthView.stat.tce).toLocaleString("zh-CN")} unit="tce"
          sub={`碳排 ${Math.round(monthView.stat.carbon).toLocaleString("zh-CN")} tCO₂e · ${monthView.stat.days} 天`} />
        <Kpi label="异常偏高天数（12 个月）" value={kpi.veryHighDays} unit="天" tone={kpi.veryHighDays ? "red" : "green"}
          sub={kpi.lastVeryHigh ? `最近 ${kpi.lastVeryHigh} · 异常偏低 ${kpi.veryLowDays} 天` : `异常偏低 ${kpi.veryLowDays} 天`} />
        <Kpi label="偏离正常带占比" value={kpi.offNormalPct} unit="%" tone="amber" sub={`正常带 ±3% · 窗口 ${win.dates.length} 天`} />
        <Kpi label="节假日 / 检修（窗口内）" value={`${kpi.holidayDays} / ${kpi.maintDays}`} unit="天"
          sub={`门诊高峰 ${kpi.ovPeakDays} 天 · 手术高峰 ${kpi.sgPeakDays} 天`} />
      </div>

      <Panel
        title="近 12 个月逐日热力日历（全院综合能耗折标煤，tce）"
        style={{ marginTop: 10 }}
        extra={<span>五档 = 对前后 4 周同星期基线的偏差 · ● 节假日 ◆ 检修 · 点击日期查看详情</span>}
      >
        <EChart height={200} option={heatOption} onClick={onHeatClick} />
      </Panel>

      <div className="grid cols-3" style={{ marginTop: 10 }}>
        <Panel
          title={`月视图 ${month}`}
          style={{ gridColumn: "span 2" }}
          extra={
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button className="pf-btn ghost" disabled={mi <= 0} onClick={() => setMonth(MONTHS[mi - 1])} aria-label="上一月"><ChevronLeft size={13} /></button>
              <select className="pf-select" value={month} onChange={(e) => setMonth(e.target.value)} style={{ padding: "3px 8px" }}>
                {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <button className="pf-btn ghost" disabled={mi >= MONTHS.length - 1} onClick={() => setMonth(MONTHS[mi + 1])} aria-label="下一月"><ChevronRight size={13} /></button>
            </span>
          }
        >
          <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--ink-2)", marginBottom: 8, flexWrap: "wrap" }}>
            <span>当月累计 <b className="num">{monthView.stat.tce.toFixed(1)}</b> tce</span>
            <span>碳排 <b className="num">{monthView.stat.carbon.toFixed(1)}</b> tCO₂e</span>
            <span>异常偏高 <b className="num" style={{ color: monthView.stat.veryHigh ? TIERS[0].color : undefined }}>{monthView.stat.veryHigh}</b> 天</span>
            <span>节假日 <b className="num">{monthView.stat.holidays}</b> 天</span>
            <span>检修 <b className="num">{monthView.stat.maint}</b> 天</span>
            <span>门诊高峰 <b className="num">{monthView.stat.ovPeaks}</b> · 手术高峰 <b className="num">{monthView.stat.sgPeaks}</b> 天</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
            {["一", "二", "三", "四", "五", "六", "日"].map((w) => (
              <div key={w} style={{ textAlign: "center", fontSize: 10, color: "var(--ink-3)", padding: "2px 0" }}>周{w}</div>
            ))}
            {monthView.cells.map((c, idx) => c ? (
              <button
                key={c.date}
                onClick={() => c.selectable && selectDate(c.date)}
                disabled={!c.selectable}
                title={c.selectable ? `${c.date} 点击查看详情` : c.date}
                style={{
                  textAlign: "left", font: "inherit", minHeight: 56, borderRadius: 7, padding: "4px 6px",
                  border: `1px solid ${c.tier ? hexA(c.tier.color, 0.4) : "rgba(56,116,178,0.18)"}`,
                  outline: selDate === c.date ? "1px solid var(--cyan)" : "none",
                  background: c.tier ? hexA(c.tier.color, 0.13) : "transparent",
                  cursor: c.selectable ? "pointer" : "default",
                  opacity: c.selectable ? 1 : 0.45, color: "var(--ink-2)",
                }}
              >
                <span style={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
                  <b style={{ fontSize: 11, color: "var(--ink-1)" }}>{c.day}</b>
                  <span style={{ display: "flex", gap: 2 }}>
                    {c.holiday && <MarkBadge text="假" color="#f5a524" />}
                    {c.maint && <MarkBadge text="检" color="#29d3e8" />}
                    {c.ovPeak && <MarkBadge text="门" color="#4da3ff" />}
                    {c.sgPeak && <MarkBadge text="术" color="#8b8df0" />}
                  </span>
                </span>
                {c.tier ? (
                  <>
                    <span className="num" style={{ display: "block", fontSize: 11, color: "var(--ink-1)", marginTop: 3 }}>
                      {c.tce.toFixed(1)} <span style={{ fontSize: 9, color: "var(--ink-3)" }}>tce</span>
                    </span>
                    <span className="num" style={{ display: "block", fontSize: 9, color: c.tier.color }}>{fmtPct(c.dev)}</span>
                  </>
                ) : (
                  <span style={{ display: "block", fontSize: 9, color: "var(--ink-3)", marginTop: 4 }}>
                    {c.future ? (c.maint ? "计划检修" : "未来日期") : "窗口外"}
                  </span>
                )}
              </button>
            ) : <div key={`e-${idx}`} />)}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8, fontSize: 10, color: "var(--ink-3)", alignItems: "center" }}>
            {TIERS.map((t) => (
              <span key={t.name} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <i style={{ width: 8, height: 8, borderRadius: 2, background: hexA(t.color, 0.7), display: "inline-block" }} />
                {t.name} {t.label}
              </span>
            ))}
            <span style={{ marginLeft: "auto" }}>基线 = 前后 4 周同星期均值 · 节假日为演示配置</span>
          </div>
        </Panel>

        <Panel title="当日详情与联动判读" extra={<Tag tone="muted">模拟诊断</Tag>}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <b style={{ fontSize: 13, color: "var(--ink-1)" }}>{selDate} 周{WEEKDAYS[dayjs(selDate).day()]}</b>
            <span style={{ fontSize: 10, padding: "1px 8px", borderRadius: 999, border: `1px solid ${hexA(detail.tier.color, 0.5)}`, color: detail.tier.color, background: hexA(detail.tier.color, 0.12) }}>
              {detail.tier.name} {fmtPct(detail.dev)}
            </span>
            {detail.holiday && <Tag tone="warn">节假日 · {detail.holiday}</Tag>}
            {detail.maint && <Tag tone="info">检修 · {detail.maint}</Tag>}
            {detail.ovPeak && <Tag tone="info">门诊高峰</Tag>}
            {detail.sgPeak && <Tag tone="info">手术高峰</Tag>}
          </div>
          <div style={{ display: "flex", gap: 14, margin: "8px 0 6px", fontSize: 11, color: "var(--ink-2)", flexWrap: "wrap" }}>
            <span>综合 <b className="num" style={{ fontSize: 16, color: "var(--ink-1)" }}>{detail.tceDay.toFixed(1)}</b> tce</span>
            <span>碳排 <b className="num">{detail.carbon.toFixed(1)}</b> tCO₂e</span>
            <span>气温 <b className="num">{detail.temp.toFixed(1)}</b> ℃</span>
          </div>
          <table className="pf-table">
            <thead>
              <tr><th>品种</th><th style={rightAlign}>用量</th><th style={rightAlign}>折标煤 tce</th><th style={rightAlign}>对基线</th></tr>
            </thead>
            <tbody>
              {detail.perKind.map((r) => (
                <tr key={r.kind}>
                  <td>{r.name}</td>
                  <td className="num" style={rightAlign}>{r.usage.toLocaleString("zh-CN")} {r.unit}</td>
                  <td className="num" style={rightAlign}>{r.tce.toFixed(2)}</td>
                  <td className="num" style={{ ...rightAlign, color: devColor(r.dev) }}>{fmtPct(r.dev)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 8 }}>
            {[
              { label: "门诊", v: detail.ov.toLocaleString("zh-CN"), unit: "人次", dev: detail.ovD, peak: detail.ovPeak },
              { label: "手术", v: String(detail.sg), unit: "台", dev: detail.sgD, peak: detail.sgPeak },
              { label: "床位使用率", v: String(detail.bo), unit: "%", dev: detail.boD, peak: false },
            ].map((b) => (
              <div key={b.label} style={{ background: "rgba(41,211,232,0.05)", border: "1px solid rgba(56,116,178,0.25)", borderRadius: 8, padding: "6px 8px" }}>
                <div style={{ fontSize: 10, color: "var(--ink-3)" }}>{b.label}{b.peak && <span style={{ color: "var(--amber)" }}> · 高峰</span>}</div>
                <div className="num" style={{ fontSize: 15, color: "var(--ink-1)" }}>{b.v}<small style={{ fontSize: 10, color: "var(--ink-3)" }}> {b.unit}</small></div>
                <div className="num" style={{ fontSize: 10, color: Math.abs(b.dev) < 3 ? "var(--ink-3)" : b.dev > 0 ? "var(--amber)" : "var(--cyan)" }}>基线 {fmtPct(b.dev)}</div>
              </div>
            ))}
          </div>

          {detail.judge ? (
            <div style={{
              border: `1px solid ${hexA(detail.judge.kind === "business" ? "#35d399" : "#f5a524", 0.45)}`,
              background: hexA(detail.judge.kind === "business" ? "#35d399" : "#f5a524", 0.07),
              borderRadius: 8, padding: "8px 10px", marginTop: 10,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <b style={{ fontSize: 12, color: detail.judge.kind === "business" ? "var(--green)" : "var(--amber)" }}>{detail.judge.title}</b>
                <span style={{ display: "flex", gap: 6 }}>
                  <Tag tone="muted">模拟诊断</Tag>
                  <Tag tone={detail.judge.kind === "business" ? "ok" : "warn"}>置信度 {detail.judge.confidence}%</Tag>
                </span>
              </div>
              <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 11, color: "var(--ink-2)", display: "grid", gap: 3 }}>
                {detail.judge.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, color: "var(--ink-3)" }}>不影响医疗安全 · 保障优先，本判定不下发任何自动控制</span>
                {isConfirmed
                  ? <Tag tone="ok">已人工确认</Tag>
                  : (
                    <button className="pf-btn" disabled={!writable} title={writable ? "确认后计入判读台账" : "当前角色无本模块写权限"} onClick={confirmJudge}>
                      <BadgeCheck size={13} /> 人工确认判定
                    </button>
                  )}
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "10px 0 0" }}>
              当日综合偏差 {fmtPct(detail.dev)}，在判读触发阈值（±{JUDGE_PCT}% 或异常档）内，无需异常判读。
            </p>
          )}

          <p style={secTitle}>当日新增告警（{detail.dayAlarms.length}）</p>
          {detail.dayAlarms.length ? (
            <div style={{ display: "grid", gap: 4 }}>
              {detail.dayAlarms.map((a) => (
                <div key={a.id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: "var(--ink-2)" }}>
                  <Tag tone={a.level === "critical" ? "danger" : a.level === "warning" ? "warn" : "info"}>{alarmLevelMeta[a.level]}</Tag>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.detail}>{a.title}</span>
                  <Tag tone="muted">{alarmStatusMeta[a.status]}</Tag>
                </div>
              ))}
            </div>
          ) : <EmptyState text="当日无新增告警" />}

          <p style={secTitle}>覆盖当日的异常链（{detail.activeAnomalies.length}）</p>
          {detail.activeAnomalies.length ? (
            <div style={{ display: "grid", gap: 4 }}>
              {detail.activeAnomalies.slice(0, 5).map((c) => (
                <div key={c.id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: "var(--ink-2)" }}>
                  <Tag tone={c.level === "critical" ? "danger" : c.level === "warning" ? "warn" : "info"}>{c.id}</Tag>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.rootCause}>{c.title}</span>
                  <span className="num" style={{ color: "var(--ink-3)" }}>{c.factor !== 1 ? fmtPct((c.factor - 1) * 100) : "数据/合规"}</span>
                </div>
              ))}
              {detail.activeAnomalies.length > 5 && (
                <span style={{ fontSize: 10, color: "var(--ink-3)" }}>等 {detail.activeAnomalies.length} 条，完整列表见能源诊断中心</span>
              )}
            </div>
          ) : <p style={{ fontSize: 11, color: "var(--ink-3)", margin: 0 }}>无覆盖当日的异常链</p>}
        </Panel>
      </div>

      <Panel title="季节与典型日对比（两日期 24 小时曲线）" style={{ marginTop: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8, fontSize: 11, color: "var(--ink-2)" }}>
          <span>品种</span>
          <select className="pf-select" value={cmpKind} onChange={(e) => setPageFilter(MODULE_ID, { cmpKind: e.target.value })}>
            {KINDS.map((k) => <option key={k} value={k}>{energyKindMeta[k].name}（{energyKindMeta[k].unit}）</option>)}
          </select>
          <span>日期 A</span>
          <input className="pf-input" type="date" min={WINDOW_START} max={demoAsOfDate} value={cmpA}
            onChange={(e) => e.target.value && setCmpPreset(e.target.value, cmpB)} />
          <span>日期 B</span>
          <input className="pf-input" type="date" min={WINDOW_START} max={demoAsOfDate} value={cmpB}
            onChange={(e) => e.target.value && setCmpPreset(cmpA, e.target.value)} />
          <span style={{ marginLeft: 6, color: "var(--ink-3)" }}>快捷：</span>
          <button className="pf-btn ghost" onClick={() => setCmpPreset("2026-07-21", "2026-01-20")}>夏冬典型日</button>
          <button className="pf-btn ghost" onClick={() => setCmpPreset("2026-07-29", "2026-08-01")}>工作日 vs 周末</button>
          <button className="pf-btn ghost" onClick={() => setCmpPreset("2026-05-01", "2026-04-24")}>节假日 vs 平日</button>
          <button className="pf-btn ghost" onClick={() => setCmpPreset(selDate, dayjs(selDate).subtract(7, "day").format("YYYY-MM-DD"))}>选中日 vs 上周同日</button>
        </div>
        <div className="grid cols-2">
          <EChart height={260} option={cmpOption} />
          <div style={{ overflowX: "auto" }}>
            <table className="pf-table">
              <thead>
                <tr>
                  <th>指标</th>
                  <th style={rightAlign}>A {cmpA} 周{cmp.a.wd}{cmp.a.holiday ? `（${cmp.a.holiday}）` : ""}</th>
                  <th style={rightAlign}>B {cmpB} 周{cmp.b.wd}{cmp.b.holiday ? `（${cmp.b.holiday}）` : ""}</th>
                  <th style={rightAlign}>A 相对 B</th>
                </tr>
              </thead>
              <tbody>
                {cmpRows.map((r) => {
                  const delta = r.abs ? r.a - r.b : (r.b ? ((r.a - r.b) / r.b) * 100 : 0);
                  const deltaText = r.abs ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} ${r.absUnit}` : fmtPct(delta);
                  const strong = r.abs ? Math.abs(delta) >= 2 : Math.abs(delta) >= 10;
                  return (
                    <tr key={r.label}>
                      <td>{r.label}</td>
                      <td className="num" style={rightAlign}>{r.digits ? r.a.toFixed(r.digits) : r.a.toLocaleString("zh-CN")}</td>
                      <td className="num" style={rightAlign}>{r.digits ? r.b.toFixed(r.digits) : r.b.toLocaleString("zh-CN")}</td>
                      <td className="num" style={{ ...rightAlign, color: strong ? (delta > 0 ? "var(--amber)" : "var(--cyan)") : "var(--ink-3)" }}>{deltaText}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>
    </>
  );
}
