// 后勤驾驶舱（提示词 6.6.2）：能耗-碳排-设备一体化运营。
// 执行层视角：实时负荷、系统效率、运行事件、今日任务、高碳排行。
import dayjs from "dayjs";
import { Activity, ChevronRight, ClipboardCheck, Clock3, Radio } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { EChart } from "../../components/EChart";
import { Panel, Tag } from "../../components/kit";
import { alarmLevelMeta, alarmStatusMeta } from "../../data/alarms";
import { mainBuildings } from "../../data/buildings";
import { demoAsOfDate } from "../../data/config";
import { deviceStats } from "../../data/devices";
import { activeFactors } from "../../data/factors";
import { CockpitShell } from "../../layouts/CockpitShell";
import { useDemoStore } from "../../stores/demo";
import type { WorkOrder } from "../../types/core";
import {
  dailyCarbonKg,
  forecastHospitalHourlyElectricCarbonKg,
  hospitalDailyCarbonT,
  hospitalHourlyElectricCarbonKg,
  hourlySeries,
  outpatientVisits,
  realtimeElectricCarbonKgPerHour,
  realtimePowerKw,
} from "../../services/timeseries";

/** 重点系统效率（首版演示基准：冷站 84% / 锅炉 76% / 医气 91% / 污水 68%） */
const KEY_SYSTEMS = [
  { name: "冷站（冷机+水泵）", eff: 84, status: "warn", note: "3# 泵低温差综合征，节能潜力 126 MWh/a", guard: "供冷保障正常" },
  { name: "蒸汽锅炉", eff: 76, status: "warn", note: "2# 锅炉烟温偏高，燃烧调试中", guard: "蒸汽保障正常" },
  { name: "医用气体", eff: 91, status: "danger", note: "备用汇流排压力异常（保障优先）", guard: "主供正常·冗余降级" },
  { name: "污水处理", eff: 68, status: "ok", note: "曝气系统按负荷运行", guard: "达标排放" },
] as const;

/** 实时运行事件脚本（确定性轮播，模拟实时流） */
const EVENT_SCRIPT = [
  { time: "14:28", area: "手术医技楼 3F", event: "洁净空调送风温度超阈 +1.2℃", level: "warning", team: "暖通组" },
  { time: "14:21", area: "动力中心", event: "冷站执行 7℃ 出水温度策略", level: "info", team: "冷站班" },
  { time: "14:15", area: "住院部 A 楼", event: "生活热水用量进入午后峰值", level: "info", team: "水务组" },
  { time: "14:02", area: "动力中心", event: "2# 锅炉效率低于基线 4.2%", level: "warning", team: "锅炉班" },
  { time: "13:47", area: "医用氧气站", event: "备用汇流排压力 8.2bar（<9.5 下限）", level: "critical", team: "医气组" },
  { time: "13:30", area: "影像中心", event: "MRI-02 完成上午检查转待机", level: "info", team: "医工科" },
  { time: "13:18", area: "消毒供应室", event: "7# 疏水阀更换后复测蒸汽耗量 -13%", level: "info", team: "锅炉班" },
  { time: "13:02", area: "门诊综合楼", event: "大厅空调按人流密度降档", level: "info", team: "暖通组" },
];

/** 今日减碳任务（提示词指定三项） */
const TODAY_TASKS = [
  { name: "手术中心空调策略核查（恢复 setback 计划）", status: "processing", pct: 60, owner: "暖通组" },
  { name: "住院楼夜间照明巡检", status: "pending", pct: 0, owner: "电气组" },
  { name: "锅炉余热回收核查", status: "done", pct: 100, owner: "锅炉班" },
] as const;

function dueState(workOrder: WorkOrder): "overdue" | "soon" | "normal" | "done" {
  if (workOrder.status === "closed") return "done";
  const hours = dayjs(workOrder.dueAt).diff(dayjs(`${demoAsOfDate} 00:00`), "hour");
  if (hours < 0) return "overdue";
  if (hours <= 48) return "soon";
  return "normal";
}

