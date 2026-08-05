// 6.1.3 医用气体管理：氧气三级监测 / 笑气 N2O / 压缩空气 / 负压吸引 / 特种气体
// / 管路健康与泄漏定位 / 扩展边界碳排换算 / 费用与科室分摊。
// 数据全部来自 services/timeseries 与 data/*，分气体份额为演示假设（页内标注）。
import dayjs from "dayjs";
import {
  Activity, Coins, Download, Droplets, FlaskConical, Gauge, Moon,
  ShieldAlert, Thermometer, Wind, Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";
import { EChart, CHART_COLORS } from "../../components/EChart";
import { Delta, Kpi, Modal, PageHead, Panel, Tag } from "../../components/kit";
import { anomalyById } from "../../data/anomalies";
import { alarmStatusMeta } from "../../data/alarms";
import { workOrderStatusMeta } from "../../data/workorders";
import { mainBuildings } from "../../data/buildings";
import { demoAsOfDate, energyKindMeta } from "../../data/config";
import { deviceById } from "../../data/devices";
import { factorById } from "../../data/factors";
import { canWrite } from "../../data/navigation";
import { unitNoise } from "../../data/rng";
import { alarmTransitions } from "../../services/machines";
import {
  bedOccupancy, dailySeries, dailyUsage, hourlyShape, monthlySeries,
  sumUsage, surgeryCount, tempOfDate, yoyPct,
} from "../../services/timeseries";
import { useDemoStore } from "../../stores/demo";
import type { AlarmStatus, BuildingId } from "../../types/core";

const PAGE_ID = "medical-gas";

/** 分气体份额（演示假设：全院医气总量口径一致，份额合计 = 1） */
const GAS = { o2: 0.78, air: 0.19, n2o: 0.002, n2: 0.02, ar: 0.008 } as const;
/** N2O 密度 kg/m³（0℃, 101.325 kPa，演示口径） */
const N2O_DENSITY = 1.98;
/** N2O 夜间最小流量阈值 m³/h（演示口径） */
const LEAK_THRESHOLD = 0.05;

const O2_FACTOR = factorById["ef-oxygen-ext"];
const N2O_FACTOR = factorById["ef-n2o-ar6"];
const DESF_FACTOR = factorById["ef-desflurane"];
const GWP_OPTIONS = [
  { ver: "AR6", year: "2021", value: 273, note: "IPCC 第六次评估报告（平台默认）" },
  { ver: "AR5", year: "2014", value: 265, note: "IPCC 第五次评估报告" },
  { ver: "AR4", year: "2007", value: 298, note: "IPCC 第四次评估报告" },
] as const;

const MEDGAS_PRICE = energyKindMeta.medgas.price; // 2.6 元/m³
const AN5 = anomalyById["AN-005"];
const airCompressor = deviceById["DEV-PWR-AIR-01"];
const vacuumPump = deviceById["DEV-PWR-VAC-01"];

// ---------- 模块级确定性计算（不依赖筛选，只算一次） ----------
const D = dayjs(demoAsOfDate);
const today = demoAsOfDate;
const monthStart = D.format("YYYY-MM-01");
const from30 = D.subtract(29, "day").format("YYYY-MM-DD");
const medgasBuildings = mainBuildings.filter((b) => b.baseDaily.medgas > 0);
const TOTAL_BEDS = mainBuildings.reduce((s, b) => s + b.beds, 0);

const todayTotal = sumUsage("medgas", today, today);
const use30Total = sumUsage("medgas", from30, today);
const yoy30 = yoyPct("medgas", from30, today);
const occToday = bedOccupancy(today);
const occ30 = (() => {
  let s = 0;
  for (let i = 0; i < 30; i++) s += bedOccupancy(D.subtract(i, "day").format("YYYY-MM-DD"));
  return s / 30;
})();
const o2Today = todayTotal * GAS.o2;
const bedDayO2Today = o2Today / (TOTAL_BEDS * occToday / 100);
const cost30 = use30Total * MEDGAS_PRICE;
const bedDayCost30 = cost30 / (TOTAL_BEDS * (occ30 / 100) * 30);

// 一级：液氧罐（20 m³，液气膨胀比 1:800，演示口径）
const loxLevelPct = Math.round((58 + unitNoise(`lox:${today}`) * 18) * 10) / 10;
const loxGasEquiv = Math.round((loxLevelPct / 100) * 20 * 800);
const o2Daily30Avg = (use30Total * GAS.o2) / 30;
const loxDaysLeft = Math.round((loxGasEquiv / o2Daily30Avg) * 10) / 10;
const loxRefillDate = D.add(Math.max(1, Math.floor(loxDaysLeft) - 1), "day").format("MM-DD");
const loxPressure = Math.round((0.78 + unitNoise(`loxp:${today}`) * 0.08) * 100) / 100;
// 二级：汇流排（备用 8.2 bar 与 AN-005 证据一致）
const manifoldMain = Math.round((9.9 + unitNoise("manifold-main") * 0.5) * 10) / 10;
const manifoldBackup = 8.2;
const manifoldFloor = 9.5;
// 三级：科室终端
const terminalRows = medgasBuildings.map((b) => {
  const pressure = Math.round((0.42 + (unitNoise(`term:${b.id}`) - 0.5) * 0.04) * 1000) / 1000;
  return {
    id: b.id,
    name: b.shortName,
    terminals: b.beds > 0 ? Math.round(b.beds * 1.15) : Math.max(8, Math.round(b.areaM2 / 400)),
    pressure,
    o2Today: Math.round(dailyUsage(b.id, "medgas", today) * GAS.o2),
    low: pressure < 0.405,
  };
});

// N2O：当前流量按手术医技楼小时形状换算（与引擎口径一致）
const n2oToday = todayTotal * GAS.n2o;
const n2oMonth = sumUsage("medgas", monthStart, today) * GAS.n2o;
const surgicalShape14 = hourlyShape("surgical", "medgas", today)[14] * 24;
const n2oFlowNow = Math.round((n2oToday / 24) * surgicalShape14 * 100) / 100;
const n2oPressure = Math.round((0.36 + unitNoise(`n2op:${today}`) * 0.03) * 100) / 100;
const leakRows = Array.from({ length: 7 }, (_, i) => {
  const date = D.subtract(6 - i, "day").format("YYYY-MM-DD");
  const v = Math.round((0.008 + unitNoise(`n2o-night:${date}`) * 0.07) * 1000) / 1000;
  return { date, v, ok: v <= LEAK_THRESHOLD };
});
const leakWatch = leakRows.some((r) => !r.ok);

// 压缩空气 24h（DEV-PWR-AIR-01，额定 37 kW；满载电流约 70 A @380V）
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const airHours = Array.from({ length: 24 }, (_, h) => {
  const base = h >= 7 && h < 20 ? 0.62 : 0.38;
  const load = Math.min(0.95, Math.max(0.22, base + (unitNoise(`air:${today}:${h}`) - 0.5) * 0.18));
  return {
    t: hh(h),
    current: Math.round(70 * load),
    pressure: Math.round((8.35 - load * 0.9 + (unitNoise(`airp:${today}:${h}`) - 0.5) * 0.2) * 100) / 100,
    temp: Math.round(62 + load * 22),
  };
});
const airNow = airHours[14];
const airToday = Math.round(todayTotal * GAS.air);
const airSpecificDesign = 0.105; // kWh/m³ 设计比功率（演示）
const airSpecific = Math.round(airSpecificDesign * (1 + airCompressor.efficiencyDecayPct / 100) * 1000) / 1000;
const airElecToday = Math.round(airToday * airSpecific);
const airDewPoint = -42;

// 负压吸引 24h（DEV-PWR-VAC-01）
const vacHours = Array.from({ length: 24 }, (_, h) => {
  const day = h >= 8 && h < 19;
  return {
    t: hh(h),
    vac: -Math.round((0.068 + (day ? 0.006 : 0) + (unitNoise(`vac:${today}:${h}`) - 0.5) * 0.004) * 1000) / 1000,
    flow: Math.round((day ? 44 : 26) + (unitNoise(`vacf:${today}:${h}`) - 0.5) * 8),
  };
});
const vacNow = vacHours[14];
const vacEfficiency = 100 - vacuumPump.efficiencyDecayPct;

// 特种气体（份额换算 + 库存演示常量）
const n2Daily = Math.round(todayTotal * GAS.n2);
const arDaily = Math.round(todayTotal * GAS.ar * 10) / 10;
const n2StockGas = 8 * 120; // 液氮杜瓦罐 175L×8，约 120 m³/罐
const arStockGas = 36 * 6; // 40L 钢瓶 36 瓶，约 6 m³/瓶
const n2Days = Math.round((n2StockGas / Math.max(1, n2Daily)) * 10) / 10;
const arDays = Math.round((arStockGas / Math.max(1, arDaily)) * 10) / 10;

// 管路健康度与泄漏定位（AN-005 备用汇流排置顶）
const segments = [
  {
    key: "backup", name: "氧气站备用汇流排", loc: "手术医技楼 B1 气体站",
    pressure: `${manifoldBackup.toFixed(1)} bar`, dropKPaH: 1.3, health: 62,
    hint: "减压阀内漏（定位：汇流排出口段），切换测试未通过", danger: true, anomalyId: "AN-005",
  },
  ...medgasBuildings.map((b) => {
    const health = Math.round(86 + unitNoise(`seg:${b.id}`) * 12);
    return {
      key: b.id, name: `${b.shortName}楼医气立管`, loc: b.name,
      pressure: `${(0.42 + (unitNoise(`term:${b.id}`) - 0.5) * 0.04).toFixed(3)} MPa`,
      dropKPaH: Math.round(unitNoise(`drop:${b.id}`) * 40) / 100,
      health, hint: health < 90 ? "支路压降偏大，建议红外/皂膜巡检" : "—",
      danger: false, anomalyId: undefined as string | undefined,
    };
  }),
];
const healthAvg = Math.round(segments.reduce((s, x) => s + x.health, 0) / segments.length);
const maintenanceDue = segments.filter((s) => !s.danger && s.health < 90);

// 费用与科室分摊（本月 + 近30日；总计=分项和，按数据层构造成立）
const costRows = medgasBuildings.map((b) => {
  const useM = sumUsage("medgas", monthStart, today, b.id);
  const use30 = sumUsage("medgas", from30, today, b.id);
  return {
    id: b.id, name: b.name, beds: b.beds, useM, costM: Math.round(useM * MEDGAS_PRICE),
    use30, cost30: Math.round(use30 * MEDGAS_PRICE),
    bedDay: b.beds > 0 ? Math.round((use30 * MEDGAS_PRICE) / (b.beds * (occ30 / 100) * 30) * 100) / 100 : null,
  };
});
const costTotal = {
  useM: costRows.reduce((s, r) => s + r.useM, 0),
  costM: costRows.reduce((s, r) => s + r.costM, 0),
  use30: costRows.reduce((s, r) => s + r.use30, 0),
  cost30: costRows.reduce((s, r) => s + r.cost30, 0),
};

// 扩展边界碳排：近 6 个月医气总量（GWP 版本在组件内参与换算）
const M6 = monthlySeries("medgas", D.subtract(5, "month").format("YYYY-MM"), D.format("YYYY-MM"));

const fmt = (n: number, d = 0) => n.toLocaleString("zh-CN", { maximumFractionDigits: d, minimumFractionDigits: d });

function pearson(pts: [number, number][]): number {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n;
  const my = pts.reduce((s, p) => s + p[1], 0) / n;
  let cov = 0, sx = 0, sy = 0;
  for (const [x, y] of pts) { cov += (x - mx) * (y - my); sx += (x - mx) ** 2; sy += (y - my) ** 2; }
  return sx && sy ? Math.round((cov / Math.sqrt(sx * sy)) * 100) / 100 : 0;
}

function HealthBar({ value }: { value: number }) {
  const color = value < 70 ? "var(--red)" : value < 90 ? "var(--amber)" : "var(--green)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 56, height: 6, borderRadius: 3, background: "rgba(157,180,214,0.15)", display: "inline-block" }}>
        <span style={{ width: `${value}%`, height: 6, borderRadius: 3, background: color, display: "block" }} />
      </span>
      <span className="num">{value}</span>
    </span>
  );
}

