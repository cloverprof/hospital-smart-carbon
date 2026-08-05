// 能源监测中心（6.1.1）：五维能源 KPI、24h 实时负荷、设备状态、大型医疗设备、
// 七类告警中心与夜间基础负荷异常检测。所有数值来自 services/timeseries 确定性引擎
// 与 data/ 静态领域数据；"实时"由 5 秒拍号 + data/rng 确定性噪声派生，禁止 Math.random()。
import dayjs from "dayjs";
import { Download, Droplets, Flame, Thermometer, Wind, Zap } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CHART_COLORS, EChart } from "../../components/EChart";
import { Delta, EmptyState, Kpi, Modal, PageHead, Panel, Tag } from "../../components/kit";
import { alarmCategoryMeta, alarmLevelMeta, alarmStatusMeta } from "../../data/alarms";
import { anomalyById, anomalyChains } from "../../data/anomalies";
import { buildingById, mainBuildings } from "../../data/buildings";
import { demoAsOfDate, energyKindMeta } from "../../data/config";
import { deviceById, devices, deviceStats } from "../../data/devices";
import { canWrite } from "../../data/navigation";
import { unitNoise } from "../../data/rng";
import { workOrderStatusMeta } from "../../data/workorders";
import { alarmTransitions } from "../../services/machines";
import {
  bedOccupancy, hourlySeries, outpatientVisits, realtimePowerKw, sumUsage, toTce, yoyPct,
} from "../../services/timeseries";
import { useDemoStore } from "../../stores/demo";
import type { Alarm, AlarmStatus, BuildingId, Device, EnergyKind } from "../../types/core";

const PAGE_ID = "energy-monitoring";
/** 演示"当前"时刻（与设备心跳 14:0x 一致） */
const DEMO_HOUR = 14;
const KINDS = Object.keys(energyKindMeta) as EnergyKind[];

/** 24h 负荷曲线可勾选的 8 栋楼（提示词 6.1.1 指定清单） */
const CURVE_BUILDINGS: BuildingId[] = [
  "outpatient", "inpatientA", "inpatientB", "surgical", "lab", "imaging", "cssd", "admin",
];

const KIND_ICONS: Record<EnergyKind, ReactNode> = {
  electricity: <Zap size={13} />,
  water: <Droplets size={13} />,
  gas: <Flame size={13} />,
  heat: <Thermometer size={13} />,
  medgas: <Wind size={13} />,
};

const DEV_STATUS_META: Record<Device["status"], { label: string; tone: "ok" | "warn" | "danger" | "muted" }> = {
  online: { label: "在线", tone: "ok" },
  offline: { label: "离线", tone: "muted" },
  fault: { label: "故障", tone: "danger" },
  maintenance: { label: "维护中", tone: "warn" },
};

const LEVEL_TONE: Record<Alarm["level"], "danger" | "warn" | "info"> = { critical: "danger", warning: "warn", info: "info" };
const STATUS_TONE: Record<AlarmStatus, "warn" | "info" | "muted" | "ok"> = {
  pending: "warn", processing: "info", acknowledged: "muted", resolved: "ok",
};
/** 目标状态 -> 操作按钮文案 */
const ALARM_ACTION: Record<AlarmStatus, string> = { pending: "待处理", processing: "处理", acknowledged: "确认", resolved: "解决" };

const LM_STATE_META = {
  run: { label: "运行", tone: "ok" as const },
  standby: { label: "待机", tone: "muted" as const },
  maintenance: { label: "维护中", tone: "warn" as const },
  fault: { label: "故障", tone: "danger" as const },
  offline: { label: "离线", tone: "muted" as const },
};

const fmt = (n: number, d = 0) => n.toLocaleString("zh-CN", { maximumFractionDigits: d });
const autoFmt = (n: number) => fmt(n, n >= 100 ? 0 : n >= 10 ? 1 : 2);
const padH = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** 当前"实时"流量：电 = realtimePowerKw；其余品种 = 各楼宇当前小时流量之和 + 确定性抖动 */
function flowNow(kind: EnergyKind, tick: number): number {
  if (kind === "electricity") return realtimePowerKw(DEMO_HOUR * 3600 + ((tick * 5) % 3600));
  const base = mainBuildings.reduce((s, b) => s + (hourlySeries(b.id, kind, demoAsOfDate)[DEMO_HOUR]?.v ?? 0), 0);
  const jitter = 1 + (unitNoise(`rtflow:${kind}:${tick}`) - 0.5) * 0.04;
  return Math.round(base * jitter * 10) / 10;
}

/** 某楼宇某日夜间时段（[start,end) 跨零点）平均电负荷 kW */
function nightAvgKw(buildingId: BuildingId, date: string, span: [number, number]): number {
  const series = hourlySeries(buildingId, "electricity", date);
  const hours: number[] = [];
  for (let h = span[0]; h !== span[1]; h = (h + 1) % 24) hours.push(h);
  return Math.round(hours.reduce((acc, h) => acc + (series[h]?.v ?? 0), 0) / hours.length);
}

/** 基线日：基准日往前按周对齐、且早于异常开始日（同星期，剔除周末效应） */
function baselineDateBefore(from: string): string {
  let d = dayjs(demoAsOfDate).subtract(7, "day");
  while (!d.isBefore(dayjs(from))) d = d.subtract(7, "day");
  return d.format("YYYY-MM-DD");
}