export function OperationsCockpit() {
  const { alarms, workOrders } = useDemoStore();
  const [tick, setTick] = useState(0);
  const [rightTab, setRightTab] = useState<"rank" | "medgas" | "or" | "meter">("rank");
  const [eventCount, setEventCount] = useState(4);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.hidden) return;
      setTick((x) => x + 1);
      setEventCount((c) => (c >= EVENT_SCRIPT.length ? 4 : c + 1)); // 固定长度环形轮播
    }, 5000);
    return () => window.clearInterval(t);
  }, []);

  const realtimeTick = 14.5 * 3600 + tick * 5;
  const kw = realtimePowerKw(realtimeTick);
  const todayCarbon = hospitalDailyCarbonT(demoAsOfDate);
  const stats = deviceStats();
  // 在线率口径 = 表计/采集通讯在线率（故障设备仍在线上报，不计离线）
  const METERS = { total: 492, online: 486 };
  const onlineRate = (METERS.online / METERS.total) * 100;
  const pendingAlarms = alarms.filter((a) => a.status === "pending" || a.status === "processing").length;

  const hourly = useMemo(() => {
    const elec = Array.from({ length: 24 }, (_, h) =>
      mainBuildings.reduce((s, b) => s + hourlySeries(b.id, "electricity", demoAsOfDate)[h].v, 0));
    const carbonNow = elec.map((v) => Math.round(v * activeFactors.electricity) / 1000);
    const visits = outpatientVisits(demoAsOfDate);
    const load = Array.from({ length: 24 }, (_, h) => {
      const w = h >= 7 && h < 18 ? 1 + 0.9 * Math.exp(-((h - 10.5) ** 2) / 14) : 0.25;
      return Math.round((visits / 12) * w);
    });
    return { elec, carbonNow, load };
  }, []);

  const liveCarbon = useMemo(() => {
    const today = dayjs(demoAsOfDate);
    const currentHour = Math.floor((realtimeTick / 3600) % 24);
    const startHour = (currentHour + 1) % 24;
    const hours = Array.from({ length: 24 }, (_, index) => (startHour + index) % 24);
    const rows = hours.map((hour) => {
      const date = hour > currentHour ? today.subtract(1, "day") : today;
      const dateText = date.format("YYYY-MM-DD");
      const historical = hospitalHourlyElectricCarbonKg(dateText)[hour].v;
      const previous = hospitalHourlyElectricCarbonKg(date.subtract(1, "day").format("YYYY-MM-DD"))[hour].v;
      const forecast = forecastHospitalHourlyElectricCarbonKg(dateText)[hour].v;
      const actual = date.isSame(today, "day") && hour === currentHour
        ? realtimeElectricCarbonKgPerHour(realtimeTick)
        : historical;
      return { hour, actual, previous, forecast };
    });
    const current = rows[rows.length - 1];
    const deviationPct = current.forecast ? ((current.actual - current.forecast) / current.forecast) * 100 : 0;
    const minute = Math.floor((realtimeTick / 60) % 60);

    return {
      labels: rows.map((row) => `${String(row.hour).padStart(2, "0")}:00`),
      actual: rows.map((row) => row.actual),
      previous: rows.map((row) => row.previous),
      forecast: rows.map((row) => row.forecast),
      current: current.actual,
      deviationPct,
      clock: `${String(currentHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    };
  }, [realtimeTick]);

  const ranking = useMemo(
    () =>
      mainBuildings
        .map((b) => ({ name: b.shortName, full: b.name, v: Math.round(dailyCarbonKg(b.id, demoAsOfDate) / 100) / 10 }))
        .sort((a, b) => b.v - a.v),
    [],
  );

  const workOrderFlow = useMemo(() => {
    const open = workOrders.filter((workOrder) => workOrder.status !== "closed");
    const stages = [
      {
        name: "待研判",
        count: open.filter((workOrder) => workOrder.status === "received" || workOrder.status === "judging").length,
        color: "#5f7799",
      },
      {
        name: "待执行",
        count: open.filter((workOrder) => workOrder.status === "assigned").length,
        color: "#29d3e8",
      },
      {
        name: "处理中",
        count: open.filter((workOrder) => workOrder.status === "processing").length,
        color: "#35d399",
      },
      {
        name: "验证中",
        count: open.filter((workOrder) => workOrder.status === "retest" || workOrder.status === "review").length,
        color: "#8b8df0",
      },
    ];
    const high = open.filter((workOrder) => workOrder.priority === "high").length;
    const dueSoon = open.filter((workOrder) => {
      const state = dueState(workOrder);
      return state === "soon" || state === "overdue";
    }).length;
    const earliest = [...open]
      .sort((a, b) => dayjs(a.dueAt).valueOf() - dayjs(b.dueAt).valueOf())
      .slice(0, 2);

    return {
      open: open.length,
      high,
      dueSoon,
      earliest,
      stages,
      option: {
        animationDuration: 420,
        legend: false as const,
        grid: { left: 0, right: 0, top: 4, bottom: 4 },
        tooltip: {
          trigger: "item",
          formatter: (params: { seriesName: string; value: number }) => `${params.seriesName}：${params.value} 单`,
        },
        xAxis: {
          type: "value",
          max: Math.max(open.length, 1),
          show: false,
        },
        yAxis: {
          type: "category",
          data: ["在途工单"],
          show: false,
        },
        series: stages.map((stage, index) => ({
          name: stage.name,
          type: "bar",
          stack: "work-order-flow",
          barWidth: 18,
          data: [stage.count],
          itemStyle: {
            color: stage.color,
            borderRadius: index === 0 ? [4, 0, 0, 4] : index === stages.length - 1 ? [0, 4, 4, 0] : 0,
          },
          label: {
            show: stage.count > 0,
            position: "inside",
            color: "#06101f",
            fontSize: 10,
            fontWeight: 700,
            formatter: String(stage.count),
          },
        })),
      },
    };
  }, [workOrders]);

  const kpis = [
    { label: "实时总负荷", v: (kw / 1000).toFixed(2), u: "MW", sub: "全院电力（5s 模拟刷新）", tone: "cyan" },
    { label: "今日综合碳排", v: todayCarbon.toFixed(1), u: "tCO₂e", sub: "电+气+热合规口径", tone: "cyan" },
    { label: "保障系统在线率", v: onlineRate.toFixed(1), u: "%", sub: `表计 ${METERS.online}/${METERS.total} · 设备故障 ${stats.fault} 台`, tone: onlineRate > 98 ? "green" : "amber" },
    { label: "待处理告警", v: String(pendingAlarms), u: "条", sub: "含 2 条严重", tone: pendingAlarms > 5 ? "amber" : "green" },
  ] as const;

  return (
    <CockpitShell name="后勤驾驶舱｜能耗-碳排-设备一体化运营" variant="operations">
      <div className="hud-kpis">
        {kpis.map((k) => (
          <div key={k.label} className="pf-kpi" style={{ padding: "8px 16px", minWidth: 150 }}>
            <span className="k-label" style={{ fontSize: 11 }}>{k.label}</span>
            <span className="k-value" style={{ fontSize: 22, color: `var(--${k.tone === "cyan" ? "cyan" : k.tone})` }}>{k.v}<small>{k.u}</small></span>
            <span className="k-sub" style={{ fontSize: 10 }}>{k.sub}</span>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", top: 14, left: 16, zIndex: 12, fontSize: 11, color: "var(--ink-2)" }}>
        主院区实时监测 · 楼宇/科室/系统多维联动
      </div>

      <div className="hud-cols" style={{ paddingTop: 92 }}>
        {/* 左列 */}
        <div className="hud-col">
          <Panel title="24h 能耗-碳排趋势与医疗负荷" extra={<Activity size={13} />}>
            <EChart
              height="clamp(140px, 19vh, 230px)"
              option={{
                grid: { left: 40, right: 34, top: 24, bottom: 18 },
                legend: { data: ["能耗 kWh", "碳排 t", "医疗负荷"] },
                xAxis: { type: "category", data: Array.from({ length: 24 }, (_, h) => `${h}时`), axisLabel: { interval: 3, fontSize: 9 } },
                yAxis: [
                  { type: "value", axisLabel: { fontSize: 9 } },
                  { type: "value", axisLabel: { fontSize: 9 }, splitLine: { show: false } },
                ],
                tooltip: {},
                series: [
                  { name: "能耗 kWh", type: "line", data: hourly.elec.map((v) => Math.round(v)), symbol: "none", smooth: true, lineStyle: { width: 2, color: "#29d3e8" }, areaStyle: { opacity: 0.1, color: "#29d3e8" }, markPoint: { data: [{ type: "max", name: "峰值" }], symbolSize: 36, label: { fontSize: 8 } } },
                  { name: "碳排 t", type: "line", data: hourly.carbonNow, symbol: "none", smooth: true, yAxisIndex: 1, lineStyle: { width: 1.4, color: "#f5a524" } },
                  { name: "医疗负荷", type: "bar", data: hourly.load, yAxisIndex: 1, barWidth: 3, itemStyle: { color: "rgba(139,141,240,0.4)" } },
                ],
              }}
            />
            <p style={{ margin: "2px 0 0", fontSize: 10, color: "var(--ink-3)" }}>
              峰值 10-11 时随门诊高峰出现 · 同比 +6.2% · 错峰建议：影像大型设备检查预约向 13-16 时平移，可削峰约 4%
            </p>
          </Panel>

          <Panel title="重点系统效率与保障状态">
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {KEY_SYSTEMS.map((s) => (
                <div key={s.name}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                    <span>{s.name}</span>
                    <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <Tag tone={s.status === "ok" ? "ok" : s.status === "warn" ? "warn" : "danger"}>{s.guard}</Tag>
                      <b className="num" style={{ color: s.status === "ok" ? "var(--green)" : s.status === "warn" ? "var(--amber)" : "var(--red)" }}>{s.eff}%</b>
                    </span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: "rgba(157,180,214,0.15)", overflow: "hidden" }}>
                    <div style={{ width: `${s.eff}%`, height: "100%", borderRadius: 3, background: s.status === "ok" ? "var(--green)" : s.status === "warn" ? "var(--amber)" : "var(--red)", opacity: 0.85 }} />
                  </div>
                  <p style={{ margin: "2px 0 0", fontSize: 9.5, color: "var(--ink-3)" }}>{s.note}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="今日减碳任务" extra={<ClipboardCheck size={13} />}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {TODAY_TASKS.map((t) => (
                <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <Tag tone={t.status === "done" ? "ok" : t.status === "processing" ? "info" : "muted"}>
                    {t.status === "done" ? "已完成" : t.status === "processing" ? "进行中" : "待开始"}
                  </Tag>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.name}>{t.name}</span>
                  <span className="num" style={{ color: "var(--ink-3)", fontSize: 10 }}>{t.owner} · {t.pct}%</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* 中列：仅底部留言，场景为主 */}
        <div className="hud-col center">
          <div style={{ pointerEvents: "auto", alignSelf: "center", marginBottom: "clamp(175px, 21vh, 238px)" }}>
            <p style={{ margin: 0, fontSize: 10, color: "var(--ink-3)", textAlign: "center", background: "rgba(6,13,27,0.55)", padding: "3px 12px", borderRadius: 999 }}>
              点击楼宇名牌查看当前故障、工单与碳影响 · 红色=存在严重异常
            </p>
          </div>
        </div>

        {/* 右列 */}
        <div className="hud-col">
          <Panel title="实时运行事件" extra={<span className="panel-extra"><Radio size={12} className="breath" /> LIVE（模拟）</span>}>
            <div ref={listRef} style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: "clamp(120px, 16vh, 200px)", overflowY: "auto" }}>
              {EVENT_SCRIPT.slice(0, eventCount).map((e, i) => (
                <div key={`${e.time}-${i}`} className={i === eventCount - 1 ? "fadeup" : undefined} style={{ display: "flex", gap: 7, fontSize: 11, alignItems: "baseline" }}>
                  <span className="num" style={{ color: "var(--ink-3)", fontSize: 10, flexShrink: 0 }}>{e.time}</span>
                  <Tag tone={e.level === "critical" ? "danger" : e.level === "warning" ? "warn" : "info"}>
                    {e.level === "critical" ? "严重" : e.level === "warning" ? "警告" : "提示"}
                  </Tag>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 10.5, color: "var(--ink-2)" }}>{e.area}</b> {e.event}
                    <span style={{ color: "var(--ink-3)", fontSize: 9.5 }}> · {e.team}</span>
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title={rightTab === "rank" ? "高碳楼宇排行" : rightTab === "medgas" ? "医用气体状态" : rightTab === "or" ? "手术环境" : "表计与告警"}
            extra={
              <div className="cockpit-tabs">
                <button className={rightTab === "rank" ? "active" : ""} onClick={() => setRightTab("rank")}>排行</button>
                <button className={rightTab === "medgas" ? "active" : ""} onClick={() => setRightTab("medgas")}>医气</button>
                <button className={rightTab === "or" ? "active" : ""} onClick={() => setRightTab("or")}>手术</button>
                <button className={rightTab === "meter" ? "active" : ""} onClick={() => setRightTab("meter")}>表计</button>
              </div>
            }
          >
            {rightTab === "rank" && (
              <EChart
                height="clamp(150px, 20vh, 250px)"
                option={{
                  legend: false,
                  grid: { left: 62, right: 34, top: 4, bottom: 16 },
                  xAxis: { type: "value", axisLabel: { fontSize: 9 } },
                  yAxis: { type: "category", data: ranking.slice(0, 7).map((r) => r.name).reverse(), axisLabel: { fontSize: 10 } },
                  tooltip: { formatter: (p: { name: string; value: number }) => `${ranking.find((r) => r.name === p.name)?.full}：${p.value} tCO₂e 今日` },
                  series: [{
                    type: "bar", barWidth: 9,
                    data: ranking.slice(0, 7).map((r) => r.v).reverse(),
                    itemStyle: { color: "#29d3e8", borderRadius: 3 },
                    label: { show: true, position: "right", fontSize: 9, color: "#9db4d6", formatter: "{c}t" },
                  }],
                }}
              />
            )}
            {rightTab === "medgas" && (
              <table className="pf-table">
                <tbody>
                  {[
                    { n: "液氧罐余量", v: "72%", s: "ok", note: "可用 9.2 天" },
                    { n: "备用汇流排", v: "8.2 bar", s: "danger", note: "低于下限，更换减压阀中" },
                    { n: "压缩空气", v: "0.78 MPa", s: "ok", note: "1# 空压机运行" },
                    { n: "负压吸引", v: "-68 kPa", s: "ok", note: "真空泵正常" },
                    { n: "N₂O 管道", v: "0.42 MPa", s: "ok", note: "夜间无泄漏征兆" },
                  ].map((r) => (
                    <tr key={r.n}>
                      <td style={{ fontSize: 11 }}>{r.n}</td>
                      <td className="num">{r.v}</td>
                      <td><Tag tone={r.s as "ok" | "danger"}>{r.s === "ok" ? "正常" : "异常"}</Tag></td>
                      <td style={{ fontSize: 10, color: "var(--ink-3)" }}>{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {rightTab === "or" && (
              <div style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                  {[
                    { n: "手术环境达标率", v: "99.4%", tone: "green" },
                    { n: "净化空调效率", v: "81%", tone: "amber" },
                    { n: "在术手术间", v: "9/22", tone: "cyan" },
                  ].map((k) => (
                    <div key={k.n} className="pf-kpi" style={{ padding: "6px 8px" }}>
                      <span className="k-label" style={{ fontSize: 10 }}>{k.n}</span>
                      <span className="k-value" style={{ fontSize: 16, color: `var(--${k.tone})` }}>{k.v}</span>
                    </div>
                  ))}
                </div>
                <p style={{ margin: 0, color: "var(--ink-3)", fontSize: 10 }}>
                  AHU-03 夜间未 setback 处置中（WO-2026-0712）· 3# 手术室压差波动已闭环（保障优先，禁止自动节能控制）
                </p>
              </div>
            )}
            {rightTab === "meter" && (
              <div style={{ fontSize: 11 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
                  <Tag tone="ok">在线表计 486/492</Tag>
                  <Tag tone="warn">行政楼网关已恢复</Tag>
                  <Tag tone="muted">完整率 97.8%</Tag>
                </div>
                <table className="pf-table">
                  <thead><tr><th>告警</th><th>等级</th><th>状态</th></tr></thead>
                  <tbody>
                    {alarms.filter((a) => a.status !== "resolved").slice(0, 5).map((a) => (
                      <tr key={a.id}>
                        <td style={{ fontSize: 10.5 }}>{a.title.slice(0, 16)}…</td>
                        <td><Tag tone={a.level === "critical" ? "danger" : a.level === "warning" ? "warn" : "info"}>{alarmLevelMeta[a.level]}</Tag></td>
                        <td style={{ fontSize: 10 }}>{alarmStatusMeta[a.status]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel
            title="工单闭环与时限"
            extra={
              <Link className="pf-btn ghost" to="/app/operations/workorders" style={{ padding: "2px 7px", fontSize: 10 }}>
                查看工单 <ChevronRight size={11} />
              </Link>
            }
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, marginBottom: 6 }}>
              {[
                { label: "在途", value: workOrderFlow.open, unit: "单", color: "var(--cyan)" },
                { label: "高优先级", value: workOrderFlow.high, unit: "单", color: "var(--red)" },
                { label: "48h 临期", value: workOrderFlow.dueSoon, unit: "单", color: "var(--amber)" },
              ].map((item, index) => (
                <div
                  key={item.label}
                  style={{
                    padding: "1px 9px 3px",
                    borderLeft: index > 0 ? "1px solid var(--panel-border)" : undefined,
                  }}
                >
                  <span style={{ display: "block", color: "var(--ink-3)", fontSize: 9.5 }}>{item.label}</span>
                  <b className="num" style={{ color: item.color, fontSize: 17, lineHeight: 1.25 }}>
                    {item.value}<small style={{ marginLeft: 3, fontSize: 9, color: "var(--ink-3)", fontWeight: 400 }}>{item.unit}</small>
                  </b>
                </div>
              ))}
            </div>

            <EChart height={36} option={workOrderFlow.option} />
            <div style={{ display: "flex", justifyContent: "space-between", gap: 6, marginTop: 3 }}>
              {workOrderFlow.stages.map((stage) => (
                <span key={stage.name} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--ink-3)", fontSize: 9.5 }}>
                  <i style={{ width: 6, height: 6, borderRadius: 2, background: stage.color }} />
                  {stage.name} {stage.count}
                </span>
              ))}
            </div>

            <div style={{ borderTop: "1px solid rgba(56,116,178,0.16)", marginTop: 7, paddingTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
              {workOrderFlow.earliest.map((workOrder, index) => {
                const state = dueState(workOrder);
                return (
                  <div key={workOrder.id} style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", alignItems: "center", gap: 6, fontSize: 10 }}>
                    {index === 0 ? <Clock3 size={11} color={state === "overdue" ? "var(--red)" : "var(--amber)"} /> : <span style={{ width: 11 }} />}
                    <span title={`${workOrder.id} · ${workOrder.title}`} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink-2)" }}>
                      {workOrder.id} · {workOrder.title}
                    </span>
                    <span className="num" style={{ color: state === "overdue" ? "var(--red)" : state === "soon" ? "var(--amber)" : "var(--ink-3)" }}>
                      {dayjs(workOrder.dueAt).format("MM-DD HH:mm")}
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>

      <Panel
        className="operations-live-carbon"
        title="医院实时碳排速率"
        extra={(
          <span className="panel-extra">
            <Radio size={12} className="breath" />LIVE（模拟） · 当前 {liveCarbon.current.toLocaleString("zh-CN", { maximumFractionDigits: 0 })} kgCO₂e/h · {liveCarbon.clock}
          </span>
        )}
      >
        <EChart
          height="clamp(118px, 15vh, 164px)"
          option={{
            animationDuration: 380,
            animationDurationUpdate: 380,
            grid: { left: 54, right: 20, top: 28, bottom: 22 },
            legend: { data: ["实时", "昨日", "预测"], top: 0 },
            xAxis: { type: "category", data: liveCarbon.labels, axisLabel: { interval: 2, fontSize: 9 } },
            yAxis: { type: "value", name: "kgCO₂e/h", nameTextStyle: { fontSize: 9, color: "#5f7799" }, axisLabel: { fontSize: 9 } },
            tooltip: { valueFormatter: (value: unknown) => `${Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 0 })} kgCO₂e/h` },
            series: [
              {
                name: "实时",
                type: "line",
                data: liveCarbon.actual,
                symbol: "none",
                smooth: true,
                z: 3,
                lineStyle: { width: 2.6, color: "#29d3e8" },
                areaStyle: { opacity: 0.1, color: "#29d3e8" },
              },
              {
                name: "昨日",
                type: "bar",
                data: liveCarbon.previous,
                barMaxWidth: 20,
                itemStyle: { color: "rgba(245,165,36,0.38)", borderColor: "rgba(245,165,36,0.78)", borderWidth: 1, borderRadius: [3, 3, 0, 0] },
              },
              {
                name: "预测",
                type: "line",
                data: liveCarbon.forecast,
                symbol: "none",
                smooth: true,
                z: 4,
                lineStyle: { width: 2.2, type: "dashed", color: "#ff7467" },
              },
            ],
          }}
        />
        <div className="operations-live-carbon__caption">
          <span>偏离预测 <b className={liveCarbon.deviationPct > 0 ? "is-over" : "is-under"}>{liveCarbon.deviationPct >= 0 ? "+" : ""}{liveCarbon.deviationPct.toFixed(1)}%</b></span>
          <span>范围二·外购电力 · 因子 0.6096 kgCO₂e/kWh（已核验）</span>
          <span>预测为模拟估算；天然气/热力因子待标准确认（演示）</span>
        </div>
      </Panel>

      <div style={{ position: "absolute", left: 16, bottom: 12, zIndex: 12, fontSize: 10, color: "var(--ink-3)" }}>
        工单闭环率本月 87% · 进行中 {workOrders.filter((w) => w.status !== "closed").length} 单 · 详情见 后勤运维 → 设备台账与工单
      </div>
    </CockpitShell>
  );
}
