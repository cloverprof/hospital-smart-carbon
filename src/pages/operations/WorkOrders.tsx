// 6.5.1 设备台账与工单联动：八大系统台账 + 计量绑定链 + 能耗异常自动工单 + 七态状态机看板。
import dayjs from "dayjs";
import { ArrowRight, ChevronRight, ClipboardList, Download, RefreshCcw, Search, ShieldCheck, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EChart } from "../../components/EChart";
import { EmptyState, Kpi, Modal, PageHead, Panel, Tag } from "../../components/kit";
import { alarmById, alarmLevelMeta } from "../../data/alarms";
import { anomalyById, anomalyChains } from "../../data/anomalies";
import { buildingById, campusName } from "../../data/buildings";
import { demoAsOfDate, energyKindMeta } from "../../data/config";
import { devices } from "../../data/devices";
import { activeFactors } from "../../data/factors";
import {
  deviceStatusMeta, historicalWorkOrders, kanbanStatusOrder, meterInfo,
  systemNames, systemTabs, transitionLabels,
} from "../../data/modules/asset-workorders";
import { canWrite } from "../../data/navigation";
import { workOrderStatusMeta } from "../../data/workorders";
import { workOrderTransitions } from "../../services/machines";
import { dailySeries } from "../../services/timeseries";
import { useDemoStore } from "../../stores/demo";
import type { Device, Project, WorkOrder, WorkOrderStatus } from "../../types/core";

const PAGE_ID = "asset-workorders";

const priorityMeta: Record<WorkOrder["priority"], { name: string; tone: "danger" | "warn" | "info"; color: string }> = {
  high: { name: "高", tone: "danger", color: "#f4525f" },
  medium: { name: "中", tone: "warn", color: "#f5a524" },
  low: { name: "低", tone: "info", color: "#29d3e8" },
};

const asOfYear = Number(demoAsOfDate.slice(0, 4));

/** 截止时间状态：closed 不计；逾期 / 48h 临期 / 正常 */
function dueState(wo: WorkOrder): "overdue" | "soon" | "normal" | "done" {
  if (wo.status === "closed") return "done";
  const hrs = dayjs(wo.dueAt).diff(dayjs(`${demoAsOfDate} 00:00`), "hour");
  if (hrs < 0) return "overdue";
  if (hrs <= 48) return "soon";
  return "normal";
}

function remainLifeYears(d: Device): number {
  return d.commissionYear + d.designLifeYears - asOfYear;
}

function shortDeviceName(name: string): string {
  const plain = name.replace(/（[^）]*）/g, "");
  return plain.length > 11 ? `${plain.slice(0, 11)}…` : plain;
}

const cellNum: React.CSSProperties = { textAlign: "right" };
const fieldLabel: React.CSSProperties = { fontSize: 11, color: "var(--ink-3)" };
const fieldValue: React.CSSProperties = { fontSize: 13, color: "var(--ink-1)" };