/** 大型医疗设备当前运行态（按 30s 槽位确定性派生，维护/故障态直接沿用台账） */
function largeMedicalNow(d: Device, tick: number): { state: keyof typeof LM_STATE_META; powerKw: number } {
  if (d.status === "maintenance") return { state: "maintenance", powerKw: 0 };
  if (d.status === "fault") return { state: "fault", powerKw: 0 };
  if (d.status === "offline") return { state: "offline", powerKw: 0 };
  const slot = Math.floor((tick * 5) / 30);
  const running = unitNoise(`lmrun:${d.id}:${slot}`) > 0.3;
  if (!running) return { state: "standby", powerKw: d.standbyPowerKw ?? Math.round(d.ratedPowerKw * 0.08) };
  const load = 0.5 + 0.35 * unitNoise(`lmload:${d.id}:${slot}`);
  return { state: "run", powerKw: Math.round(d.ratedPowerKw * load) };
}

/** 夜间基础负荷检测清单：AN-001 / AN-006 来自异常链，AL-2026-0815 为基线规则检出 */
function buildNightChecks() {
  const fromChain = (id: string) => {
    const a = anomalyById[id];
    return {
      alarmId: a.alarmId, anomalyId: id, buildingId: a.buildingId,
      span: (a.hours ?? [22, 6]) as [number, number], from: a.from,
      method: "AI 模拟诊断", confidence: a.aiConfidencePct as number | undefined,
      workOrderId: a.workOrderId, medicalSafetyNote: a.medicalSafetyNote,
    };
  };
  return [
    fromChain("AN-001"),
    fromChain("AN-006"),
    {
      alarmId: "AL-2026-0815", anomalyId: undefined as string | undefined, buildingId: "outpatient" as BuildingId,
      span: [23, 5] as [number, number], from: "2026-08-03",
      method: "夜间基线规则", confidence: undefined as number | undefined,
      workOrderId: undefined as string | undefined, medicalSafetyNote: undefined as string | undefined,
    },
  ];
}

function Field({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div style={{ fontSize: 12, minWidth: 0 }}>
      <span style={{ color: "var(--ink-3)", marginRight: 6 }}>{k}</span>
      <span style={{ color: "var(--ink-1)" }}>{v}</span>
    </div>
  );
}

