import dayjs from "dayjs";
import type { EChartsCoreOption } from "echarts";
import {
  Activity,
  BadgeCheck,
  BriefcaseMedical,
  ClipboardCheck,
  Download,
  Gauge,
  Link2,
  ShieldCheck,
  Stethoscope,
  UsersRound,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { EChart } from "../../components/EChart";
import { Delta, EmptyState, Kpi, Modal, PageHead, Panel, Tag } from "../../components/kit";
import { anomalyById } from "../../data/anomalies";
import { buildingById } from "../../data/buildings";
import { demoAsOfDate } from "../../data/config";
import {
  defaultDepartmentId,
  defaultDepartmentWindowDays,
  departmentById,
  departmentProfiles,
  departmentWindowOptions,
  departmentWorkbenchCopy,
  type DepartmentId,
  type DepartmentProfile,
  type DepartmentWindowDays,
} from "../../data/modules/department-workbench";
import { canWrite, roleMeta } from "../../data/navigation";
import { workOrderStatusMeta } from "../../data/workorders";
import { activeFactors } from "../../data/factors";
import { bedOccupancy, dailyUsage, outpatientVisits, surgeryCount } from "../../services/timeseries";
import { useDemoStore } from "../../stores/demo";
import type { WorkOrder } from "../../types/core";
import { downloadCsv } from "../../utils/downloads";
import "./workbench.css";

const MODULE_ID = "department-workbench";

interface DepartmentDay {
  date: string;
  energyKwh: number;
  workload: number;
  intensity: number;
}

interface DepartmentIssue {
  id: string;
  anomalyId?: string;
  alarmId: string;
  workOrderId?: string;
  title: string;
  buildingId: DepartmentProfile["buildingId"];
  level: "critical" | "warning" | "info";
  status: "open" | "handling" | "closed";
  owner: string;
  ownerTeam: string;
  evidence: string;
  guidance: string;
}

interface IssueAction {
  kind: "confirm" | "link";
  issue: DepartmentIssue;
}

const fmt = (value: number, digits = 0) => value.toLocaleString("zh-CN", {
  minimumFractionDigits: digits,
  maximumFractionDigits: digits,
});

function workloadOf(profile: DepartmentProfile, date: string): number {
  if (profile.workload.driver === "surgery") {
    return Math.max(1, Math.round(surgeryCount(date) * profile.workload.multiplier));
  }
  if (profile.workload.driver === "occupied-bed") {
    const beds = buildingById[profile.buildingId].beds;
    return Math.max(1, Math.round((beds * bedOccupancy(date)) / 100 * profile.workload.multiplier));
  }
  return Math.max(1, Math.round(outpatientVisits(date) * profile.workload.multiplier));
}

function departmentDay(profile: DepartmentProfile, date: string): DepartmentDay {
  const energyKwh = Math.round(dailyUsage(profile.buildingId, "electricity", date) * profile.electricityShare);
  const workload = workloadOf(profile, date);
  return { date, energyKwh, workload, intensity: energyKwh / workload };
}

function period(profile: DepartmentProfile, from: string, to: string): DepartmentDay[] {
  const rows: DepartmentDay[] = [];
  let cursor = dayjs(from);
  const end = dayjs(to);
  while (!cursor.isAfter(end)) {
    rows.push(departmentDay(profile, cursor.format("YYYY-MM-DD")));
    cursor = cursor.add(1, "day");
  }
  return rows;
}

function summarize(rows: DepartmentDay[]) {
  const energyKwh = rows.reduce((sum, row) => sum + row.energyKwh, 0);
  const workload = rows.reduce((sum, row) => sum + row.workload, 0);
  return { energyKwh, workload, intensity: workload ? energyKwh / workload : 0 };
}

function pctChange(current: number, previous: number): number {
  return previous ? ((current - previous) / previous) * 100 : 0;
}

function anomalyTone(level: "critical" | "warning" | "info") {
  if (level === "critical") return "danger" as const;
  if (level === "warning") return "warn" as const;
  return "info" as const;
}

function anomalyStatusTone(status: "open" | "handling" | "closed") {
  if (status === "closed") return "ok" as const;
  if (status === "handling") return "info" as const;
  return "warn" as const;
}

function issueStatus(status: "pending" | "processing" | "acknowledged" | "resolved"): DepartmentIssue["status"] {
  if (status === "resolved") return "closed";
  if (status === "processing" || status === "acknowledged") return "handling";
  return "open";
}

const confirmationMarker = (issueId: string) => `[科室确认:${issueId}]`;
const associationMarker = (issueId: string) => `[科室关联:${issueId}]`;

const anomalyStatusText = { open: "待确认", handling: "整改中", closed: "已闭环" } as const;

export function DepartmentWorkbenchPage() {
  const {
    role,
    allPermissions,
    pageFilters,
    setPageFilter,
    alarms,
    workOrders,
    transitionAlarm,
    createWorkOrder,
    addWorkOrderLog,
    pushToast,
  } = useDemoStore();
  const writable = canWrite(MODULE_ID, role, allPermissions);
  const filters = pageFilters[MODULE_ID] ?? {};
  const departmentId = typeof filters.departmentId === "string" && filters.departmentId in departmentById
    ? filters.departmentId as DepartmentId
    : defaultDepartmentId;
  const days = departmentWindowOptions.includes(filters.days as DepartmentWindowDays)
    ? filters.days as DepartmentWindowDays
    : defaultDepartmentWindowDays;
  const anomalyFilter = filters.anomalyFilter === "open" || filters.anomalyFilter === "handling" || filters.anomalyFilter === "closed"
    ? filters.anomalyFilter
    : "all";
  const profile = departmentById[departmentId];
  const [issueAction, setIssueAction] = useState<IssueAction | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [targetWorkOrderId, setTargetWorkOrderId] = useState("");

  const data = useMemo(() => {
    const end = dayjs(demoAsOfDate);
    const start = end.subtract(days - 1, "day");
    const previousEnd = start.subtract(1, "day");
    const previousStart = previousEnd.subtract(days - 1, "day");
    const currentRows = period(profile, start.format("YYYY-MM-DD"), end.format("YYYY-MM-DD"));
    const previousRows = period(profile, previousStart.format("YYYY-MM-DD"), previousEnd.format("YYYY-MM-DD"));
    const current = summarize(currentRows);
    const previous = summarize(previousRows);
    const targetIntensity = previous.intensity * (1 - profile.improvementTargetPct / 100);
    const deviationPct = pctChange(current.intensity, targetIntensity);
    const energyPct = pctChange(current.energyKwh, previous.energyKwh);
    const workloadPct = pctChange(current.workload, previous.workload);

    const ranking = departmentProfiles.map((department) => {
      const now = summarize(period(department, start.format("YYYY-MM-DD"), end.format("YYYY-MM-DD")));
      const before = summarize(period(department, previousStart.format("YYYY-MM-DD"), previousEnd.format("YYYY-MM-DD")));
      const target = before.intensity * (1 - department.improvementTargetPct / 100);
      return {
        id: department.id,
        name: department.shortName,
        intensity: now.intensity,
        target,
        performanceIndex: target ? (now.intensity / target) * 100 : 100,
      };
    }).sort((a, b) => a.performanceIndex - b.performanceIndex);

    const rank = ranking.findIndex((row) => row.id === profile.id) + 1;
    const chartOption: EChartsCoreOption = {
      color: ["#29d3e8", "#f5a524", "#8b8df0"],
      legend: { data: ["科室用电", profile.workload.label, "历史基准用电"] },
      grid: { top: 34, bottom: 26, left: 52, right: 54 },
      xAxis: { type: "category", data: currentRows.map((row) => row.date.slice(5)) },
      yAxis: [
        { type: "value", name: "kWh", nameTextStyle: { color: "#5f7799" } },
        { type: "value", name: profile.workload.unit, nameTextStyle: { color: "#5f7799" }, splitLine: { show: false } },
      ],
      tooltip: { trigger: "axis" },
      series: [
        {
          name: "科室用电",
          type: "bar",
          barMaxWidth: 18,
          data: currentRows.map((row) => row.energyKwh),
          itemStyle: { color: "rgba(41, 211, 232, 0.62)", borderColor: "#29d3e8", borderWidth: 1 },
        },
        {
          name: profile.workload.label,
          type: "line",
          yAxisIndex: 1,
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2.5, color: "#f5a524" },
          data: currentRows.map((row) => row.workload),
        },
        {
          name: "历史基准用电",
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 1.5, type: "dashed", color: "#8b8df0" },
          data: currentRows.map((row) => Math.round(row.workload * previous.intensity)),
        },
      ],
    };

    const rankingOption: EChartsCoreOption = {
      grid: { top: 8, bottom: 20, left: 74, right: 30 },
      xAxis: { type: "value", name: "基准指数", min: 80, max: Math.max(112, Math.ceil(Math.max(...ranking.map((row) => row.performanceIndex)) / 4) * 4) },
      yAxis: { type: "category", inverse: true, data: ranking.map((row) => row.name) },
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      series: [{
        name: "单位业务量能效指数",
        type: "bar",
        barWidth: 12,
        data: ranking.map((row) => ({
          value: Number(row.performanceIndex.toFixed(1)),
          itemStyle: { color: row.id === profile.id ? "#29d3e8" : row.performanceIndex <= 100 ? "#35d399" : "#f5a524" },
        })),
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { type: "dashed", color: "#8b8df0" },
          label: { formatter: "目标 100", color: "#9db4d6", fontSize: 10 },
          data: [{ xAxis: 100 }],
        },
      }],
    };

    return {
      currentRows,
      current,
      previous,
      targetIntensity,
      deviationPct,
      energyPct,
      workloadPct,
      gapPct: energyPct - workloadPct,
      carbonKg: current.energyKwh * activeFactors.electricity,
      ranking,
      rank,
      chartOption,
      rankingOption,
      from: start.format("YYYY-MM-DD"),
      to: end.format("YYYY-MM-DD"),
      previousFrom: previousStart.format("YYYY-MM-DD"),
      previousTo: previousEnd.format("YYYY-MM-DD"),
    };
  }, [days, profile]);

  const departmentIssues = useMemo<DepartmentIssue[]>(() => alarms
    .filter((alarm) => alarm.buildingId === profile.buildingId)
    .map((alarm) => {
      const anomaly = alarm.anomalyId ? anomalyById[alarm.anomalyId] : undefined;
      return {
        id: anomaly?.id ?? alarm.id,
        anomalyId: anomaly?.id,
        alarmId: alarm.id,
        workOrderId: alarm.workOrderId,
        title: alarm.title,
        buildingId: alarm.buildingId,
        level: alarm.level,
        status: issueStatus(alarm.status),
        owner: alarm.owner,
        ownerTeam: alarm.ownerTeam,
        evidence: anomaly?.evidence[0] ?? alarm.detail,
        guidance: anomaly?.medicalSafetyNote ?? anomaly?.suggestion ?? profile.safetyNote,
      };
    }), [alarms, profile]);

  const selectedIssues = useMemo(() => departmentIssues
    .filter((issue) => anomalyFilter === "all" || issue.status === anomalyFilter), [anomalyFilter, departmentIssues]);

  const associatedOrderFor = (issueId: string) => workOrders.find((workOrder) =>
    workOrder.logs.some((log) => log.action === "科室关联" && log.note.includes(associationMarker(issueId))),
  );

  const confirmedByLog = (issueId: string) => workOrders.some((workOrder) =>
    workOrder.logs.some((log) => log.action === "科室确认" && log.note.includes(confirmationMarker(issueId))),
  );

  const openIssueAction = (kind: IssueAction["kind"], issue: DepartmentIssue) => {
    const directOrder = workOrders.find((workOrder) => workOrder.id === issue.workOrderId && workOrder.status !== "closed");
    const firstCandidate = directOrder ?? workOrders.find((workOrder) => workOrder.buildingId === issue.buildingId && workOrder.status !== "closed");
    setIssueAction({ kind, issue });
    setTargetWorkOrderId(firstCandidate?.id ?? "");
    setActionNote("");
  };

  const closeIssueAction = () => {
    setIssueAction(null);
    setTargetWorkOrderId("");
    setActionNote("");
  };

  const confirmDiagnosis = () => {
    if (!issueAction || issueAction.kind !== "confirm") return;
    const { issue } = issueAction;
    const alarm = alarms.find((item) => item.id === issue.alarmId);
    if (alarm?.status === "pending" || alarm?.status === "processing") {
      transitionAlarm(issue.alarmId, "acknowledged");
    }
    const linkedOrder = workOrders.find((workOrder) => workOrder.id === issue.workOrderId)
      ?? associatedOrderFor(issue.id);
    if (linkedOrder) {
      addWorkOrderLog(
        linkedOrder.id,
        "科室确认",
        `${confirmationMarker(issue.id)} ${actionNote.trim() || "科室负责人已复核异常证据"}；未下发任何控制指令`,
        roleMeta[role].name,
      );
    }
    pushToast("已记录人工确认", `「${issue.title}」已完成科室侧确认；医疗安全边界保持不变`, "success");
    closeIssueAction();
  };

  const linkOrCreateTask = () => {
    if (!issueAction || issueAction.kind !== "link") return;
    const { issue } = issueAction;
    const actor = roleMeta[role].name;
    const note = `${associationMarker(issue.id)} ${actionNote.trim() || "纳入本科室整改跟踪清单"}；正式状态流转仍由后勤工单流程处理`;
    const target = workOrders.find((workOrder) => workOrder.id === targetWorkOrderId);

    if (target) {
      addWorkOrderLog(target.id, "科室关联", note, actor);
      pushToast("已关联整改任务", `${target.id} 已纳入本科室工作台，并写入工单日志`, "success");
      closeIssueAction();
      return;
    }

    const alarm = alarms.find((item) => item.id === issue.alarmId);
    if (!alarm) return;
    const taskId = `DEPT-${demoAsOfDate.replaceAll("-", "")}-${issue.id.replace(/[^A-Z0-9]/gi, "").slice(-6)}`;
    const createdAt = `${demoAsOfDate} 14:30`;
    const dueAt = dayjs(demoAsOfDate).add(issue.level === "critical" ? 1 : 7, "day").format("YYYY-MM-DD 18:00");
    const task: WorkOrder = {
      id: taskId,
      title: `${profile.name}：${issue.title}整改任务`,
      buildingId: issue.buildingId,
      system: alarm.system,
      deviceId: alarm.deviceId,
      alarmId: issue.alarmId,
      anomalyId: issue.id,
      status: "received",
      priority: issue.level === "critical" ? "high" : issue.level === "warning" ? "medium" : "low",
      owner: `${profile.name}负责人`,
      ownerTeam: profile.name,
      createdAt,
      dueAt,
      logs: [{ at: createdAt, actor, action: "科室关联", note }],
    };
    if (createWorkOrder(task)) {
      pushToast("已生成整改任务", `${taskId} 已从“接收”状态进入后勤工单流程`, "success");
    }
    closeIssueAction();
  };

  const exportDaily = () => {
    const rows = data.currentRows.map((row) => ({
      日期: row.date,
      科室: profile.name,
      用电量_kWh: row.energyKwh,
      [profile.workload.label]: row.workload,
      [`单位业务量用电_kWh每${profile.workload.unit}`]: Number(row.intensity.toFixed(3)),
      历史基准用电_kWh: Math.round(row.workload * data.previous.intensity),
    }));
    downloadCsv(rows, `科室能效日报_${profile.name}_${data.to}.csv`);
    pushToast("日报已导出", `${profile.name} ${data.from} 至 ${data.to} 的能效明细已下载`, "success");
  };

  const diagnosisBad = data.deviationPct > 0;
  const associatedCount = departmentIssues.filter((issue) => Boolean(associatedOrderFor(issue.id))).length;

  return (
    <div className="dept-workbench">
      <PageHead
        title={departmentWorkbenchCopy.title}
        sub={departmentWorkbenchCopy.subtitle}
        actions={(
          <>
            <select
              className="pf-select"
              aria-label="选择科室"
              value={departmentId}
              onChange={(event) => setPageFilter(MODULE_ID, { departmentId: event.target.value })}
            >
              {departmentProfiles.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </select>
            {departmentWindowOptions.map((windowDays) => (
              <button
                key={windowDays}
                className={`pf-btn ${days === windowDays ? "primary" : "ghost"}`}
                onClick={() => setPageFilter(MODULE_ID, { days: windowDays })}
              >
                近 {windowDays} 日
              </button>
            ))}
            <button className="pf-btn ghost" onClick={exportDaily}><Download size={13} />导出日报</button>
          </>
        )}
      />

      <div className="dept-context">
        <div className="dept-context-copy">
          <ShieldCheck size={17} />
          <div>
            <b>{profile.name} · 安全边界</b>
            <p>{profile.safetyNote} {departmentWorkbenchCopy.benchmarkNote}</p>
          </div>
        </div>
        <div className="dept-context-meta">
          <span>统计期<b>{data.from.slice(5)}—{data.to.slice(5)}</b></span>
          <span>基准期<b>{data.previousFrom.slice(5)}—{data.previousTo.slice(5)}</b></span>
        </div>
      </div>

      <div className="dept-kpis">
        <Kpi
          label="科室用电"
          value={fmt(data.current.energyKwh / 1000, 1)}
          unit="MWh"
          icon={<Zap size={14} />}
          sub={<Delta pct={data.energyPct} label="较前期" />}
          tone="cyan"
        />
        <Kpi
          label={profile.workload.label}
          value={fmt(data.current.workload)}
          unit={profile.workload.unit}
          icon={<UsersRound size={14} />}
          sub={<Delta pct={data.workloadPct} label="较前期" higherIsBad={false} />}
        />
        <Kpi
          label="单位业务量用电"
          value={fmt(data.current.intensity, data.current.intensity < 10 ? 2 : 1)}
          unit={`kWh/${profile.workload.unit}`}
          icon={<Gauge size={14} />}
          sub={<Delta pct={data.deviationPct} label="较院内目标" />}
          tone={diagnosisBad ? "amber" : "green"}
        />
        <Kpi
          label="本期用电碳排"
          value={fmt(data.carbonKg / 1000, 1)}
          unit="tCO₂e"
          icon={<Activity size={14} />}
          sub={<span>由统一电力排放因子计算</span>}
        />
        <Kpi
          label="院内能效位次"
          value={`${data.rank}/${data.ranking.length}`}
          icon={<BadgeCheck size={14} />}
          sub={<span>按各科室自身历史目标指数排序</span>}
          tone={data.rank <= 2 ? "green" : data.rank >= 6 ? "red" : "cyan"}
        />
      </div>

      <div className="dept-diagnosis">
        <Stethoscope size={18} />
        <div className="dept-diagnosis-copy">
          <b><Tag tone={diagnosisBad ? "warn" : "ok"}>{departmentWorkbenchCopy.diagnosisLabel}</Tag> {diagnosisBad ? "单位业务量能耗偏离目标" : "单位业务量能耗处于目标内"}</b>
          <p>
            本期用电较前期{data.energyPct >= 0 ? "增加" : "下降"} {fmt(Math.abs(data.energyPct), 1)}%，业务量{data.workloadPct >= 0 ? "增加" : "下降"} {fmt(Math.abs(data.workloadPct), 1)}%。
            {diagnosisBad ? "建议先核对排班、设备待机和环境保障时段，再由人工决定整改动作。" : "当前变化可由业务量解释，继续观察异常链即可。"}
          </p>
        </div>
        <div className="dept-diagnosis-evidence">
          <strong style={{ color: data.gapPct > 0 ? "var(--amber)" : "var(--green)" }}>{data.gapPct >= 0 ? "+" : ""}{fmt(data.gapPct, 1)}%</strong>
          <span>能耗增速－业务量增速</span>
        </div>
      </div>

      <div className="dept-analysis-grid">
        <Panel title="能耗与业务量趋势" extra={<span>用电与业务量同轴对照 · 历史基准随业务量调整</span>}>
          <EChart option={data.chartOption} height={242} />
        </Panel>
        <Panel title="科室对标排名" extra={<span>指数低于 100 为优于目标</span>}>
          <EChart option={data.rankingOption} height={204} />
          <div className="dept-ranking-summary">
            <span>{profile.name}当前指数</span>
            <b>{fmt(data.ranking.find((row) => row.id === profile.id)?.performanceIndex ?? 100, 1)}</b>
            <span>院内目标强度 <b>{fmt(data.targetIntensity, data.targetIntensity < 10 ? 2 : 1)}</b> kWh/{profile.workload.unit}</span>
          </div>
        </Panel>
      </div>

      <Panel
        title="异常与整改任务"
        extra={(
          <>
            <span>{selectedIssues.length} 条异常 · {associatedCount} 条已纳入科室整改</span>
            <select
              className="pf-select"
              aria-label="筛选异常状态"
              value={anomalyFilter}
              onChange={(event) => setPageFilter(MODULE_ID, { anomalyFilter: event.target.value })}
            >
              <option value="all">全部状态</option>
              <option value="open">待确认</option>
              <option value="handling">整改中</option>
              <option value="closed">已闭环</option>
            </select>
          </>
        )}
      >
        {selectedIssues.length ? (
          <div className="dept-table-scroll">
            <table className="pf-table dept-task-table">
              <thead>
                <tr>
                  <th>异常 / 模拟诊断证据</th>
                  <th>等级</th>
                  <th>状态</th>
                  <th>责任协同</th>
                  <th>整改任务</th>
                  <th style={{ textAlign: "right" }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {selectedIssues.map((issue) => {
                  const seededWorkOrder = workOrders.find((workOrder) => workOrder.id === issue.workOrderId);
                  const associatedOrder = associatedOrderFor(issue.id);
                  const task = associatedOrder ?? seededWorkOrder;
                  const liveAlarm = alarms.find((alarm) => alarm.id === issue.alarmId);
                  const confirmed = liveAlarm?.status === "acknowledged" || liveAlarm?.status === "resolved" || confirmedByLog(issue.id);
                  const taskCandidates = workOrders.filter((workOrder) => workOrder.buildingId === issue.buildingId && workOrder.status !== "closed");
                  return (
                    <tr key={issue.id}>
                      <td className="dept-task-title">
                        <b>{issue.id} · {issue.title}</b>
                        <span>{issue.evidence}；{issue.guidance}</span>
                      </td>
                      <td><Tag tone={anomalyTone(issue.level)}>{issue.level === "critical" ? "高" : issue.level === "warning" ? "中" : "提示"}</Tag></td>
                      <td><Tag tone={anomalyStatusTone(issue.status)}>{anomalyStatusText[issue.status]}</Tag></td>
                      <td>{issue.ownerTeam}<br /><span style={{ color: "var(--ink-3)", fontSize: 10 }}>{issue.owner}</span></td>
                      <td>
                        {task ? (
                          <>
                            <span className="dept-task-id">{task.id}</span>
                            <br /><Tag tone={task.status === "closed" ? "ok" : "info"}>{workOrderStatusMeta[task.status]}</Tag>
                            {associatedOrder && <><br /><Tag tone="ok">已纳入本科室整改</Tag></>}
                          </>
                        ) : <span style={{ color: "var(--ink-3)" }}>未关联</span>}
                      </td>
                      <td>
                        <div className="dept-task-actions">
                          <button
                            className="pf-btn ghost"
                            disabled={!writable || confirmed}
                            title={writable ? "记录人工确认，不下发控制" : "当前角色无写权限"}
                            onClick={() => openIssueAction("confirm", issue)}
                          >
                            <ClipboardCheck size={12} />{confirmed ? "已确认" : "人工确认"}
                          </button>
                          <button
                            className="pf-btn ghost"
                            disabled={!writable || issue.status === "closed" || Boolean(associatedOrder)}
                            title={!writable ? "当前角色无写权限" : issue.status === "closed" ? "已闭环异常无需新增整改任务" : taskCandidates.length === 0 ? "生成新的科室整改任务" : "写入工单日志并纳入科室整改清单"}
                            onClick={() => openIssueAction("link", issue)}
                          >
                            {taskCandidates.length ? <Link2 size={12} /> : <BriefcaseMedical size={12} />}
                            {associatedOrder ? "已关联" : taskCandidates.length ? "关联整改任务" : "生成整改任务"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyState text={`${profile.name}在当前状态筛选下暂无异常`} />}
      </Panel>

      {issueAction && (
        <Modal
          title={`${issueAction.kind === "confirm" ? "人工确认" : targetWorkOrderId ? "关联整改任务" : "生成整改任务"} · ${issueAction.issue.id}`}
          onClose={closeIssueAction}
          width={660}
        >
          <div className="dept-action-modal">
            <div className="dept-action-evidence">
              <Tag tone={issueAction.kind === "confirm" ? "warn" : "info"}>
                {issueAction.kind === "confirm" ? "模拟诊断需人工复核" : "不改变后勤工单状态"}
              </Tag>
              <b>{issueAction.issue.title}</b>
              <p>{issueAction.issue.evidence}</p>
              <span><ShieldCheck size={13} />{issueAction.issue.guidance}</span>
            </div>

            {issueAction.kind === "link" && targetWorkOrderId && (
              <label className="dept-action-field">
                <span>选择进行中的整改任务</span>
                <select
                  className="pf-select"
                  value={targetWorkOrderId}
                  onChange={(event) => setTargetWorkOrderId(event.target.value)}
                >
                  {workOrders
                    .filter((workOrder) => workOrder.buildingId === issueAction.issue.buildingId && workOrder.status !== "closed")
                    .map((workOrder) => (
                      <option key={workOrder.id} value={workOrder.id}>
                        {workOrder.id} · {workOrder.title} · {workOrderStatusMeta[workOrder.status]}
                      </option>
                    ))}
                </select>
              </label>
            )}

            {issueAction.kind === "link" && !targetWorkOrderId && (
              <div className="dept-action-create-note">
                <BriefcaseMedical size={15} />
                当前楼宇没有可关联的进行中工单。确认后将创建一条“接收”状态的科室整改任务，再由后勤状态机继续流转。
              </div>
            )}

            <label className="dept-action-field">
              <span>{issueAction.kind === "confirm" ? "人工复核备注（可选）" : "协同说明（可选）"}</span>
              <textarea
                className="pf-input dept-action-note"
                value={actionNote}
                onChange={(event) => setActionNote(event.target.value)}
                placeholder={issueAction.kind === "confirm" ? "例如：已核对排班与设备运行记录" : "例如：科室联系人与可配合整改时段"}
              />
            </label>

            <div className="dept-action-footer">
              <span>所有记录均为演示数据；不会自动控制设备或改变医疗保障策略。</span>
              <div>
                <button className="pf-btn ghost" onClick={closeIssueAction}>取消</button>
                <button
                  className="pf-btn primary"
                  onClick={issueAction.kind === "confirm" ? confirmDiagnosis : linkOrCreateTask}
                >
                  {issueAction.kind === "confirm" ? <ClipboardCheck size={13} /> : <Link2 size={13} />}
                  {issueAction.kind === "confirm" ? "记录人工确认" : targetWorkOrderId ? "确认关联" : "生成任务"}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