export function WorkOrdersPage() {
  const nav = useNavigate();
  const {
    role, allPermissions, workOrders, projects,
    transitionWorkOrder, addWorkOrderLog, addProject,
    pageFilters, setPageFilter, pushToast,
  } = useDemoStore();
  const writable = canWrite(PAGE_ID, role, allPermissions);

  const f = pageFilters[PAGE_ID] ?? {};
  const sysTab = typeof f.sysTab === "string" ? f.sysTab : "all";
  const q = typeof f.q === "string" ? f.q : "";
  const statusF = typeof f.status === "string" ? f.status : "all";
  const sortBy = typeof f.sort === "string" ? f.sort : "decay";
  const woPriority = typeof f.woPriority === "string" ? f.woPriority : "all";
  const woDueSoon = f.woDueSoon === true;
  const setF = (patch: Record<string, string | number | boolean>) => setPageFilter(PAGE_ID, patch);

  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [woId, setWoId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  // ---------- 台账数据 ----------
  const liveWoByDevice = useMemo(() => {
    const m = new Map<string, WorkOrder[]>();
    workOrders.forEach((w) => {
      if (w.deviceId) m.set(w.deviceId, [...(m.get(w.deviceId) ?? []), w]);
    });
    return m;
  }, [workOrders]);

  const histByDevice = useMemo(() => {
    const m = new Map<string, typeof historicalWorkOrders>();
    historicalWorkOrders.forEach((h) => m.set(h.deviceId, [...(m.get(h.deviceId) ?? []), h]));
    return m;
  }, []);

  const woCountOf = (id: string) => (liveWoByDevice.get(id)?.length ?? 0) + (histByDevice.get(id)?.length ?? 0);

  const tab = systemTabs.find((t) => t.id === sysTab) ?? systemTabs[0];
  const tabDevices = useMemo(
    () => devices.filter((d) => tab.systems.length === 0 || tab.systems.includes(d.system)),
    [tab],
  );
  const filteredDevices = useMemo(() => {
    let list = tabDevices;
    if (statusF !== "all") list = list.filter((d) => d.status === statusF);
    const k = q.trim().toLowerCase();
    if (k) list = list.filter((d) => `${d.name}${d.id}${d.meterId}`.toLowerCase().includes(k));
    const sorted = [...list];
    if (sortBy === "hours") sorted.sort((a, b) => b.runHours - a.runHours);
    else if (sortBy === "year") sorted.sort((a, b) => a.commissionYear - b.commissionYear);
    else if (sortBy === "power") sorted.sort((a, b) => b.ratedPowerKw - a.ratedPowerKw);
    else sorted.sort((a, b) => b.efficiencyDecayPct - a.efficiencyDecayPct);
    return sorted;
  }, [tabDevices, statusF, q, sortBy]);

  // ---------- KPI ----------
  const stats = useMemo(() => {
    const online = devices.filter((d) => d.status === "online").length;
    const fault = devices.filter((d) => d.status === "fault").length;
    const maintenance = devices.filter((d) => d.status === "maintenance").length;
    const open = workOrders.filter((w) => w.status !== "closed");
    const high = open.filter((w) => w.priority === "high").length;
    const dueSoon = open.filter((w) => dueState(w) === "soon" || dueState(w) === "overdue").length;
    const lifeWarn = devices.filter((d) => remainLifeYears(d) <= 1).length;
    return { online, fault, maintenance, open: open.length, high, dueSoon, lifeWarn };
  }, [workOrders]);

  // ---------- 图表 ----------
  const decayOption = useMemo(() => {
    const top = [...filteredDevices]
      .filter((d) => d.efficiencyDecayPct > 0)
      .sort((a, b) => b.efficiencyDecayPct - a.efficiencyDecayPct)
      .slice(0, 8)
      .reverse();
    return {
      empty: top.length === 0,
      option: {
        legend: false as const,
        grid: { left: 96, right: 30 },
        tooltip: { valueFormatter: (v: unknown) => `${v as number}%` },
        xAxis: { type: "value", name: "%", nameGap: 6 },
        yAxis: { type: "category", data: top.map((d) => shortDeviceName(d.name)) },
        series: [{
          type: "bar", barWidth: 10,
          data: top.map((d) => d.efficiencyDecayPct),
          itemStyle: { color: "#f5a524", borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: "right", color: "#9db4d6", fontSize: 10, formatter: "{c}%" },
        }],
      },
    };
  }, [filteredDevices]);

  const statusPieOption = useMemo(() => {
    const cnt = (s: Device["status"]) => filteredDevices.filter((d) => d.status === s).length;
    const data = [
      { name: "在线", value: cnt("online"), itemStyle: { color: "#35d399" } },
      { name: "故障", value: cnt("fault"), itemStyle: { color: "#f4525f" } },
      { name: "维保中", value: cnt("maintenance"), itemStyle: { color: "#f5a524" } },
      { name: "离线", value: cnt("offline"), itemStyle: { color: "#5f7799" } },
    ].filter((d) => d.value > 0);
    return {
      empty: data.length === 0,
      option: {
        tooltip: { trigger: "item", valueFormatter: (v: unknown) => `${v as number} 台` },
        legend: { orient: "vertical", right: 4, top: "middle", left: undefined },
        series: [{
          type: "pie", radius: ["46%", "72%"], center: ["34%", "50%"],
          label: { show: false }, data,
        }],
      },
    };
  }, [filteredDevices]);

  const woStructureOption = useMemo(() => {
    const open = workOrders.filter((w) => w.status !== "closed");
    const systems = [...new Set(open.map((w) => w.system))];
    const count = (sys: string, p: WorkOrder["priority"]) => open.filter((w) => w.system === sys && w.priority === p).length;
    return {
      empty: systems.length === 0,
      option: {
        grid: { bottom: 30 },
        tooltip: { valueFormatter: (v: unknown) => `${v as number} 单` },
        xAxis: { type: "category", data: systems.map((s) => systemNames[s]), axisLabel: { color: "#5f7799", fontSize: 10, interval: 0 } },
        yAxis: { type: "value", name: "单", minInterval: 1 },
        series: (["high", "medium", "low"] as const).map((p) => ({
          name: `${priorityMeta[p].name}优先级`, type: "bar", stack: "total", barWidth: 18,
          itemStyle: { color: priorityMeta[p].color },
          data: systems.map((s) => count(s, p)),
        })),
      },
    };
  }, [workOrders]);

  // ---------- 寿命预警 ----------
  const lifeWarnDevices = useMemo(
    () => [...devices].filter((d) => remainLifeYears(d) <= 2 && d.designLifeYears < 90).sort((a, b) => remainLifeYears(a) - remainLifeYears(b)).slice(0, 6),
    [],
  );

  // ---------- 看板 ----------
  const kanbanWos = useMemo(
    () => workOrders.filter((w) =>
      (woPriority === "all" || w.priority === woPriority) &&
      (!woDueSoon || dueState(w) === "soon" || dueState(w) === "overdue"),
    ),
    [workOrders, woPriority, woDueSoon],
  );

  const autoChains = useMemo(() => anomalyChains.filter((a) => a.workOrderId), []);

  // ---------- 反复故障转项目 ----------
  const linkedProjectOf = (dev: Device): Project | undefined => {
    const anomaly = anomalyChains.find((a) => a.deviceId === dev.id);
    const woIds = (liveWoByDevice.get(dev.id) ?? []).map((w) => w.id);
    return projects.find((p) =>
      (anomaly?.projectId && p.id === anomaly.projectId) ||
      (p.workOrderId && woIds.includes(p.workOrderId)) ||
      (anomaly && p.anomalyId === anomaly.id),
    );
  };

  const convertToProject = (dev: Device) => {
    const linked = linkedProjectOf(dev);
    if (linked) {
      pushToast("已存在关联项目", `${linked.id}「${linked.name}」，请到项目库查看`, "info");
      return;
    }
    const anomaly = anomalyChains.find((a) => a.deviceId === dev.id);
    let mwh = anomaly?.estSavingMwhPerYear ?? 0;
    let wan = anomaly?.estSavingWanYuanPerYear ?? 0;
    let t = anomaly?.estReductionTPerYear ?? 0;
    if (wan <= 0) {
      // 无异常链收益口径时按额定功率×年运行 3600h×衰减率×可恢复系数 0.6 估算（确定性推导，非随机）
      mwh = Math.round(dev.ratedPowerKw * 3600 * (dev.efficiencyDecayPct / 100) * 0.6) / 1000;
      wan = Math.round(mwh * 1000 * energyKindMeta.electricity.price) / 10000;
      t = Math.round(mwh * activeFactors.electricity);
    }
    const isSafety = Boolean(anomaly?.medicalSafetyNote) && wan < 1;
    const inv = Math.max(8, Math.round(wan * 2.5));
    const payback = wan >= 0.5 ? Math.round((inv / wan) * 10) / 10 : 99;
    const nextNum = projects.reduce((mx, p) => {
      const m = /^PRJ-2026-(\d+)$/.exec(p.id);
      return m ? Math.max(mx, Number(m[1])) : mx;
    }, 12) + 1;
    const woIds = (liveWoByDevice.get(dev.id) ?? []).map((w) => w.id);
    addProject({
      id: `PRJ-2026-${String(nextNum).padStart(2, "0")}`,
      name: `${dev.name} 反复故障治理改造`,
      source: "diagnosis",
      buildingIds: [dev.buildingId],
      system: dev.system,
      stage: "initiation",
      owner: anomaly?.owner ?? histByDevice.get(dev.id)?.[0]?.owner ?? "后勤保障部",
      investmentWanYuan: inv,
      annualSavingMwh: Math.round(mwh * 10) / 10,
      annualSavingWanYuan: Math.round(wan * 10) / 10,
      annualCarbonReductionT: t,
      paybackYears: payback,
      createdAt: demoAsOfDate,
      workOrderId: woIds[0],
      anomalyId: anomaly?.id,
    });
    pushToast(
      "已转改造项目",
      `PRJ-2026-${String(nextNum).padStart(2, "0")} 进入项目库「立项」阶段${isSafety ? "（保障类改造，不以节能回报为目标）" : ""}`,
      "success",
    );
  };

  // ---------- 导出 ----------
  const exportDevices = async () => {
    const { downloadCsv } = await import("../../utils/downloads");
    downloadCsv(
      filteredDevices.map((d) => ({
        设备编号: d.id, 设备名称: d.name, 楼宇: buildingById[d.buildingId].name, 系统: systemNames[d.system],
        类别: d.category, 额定功率kW: d.ratedPowerKw, 投运年份: d.commissionYear, 设计寿命年: d.designLifeYears,
        剩余寿命年: remainLifeYears(d), 运行时长h: d.runHours, 能效衰减pct: d.efficiencyDecayPct,
        状态: deviceStatusMeta[d.status].name, 绑定表计: d.meterId, 历史工单数: woCountOf(d.id),
      })),
      `设备台账_${tab.name}_${demoAsOfDate}.csv`,
    );
    pushToast("台账已导出", `按当前筛选导出 ${filteredDevices.length} 台设备`, "success");
  };

  const exportWorkOrders = async () => {
    const { downloadCsv } = await import("../../utils/downloads");
    downloadCsv(
      kanbanWos.map((w) => ({
        工单号: w.id, 标题: w.title, 状态: workOrderStatusMeta[w.status], 优先级: priorityMeta[w.priority].name,
        楼宇: buildingById[w.buildingId].name, 系统: systemNames[w.system], 设备: w.deviceId ?? "-",
        责任人: `${w.ownerTeam} ${w.owner}`, 创建时间: w.createdAt, 截止时间: w.dueAt,
        关联告警: w.alarmId ?? "-", 关联异常: w.anomalyId ?? "-", 关联项目: w.projectId ?? "-",
      })),
      `工单看板_${demoAsOfDate}.csv`,
    );
    pushToast("工单已导出", `按当前筛选导出 ${kanbanWos.length} 条工单`, "success");
  };

  // ---------- 详情对象 ----------
  const modalDevice = deviceId ? devices.find((d) => d.id === deviceId) ?? null : null;
  const modalWo = woId ? workOrders.find((w) => w.id === woId) ?? null : null;

  const openWo = (id: string) => {
    setDeviceId(null);
    setNoteDraft("");
    setWoId(id);
  };

  return (
    <>
      <PageHead
        title="设备台账与工单联动"
        sub={`八大系统台账 · 院区→楼栋→系统→设备→计量点绑定 · 异常自动开单与状态机闭环（基准日 ${demoAsOfDate}）`}
        actions={
          <>
            <button className="pf-btn ghost" onClick={exportDevices}><Download size={13} /> 导出台账</button>
            <button className="pf-btn ghost" onClick={exportWorkOrders}><Download size={13} /> 导出工单</button>
          </>
        }
      />

      <div className="grid cols-6">
        <Kpi label="设备总数" value={devices.length} unit="台" icon={<Wrench size={13} />} sub={<span>{stats.maintenance} 台维保中</span>} />
        <Kpi label="在线率" value={`${((stats.online / devices.length) * 100).toFixed(1)}`} unit="%" tone="green" sub={<span>{stats.online}/{devices.length} 台在线</span>} />
        <Kpi label="故障设备" value={stats.fault} unit="台" tone="red" sub={<span>保障类设备优先处置</span>} />
        <Kpi label="在办工单" value={stats.open} unit="单" tone="cyan" icon={<ClipboardList size={13} />} sub={<span>全部 {workOrders.length} 单</span>} />
        <Kpi label="高优先级在办" value={stats.high} unit="单" tone="amber" sub={<span>要求 24h 内响应</span>} />
        <Kpi label="48h 内到期" value={stats.dueSoon} unit="单" tone={stats.dueSoon > 0 ? "amber" : undefined} sub={<span>含已逾期工单</span>} />
      </div>

      {/* ===== 上：台账区 ===== */}
      <div className="grid cols-3" style={{ marginTop: 10 }}>
        <Panel title="设备台账" style={{ gridColumn: "span 2" }} extra={<span>{filteredDevices.length} / {devices.length} 台</span>}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {systemTabs.map((t) => {
              const n = t.systems.length === 0 ? devices.length : devices.filter((d) => t.systems.includes(d.system)).length;
              return (
                <button
                  key={t.id}
                  className={`pf-btn ${sysTab === t.id ? "primary" : "ghost"}`}
                  style={{ fontSize: 11, padding: "3px 10px" }}
                  onClick={() => setF({ sysTab: t.id })}
                >
                  {t.name} <span className="num">{n}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={12} style={{ position: "absolute", left: 8, top: 7, color: "var(--ink-3)" }} />
              <input
                className="pf-input"
                style={{ width: "100%", paddingLeft: 26 }}
                placeholder="搜索设备名称 / 编号 / 表计…"
                value={q}
                onChange={(e) => setF({ q: e.target.value })}
              />
            </div>
            <select className="pf-select" value={statusF} onChange={(e) => setF({ status: e.target.value })}>
              <option value="all">全部状态</option>
              <option value="online">在线</option>
              <option value="fault">故障</option>
              <option value="maintenance">维保中</option>
              <option value="offline">离线</option>
            </select>
            <select className="pf-select" value={sortBy} onChange={(e) => setF({ sort: e.target.value })}>
              <option value="decay">按能效衰减</option>
              <option value="hours">按运行时长</option>
              <option value="year">按投运年份</option>
              <option value="power">按额定功率</option>
            </select>
          </div>
          {filteredDevices.length === 0 ? (
            <EmptyState text="当前筛选无设备，请调整系统 Tab 或搜索条件" />
          ) : (
            <div style={{ maxHeight: 520, overflowY: "auto" }}>
              <table className="pf-table">
                <thead>
                  <tr>
                    <th>设备</th><th>楼宇</th><th>系统</th>
                    <th style={cellNum}>额定 kW</th><th style={cellNum}>投运年</th><th style={cellNum}>剩余寿命</th>
                    <th style={cellNum}>运行 h</th><th style={cellNum}>能效衰减</th>
                    <th>表计</th><th>状态</th><th style={cellNum}>工单</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDevices.map((d) => {
                    const remain = remainLifeYears(d);
                    const n = woCountOf(d.id);
                    const sm = deviceStatusMeta[d.status];
                    return (
                      <tr key={d.id} style={{ cursor: "pointer" }} onClick={() => setDeviceId(d.id)}>
                        <td>
                          <div style={{ color: "var(--ink-1)" }}>{d.name}</div>
                          <div style={{ fontSize: 10, color: "var(--ink-3)" }} className="num">{d.id}</div>
                        </td>
                        <td>{buildingById[d.buildingId].shortName}</td>
                        <td>{systemNames[d.system]}</td>
                        <td className="num" style={cellNum}>{d.ratedPowerKw}</td>
                        <td className="num" style={cellNum}>{d.commissionYear}</td>
                        <td className="num" style={{ ...cellNum, color: remain <= 0 ? "var(--red)" : remain <= 2 ? "var(--amber)" : undefined }}>
                          {remain <= 0 ? `超期 ${-remain} 年` : `${remain} 年`}
                        </td>
                        <td className="num" style={cellNum}>{d.runHours.toLocaleString("zh-CN")}</td>
                        <td className="num" style={{ ...cellNum, color: d.efficiencyDecayPct >= 8 ? "var(--red)" : d.efficiencyDecayPct >= 5 ? "var(--amber)" : undefined }}>
                          {d.efficiencyDecayPct}%
                        </td>
                        <td className="num" style={{ fontSize: 10 }}>{d.meterId}</td>
                        <td><Tag tone={sm.tone}>{sm.name}</Tag></td>
                        <td style={cellNum}>
                          <span className="num">{n}</span>
                          {n >= 2 && <Tag tone="danger">反复</Tag>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Panel title="设备状态分布" extra={<span>{tab.name}</span>}>
            {statusPieOption.empty ? <EmptyState /> : <EChart height={140} option={statusPieOption.option} />}
          </Panel>
          <Panel title="能效衰减 TOP8" extra={<span>单位 %</span>}>
            {decayOption.empty ? <EmptyState text="当前筛选无衰减数据" /> : <EChart height={216} option={decayOption.option} />}
          </Panel>
          <Panel title="寿命预警" extra={<span>剩余 ≤2 年</span>}>
            {lifeWarnDevices.length === 0 ? <EmptyState /> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {lifeWarnDevices.map((d) => {
                  const remain = remainLifeYears(d);
                  return (
                    <div key={d.id} onClick={() => setDeviceId(d.id)}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, cursor: "pointer", color: "var(--ink-2)" }}>
                      <span>{shortDeviceName(d.name)}</span>
                      <Tag tone={remain <= 0 ? "danger" : "warn"}>{remain <= 0 ? `超期 ${-remain} 年` : `剩 ${remain} 年`}</Tag>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>
      </div>

      {/* ===== 下：工单区 ===== */}
      <div style={{ marginTop: 10 }}>
        <Panel
          title="工单状态机看板"
          extra={
            <>
              <span>接收→判断→指派→处理→复测→复核→关闭</span>
              <select className="pf-select" style={{ fontSize: 11, padding: "2px 6px" }} value={woPriority} onChange={(e) => setF({ woPriority: e.target.value })}>
                <option value="all">全部优先级</option>
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={woDueSoon} onChange={(e) => setF({ woDueSoon: e.target.checked })} />
                只看临期/逾期
              </label>
              <span className="num">{kanbanWos.length} 单</span>
            </>
          }
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 8 }}>
            {kanbanStatusOrder.map((st) => {
              const list = kanbanWos.filter((w) => w.status === st);
              return (
                <div key={st} style={{ background: "rgba(10,20,40,0.5)", border: "1px solid var(--panel-border)", borderRadius: 8, padding: 8, minHeight: 140 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, fontSize: 12, color: "var(--ink-1)" }}>
                    <b>{workOrderStatusMeta[st]}</b>
                    <span className="num" style={{ color: "var(--ink-3)", fontSize: 11 }}>{list.length}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 360, overflowY: "auto" }}>
                    {list.length === 0 && <div style={{ fontSize: 11, color: "var(--ink-3)", textAlign: "center", padding: "16px 0" }}>无工单</div>}
                    {list.map((w) => {
                      const ds = dueState(w);
                      const nexts = workOrderTransitions[w.status];
                      return (
                        <div
                          key={w.id}
                          onClick={() => openWo(w.id)}
                          style={{
                            background: "var(--panel-solid)", border: "1px solid var(--panel-border)",
                            borderLeft: `3px solid ${priorityMeta[w.priority].color}`,
                            borderRadius: 6, padding: "7px 8px", cursor: "pointer",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                            <span className="num" style={{ fontSize: 10, color: "var(--ink-3)" }}>{w.id}</span>
                            <Tag tone={priorityMeta[w.priority].tone}>{priorityMeta[w.priority].name}</Tag>
                          </div>
                          <div style={{ fontSize: 12, color: "var(--ink-1)", lineHeight: 1.35, marginBottom: 4 }}>{w.title}</div>
                          <div style={{ fontSize: 10, color: "var(--ink-3)", marginBottom: 4 }}>
                            {buildingById[w.buildingId].shortName} · {w.owner}
                          </div>
                          <div className="num" style={{ fontSize: 10, color: ds === "overdue" ? "var(--red)" : ds === "soon" ? "var(--amber)" : "var(--ink-3)" }}>
                            截止 {w.dueAt.slice(5)}{ds === "overdue" ? " · 已逾期" : ds === "soon" ? " · 临期" : ""}
                          </div>
                          {nexts.length > 0 && (
                            <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                              {nexts.map((to, i) => (
                                <button
                                  key={to}
                                  className={`pf-btn ${i === 0 ? "primary" : "ghost"}`}
                                  style={{ fontSize: 10, padding: "2px 7px" }}
                                  disabled={!writable}
                                  title={writable ? `流转到「${workOrderStatusMeta[to]}」` : "当前角色无写权限"}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    transitionWorkOrder(w.id, to, `看板操作：${transitionLabels[`${w.status}->${to}`] ?? workOrderStatusMeta[to]}`);
                                  }}
                                >
                                  {transitionLabels[`${w.status}->${to}`] ?? workOrderStatusMeta[to]}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <div className="grid cols-2" style={{ marginTop: 10 }}>
        <Panel title="能耗异常自动开单链路（模拟诊断）" extra={<span>{autoChains.length}/{anomalyChains.length} 条异常链已自动开单</span>}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {["能耗/表计异常检测", "生成告警", "AI 判断（置信度≥80% 自动开单）", "工单状态机闭环"].map((step, i) => (
              <span key={step} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {i > 0 && <ArrowRight size={12} style={{ color: "var(--ink-3)" }} />}
                <span style={{ fontSize: 11, color: "var(--ink-2)", border: "1px solid var(--panel-border)", borderRadius: 999, padding: "2px 10px" }}>{step}</span>
              </span>
            ))}
          </div>
          <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "0 0 8px" }}>
            数据层按 15 分钟粒度比对楼宇/系统能耗与动态基线，越限生成告警；AI 判定为有效异常后自动创建工单（模拟诊断，含证据与置信度，低置信度转人工判断）。
            {anomalyChains.length - autoChains.length} 条（合规凭证到期类）转人工跟进。
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <ShieldCheck size={13} style={{ color: "var(--amber)", flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "var(--amber)" }}>
              保障优先：手术室压差、供氧冗余等保障回路仅生成保障处置工单，禁止任何自动节能控制，不影响医疗安全。
            </span>
          </div>
          <div style={{ maxHeight: 210, overflowY: "auto" }}>
            <table className="pf-table">
              <thead>
                <tr><th>告警</th><th>级别</th><th style={cellNum}>AI 置信度</th><th>自动工单</th><th>当前状态</th></tr>
              </thead>
              <tbody>
                {autoChains.map((a) => {
                  const wo = workOrders.find((w) => w.id === a.workOrderId);
                  return (
                    <tr key={a.id} style={{ cursor: "pointer" }} onClick={() => a.workOrderId && openWo(a.workOrderId)}>
                      <td>
                        <div style={{ color: "var(--ink-1)" }}>{a.title}</div>
                        <div className="num" style={{ fontSize: 10, color: "var(--ink-3)" }}>{a.alarmId} → {a.id}</div>
                      </td>
                      <td><Tag tone={a.level === "critical" ? "danger" : a.level === "warning" ? "warn" : "info"}>{alarmLevelMeta[a.level]}</Tag></td>
                      <td className="num" style={cellNum}>{a.aiConfidencePct}%</td>
                      <td className="num" style={{ fontSize: 11 }}>{a.workOrderId}</td>
                      <td>{wo ? <Tag tone={wo.status === "closed" ? "muted" : "info"}>{workOrderStatusMeta[wo.status]}</Tag> : <Tag tone="muted">—</Tag>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 10, color: "var(--ink-3)", margin: "8px 0 0" }}>
            链路数据来自告警/异常/工单种子的全链路关联 ID；点击行打开对应工单详情。
          </p>
        </Panel>

        <Panel title="在办工单结构（按系统 × 优先级）" extra={<span>单位：单</span>}>
          {woStructureOption.empty ? <EmptyState text="暂无在办工单" /> : <EChart height={278} option={woStructureOption.option} />}
        </Panel>
      </div>

      {/* ===== 设备详情 Modal ===== */}
      {modalDevice && (
        <DeviceDetailModal
          device={modalDevice}
          liveOrders={liveWoByDevice.get(modalDevice.id) ?? []}
          linkedProject={linkedProjectOf(modalDevice)}
          writable={writable}
          onClose={() => setDeviceId(null)}
          onOpenWo={openWo}
          onConvert={() => convertToProject(modalDevice)}
          onGoProjects={() => nav("/app/operations/projects")}
        />
      )}

      {/* ===== 工单详情 Modal ===== */}
      {modalWo && (
        <WorkOrderDetailModal
          wo={modalWo}
          projects={projects}
          writable={writable}
          noteDraft={noteDraft}
          setNoteDraft={setNoteDraft}
          onClose={() => setWoId(null)}
          onTransition={(to) => transitionWorkOrder(modalWo.id, to, `详情操作：${transitionLabels[`${modalWo.status}->${to}`] ?? workOrderStatusMeta[to]}`)}
          onAddNote={() => {
            if (!noteDraft.trim()) {
              pushToast("备注为空", "请输入备注内容后再记录", "warning");
              return;
            }
            addWorkOrderLog(modalWo.id, "备注", noteDraft.trim());
            setNoteDraft("");
            pushToast("已记录", "备注已写入工单时间线", "success");
          }}
          onNav={(route, hint) => {
            nav(route);
            pushToast("已跳转", hint, "info");
          }}
        />
      )}
    </>
  );
}

/* ================= 设备详情 ================= */

function DeviceDetailModal({ device, liveOrders, linkedProject, writable, onClose, onOpenWo, onConvert, onGoProjects }: {
  device: Device;
  liveOrders: WorkOrder[];
  linkedProject?: Project;
  writable: boolean;
  onClose: () => void;
  onOpenWo: (id: string) => void;
  onConvert: () => void;
  onGoProjects: () => void;
}) {
  const building = buildingById[device.buildingId];
  const meter = meterInfo(device.meterId);
  const anomaly = anomalyChains.find((a) => a.deviceId === device.id);
  const archived = historicalWorkOrders.filter((h) => h.deviceId === device.id);
  const totalWo = liveOrders.length + archived.length;
  const remain = remainLifeYears(device);
  const sm = deviceStatusMeta[device.status];

  const trendOption = useMemo(() => {
    const from = dayjs(demoAsOfDate).subtract(13, "day").format("YYYY-MM-DD");
    const series = dailySeries(meter.kind, from, demoAsOfDate, device.buildingId);
    return {
      legend: false as const,
      grid: { top: 14, left: 54 },
      tooltip: { valueFormatter: (v: unknown) => `${(v as number).toLocaleString("zh-CN")} ${energyKindMeta[meter.kind].unit}` },
      xAxis: { type: "category", data: series.map((p) => p.t.slice(5)) },
      yAxis: { type: "value", name: energyKindMeta[meter.kind].unit, nameGap: 8 },
      series: [{
        type: "line", smooth: true, symbol: "none",
        data: series.map((p) => Math.round(p.v)),
        lineStyle: { color: "#29d3e8", width: 1.5 },
        areaStyle: { color: "rgba(41,211,232,0.12)" },
      }],
    };
  }, [meter.kind, device.buildingId]);

  const chainStyle: React.CSSProperties = {
    fontSize: 11, color: "var(--ink-1)", background: "rgba(41,211,232,0.08)",
    border: "1px solid var(--panel-border)", borderRadius: 6, padding: "3px 9px", whiteSpace: "nowrap",
  };

  return (
    <Modal title={`设备详情 · ${device.name}`} onClose={onClose} width={880}>
      {/* 绑定链 */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
        {[campusName(building.campusId), building.name, systemNames[device.system], device.name, `计量点 ${device.meterId}（${meter.label}）`].map((seg, i) => (
          <span key={seg} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {i > 0 && <ChevronRight size={12} style={{ color: "var(--ink-3)" }} />}
            <span style={chainStyle}>{seg}</span>
          </span>
        ))}
      </div>

      {/* 基础信息 */}
      <div className="grid cols-4" style={{ marginBottom: 12 }}>
        {([
          ["设备编号", device.id],
          ["类别", device.category],
          ["状态", <Tag key="s" tone={sm.tone}>{sm.name}</Tag>],
          ["额定功率", <span key="p" className="num">{device.ratedPowerKw} kW</span>],
          ["投运年份", <span key="y" className="num">{device.commissionYear} 年</span>],
          ["设计寿命", <span key="l" className="num">{device.designLifeYears} 年</span>],
          ["剩余寿命", <span key="r" className="num" style={{ color: remain <= 0 ? "var(--red)" : remain <= 2 ? "var(--amber)" : undefined }}>{remain <= 0 ? `超期 ${-remain} 年` : `${remain} 年`}</span>],
          ["运行时长", <span key="h" className="num">{device.runHours.toLocaleString("zh-CN")} h</span>],
          ["能效衰减", <span key="d" className="num" style={{ color: device.efficiencyDecayPct >= 8 ? "var(--red)" : device.efficiencyDecayPct >= 5 ? "var(--amber)" : undefined }}>{device.efficiencyDecayPct}%</span>],
          ...(device.standbyPowerKw !== undefined ? [["待机功率", <span key="sb" className="num">{device.standbyPowerKw} kW</span>] as const] : []),
          ...(device.lastHeartbeat ? [["最近心跳", <span key="hb" className="num" style={{ fontSize: 12 }}>{device.lastHeartbeat}</span>] as const] : []),
          ["维保口径", "年度计划 + 故障响应"],
        ] as [string, React.ReactNode][]).map(([label, value]) => (
          <div key={label} style={{ background: "rgba(10,20,40,0.5)", border: "1px solid var(--panel-border)", borderRadius: 6, padding: "6px 10px" }}>
            <div style={fieldLabel}>{label}</div>
            <div style={fieldValue}>{value}</div>
          </div>
        ))}
      </div>

      {/* 关联异常（模拟诊断） */}
      {anomaly && anomaly.status !== "closed" && (
        <div style={{ border: "1px solid rgba(245,165,36,0.35)", background: "rgba(245,165,36,0.06)", borderRadius: 6, padding: "8px 10px", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
            <Tag tone="warn">在办异常 {anomaly.id}</Tag>
            <Tag tone="info">模拟诊断 · 置信度 {anomaly.aiConfidencePct}%</Tag>
            {anomaly.medicalSafetyNote && <Tag tone="danger">保障优先</Tag>}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-2)" }}>根因：{anomaly.rootCause}</div>
          <div style={{ fontSize: 11, color: "var(--ink-2)" }}>建议：{anomaly.suggestion}（需人工确认后执行）</div>
          {anomaly.medicalSafetyNote && <div style={{ fontSize: 11, color: "var(--amber)", marginTop: 2 }}>{anomaly.medicalSafetyNote}——不影响医疗安全/保障优先。</div>}
        </div>
      )}

      {/* 楼宇计量趋势 */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 4 }}>
          绑定计量点所在楼宇{energyKindMeta[meter.kind].name}近 14 日用量（{energyKindMeta[meter.kind].unit}，楼宇级计量）
        </div>
        <EChart height={150} option={trendOption} />
      </div>

      {/* 历史工单 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <b style={{ fontSize: 13, color: "var(--ink-1)" }}>历史工单（{totalWo} 条）</b>
        {totalWo >= 2 && <Tag tone="danger"><RefreshCcw size={10} /> 反复故障</Tag>}
        {totalWo >= 2 && (
          linkedProject ? (
            <>
              <Tag tone="info">已转项目 {linkedProject.id}</Tag>
              <button className="pf-btn ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={onGoProjects}>去项目库查看</button>
            </>
          ) : (
            <button className="pf-btn primary" style={{ fontSize: 11, padding: "2px 10px" }} disabled={!writable}
              title={writable ? "以本设备反复故障为依据生成改造项目（立项阶段）" : "当前角色无写权限"} onClick={onConvert}>
              转改造项目
            </button>
          )
        )}
      </div>
      {totalWo === 0 ? (
        <EmptyState text="该设备暂无历史工单" />
      ) : (
        <table className="pf-table">
          <thead>
            <tr><th>工单号</th><th>标题</th><th>时间</th><th>责任人</th><th>状态 / 结果</th></tr>
          </thead>
          <tbody>
            {liveOrders.map((w) => (
              <tr key={w.id} style={{ cursor: "pointer" }} onClick={() => onOpenWo(w.id)}>
                <td className="num">{w.id}</td>
                <td style={{ color: "var(--ink-1)" }}>{w.title}</td>
                <td className="num">{w.createdAt.slice(0, 10)}</td>
                <td>{w.owner}</td>
                <td><Tag tone={w.status === "closed" ? "muted" : "info"}>{workOrderStatusMeta[w.status]}</Tag></td>
              </tr>
            ))}
            {archived.map((h) => (
              <tr key={h.id}>
                <td className="num">{h.id}</td>
                <td style={{ color: "var(--ink-1)" }}>{h.title}</td>
                <td className="num">{h.closedAt}</td>
                <td>{h.owner}</td>
                <td>
                  <Tag tone="muted">已归档 · {h.durationH}h</Tag>
                  <span style={{ fontSize: 10, color: "var(--ink-3)", marginLeft: 6 }}>{h.result}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

/* ================= 工单详情 ================= */

function WorkOrderDetailModal({ wo, projects, writable, noteDraft, setNoteDraft, onClose, onTransition, onAddNote, onNav }: {
  wo: WorkOrder;
  projects: Project[];
  writable: boolean;
  noteDraft: string;
  setNoteDraft: (v: string) => void;
  onClose: () => void;
  onTransition: (to: WorkOrderStatus) => void;
  onAddNote: () => void;
  onNav: (route: string, hint: string) => void;
}) {
  const alarm = wo.alarmId ? alarmById[wo.alarmId] : undefined;
  const anomaly = wo.anomalyId ? anomalyById[wo.anomalyId] : undefined;
  const project = projects.find((p) => p.id === wo.projectId) ?? projects.find((p) => p.workOrderId === wo.id);
  const ds = dueState(wo);
  const nexts = workOrderTransitions[wo.status];

  const linkCard: React.CSSProperties = {
    background: "rgba(10,20,40,0.5)", border: "1px solid var(--panel-border)",
    borderRadius: 6, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4,
  };

  return (
    <Modal title={`工单详情 · ${wo.id}`} onClose={onClose} width={780}>
      <div style={{ fontSize: 14, color: "var(--ink-1)", marginBottom: 8 }}>{wo.title}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, alignItems: "center", fontSize: 11, color: "var(--ink-3)" }}>
        <Tag tone={wo.status === "closed" ? "muted" : "info"}>{workOrderStatusMeta[wo.status]}</Tag>
        <Tag tone={priorityMeta[wo.priority].tone}>优先级 {priorityMeta[wo.priority].name}</Tag>
        <span>{buildingById[wo.buildingId].name} · {systemNames[wo.system]}</span>
        {wo.deviceId && <span className="num">{wo.deviceId}</span>}
        <span>{wo.ownerTeam} {wo.owner}</span>
        <span className="num">创建 {wo.createdAt}</span>
        <span className="num" style={{ color: ds === "overdue" ? "var(--red)" : ds === "soon" ? "var(--amber)" : undefined }}>
          截止 {wo.dueAt}{ds === "overdue" ? "（已逾期）" : ds === "soon" ? "（48h 内）" : ""}
        </span>
        {wo.eta && <span className="num">预计完成 {wo.eta}</span>}
      </div>

      {/* 关联链路 */}
      <div className="grid cols-3" style={{ marginBottom: 12 }}>
        <div style={linkCard}>
          <div style={fieldLabel}>关联告警</div>
          {alarm ? (
            <>
              <div style={{ fontSize: 12, color: "var(--ink-1)" }}>{alarm.title}</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span className="num" style={{ fontSize: 10, color: "var(--ink-3)" }}>{alarm.id}</span>
                <Tag tone={alarm.level === "critical" ? "danger" : alarm.level === "warning" ? "warn" : "info"}>{alarmLevelMeta[alarm.level]}</Tag>
              </div>
              <button className="pf-btn ghost" style={{ fontSize: 10, padding: "2px 8px", alignSelf: "flex-start" }}
                onClick={() => onNav("/app/energy/monitoring", `在能源监测中心按 ${alarm.id} 检索该告警`)}>
                去能源监测中心 →
              </button>
            </>
          ) : <span style={{ fontSize: 11, color: "var(--ink-3)" }}>无（例行/计划性工单）</span>}
        </div>
        <div style={linkCard}>
          <div style={fieldLabel}>关联异常（模拟诊断）</div>
          {anomaly ? (
            <>
              <div style={{ fontSize: 12, color: "var(--ink-1)" }}>{anomaly.title}</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span className="num" style={{ fontSize: 10, color: "var(--ink-3)" }}>{anomaly.id}</span>
                <Tag tone="info">置信度 {anomaly.aiConfidencePct}%</Tag>
              </div>
              <button className="pf-btn ghost" style={{ fontSize: 10, padding: "2px 8px", alignSelf: "flex-start" }}
                onClick={() => onNav("/app/ai", `在 AI 智能分析中心按 ${anomaly.id} 查看异常时间线`)}>
                去 AI 分析中心 →
              </button>
            </>
          ) : <span style={{ fontSize: 11, color: "var(--ink-3)" }}>无关联异常</span>}
        </div>
        <div style={linkCard}>
          <div style={fieldLabel}>关联项目</div>
          {project ? (
            <>
              <div style={{ fontSize: 12, color: "var(--ink-1)" }}>{project.name}</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span className="num" style={{ fontSize: 10, color: "var(--ink-3)" }}>{project.id}</span>
                <Tag tone="ok">已立项</Tag>
              </div>
              <button className="pf-btn ghost" style={{ fontSize: 10, padding: "2px 8px", alignSelf: "flex-start" }}
                onClick={() => onNav("/app/operations/projects", `在项目库按 ${project.id} 查看项目全周期`)}>
                去项目库 →
              </button>
            </>
          ) : <span style={{ fontSize: 11, color: "var(--ink-3)" }}>未关联项目；反复故障设备可在台账详情「转改造项目」</span>}
        </div>
      </div>

      {anomaly?.medicalSafetyNote && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <ShieldCheck size={13} style={{ color: "var(--amber)", flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: "var(--amber)" }}>{anomaly.medicalSafetyNote}——不影响医疗安全/保障优先。</span>
        </div>
      )}

      {/* 时间线 */}
      <div style={{ fontSize: 13, color: "var(--ink-1)", marginBottom: 6 }}><b>处置时间线（{wo.logs.length} 条）</b></div>
      <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 12, borderLeft: "2px solid var(--panel-border)", paddingLeft: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {wo.logs.map((log, i) => (
          <div key={`${log.at}-${i}`} style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: -17, top: 4, width: 8, height: 8, borderRadius: "50%", background: i === wo.logs.length - 1 ? "var(--cyan)" : "var(--ink-3)" }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className="num" style={{ fontSize: 10, color: "var(--ink-3)" }}>{log.at}</span>
              <Tag tone="muted">{log.action}</Tag>
              <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{log.actor}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 2 }}>{log.note}</div>
          </div>
        ))}
      </div>

      {/* 操作区 */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {nexts.length === 0 && <Tag tone="muted">已关闭，状态机终态</Tag>}
        {nexts.map((to, i) => (
          <button key={to} className={`pf-btn ${i === 0 ? "primary" : "ghost"}`} style={{ fontSize: 11 }}
            disabled={!writable} title={writable ? `流转到「${workOrderStatusMeta[to]}」，非法流转会被状态机拒绝` : "当前角色无写权限"}
            onClick={() => onTransition(to)}>
            {transitionLabels[`${wo.status}->${to}`] ?? workOrderStatusMeta[to]}
          </button>
        ))}
        <input className="pf-input" style={{ flex: 1, minWidth: 160 }} placeholder="补充处置备注（写入时间线）…"
          value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} />
        <button className="pf-btn ghost" style={{ fontSize: 11 }} disabled={!writable}
          title={writable ? "把备注写入工单时间线" : "当前角色无写权限"} onClick={onAddNote}>
          记录备注
        </button>
      </div>
    </Modal>
  );
}