export function EnergyMonitoringPage() {
  const role = useDemoStore((s) => s.role);
  const allPermissions = useDemoStore((s) => s.allPermissions);
  const alarms = useDemoStore((s) => s.alarms);
  const workOrders = useDemoStore((s) => s.workOrders);
  const pageFilters = useDemoStore((s) => s.pageFilters[PAGE_ID]);
  const setPageFilter = useDemoStore((s) => s.setPageFilter);
  const transitionAlarm = useDemoStore((s) => s.transitionAlarm);
  const pushToast = useDemoStore((s) => s.pushToast);

  const writable = canWrite(PAGE_ID, role, allPermissions);

  // "实时"演示：5 秒一拍；同拍号所有派生值确定
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((t) => t + 1), 5000);
    return () => window.clearInterval(timer);
  }, []);

  // ---------- 持久化筛选（demo store pageFilters） ----------
  const curveKindRaw = typeof pageFilters?.curveKind === "string" ? pageFilters.curveKind : "electricity";
  const curveKind: EnergyKind = (KINDS as string[]).includes(curveKindRaw) ? (curveKindRaw as EnergyKind) : "electricity";
  const curveBuildingsRaw = typeof pageFilters?.curveBuildings === "string" ? pageFilters.curveBuildings : CURVE_BUILDINGS.join(",");
  const devQ = typeof pageFilters?.devQ === "string" ? pageFilters.devQ : "";
  const devB = typeof pageFilters?.devB === "string" ? pageFilters.devB : "all";
  const devS = typeof pageFilters?.devS === "string" ? pageFilters.devS : "all";
  const alCat = typeof pageFilters?.alCat === "string" ? pageFilters.alCat : "all";
  const alLevel = typeof pageFilters?.alLevel === "string" ? pageFilters.alLevel : "all";
  const alStatus = typeof pageFilters?.alStatus === "string" ? pageFilters.alStatus : "all";

  const curveSel = useMemo(
    () => curveBuildingsRaw.split(",").filter((x): x is BuildingId => (CURVE_BUILDINGS as string[]).includes(x)),
    [curveBuildingsRaw],
  );

  // ---------- 五维 KPI（静态聚合只算一次） ----------
  const totalBeds = useMemo(() => mainBuildings.reduce((s, b) => s + b.beds, 0), []);
  const kindStats = useMemo(() => {
    const monthStart = dayjs(demoAsOfDate).format("YYYY-MM-01");
    const yearStart = dayjs(demoAsOfDate).format("YYYY-01-01");
    const prevStart = dayjs(demoAsOfDate).subtract(1, "month").format("YYYY-MM-01");
    const prevEnd = dayjs(demoAsOfDate).subtract(1, "month").format("YYYY-MM-DD");
    let bedDays = 0;
    let visits = 0;
    for (let d = dayjs(monthStart); !d.isAfter(dayjs(demoAsOfDate)); d = d.add(1, "day")) {
      const ds = d.format("YYYY-MM-DD");
      bedDays += (bedOccupancy(ds) / 100) * totalBeds;
      visits += outpatientVisits(ds);
    }
    return KINDS.map((k) => {
      const month = sumUsage(k, monthStart, demoAsOfDate);
      const prev = sumUsage(k, prevStart, prevEnd);
      return {
        kind: k,
        meta: energyKindMeta[k],
        today: sumUsage(k, demoAsOfDate, demoAsOfDate),
        month,
        year: sumUsage(k, yearStart, demoAsOfDate),
        yoy: yoyPct(k, monthStart, demoAsOfDate),
        mom: prev ? Math.round(((month - prev) / prev) * 1000) / 10 : 0,
        tceMonth: toTce(k, month),
        perBedDay: bedDays ? month / bedDays : 0,
        perVisit: visits ? month / visits : 0,
      };
    });
  }, [totalBeds]);

  const rtFlow = useMemo(() => {
    const out = {} as Record<EnergyKind, number>;
    for (const k of KINDS) out[k] = flowNow(k, tick);
    return out;
  }, [tick]);

  /** 电力显示为 MWh，其余品种用原单位 */
  const dispUsage = (kind: EnergyKind, v: number) =>
    kind === "electricity" ? `${fmt(v / 1000, 1)} MWh` : `${fmt(v)} ${energyKindMeta[kind].unit}`;

  // ---------- 24h 负荷曲线 ----------
  const hours = useMemo(() => Array.from({ length: 24 }, (_, h) => padH(h)), []);
  const flowUnit = curveKind === "electricity" ? "kW" : `${energyKindMeta[curveKind].unit}/h`;
  const curveOption = useMemo(() => {
    const series: Record<string, unknown>[] = curveSel.map((id) => ({
      name: buildingById[id]?.shortName ?? id,
      type: "line",
      smooth: true,
      symbol: "none",
      lineStyle: { width: 1.6 },
      color: CHART_COLORS[CURVE_BUILDINGS.indexOf(id) % CHART_COLORS.length],
      data: hourlySeries(id, curveKind, demoAsOfDate).map((p) => p.v),
    }));
    if (series.length) {
      Object.assign(series[0], {
        markLine: {
          symbol: "none", silent: true,
          lineStyle: { color: "#f5a524", type: "dashed", width: 1 },
          label: { formatter: `当前 ${padH(DEMO_HOUR)}`, color: "#f5a524", fontSize: 10 },
          data: [{ xAxis: padH(DEMO_HOUR) }],
        },
        markArea: {
          silent: true,
          itemStyle: { color: "rgba(139, 141, 240, 0.07)" },
          data: [
            [{ xAxis: "22:00" }, { xAxis: "23:00" }],
            [{ xAxis: "00:00" }, { xAxis: "06:00" }],
          ],
        },
      });
    }
    return {
      grid: { top: 46, left: 56, right: 14, bottom: 24 },
      legend: { top: 0 },
      tooltip: { valueFormatter: (v: unknown) => `${typeof v === "number" ? fmt(v, 1) : String(v)} ${flowUnit}` },
      xAxis: { type: "category", data: hours, boundaryGap: false },
      yAxis: { type: "value", name: flowUnit, nameTextStyle: { color: "#5f7799", fontSize: 10 } },
      series,
    };
  }, [curveKind, curveSel, hours, flowUnit]);

  const toggleCurveBuilding = (id: BuildingId) => {
    const next = curveSel.includes(id) ? curveSel.filter((x) => x !== id) : [...curveSel, id];
    setPageFilter(PAGE_ID, { curveBuildings: next.join(",") });
  };

  // ---------- 设备状态 ----------
  const stats = useMemo(deviceStats, []);
  const filteredDevices = useMemo(() => {
    const q = devQ.trim().toLowerCase();
    return devices.filter(
      (d) =>
        (!q || d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q)) &&
        (devB === "all" || d.buildingId === devB) &&
        (devS === "all" || d.status === devS),
    );
  }, [devQ, devB, devS]);
  const largeMedical = useMemo(() => devices.filter((d) => d.isLargeMedical), []);
  const devicesWithOpenAnomaly = useMemo(
    () => new Set(anomalyChains.filter((a) => a.status !== "closed").map((a) => a.deviceId)),
    [],
  );

  // ---------- 夜间基础负荷异常检测 ----------
  const nightRows = useMemo(
    () =>
      buildNightChecks().map((c) => {
        const baseDate = baselineDateBefore(c.from);
        const baseKw = nightAvgKw(c.buildingId, baseDate, c.span);
        const nowKw = nightAvgKw(c.buildingId, demoAsOfDate, c.span);
        return { ...c, baseDate, baseKw, nowKw, deltaPct: baseKw ? Math.round(((nowKw - baseKw) / baseKw) * 1000) / 10 : 0 };
      }),
    [],
  );
  const nightOption = useMemo(
    () => ({
      grid: { top: 26, left: 48, right: 10, bottom: 20 },
      legend: { top: 0 },
      tooltip: { valueFormatter: (v: unknown) => `${String(v)} kW` },
      xAxis: { type: "category", data: nightRows.map((r) => buildingById[r.buildingId]?.shortName ?? r.buildingId) },
      yAxis: { type: "value", name: "kW", nameTextStyle: { color: "#5f7799", fontSize: 10 } },
      series: [
        { name: "基线夜间均值", type: "bar", barWidth: 14, color: "#4da3ff", data: nightRows.map((r) => r.baseKw) },
        { name: "当前夜间均值", type: "bar", barWidth: 14, color: "#f5a524", data: nightRows.map((r) => r.nowKw) },
      ],
    }),
    [nightRows],
  );

  // ---------- 告警中心 ----------
  const filteredAlarms = useMemo(() => {
    const levelRank: Record<Alarm["level"], number> = { critical: 0, warning: 1, info: 2 };
    const statusRank: Record<AlarmStatus, number> = { pending: 0, processing: 1, acknowledged: 2, resolved: 3 };
    return alarms
      .filter(
        (a) =>
          (alCat === "all" || a.category === alCat) &&
          (alLevel === "all" || a.level === alLevel) &&
          (alStatus === "all" || a.status === alStatus),
      )
      .sort(
        (a, b) =>
          statusRank[a.status] - statusRank[b.status] ||
          levelRank[a.level] - levelRank[b.level] ||
          b.startAt.localeCompare(a.startAt),
      );
  }, [alarms, alCat, alLevel, alStatus]);

  const alarmCounts = useMemo(
    () => ({
      pending: alarms.filter((a) => a.status === "pending").length,
      processing: alarms.filter((a) => a.status === "processing").length,
      acknowledged: alarms.filter((a) => a.status === "acknowledged").length,
      resolved: alarms.filter((a) => a.status === "resolved").length,
      critical: alarms.filter((a) => a.level === "critical" && a.status !== "resolved").length,
    }),
    [alarms],
  );

  const doAlarmTransition = (a: Alarm, to: AlarmStatus) => {
    if (!writable) return;
    transitionAlarm(a.id, to);
    pushToast("告警状态已更新", `${a.id}：${alarmStatusMeta[a.status]} → ${alarmStatusMeta[to]}`, "success");
  };

  // ---------- 弹窗 ----------
  const [modal, setModal] = useState<{ type: "device" | "alarm"; id: string } | null>(null);
  const modalDevice = modal?.type === "device" ? (deviceById[modal.id] as Device | undefined) : undefined;
  const modalAlarm = modal?.type === "alarm" ? alarms.find((a) => a.id === modal.id) : undefined;
  const modalChain = modalAlarm?.anomalyId ? anomalyById[modalAlarm.anomalyId] : undefined;

  // ---------- 导出（内容与当前筛选一致） ----------
  const exportAlarmsCsv = async () => {
    if (!filteredAlarms.length) {
      pushToast("导出取消", "当前筛选条件下无告警数据", "warning");
      return;
    }
    const { downloadCsv } = await import("../../utils/downloads");
    downloadCsv(
      filteredAlarms.map((a) => ({
        告警ID: a.id, 标题: a.title, 类别: alarmCategoryMeta[a.category], 级别: alarmLevelMeta[a.level],
        状态: alarmStatusMeta[a.status], 楼宇: buildingById[a.buildingId]?.name ?? a.buildingId,
        设备: a.deviceId ?? "", 责任人: a.owner, 开始时间: a.startAt, 工单ID: a.workOrderId ?? "",
      })),
      `告警清单_${demoAsOfDate}.csv`,
    );
    pushToast("导出完成", `已导出 ${filteredAlarms.length} 条告警（与当前筛选一致）`, "success");
  };

  const exportSnapshot = async () => {
    const { downloadWorkbook } = await import("../../utils/downloads");
    downloadWorkbook(
      {
        五维指标: kindStats.map((s) => ({
          品种: s.meta.name, 单位: s.meta.unit,
          "实时流量/功率": rtFlow[s.kind],
          实时单位: s.kind === "electricity" ? "kW" : `${s.meta.unit}/h`,
          今日: s.today, 本月: s.month, 年度累计: s.year,
          "同比%(本月)": s.yoy, "环比%(本月)": s.mom,
          "折标煤tce(本月)": Number(s.tceMonth.toFixed(2)),
          "床日能耗(本月)": Number(s.perBedDay.toFixed(2)),
          "门诊人次能耗(本月)": Number(s.perVisit.toFixed(3)),
        })),
        设备状态: filteredDevices.map((d) => ({
          设备ID: d.id, 名称: d.name, 楼宇: buildingById[d.buildingId]?.name ?? d.buildingId, 类别: d.category,
          状态: DEV_STATUS_META[d.status].label, "额定功率kW": d.ratedPowerKw, 运行小时: d.runHours,
          "效率衰减%": d.efficiencyDecayPct, 最后心跳: d.lastHeartbeat ?? "",
        })),
        告警清单: filteredAlarms.map((a) => ({
          告警ID: a.id, 标题: a.title, 类别: alarmCategoryMeta[a.category], 级别: alarmLevelMeta[a.level],
          状态: alarmStatusMeta[a.status], 楼宇: buildingById[a.buildingId]?.name ?? a.buildingId,
          责任人: a.owner, 工单ID: a.workOrderId ?? "",
        })),
        夜间异常检测: nightRows.map((r) => ({
          告警ID: r.alarmId, 异常链: r.anomalyId ?? "", 楼宇: buildingById[r.buildingId]?.name ?? r.buildingId,
          时段: `${padH(r.span[0])}-${padH(r.span[1])}`, 基线日: r.baseDate,
          "基线夜间均值kW": r.baseKw, "当前夜间均值kW": r.nowKw, "偏差%": r.deltaPct,
          检测方式: r.method, 工单ID: r.workOrderId ?? "",
        })),
      },
      `能源监测快照_${demoAsOfDate}.xlsx`,
    );
    pushToast("导出完成", "监测快照已生成（设备/告警按当前筛选）", "success");
  };

  return (
    <>
      <PageHead
        title="能源监测中心"
        sub="电·水·天然气·热力·医用气体五维监测 / 实时负荷 / 设备状态 / 七类告警 / 夜间异常检测"
        actions={
          <>
            <Tag tone="info">数据日期 {demoAsOfDate}</Tag>
            <Tag tone="ok">实时刷新 5s</Tag>
            {!writable && <Tag tone="muted">当前角色只读</Tag>}
            <button className="pf-btn primary" onClick={exportSnapshot}>
              <Download size={13} /> 导出监测快照
            </button>
          </>
        }
      />

      {/* 五维实时 KPI */}
      <div className="grid cols-5">
        {kindStats.map((s) => (
          <Kpi
            key={s.kind}
            icon={KIND_ICONS[s.kind]}
            label={`${s.meta.name}${s.kind === "electricity" ? "实时负荷" : "实时流量"}`}
            value={fmt(rtFlow[s.kind], s.kind === "electricity" ? 0 : 1)}
            unit={s.kind === "electricity" ? "kW" : `${s.meta.unit}/h`}
            tone={s.kind === "electricity" ? "cyan" : undefined}
            sub={
              <>
                <span>今日 {dispUsage(s.kind, s.today)}</span>
                <Delta pct={s.yoy} />
              </>
            }
          />
        ))}
      </div>

      {/* 五维指标明细 */}
      <Panel
        title="五维能源指标明细"
        style={{ marginTop: 10 }}
        extra={<span>床日 = 编制床位 {fmt(totalBeds)} 张 × 当日使用率 · 本月 = {dayjs(demoAsOfDate).format("M月1日")} 至 {dayjs(demoAsOfDate).format("M月D日")}</span>}
      >
        <table className="pf-table">
          <thead>
            <tr>
              <th>品种</th><th>实时</th><th>今日</th><th>本月</th><th>年度累计</th>
              <th>同比(本月)</th><th>环比(本月)</th><th>折标煤(本月)</th><th>床日能耗(本月)</th><th>门诊人次能耗(本月)</th>
            </tr>
          </thead>
          <tbody>
            {kindStats.map((s) => (
              <tr key={s.kind}>
                <td>{s.meta.name}</td>
                <td className="num">{fmt(rtFlow[s.kind], 1)} {s.kind === "electricity" ? "kW" : `${s.meta.unit}/h`}</td>
                <td className="num">{dispUsage(s.kind, s.today)}</td>
                <td className="num">{dispUsage(s.kind, s.month)}</td>
                <td className="num">{dispUsage(s.kind, s.year)}</td>
                <td><Delta pct={s.yoy} label="" /></td>
                <td><Delta pct={s.mom} label="" /></td>
                <td className="num">{fmt(s.tceMonth, 2)} tce</td>
                <td className="num">{autoFmt(s.perBedDay)} {s.meta.unit}/床日</td>
                <td className="num">{autoFmt(s.perVisit)} {s.meta.unit}/人次</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {/* 24h 负荷曲线 + 大型医疗设备 */}
      <div className="grid cols-3" style={{ marginTop: 10 }}>
        <Panel
          title="24 小时实时负荷曲线"
          style={{ gridColumn: "span 2" }}
          extra={
            <>
              <span>{demoAsOfDate} · 阴影为夜间基础负荷时段</span>
              <select
                className="pf-select"
                value={curveKind}
                onChange={(e) => setPageFilter(PAGE_ID, { curveKind: e.target.value })}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>{energyKindMeta[k].name}</option>
                ))}
              </select>
            </>
          }
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 6, alignItems: "center" }}>
            {CURVE_BUILDINGS.map((id, i) => (
              <label
                key={id}
                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--ink-2)", cursor: "pointer" }}
              >
                <input type="checkbox" checked={curveSel.includes(id)} onChange={() => toggleCurveBuilding(id)} />
                <span style={{ width: 8, height: 8, borderRadius: 2, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                {buildingById[id]?.shortName}
              </label>
            ))}
            <button
              className="pf-btn ghost"
              style={{ padding: "1px 8px", fontSize: 11 }}
              onClick={() => setPageFilter(PAGE_ID, { curveBuildings: CURVE_BUILDINGS.join(",") })}
            >
              全选
            </button>
            <button
              className="pf-btn ghost"
              style={{ padding: "1px 8px", fontSize: 11 }}
              onClick={() => setPageFilter(PAGE_ID, { curveBuildings: "" })}
            >
              清空
            </button>
          </div>
          {curveSel.length ? <EChart height={250} option={curveOption} /> : <EmptyState text="请至少勾选一栋楼宇进行对比" />}
        </Panel>

        <Panel title="大型医疗设备实时监测" extra={<span>独立计量 · 保障优先，不做自动控制</span>}>
          <div className="grid cols-2">
            {largeMedical.map((d) => {
              const now = largeMedicalNow(d, tick);
              const st = LM_STATE_META[now.state];
              return (
                <div key={d.id} onClick={() => setModal({ type: "device", id: d.id })} style={{ cursor: "pointer" }} title="查看设备详情">
                  <Kpi
                    label={d.name}
                    value={fmt(now.powerKw)}
                    unit="kW"
                    tone={now.state === "run" ? "cyan" : now.state === "maintenance" ? "amber" : undefined}
                    sub={
                      <>
                        <Tag tone={st.tone}>{st.label}</Tag>
                        {devicesWithOpenAnomaly.has(d.id) && <Tag tone="warn">异常</Tag>}
                        <span>心跳 {d.lastHeartbeat ? d.lastHeartbeat.slice(11) : "—"}</span>
                      </>
                    }
                  />
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "8px 0 0" }}>
            运行/待机为模拟状态；待机功耗取台账 standbyPowerKw。点击卡片查看关联告警与工单。
          </p>
        </Panel>
      </div>

      {/* 设备状态面板 + 夜间异常检测 */}
      <div className="grid cols-2" style={{ marginTop: 10 }}>
        <Panel
          title="设备状态面板"
          extra={
            <>
              <Tag tone="ok">在线 {stats.online}</Tag>
              <Tag tone="muted">离线 {stats.offline}</Tag>
              <Tag tone="danger">故障 {stats.fault}</Tag>
              <Tag tone="warn">维护 {stats.maintenance}</Tag>
              <Tag tone="info">共 {stats.total}</Tag>
            </>
          }
        >
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              className="pf-input"
              placeholder="搜索设备名 / 编号"
              value={devQ}
              onChange={(e) => setPageFilter(PAGE_ID, { devQ: e.target.value })}
              style={{ flex: 1, minWidth: 0 }}
            />
            <select className="pf-select" value={devB} onChange={(e) => setPageFilter(PAGE_ID, { devB: e.target.value })}>
              <option value="all">全部楼宇</option>
              {mainBuildings.map((b) => (
                <option key={b.id} value={b.id}>{b.shortName}</option>
              ))}
            </select>
            <select className="pf-select" value={devS} onChange={(e) => setPageFilter(PAGE_ID, { devS: e.target.value })}>
              <option value="all">全部状态</option>
              {(Object.keys(DEV_STATUS_META) as Device["status"][]).map((s) => (
                <option key={s} value={s}>{DEV_STATUS_META[s].label}</option>
              ))}
            </select>
            <button
              className="pf-btn ghost"
              onClick={() => setPageFilter(PAGE_ID, { devQ: "", devB: "all", devS: "all" })}
            >
              重置
            </button>
          </div>
          {filteredDevices.length ? (
            <div style={{ maxHeight: 318, overflowY: "auto" }}>
              <table className="pf-table">
                <thead>
                  <tr><th>设备</th><th>楼宇</th><th>类别</th><th>额定 kW</th><th>状态</th><th>最后心跳</th></tr>
                </thead>
                <tbody>
                  {filteredDevices.map((d) => (
                    <tr key={d.id} onClick={() => setModal({ type: "device", id: d.id })} style={{ cursor: "pointer" }}>
                      <td>
                        <div style={{ color: "var(--ink-1)" }}>{d.name}</div>
                        <div style={{ fontSize: 10, color: "var(--ink-3)" }}>{d.id}</div>
                      </td>
                      <td>{buildingById[d.buildingId]?.shortName}</td>
                      <td>{d.category}</td>
                      <td className="num">{d.ratedPowerKw}</td>
                      <td><Tag tone={DEV_STATUS_META[d.status].tone}>{DEV_STATUS_META[d.status].label}</Tag></td>
                      <td className="num">{d.lastHeartbeat ? d.lastHeartbeat.slice(5) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState text="无匹配设备，请调整搜索或筛选条件" />
          )}
        </Panel>

        <Panel
          title="夜间基础负荷异常检测（模拟诊断）"
          extra={<span>基线 = 异常开始前最近同星期日的夜间均值</span>}
        >
          <EChart height={150} option={nightOption} />
          <table className="pf-table" style={{ marginTop: 6 }}>
            <thead>
              <tr><th>对象</th><th>时段</th><th>基线 → 当前</th><th>偏差</th><th>检测/置信度</th><th>状态</th><th>工单</th><th>操作</th></tr>
            </thead>
            <tbody>
              {nightRows.map((r) => {
                const al = alarms.find((x) => x.id === r.alarmId);
                const wo = r.workOrderId ? workOrders.find((w) => w.id === r.workOrderId) : undefined;
                const canAck = al && alarmTransitions[al.status].includes("acknowledged");
                return (
                  <tr key={r.alarmId}>
                    <td>
                      <div style={{ color: "var(--ink-1)" }}>{buildingById[r.buildingId]?.shortName}</div>
                      <div style={{ fontSize: 10, color: "var(--ink-3)" }}>{r.anomalyId ?? r.alarmId}</div>
                    </td>
                    <td className="num">{padH(r.span[0])}-{padH(r.span[1])}</td>
                    <td className="num">{fmt(r.baseKw)} → {fmt(r.nowKw)} kW</td>
                    <td><Delta pct={r.deltaPct} label="" /></td>
                    <td>{r.method}{r.confidence != null ? ` ${r.confidence}%` : ""}</td>
                    <td>{al ? <Tag tone={STATUS_TONE[al.status]}>{alarmStatusMeta[al.status]}</Tag> : "—"}</td>
                    <td className="num">
                      {wo ? (
                        <>
                          {wo.id}
                          <div style={{ fontSize: 10, color: "var(--ink-3)" }}>{workOrderStatusMeta[wo.status]}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          className="pf-btn ghost"
                          style={{ padding: "1px 8px", fontSize: 11 }}
                          onClick={() => setModal({ type: "alarm", id: r.alarmId })}
                        >
                          详情
                        </button>
                        {al && canAck && (
                          <button
                            className="pf-btn"
                            style={{ padding: "1px 8px", fontSize: 11 }}
                            disabled={!writable}
                            title={writable ? "人工确认该诊断" : "当前角色无写权限"}
                            onClick={() => doAlarmTransition(al, "acknowledged")}
                          >
                            确认
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "8px 0 0" }}>
            模拟诊断结果需人工确认后进入处置流程；手术室、MRI 等医疗安全相关回路保障优先，不做任何自动节能控制。
          </p>
        </Panel>
      </div>

      {/* 告警中心 */}
      <Panel
        title="告警中心（7 类 × 3 级 × 4 状态）"
        style={{ marginTop: 10 }}
        extra={
          <>
            <Tag tone="danger">严重未解决 {alarmCounts.critical}</Tag>
            <Tag tone="warn">待处理 {alarmCounts.pending}</Tag>
            <Tag tone="info">处理中 {alarmCounts.processing}</Tag>
            <Tag tone="muted">已确认 {alarmCounts.acknowledged}</Tag>
            <Tag tone="ok">已解决 {alarmCounts.resolved}</Tag>
          </>
        }
      >
        <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
          <select className="pf-select" value={alCat} onChange={(e) => setPageFilter(PAGE_ID, { alCat: e.target.value })}>
            <option value="all">全部类别</option>
            {Object.entries(alarmCategoryMeta).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select className="pf-select" value={alLevel} onChange={(e) => setPageFilter(PAGE_ID, { alLevel: e.target.value })}>
            <option value="all">全部级别</option>
            {Object.entries(alarmLevelMeta).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select className="pf-select" value={alStatus} onChange={(e) => setPageFilter(PAGE_ID, { alStatus: e.target.value })}>
            <option value="all">全部状态</option>
            {Object.entries(alarmStatusMeta).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button className="pf-btn ghost" onClick={() => setPageFilter(PAGE_ID, { alCat: "all", alLevel: "all", alStatus: "all" })}>
            重置
          </button>
          <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
            {filteredAlarms.length} / {alarms.length} 条
          </span>
          <span style={{ flex: 1 }} />
          <button className="pf-btn" onClick={exportAlarmsCsv}>
            <Download size={12} /> 导出 CSV
          </button>
        </div>
        {filteredAlarms.length ? (
          <div style={{ maxHeight: 340, overflowY: "auto" }}>
            <table className="pf-table">
              <thead>
                <tr>
                  <th>级别</th><th>告警</th><th>类别</th><th>楼宇</th><th>设备</th>
                  <th>责任人</th><th>开始时间</th><th>工单</th><th>状态</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredAlarms.map((a) => (
                  <tr key={a.id} onClick={() => setModal({ type: "alarm", id: a.id })} style={{ cursor: "pointer" }}>
                    <td><Tag tone={LEVEL_TONE[a.level]}>{alarmLevelMeta[a.level]}</Tag></td>
                    <td>
                      <div style={{ color: "var(--ink-1)" }}>{a.title}</div>
                      <div style={{ fontSize: 10, color: "var(--ink-3)" }}>
                        {a.id}
                        {a.anomalyId ? ` · ${a.anomalyId}` : ""}
                      </div>
                    </td>
                    <td>{alarmCategoryMeta[a.category]}</td>
                    <td>{buildingById[a.buildingId]?.shortName}</td>
                    <td className="num">{a.deviceId ?? "—"}</td>
                    <td>{a.owner}</td>
                    <td className="num">{a.startAt}</td>
                    <td className="num">{a.workOrderId ?? "—"}</td>
                    <td><Tag tone={STATUS_TONE[a.status]}>{alarmStatusMeta[a.status]}</Tag></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {alarmTransitions[a.status].length ? (
                          alarmTransitions[a.status].map((to) => (
                            <button
                              key={to}
                              className="pf-btn"
                              style={{ padding: "1px 8px", fontSize: 11 }}
                              disabled={!writable}
                              title={writable ? `流转为「${alarmStatusMeta[to]}」` : "当前角色无写权限"}
                              onClick={() => doAlarmTransition(a, to)}
                            >
                              {ALARM_ACTION[to]}
                            </button>
                          ))
                        ) : (
                          <span style={{ fontSize: 11, color: "var(--ink-3)" }}>已闭环</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text="当前筛选条件下无告警" />
        )}
      </Panel>

      {/* 设备详情弹窗 */}
      {modalDevice && (
        <Modal title={`设备详情 · ${modalDevice.name}`} onClose={() => setModal(null)} width={620}>
          <div className="grid cols-3" style={{ marginBottom: 10 }}>
            <Field k="编号" v={modalDevice.id} />
            <Field k="楼宇" v={buildingById[modalDevice.buildingId]?.name} />
            <Field k="类别" v={modalDevice.category} />
            <Field k="状态" v={<Tag tone={DEV_STATUS_META[modalDevice.status].tone}>{DEV_STATUS_META[modalDevice.status].label}</Tag>} />
            <Field k="额定功率" v={`${modalDevice.ratedPowerKw} kW`} />
            <Field k="待机功耗" v={modalDevice.standbyPowerKw != null ? `${modalDevice.standbyPowerKw} kW` : "—"} />
            <Field k="投运年份" v={modalDevice.commissionYear} />
            <Field k="设计寿命" v={`${modalDevice.designLifeYears} 年`} />
            <Field k="累计运行" v={`${fmt(modalDevice.runHours)} h`} />
            <Field k="效率衰减" v={`${modalDevice.efficiencyDecayPct}%`} />
            <Field k="计量表计" v={modalDevice.meterId} />
            <Field k="最后心跳" v={modalDevice.lastHeartbeat ?? "—"} />
          </div>
          {(() => {
            const relAlarms = alarms.filter((a) => a.deviceId === modalDevice.id);
            const relWos = workOrders.filter((w) => w.deviceId === modalDevice.id);
            return (
              <>
                <h4 style={{ margin: "10px 0 6px", fontSize: 12, color: "var(--ink-2)" }}>关联告警（{relAlarms.length}）</h4>
                {relAlarms.length ? (
                  <table className="pf-table">
                    <tbody>
                      {relAlarms.map((a) => (
                        <tr key={a.id} onClick={() => setModal({ type: "alarm", id: a.id })} style={{ cursor: "pointer" }}>
                          <td><Tag tone={LEVEL_TONE[a.level]}>{alarmLevelMeta[a.level]}</Tag></td>
                          <td>{a.title}</td>
                          <td><Tag tone={STATUS_TONE[a.status]}>{alarmStatusMeta[a.status]}</Tag></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p style={{ fontSize: 12, color: "var(--ink-3)", margin: 0 }}>无关联告警</p>
                )}
                <h4 style={{ margin: "10px 0 6px", fontSize: 12, color: "var(--ink-2)" }}>关联工单（{relWos.length}）</h4>
                {relWos.length ? (
                  <table className="pf-table">
                    <tbody>
                      {relWos.map((w) => (
                        <tr key={w.id}>
                          <td className="num">{w.id}</td>
                          <td>{w.title}</td>
                          <td><Tag tone="info">{workOrderStatusMeta[w.status]}</Tag></td>
                          <td>{w.owner}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p style={{ fontSize: 12, color: "var(--ink-3)", margin: 0 }}>无关联工单</p>
                )}
              </>
            );
          })()}
        </Modal>
      )}

      {/* 告警详情弹窗 */}
      {modalAlarm && (
        <Modal title={`告警详情 · ${modalAlarm.id}`} onClose={() => setModal(null)} width={640}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            <Tag tone={LEVEL_TONE[modalAlarm.level]}>{alarmLevelMeta[modalAlarm.level]}</Tag>
            <Tag tone="info">{alarmCategoryMeta[modalAlarm.category]}</Tag>
            <Tag tone={STATUS_TONE[modalAlarm.status]}>{alarmStatusMeta[modalAlarm.status]}</Tag>
            {modalChain?.medicalSafetyNote && <Tag tone="danger">医疗安全 · 保障优先</Tag>}
          </div>
          <p style={{ margin: "0 0 4px", fontSize: 14, color: "var(--ink-1)" }}>{modalAlarm.title}</p>
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--ink-2)" }}>{modalAlarm.detail}</p>
          <div className="grid cols-3" style={{ marginBottom: 10 }}>
            <Field k="楼宇" v={buildingById[modalAlarm.buildingId]?.name} />
            <Field k="设备" v={modalAlarm.deviceId ?? "—"} />
            <Field k="表计" v={modalAlarm.meterId ?? "—"} />
            <Field k="责任人" v={modalAlarm.owner} />
            <Field k="班组" v={modalAlarm.ownerTeam} />
            <Field k="开始时间" v={modalAlarm.startAt} />
            <Field
              k="工单"
              v={
                modalAlarm.workOrderId
                  ? `${modalAlarm.workOrderId}（${workOrderStatusMeta[workOrders.find((w) => w.id === modalAlarm.workOrderId)?.status ?? "received"]}）`
                  : "—"
              }
            />
            <Field k="额外能耗" v={modalAlarm.extraEnergyPerDay ?? "—"} />
            <Field k="额外碳排" v={modalAlarm.extraCarbonKgPerDay != null ? `${fmt(modalAlarm.extraCarbonKgPerDay)} kgCO₂e/日` : "—"} />
          </div>

          {modalChain && (
            <div style={{ borderTop: "1px solid var(--panel-border)", paddingTop: 10 }}>
              <h4 style={{ margin: "0 0 6px", fontSize: 12, color: "var(--ink-2)", display: "flex", gap: 6, alignItems: "center" }}>
                AI 根因分析
                <Tag tone="info">模拟诊断</Tag>
                <Tag tone="muted">置信度 {modalChain.aiConfidencePct}%</Tag>
              </h4>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--ink-1)" }}>根因：{modalChain.rootCause}</p>
              <ul style={{ margin: "0 0 6px", paddingLeft: 18, fontSize: 12, color: "var(--ink-2)" }}>
                {modalChain.evidence.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--ink-2)" }}>建议：{modalChain.suggestion}</p>
              {(modalChain.estSavingMwhPerYear > 0 || modalChain.estSavingWanYuanPerYear > 0 || modalChain.estReductionTPerYear > 0) && (
                <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--ink-2)" }}>
                  预计年节省：{modalChain.estSavingMwhPerYear > 0 ? `${modalChain.estSavingMwhPerYear} MWh · ` : ""}
                  {modalChain.estSavingWanYuanPerYear > 0 ? `${modalChain.estSavingWanYuanPerYear} 万元 · ` : ""}
                  减碳 {modalChain.estReductionTPerYear} tCO₂e
                </p>
              )}
              {modalChain.medicalSafetyNote && (
                <p style={{ margin: 0, fontSize: 12, color: "var(--red)" }}>安全边界：{modalChain.medicalSafetyNote}（不影响医疗安全 / 保障优先）</p>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
            {alarmTransitions[modalAlarm.status].length ? (
              alarmTransitions[modalAlarm.status].map((to) => (
                <button
                  key={to}
                  className="pf-btn primary"
                  disabled={!writable}
                  title={writable ? undefined : "当前角色无写权限"}
                  onClick={() => doAlarmTransition(modalAlarm, to)}
                >
                  {ALARM_ACTION[to]}
                </button>
              ))
            ) : (
              <Tag tone="ok">已解决 · 流程闭环</Tag>
            )}
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
              状态流转经统一状态机校验（人工确认动作）{writable ? "" : " · 当前角色只读"}
            </span>
          </div>
        </Modal>
      )}
    </>
  );
}