export function MedicalGasPage() {
  const { role, allPermissions, alarms, workOrders, transitionAlarm, pageFilters, setPageFilter, pushToast } = useDemoStore();
  const writable = canWrite(PAGE_ID, role, allPermissions);
  const noWriteHint = writable ? undefined : "当前角色无本模块写权限";

  const pf = pageFilters[PAGE_ID] ?? {};
  const range = typeof pf.range === "string" ? pf.range : "30";
  const chartBuilding = typeof pf.building === "string" ? pf.building : "all";
  const gwpVer = typeof pf.gwp === "string" ? pf.gwp : "AR6";
  const scatterX = typeof pf.scatterX === "string" ? pf.scatterX : "surgery";
  const gwp = GWP_OPTIONS.find((g) => g.ver === gwpVer) ?? GWP_OPTIONS[0];

  const [detailOpen, setDetailOpen] = useState(false);
  const [testing, setTesting] = useState(false);

  const an5Alarm = alarms.find((a) => a.id === AN5.alarmId);
  const an5Order = workOrders.find((w) => w.id === AN5.workOrderId);

  // ---------- 筛选相关派生 ----------
  const rangeFrom = D.subtract(Number(range) - 1, "day").format("YYYY-MM-DD");
  const daily = useMemo(
    () => dailySeries("medgas", rangeFrom, today, chartBuilding === "all" ? undefined : (chartBuilding as BuildingId)),
    [rangeFrom, chartBuilding],
  );
  const bedDayLine = useMemo(
    () => daily.map((p) => Math.round(((p.v * GAS.o2) / (TOTAL_BEDS * bedOccupancy(p.t) / 100)) * 100) / 100),
    [daily],
  );

  const dailyOption = useMemo(() => ({
    legend: chartBuilding === "all" ? {} : { show: false },
    xAxis: { type: "category", data: daily.map((p) => p.t.slice(5)) },
    yAxis: [
      { type: "value", name: "m³" },
      { type: "value", name: "m³/床日", splitLine: { show: false } },
    ],
    series: [
      { name: "医气日用量", type: "bar", data: daily.map((p) => p.v), barMaxWidth: 13, itemStyle: { color: CHART_COLORS[0] } },
      ...(chartBuilding === "all"
        ? [{ name: "床日氧耗（全院）", type: "line", yAxisIndex: 1, smooth: true, symbol: "none", data: bedDayLine, lineStyle: { color: CHART_COLORS[2] } }]
        : []),
    ],
  }), [daily, bedDayLine, chartBuilding]);

  const airOption = useMemo(() => ({
    xAxis: { type: "category", data: airHours.map((p) => p.t) },
    yAxis: [
      { type: "value", name: "A" },
      { type: "value", name: "bar", min: 7, max: 9, splitLine: { show: false } },
    ],
    series: [
      { name: "电流", type: "line", smooth: true, symbol: "none", data: airHours.map((p) => p.current), lineStyle: { color: CHART_COLORS[0] }, areaStyle: { opacity: 0.12 } },
      { name: "排气压力", type: "line", yAxisIndex: 1, smooth: true, symbol: "none", data: airHours.map((p) => p.pressure), lineStyle: { color: CHART_COLORS[2] } },
    ],
  }), []);

  const vacOption = useMemo(() => ({
    xAxis: { type: "category", data: vacHours.map((p) => p.t) },
    yAxis: [
      { type: "value", name: "MPa", min: -0.085, max: -0.055 },
      { type: "value", name: "m³/h", splitLine: { show: false } },
    ],
    series: [
      { name: "真空度", type: "line", smooth: true, symbol: "none", data: vacHours.map((p) => p.vac), lineStyle: { color: CHART_COLORS[3] } },
      { name: "抽气量", type: "line", yAxisIndex: 1, smooth: true, symbol: "none", data: vacHours.map((p) => p.flow), lineStyle: { color: CHART_COLORS[1] } },
    ],
  }), []);

  // 扩展边界月度换算（随 GWP 版本联动）
  const extMonthly = useMemo(() => M6.map((p) => ({
    month: p.t,
    o2T: Math.round(p.v * GAS.o2 * O2_FACTOR.value) / 1000,
    n2oT: Math.round(p.v * GAS.n2o * N2O_DENSITY * gwp.value) / 1000,
  })), [gwp.value]);

  const extOption = useMemo(() => ({
    legend: {},
    xAxis: { type: "category", data: extMonthly.map((p) => p.month) },
    yAxis: { type: "value", name: "tCO₂e" },
    series: [
      { name: "氧气生产（扩展）", type: "bar", stack: "ext", data: extMonthly.map((p) => Math.round(p.o2T * 100) / 100), barMaxWidth: 16, itemStyle: { color: CHART_COLORS[0] } },
      { name: `N₂O（GWP-${gwp.value}）`, type: "bar", stack: "ext", data: extMonthly.map((p) => Math.round(p.n2oT * 100) / 100), itemStyle: { color: CHART_COLORS[3] } },
    ],
  }), [extMonthly, gwp.value]);

  const o2Ext30T = Math.round(use30Total * GAS.o2 * O2_FACTOR.value) / 1000;
  const n2oMass30 = Math.round(use30Total * GAS.n2o * N2O_DENSITY * 10) / 10;
  const n2oExt30T = Math.round(n2oMass30 * gwp.value) / 1000;

  // 关联散点：近 60 日手术医技楼医气用量 vs 手术量/床位率/气温
  const scatterMeta = {
    surgery: { name: "手术台次（台/日）", get: surgeryCount },
    occupancy: { name: "床位使用率（%）", get: bedOccupancy },
    temp: { name: "日均气温（℃）", get: tempOfDate },
  }[scatterX === "occupancy" || scatterX === "temp" ? scatterX : "surgery"];
  const scatterData = useMemo(() => {
    const arr: [number, number, string][] = [];
    for (let i = 59; i >= 0; i--) {
      const date = D.subtract(i, "day").format("YYYY-MM-DD");
      arr.push([scatterMeta.get(date), dailyUsage("surgical", "medgas", date), date]);
    }
    return arr;
  }, [scatterMeta]);
  const r = useMemo(() => pearson(scatterData.map((p) => [p[0], p[1]])), [scatterData]);

  const scatterOption = useMemo(() => ({
    legend: { show: false },
    grid: { left: 52 },
    tooltip: {
      trigger: "item",
      formatter: (p: { value: [number, number, string] }) =>
        `${p.value[2]}<br/>${scatterMeta.name}：${p.value[0]}<br/>手术医技楼医气：${p.value[1]} m³`,
    },
    xAxis: { type: "value", name: scatterMeta.name, nameTextStyle: { fontSize: 10 }, scale: true },
    yAxis: { type: "value", name: "m³/日", scale: true },
    series: [{ type: "scatter", symbolSize: 7, itemStyle: { color: CHART_COLORS[0], opacity: 0.75 }, data: scatterData }],
  }), [scatterData, scatterMeta]);

  // ---------- 交互动作 ----------
  const setFilter = (patch: Record<string, string>) => setPageFilter(PAGE_ID, patch);

  const onExport = async () => {
    const { downloadWorkbook } = await import("../../utils/downloads");
    downloadWorkbook({
      科室费用分摊: costRows.map((row) => ({
        楼宇: row.name, 床位数: row.beds || "—",
        "本月用量(m³)": row.useM, "本月费用(元)": row.costM,
        "近30日用量(m³)": row.use30, "近30日费用(元)": row.cost30,
        "床日成本(元/床日)": row.bedDay ?? "—",
        "占比(近30日)": `${((row.use30 / costTotal.use30) * 100).toFixed(1)}%`,
      })),
      医气日消耗: daily.map((p) => ({ 日期: p.t, "用量(m³)": p.v, 口径: chartBuilding === "all" ? "全院" : chartBuilding, 区间: `近${range}日` })),
      N2O夜间泄漏检测: leakRows.map((row) => ({ 日期: row.date, "夜间最小流量(m³/h)": row.v, "阈值(m³/h)": LEAK_THRESHOLD, 结论: row.ok ? "未检出" : "关注" })),
      管路健康度: segments.map((s) => ({ 段位: s.name, 位置: s.loc, 工作压力: s.pressure, "压降(kPa/h)": s.dropKPaH, 健康度: s.health, 泄漏定位: s.hint })),
    }, `医用气体台账_${today}.xlsx`);
    pushToast("导出完成", "已按当前筛选生成 Excel 台账（4 个工作表）", "success");
  };

  const onExportCostCsv = async () => {
    const { downloadCsv } = await import("../../utils/downloads");
    downloadCsv(costRows.map((row) => ({
      楼宇: row.name, "本月用量m3": row.useM, 本月费用元: row.costM,
      "近30日用量m3": row.use30, "近30日费用元": row.cost30, "床日成本元": row.bedDay ?? "—",
    })), `医用气体科室分摊_${today}.csv`);
    pushToast("导出完成", "科室分摊表已导出 CSV", "success");
  };

  const onManualLeakTest = () => {
    if (testing) return;
    setTesting(true);
    window.setTimeout(() => {
      setTesting(false);
      const v = Math.round((0.01 + unitNoise(`manual-leak:${today}`) * 0.05) * 1000) / 1000;
      const ok = v <= LEAK_THRESHOLD;
      pushToast(
        ok ? "人工泄漏检测通过（模拟）" : "人工泄漏检测发现关注项（模拟）",
        `N₂O 管道保压 10 分钟，折算最小流量 ${v} m³/h（阈值 ${LEAK_THRESHOLD}）`,
        ok ? "success" : "warning",
      );
    }, 1200);
  };

  const onMaintenanceRemind = () => {
    if (!maintenanceDue.length) {
      pushToast("无需生成", "当前无健康度低于 90 的常规管段", "info");
      return;
    }
    pushToast(
      "维护提醒已生成（模拟）",
      `${maintenanceDue.map((s) => s.name).join("、")} 共 ${maintenanceDue.length} 段，已推送医用气体组巡检计划`,
      "success",
    );
  };

  const onAlarmTransition = (to: AlarmStatus) => {
    if (!an5Alarm) return;
    transitionAlarm(an5Alarm.id, to);
    pushToast("告警状态已更新", `AL-2026-0805 → ${alarmStatusMeta[to]}`, "info");
  };

  return (
    <>
      <PageHead
        title="医用气体管理"
        sub={`氧气 · 笑气 · 压缩空气 · 负压吸引 · 特种气体全链路 ｜ 数据更新 ${today} 14:30`}
        actions={
          <button className="pf-btn primary" onClick={onExport}>
            <Download size={13} /> 导出台账（xlsx）
          </button>
        }
      />

      {/* AN-005 保障置顶横幅：保障优先级高于节能 */}
      <div style={{
        display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12, padding: "10px 14px",
        border: "1px solid rgba(244, 82, 95, 0.4)", background: "rgba(244, 82, 95, 0.07)", borderRadius: "var(--radius)",
      }}>
        <ShieldAlert size={20} color="var(--red)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ fontSize: 13 }}>{AN5.id} {AN5.title}</b>
            <Tag tone="danger">严重</Tag>
            <Tag tone="warn">保障优先级高于节能</Tag>
            {an5Alarm && <Tag tone={an5Alarm.status === "resolved" ? "ok" : "info"}>告警：{alarmStatusMeta[an5Alarm.status]}</Tag>}
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-2)" }}>
            备用汇流排压力 {manifoldBackup} bar，低于 {manifoldFloor} bar 下限；主液氧罐供应正常，切换测试未通过。
            {AN5.medicalSafetyNote}——本异常只做保障处置，不做供气侧节能动作。
          </p>
        </div>
        <button className="pf-btn" onClick={() => setDetailOpen(true)}>处置详情</button>
      </div>

      {/* KPI 行 */}
      <div className="grid cols-6" style={{ marginBottom: 10 }}>
        <Kpi label="今日医气总用量" value={fmt(todayTotal)} unit="m³" tone="cyan" icon={<Wind size={13} />}
          sub={<Delta pct={yoy30} label="30日同比" />} />
        <Kpi label="液氧罐余量" value={loxLevelPct.toFixed(1)} unit="%" icon={<Droplets size={13} />}
          tone={loxLevelPct < 40 ? "red" : loxLevelPct < 60 ? "amber" : "green"}
          sub={<>折合气态 {fmt(loxGasEquiv)} m³ · 约 {loxDaysLeft} 天</>} />
        <Kpi label="床日氧耗（今日）" value={bedDayO2Today.toFixed(2)} unit="m³/床日" icon={<Activity size={13} />}
          sub={<>在用床位 {fmt(TOTAL_BEDS * occToday / 100)} 张</>} />
        <Kpi label="N₂O 夜间泄漏检测" value={leakWatch ? "有关注项" : "未检出"} icon={<Moon size={13} />}
          tone={leakWatch ? "amber" : "green"} sub={<>近 7 夜 · 阈值 {LEAK_THRESHOLD} m³/h</>} />
        <Kpi label="管路综合健康度" value={healthAvg} unit="/100" icon={<Gauge size={13} />}
          tone={healthAvg >= 90 ? "green" : "amber"} sub={<>含 AN-005 备用汇流排 62 分</>} />
        <Kpi label="近30日气体费用" value={(cost30 / 10000).toFixed(1)} unit="万元" icon={<Coins size={13} />}
          sub={<>单价 {MEDGAS_PRICE} 元/m³ · 床日 {bedDayCost30.toFixed(2)} 元</>} />
      </div>

      {/* 氧气三级监测 */}
      <div className="grid cols-3" style={{ marginBottom: 10 }}>
        <Panel title="一级 · 液氧罐" extra={<Tag tone={loxLevelPct < 60 ? "warn" : "ok"}>{loxLevelPct < 60 ? "关注余量" : "正常"}</Tag>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
            <div style={{ height: 10, borderRadius: 5, background: "rgba(157,180,214,0.15)" }}>
              <div style={{ width: `${loxLevelPct}%`, height: 10, borderRadius: 5, background: loxLevelPct < 60 ? "var(--amber)" : "var(--cyan)" }} />
            </div>
            <table className="pf-table">
              <tbody>
                <tr><td>罐容 / 余量</td><td className="num">20 m³ / {loxLevelPct.toFixed(1)}%</td></tr>
                <tr><td>折合气态氧</td><td className="num">{fmt(loxGasEquiv)} m³</td></tr>
                <tr><td>罐压</td><td className="num">{loxPressure.toFixed(2)} MPa</td></tr>
                <tr><td>汽化器</td><td><Tag tone="ok">双组交替 · 正常</Tag></td></tr>
                <tr><td>预计可用 / 建议补液</td><td className="num">{loxDaysLeft} 天 / {loxRefillDate} 前</td></tr>
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="二级 · 汇流排" extra={<Tag tone="danger">备用异常</Tag>}>
          <table className="pf-table">
            <thead><tr><th>回路</th><th>压力</th><th>下限</th><th>状态</th></tr></thead>
            <tbody>
              <tr>
                <td>主用汇流排</td>
                <td className="num">{manifoldMain.toFixed(1)} bar</td>
                <td className="num">{manifoldFloor} bar</td>
                <td><Tag tone="ok">正常供气</Tag></td>
              </tr>
              <tr>
                <td>备用汇流排</td>
                <td className="num" style={{ color: "var(--red)" }}>{manifoldBackup.toFixed(1)} bar</td>
                <td className="num">{manifoldFloor} bar</td>
                <td><Tag tone="danger">低于下限</Tag></td>
              </tr>
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "8px 0 0" }}>
            08-03 切换测试未通过（{AN5.id}）；应急冗余能力下降，处置工单 {AN5.workOrderId} 进行中。
            供氧冗余属生命保障红线，仅做保障处置。
          </p>
          <button className="pf-btn ghost" style={{ marginTop: 8 }} onClick={() => setDetailOpen(true)}>
            <Wrench size={12} /> 查看处置链
          </button>
        </Panel>
        <Panel title="三级 · 科室终端" extra={<span>氧气份额按演示假设 {Math.round(GAS.o2 * 100)}%</span>}>
          <table className="pf-table">
            <thead><tr><th>楼宇</th><th>终端数</th><th>终端压力</th><th>今日氧耗</th><th>状态</th></tr></thead>
            <tbody>
              {terminalRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td className="num">{row.terminals}</td>
                  <td className="num">{row.pressure.toFixed(3)} MPa</td>
                  <td className="num">{fmt(row.o2Today)} m³</td>
                  <td>{row.low ? <Tag tone="warn">压力偏低</Tag> : <Tag tone="ok">正常</Tag>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      {/* 日消耗曲线 + N2O */}
      <div className="grid cols-2" style={{ marginBottom: 10 }}>
        <Panel
          title="氧气/医气日消耗与床日氧耗"
          extra={
            <>
              <select className="pf-select" value={chartBuilding} onChange={(e) => setFilter({ building: e.target.value })} aria-label="楼宇筛选">
                <option value="all">全院</option>
                {medgasBuildings.map((b) => <option key={b.id} value={b.id}>{b.shortName}</option>)}
              </select>
              <select className="pf-select" value={range} onChange={(e) => setFilter({ range: e.target.value })} aria-label="时间范围">
                <option value="7">近7日</option>
                <option value="30">近30日</option>
                <option value="90">近90日</option>
              </select>
            </>
          }
        >
          <EChart height={238} option={dailyOption} />
          <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "6px 0 0" }}>
            医气总量来自计量数据层（总量=分楼宇之和）；床日氧耗 = 全院氧耗 ÷ 在用床日。
            08-01 起手术医技楼含 {AN5.id} 异常（+5%）。
          </p>
        </Panel>

        <Panel
          title="笑气 N₂O 监测与 GWP 配置"
          extra={
            <button className="pf-btn ghost" onClick={onManualLeakTest} disabled={!writable || testing} title={noWriteHint}>
              <FlaskConical size={12} /> {testing ? "检测中…" : "人工泄漏检测（模拟）"}
            </button>
          }
        >
          <div className="grid cols-4" style={{ marginBottom: 8 }}>
            <Kpi label="管道压力" value={n2oPressure.toFixed(2)} unit="MPa" />
            <Kpi label="当前流量" value={n2oFlowNow.toFixed(2)} unit="m³/h" sub={<>今日手术 {surgeryCount(today)} 台</>} />
            <Kpi label="今日累计" value={n2oToday.toFixed(1)} unit="m³" />
            <Kpi label="本月累计" value={n2oMonth.toFixed(1)} unit="m³" sub={<>约 {(n2oMonth * N2O_DENSITY).toFixed(1)} kg</>} />
          </div>
          <div className="grid cols-2">
            <div>
              <p style={{ fontSize: 11, color: "var(--ink-2)", margin: "0 0 4px" }}>夜间泄漏检测（02:00-04:00 最小流量）</p>
              <table className="pf-table">
                <thead><tr><th>日期</th><th>最小流量</th><th>结论</th></tr></thead>
                <tbody>
                  {leakRows.map((row) => (
                    <tr key={row.date}>
                      <td>{row.date.slice(5)}</td>
                      <td className="num">{row.v.toFixed(3)} m³/h</td>
                      <td>{row.ok ? <Tag tone="ok">未检出</Tag> : <Tag tone="warn">关注</Tag>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <p style={{ fontSize: 11, color: "var(--ink-2)", margin: "0 0 4px", display: "flex", gap: 6, alignItems: "center" }}>
                GWP 版本
                <select className="pf-select" value={gwp.ver} onChange={(e) => setFilter({ gwp: e.target.value })} aria-label="GWP 版本">
                  {GWP_OPTIONS.map((g) => <option key={g.ver} value={g.ver}>{g.ver}（{g.year}）</option>)}
                </select>
              </p>
              <table className="pf-table">
                <thead><tr><th>版本</th><th>GWP-100</th><th>说明</th></tr></thead>
                <tbody>
                  {GWP_OPTIONS.map((g) => (
                    <tr key={g.ver} style={g.ver === gwp.ver ? { background: "rgba(41,211,232,0.06)" } : undefined}>
                      <td>{g.ver === gwp.ver ? <b>{g.ver} ✓</b> : g.ver}（{g.year}）</td>
                      <td className="num">{g.value}</td>
                      <td style={{ fontSize: 11 }}>{g.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "6px 0 0" }}>
                当前采用 GWP={gwp.value}（{N2O_FACTOR.version}，版本可配置）。
                <Tag tone="warn">待标准确认（演示）</Tag>
              </p>
            </div>
          </div>
        </Panel>
      </div>

      {/* 压缩空气 / 负压吸引 / 特种气体 */}
      <div className="grid cols-3" style={{ marginBottom: 10 }}>
        <Panel title={`压缩空气 · ${airCompressor.name}`} extra={<Tag tone="ok">1用1备 · 在线</Tag>}>
          <div className="grid cols-4" style={{ marginBottom: 6 }}>
            <Kpi label="电流" value={airNow.current} unit="A" sub={<>额定 {airCompressor.ratedPowerKw} kW</>} />
            <Kpi label="排气压力" value={airNow.pressure.toFixed(2)} unit="bar" />
            <Kpi label="排气温度" value={airNow.temp} unit="℃" icon={<Thermometer size={12} />} />
            <Kpi label="压力露点" value={airDewPoint} unit="℃" sub={<>医用标准 ≤ -40℃</>} />
          </div>
          <EChart height={158} option={airOption} />
          <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "6px 0 0" }}>
            今日供气 {fmt(airToday)} m³ · 耗电约 {fmt(airElecToday)} kWh · 比功率 {airSpecific} kWh/m³
            （设计 {airSpecificDesign}，效率衰减 {airCompressor.efficiencyDecayPct}%）
          </p>
        </Panel>

        <Panel title={`负压吸引 · ${vacuumPump.name}`} extra={<Tag tone="ok">1用1备 · 在线</Tag>}>
          <div className="grid cols-4" style={{ marginBottom: 6 }}>
            <Kpi label="真空度" value={vacNow.vac.toFixed(3)} unit="MPa" sub={<>维持 -0.06~-0.08</>} />
            <Kpi label="抽气量" value={vacNow.flow} unit="m³/h" />
            <Kpi label="累计运行" value={fmt(vacuumPump.runHours)} unit="h" />
            <Kpi label="泵组效率" value={vacEfficiency} unit="%" tone={vacEfficiency >= 92 ? "green" : "amber"} />
          </div>
          <EChart height={158} option={vacOption} />
          <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "6px 0 0" }}>
            额定 {vacuumPump.ratedPowerKw} kW · 手术时段（08:00-19:00）抽气量抬升与手术排班一致；负压站排气经消毒处理。
          </p>
        </Panel>

        <Panel title="特种气体 · 氮气 / 氩气" extra={<span>份额为演示假设</span>}>
          <table className="pf-table">
            <thead><tr><th>气体</th><th>用途</th><th>今日用量</th><th>库存</th><th>可用</th><th>状态</th></tr></thead>
            <tbody>
              <tr>
                <td>氮气 N₂</td>
                <td style={{ fontSize: 11 }}>手术动力工具 / 低温治疗</td>
                <td className="num">{fmt(n2Daily)} m³</td>
                <td style={{ fontSize: 11 }}>液氮杜瓦罐 175L×8</td>
                <td className="num">{n2Days} 天</td>
                <td>{n2Days < 10 ? <Tag tone="warn">建议补货</Tag> : <Tag tone="ok">充足</Tag>}</td>
              </tr>
              <tr>
                <td>氩气 Ar</td>
                <td style={{ fontSize: 11 }}>氩气刀 / 腔镜电外科</td>
                <td className="num">{arDaily} m³</td>
                <td style={{ fontSize: 11 }}>40L 钢瓶 ×36</td>
                <td className="num">{arDays} 天</td>
                <td>{arDays < 10 ? <Tag tone="warn">建议补货</Tag> : <Tag tone="ok">充足</Tag>}</td>
              </tr>
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "8px 0 0" }}>
            特种气体按钢瓶/杜瓦罐计量，纳入医气总量份额口径（N₂ {GAS.n2 * 100}% · Ar {GAS.ar * 100}%）。
            库存低于 10 天自动提示补货；采购接口为演示预留。
          </p>
          <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "6px 0 0" }}>
            腔镜气腹 CO₂ 由手麻系统计量，暂未接入本平台（待办）。
          </p>
        </Panel>
      </div>

      {/* 管路健康 + 碳排换算 */}
      <div className="grid cols-2" style={{ marginBottom: 10 }}>
        <Panel
          title="管路健康度与泄漏定位"
          extra={
            <button className="pf-btn ghost" onClick={onMaintenanceRemind} disabled={!writable} title={noWriteHint}>
              <Wrench size={12} /> 生成维护提醒（{maintenanceDue.length}）
            </button>
          }
        >
          <table className="pf-table">
            <thead><tr><th>管段</th><th>工作压力</th><th>压降</th><th>健康度</th><th>泄漏定位</th><th>状态</th></tr></thead>
            <tbody>
              {segments.map((seg) => (
                <tr key={seg.key} style={seg.danger ? { background: "rgba(244,82,95,0.05)" } : undefined}>
                  <td>
                    {seg.name}
                    {seg.anomalyId && (
                      <button
                        className="pf-btn ghost"
                        style={{ marginLeft: 6, padding: "0 6px", fontSize: 10, height: 18 }}
                        onClick={() => setDetailOpen(true)}
                      >
                        {seg.anomalyId}
                      </button>
                    )}
                  </td>
                  <td className="num">{seg.pressure}</td>
                  <td className="num">{seg.dropKPaH} kPa/h</td>
                  <td><HealthBar value={seg.health} /></td>
                  <td style={{ fontSize: 11 }}>{seg.hint}</td>
                  <td>
                    {seg.danger
                      ? <Tag tone="danger">保障处置中</Tag>
                      : seg.health < 90 ? <Tag tone="warn">关注</Tag> : <Tag tone="ok">正常</Tag>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "8px 0 0" }}>
            健康度由压降速率、夜间最小流量与巡检结果综合评分（模拟诊断）。{AN5.id} 为保障类异常置顶：
            <b style={{ color: "var(--amber)" }}>保障优先级高于节能</b>，不因节能目标降低供气冗余。
          </p>
        </Panel>

        <Panel title="医气碳排换算演示（扩展边界）" extra={<Tag tone="warn">前瞻性预留 · 不计入当前合规总量</Tag>}>
          <table className="pf-table" style={{ marginBottom: 6 }}>
            <thead><tr><th>项目</th><th>近30日活动量</th><th>因子</th><th>折算</th><th>标注</th></tr></thead>
            <tbody>
              <tr>
                <td>氧气生产碳足迹</td>
                <td className="num">{fmt(use30Total * GAS.o2)} m³</td>
                <td className="num">{O2_FACTOR.value} {O2_FACTOR.unit}</td>
                <td className="num">{o2Ext30T.toFixed(2)} t</td>
                <td><Tag tone="warn">待标准确认（演示）</Tag></td>
              </tr>
              <tr>
                <td>笑气 N₂O（GWP-{gwp.value}）</td>
                <td className="num">{n2oMass30} kg</td>
                <td className="num">{gwp.value} kgCO₂e/kg</td>
                <td className="num">{n2oExt30T.toFixed(2)} t</td>
                <td><Tag tone="warn">待标准确认（演示）</Tag></td>
              </tr>
              <tr>
                <td>麻醉气体（地氟烷等）</td>
                <td style={{ fontSize: 11 }}>—（药剂科接口预留）</td>
                <td className="num">{DESF_FACTOR.value} {DESF_FACTOR.unit}</td>
                <td className="num">—</td>
                <td><Tag tone="muted">未接入计量</Tag></td>
              </tr>
            </tbody>
          </table>
          <EChart height={150} option={extOption} />
          <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "6px 0 0" }}>
            氧气因子来源：{O2_FACTOR.source}；N₂O 密度按 {N2O_DENSITY} kg/m³（标态）折算。
            压缩空气/负压电耗已计入电力合规核算，此处不重复折算。本面板全部为扩展边界演示，
            <b>不计入当前 Scope1+2 合规总量</b>。
          </p>
        </Panel>
      </div>

      {/* 费用分摊 + 关联散点 */}
      <div className="grid cols-2" style={{ marginBottom: 10 }}>
        <Panel
          title="气体费用与科室（楼宇）分摊"
          extra={
            <button className="pf-btn ghost" onClick={onExportCostCsv}>
              <Download size={12} /> 导出 CSV
            </button>
          }
        >
          <table className="pf-table">
            <thead>
              <tr><th>楼宇</th><th>本月用量</th><th>本月费用</th><th>近30日用量</th><th>近30日费用</th><th>床日成本</th><th>占比</th></tr>
            </thead>
            <tbody>
              {costRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td className="num">{fmt(row.useM)} m³</td>
                  <td className="num">{fmt(row.costM)} 元</td>
                  <td className="num">{fmt(row.use30)} m³</td>
                  <td className="num">{fmt(row.cost30)} 元</td>
                  <td className="num">{row.bedDay !== null ? `${row.bedDay.toFixed(2)} 元` : "—"}</td>
                  <td className="num">{((row.use30 / costTotal.use30) * 100).toFixed(1)}%</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 600 }}>
                <td>全院合计</td>
                <td className="num">{fmt(costTotal.useM)} m³</td>
                <td className="num">{fmt(costTotal.costM)} 元</td>
                <td className="num">{fmt(costTotal.use30)} m³</td>
                <td className="num">{fmt(costTotal.cost30)} 元</td>
                <td className="num">{bedDayCost30.toFixed(2)} 元</td>
                <td className="num">100%</td>
              </tr>
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "8px 0 0" }}>
            按楼宇计量用量 × {MEDGAS_PRICE} 元/m³ 分摊；床日成本 = 近30日费用 ÷（床位 × 平均使用率 {occ30.toFixed(1)}% × 30）。
            合计与分项一致（数据层按构造保证）。
          </p>
        </Panel>

        <Panel
          title="医气用量关联分析（近60日 · 手术医技楼）"
          extra={
            <>
              <span>相关系数 r = <b className="num" style={{ color: Math.abs(r) >= 0.6 ? "var(--cyan)" : "var(--ink-2)" }}>{r.toFixed(2)}</b></span>
              <select className="pf-select" value={scatterX} onChange={(e) => setFilter({ scatterX: e.target.value })} aria-label="关联维度">
                <option value="surgery">手术台次</option>
                <option value="occupancy">床位使用率</option>
                <option value="temp">日均气温（季节）</option>
              </select>
            </>
          }
        >
          <EChart height={252} option={scatterOption} />
          <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "6px 0 0" }}>
            手术医技楼医气用量主要由手术台次驱动（引擎口径：手术日驱动系数 0.3+0.7×台次比）；
            床位使用率反映住院氧疗需求，气温维度用于检验季节相关性。
          </p>
        </Panel>
      </div>

      {/* AN-005 处置详情 */}
      {detailOpen && (
        <Modal title={`${AN5.id} ${AN5.title} · 处置链`} onClose={() => setDetailOpen(false)} width={720}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <Tag tone="danger">严重</Tag>
            <Tag tone="warn">保障优先级高于节能</Tag>
            <Tag tone="info">模拟诊断 · 置信度 {AN5.aiConfidencePct}%</Tag>
            {an5Alarm && <Tag tone={an5Alarm.status === "resolved" ? "ok" : "muted"}>告警 {an5Alarm.id}：{alarmStatusMeta[an5Alarm.status]}</Tag>}
          </div>
          <div className="grid cols-2" style={{ gap: 12 }}>
            <div>
              <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "0 0 4px" }}><b>证据链</b></p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--ink-2)" }}>
                {AN5.evidence.map((e) => <li key={e} style={{ marginBottom: 4 }}>{e}</li>)}
              </ul>
              <p style={{ fontSize: 12, margin: "10px 0 4px", color: "var(--ink-2)" }}><b>根因（模拟诊断）</b></p>
              <p style={{ fontSize: 12, margin: 0, color: "var(--ink-2)" }}>{AN5.rootCause}</p>
              <p style={{ fontSize: 12, margin: "10px 0 4px", color: "var(--ink-2)" }}><b>处置建议</b></p>
              <p style={{ fontSize: 12, margin: 0, color: "var(--ink-2)" }}>{AN5.suggestion}</p>
              <p style={{ fontSize: 11, margin: "10px 0 0", color: "var(--amber)" }}>
                <ShieldAlert size={11} style={{ verticalAlign: -1 }} /> {AN5.medicalSafetyNote}
              </p>
            </div>
            <div>
              <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "0 0 4px" }}>
                <b>工单 {AN5.workOrderId} 进度</b>{an5Order && <Tag tone="info">{workOrderStatusMeta[an5Order.status]}</Tag>}
              </p>
              {an5Order ? (
                <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", fontSize: 12 }}>
                  {an5Order.logs.map((log, i) => (
                    <li key={i} style={{ padding: "5px 0", borderBottom: "1px solid rgba(56,116,178,0.12)", color: "var(--ink-2)" }}>
                      <span className="num" style={{ color: "var(--ink-3)", marginRight: 8 }}>{log.at}</span>
                      <b style={{ marginRight: 6 }}>{log.action}</b>{log.note}（{log.actor}）
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: 12, color: "var(--ink-3)" }}>未找到关联工单。</p>
              )}
              {an5Alarm && alarmTransitions[an5Alarm.status].length > 0 && (
                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {alarmTransitions[an5Alarm.status].map((to) => (
                    <button key={to} className={`pf-btn ${to === "resolved" ? "primary" : ""}`}
                      onClick={() => onAlarmTransition(to)} disabled={!writable} title={noWriteHint}>
                      告警转为「{alarmStatusMeta[to]}」
                    </button>
                  ))}
                </div>
              )}
              <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "10px 0 0" }}>
                状态流转经状态机校验；人工确认后生效。本异常不做任何供气侧自动控制。
              </p>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
