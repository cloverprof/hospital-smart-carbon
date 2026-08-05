// 6.5.2 巡检管理与能效联动（仅 PC）：
// 计划区（日/周/月/季计划）→ 执行区（任务领取 + 检查项 + 模拟记录三件套）
// → 联动区（巡检问题-能效量化关联）→ 报告区（自动汇总日报，可下载）。
// 所有影响量来自 timeseries 数据层反推；模拟记录不调用真实相机/麦克风/定位权限。
import dayjs from "dayjs";
import type { EChartsCoreOption } from "echarts";
import {
  AlertTriangle, Camera, CheckCircle2, ClipboardCheck, FileDown, FileText,
  ListChecks, MapPin, Mic, ShieldCheck, Trash2, Upload,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { CHART_COLORS, EChart } from "../../components/EChart";
import { EmptyState, Kpi, Modal, PageHead, Panel, Tag } from "../../components/kit";
import { anomalyById } from "../../data/anomalies";
import { buildingName } from "../../data/buildings";
import { demoAsOfDate, energyKindMeta } from "../../data/config";
import { deviceById } from "../../data/devices";
import {
  DEMO_GPS, efficiencyLinks, freqMeta, inspectionPlans, linkImpact, todayTasks,
  type EfficiencyLink, type InspectionTask, type LinkImpact, type TaskRecord,
} from "../../data/modules/inspection";
import { canWrite, roleMeta } from "../../data/navigation";
import { hashSeed, mulberry32 } from "../../data/rng";
import { workOrderStatusMeta } from "../../data/workorders";
import { useDemoStore } from "../../stores/demo";
import { useInspectionStore } from "../../stores/inspection";

const MODULE_ID = "inspection";

const anomalyStatusMeta = {
  open: { name: "待处置", tone: "warn" },
  handling: { name: "处置中", tone: "info" },
  closed: { name: "已闭环", tone: "ok" },
} as const;

const nowAt = () => `${demoAsOfDate} ${dayjs().format("HH:mm")}`;
const fmtDur = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.round(s) % 60).padStart(2, "0")}`;

const smallBtn: React.CSSProperties = { padding: "2px 8px", fontSize: 11 };
const dimText: React.CSSProperties = { fontSize: 11, color: "var(--ink-3)" };

interface LinkRow {
  link: EfficiencyLink;
  impact: LinkImpact;
}

export function InspectionPage() {
  const { role, allPermissions, pageFilters, setPageFilter, pushToast } = useDemoStore();
  const { records, confirmedLinks } = useInspectionStore();
  const writable = canWrite(MODULE_ID, role, allPermissions);

  const filters = pageFilters[MODULE_ID] ?? {};
  const freq = String(filters.freq ?? "all");
  const linkScope = String(filters.linkScope ?? "all");

  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeLinkId, setActiveLinkId] = useState<string | null>(null);

  /* ---------- 计划区数据 ---------- */
  const plansShown = freq === "all" ? inspectionPlans : inspectionPlans.filter((p) => p.freq === freq);
  const totalPoints = inspectionPlans.reduce((s, p) => s + p.points, 0);
  const freqLabel = freq === "all" ? "全部频次" : freqMeta[freq as keyof typeof freqMeta].name;

  /* ---------- 执行区数据 ---------- */
  const doneTasks = todayTasks.filter((t) => records[t.id]?.status === "done");
  const claimedCount = todayTasks.filter((t) => records[t.id]?.status === "claimed").length;
  const todoCount = todayTasks.length - doneTasks.length - claimedCount;
  const abnormalFindings = doneTasks.flatMap((t) => {
    const r = records[t.id];
    if (!r) return [];
    return r.items
      .filter((i) => i.result === "abnormal")
      .map((i) => {
        const item = t.items.find((ci) => ci.id === i.itemId);
        return {
          task: t,
          item: item ?? { id: i.itemId, label: i.itemId, spec: "—", abnormalAdvice: "复核确认后转入工单流程处理" },
          note: i.note,
          advice: item?.abnormalAdvice ?? "复核确认后转入工单流程处理",
        };
      });
  });
  const checkedItems = doneTasks.reduce((s, t) => s + (records[t.id]?.items.length ?? 0), 0);
  const photoCount = doneTasks.reduce((s, t) => s + (records[t.id]?.photos.length ?? 0), 0);
  const audioCount = doneTasks.reduce((s, t) => s + (records[t.id]?.audios.length ?? 0), 0);
  const gpsCount = doneTasks.filter((t) => records[t.id]?.gps).length;

  /* ---------- 联动区数据（影响量由数据层反推） ---------- */
  const linkRows: LinkRow[] = useMemo(
    () => efficiencyLinks.map((l) => ({ link: l, impact: linkImpact(l, demoAsOfDate) })),
    [],
  );
  const linkShown = linkRows.filter(({ link }) =>
    linkScope === "all" ? true : linkScope === "confirmed" ? !!confirmedLinks[link.id] : !confirmedLinks[link.id],
  );
  const extraCarbonTotal = linkRows.reduce((s, r) => s + r.impact.extraCarbonKg, 0);
  const extraCostTotal = linkRows.reduce((s, r) => s + r.impact.extraCostYuan, 0);
  const openLinkCount = linkRows.filter(({ link }) => !link.anomalyId || anomalyById[link.anomalyId].status !== "closed").length;

  const activeTask = activeTaskId ? todayTasks.find((t) => t.id === activeTaskId) : undefined;
  const activeRecord = activeTaskId ? records[activeTaskId] : undefined;
  const activeLinkRow = activeLinkId ? linkRows.find((r) => r.link.id === activeLinkId) : undefined;

  /* ---------- 交互 ---------- */
  const claimTaskFn = useInspectionStore((s) => s.claimTask);
  const claim = (t: InspectionTask) => {
    if (!writable) return;
    claimTaskFn(t, `演示账号 · ${roleMeta[role].name}`, nowAt());
    pushToast("任务已领取", `「${t.title}」已进入执行状态`, "success");
    setActiveTaskId(t.id);
  };

  const exportPlans = async () => {
    const { downloadCsv } = await import("../../utils/downloads");
    downloadCsv(
      plansShown.map((p) => ({
        计划编号: p.id, 计划名称: p.name, 频次: freqMeta[p.freq].name, 覆盖系统: p.systemLabel,
        覆盖楼宇: p.buildingIds.map(buildingName).join("、"), 点位数: p.points, 责任班组: p.team,
        "单次时长(min)": p.durationMin, 上次执行: p.lastDone, 下次执行: p.nextDue, 重点覆盖: p.keyArea ? "是" : "否",
      })),
      `巡检计划_${freqLabel}_${demoAsOfDate}.csv`,
    );
    pushToast("已导出", `巡检计划 CSV（${plansShown.length} 条 · ${freqLabel}）已下载`, "success");
  };

  const downloadReport = async () => {
    const { downloadBlob } = await import("../../utils/downloads");
    const lines: string[] = [];
    lines.push("医碳智擎 · 巡检日报（Demo 模拟数据，非正式记录）");
    lines.push(`报告日期：${demoAsOfDate}    生成时间：${dayjs().format("HH:mm:ss")}`);
    lines.push("-".repeat(56));
    lines.push(`一、完成情况：今日任务 ${todayTasks.length} 项，已完成 ${doneTasks.length} 项，执行中 ${claimedCount} 项，待领取 ${todoCount} 项`);
    lines.push(`二、检查项统计：已核查 ${checkedItems} 项，正常 ${checkedItems - abnormalFindings.length} 项，异常 ${abnormalFindings.length} 项`);
    lines.push(`三、记录留痕：照片 ${photoCount} 张、录音 ${audioCount} 段、GPS 打点 ${gpsCount} 次（均为模拟记录，未调用真实权限）`);
    lines.push("四、异常清单与处理建议：");
    if (!abnormalFindings.length) lines.push("  今日已提交记录中无异常项");
    abnormalFindings.forEach((f, i) => {
      lines.push(`  ${i + 1}. [${f.task.title}] ${f.item.label}（标准：${f.item.spec}）`);
      lines.push(`     现场记录：${f.note || "—"}`);
      lines.push(`     处理建议：${f.advice}${f.task.relatedWorkOrderId ? `（关联工单 ${f.task.relatedWorkOrderId}）` : ""}`);
    });
    lines.push("五、巡检问题-能效联动（模拟诊断，供人工复核）：");
    linkRows.forEach((r) => {
      const meta = energyKindMeta[r.link.kind];
      const carbon = r.impact.extraCarbonKg > 0 ? `${r.impact.extraCarbonKg} kgCO2e/日` : "不计入合规口径";
      const ref = r.link.anomalyId
        ? `（异常 ${r.link.anomalyId}${r.link.workOrderId ? ` / 工单 ${r.link.workOrderId}` : ""}）`
        : "（工程估算）";
      lines.push(`  · ${r.link.finding}：额外${meta.name} ${r.impact.extraUsage} ${meta.unit}/日，额外碳排 ${carbon}，额外成本约 ${r.impact.extraCostYuan} 元/日${ref}`);
    });
    lines.push(`   合计额外碳排约 ${extraCarbonTotal.toFixed(1)} kgCO2e/日，额外成本约 ${extraCostTotal.toLocaleString("zh-CN")} 元/日`);
    lines.push("六、声明：本报告由演示环境自动汇总生成；巡检整改不改变净化空调、ICU 换气、医用气体等保障回路的运行下限（不影响医疗安全，保障优先）。");
    downloadBlob(new Blob(["\ufeff", lines.join("\r\n")], { type: "text/plain;charset=utf-8" }), `巡检日报_${demoAsOfDate}_Demo模拟.txt`);
    pushToast("报告已生成", "巡检日报（Demo 模拟）已下载为文本文件", "success");
  };

  const exportFindings = async () => {
    if (!abnormalFindings.length) {
      pushToast("暂无异常项", "今日已提交的巡检记录全部正常，无可导出的异常清单", "warning");
      return;
    }
    const { downloadCsv } = await import("../../utils/downloads");
    downloadCsv(
      abnormalFindings.map((f) => ({
        日期: demoAsOfDate, 任务: f.task.title, 检查项: f.item.label, 判定标准: f.item.spec,
        现场记录: f.note, 处理建议: f.advice, 责任班组: f.task.team, 关联工单: f.task.relatedWorkOrderId ?? "",
      })),
      `巡检异常清单_${demoAsOfDate}.csv`,
    );
    pushToast("已导出", `异常清单 CSV（${abnormalFindings.length} 条）已下载`, "success");
  };

  /* ---------- 联动区图表（额外成本 元/日，点击下钻） ---------- */
  const chartOption: EChartsCoreOption = useMemo(
    () => ({
      legend: false,
      grid: { left: 46, right: 14, top: 26, bottom: 44 },
      tooltip: {
        trigger: "axis",
        formatter: (raw: unknown) => {
          const p = (Array.isArray(raw) ? raw[0] : raw) as { dataIndex: number };
          const r = linkShown[p.dataIndex];
          if (!r) return "";
          const meta = energyKindMeta[r.link.kind];
          const carbon = r.impact.extraCarbonKg > 0 ? `${r.impact.extraCarbonKg.toFixed(1)} kgCO₂e/日` : "不计入合规口径";
          return `${r.link.finding}<br/>额外${meta.name}：${r.impact.extraUsage.toFixed(1)} ${meta.unit}/日<br/>额外碳排：${carbon}<br/>额外成本：${r.impact.extraCostYuan.toLocaleString("zh-CN")} 元/日<br/><span style="color:#9db4d6">点击柱体查看证据与人工确认</span>`;
        },
      },
      xAxis: { type: "category", data: linkShown.map((r) => r.link.short), axisLabel: { interval: 0, rotate: 24 } },
      yAxis: { type: "value", name: "元/日", nameTextStyle: { color: "#5f7799", fontSize: 10 } },
      series: [
        {
          type: "bar",
          barWidth: 16,
          data: linkShown.map((r, i) => ({
            value: r.impact.extraCostYuan,
            itemStyle: { color: CHART_COLORS[i % CHART_COLORS.length], borderRadius: [3, 3, 0, 0] },
          })),
        },
      ],
    }),
    [linkShown],
  );

  return (
    <>
      <PageHead
        title="巡检管理与能效联动"
        sub={`仅 PC 端 · 基准日 ${demoAsOfDate} · 巡检问题与同期能耗/碳排变化量化关联（模拟诊断）`}
        actions={
          <>
            <button className="pf-btn ghost" onClick={exportPlans}><FileDown size={13} />导出计划 CSV</button>
            <button className="pf-btn primary" onClick={downloadReport}><FileText size={13} />下载今日巡检报告</button>
          </>
        }
      />

      {/* KPI 行 */}
      <div className="grid cols-5">
        <Kpi label="巡检计划" value={inspectionPlans.length} unit="项" icon={<ListChecks size={13} />}
          sub={<span>覆盖点位 {totalPoints} 个 · 重点场景 5 类全覆盖</span>} />
        <Kpi label="今日任务完成" value={`${doneTasks.length}/${todayTasks.length}`} tone={doneTasks.length === todayTasks.length ? "green" : "cyan"}
          icon={<ClipboardCheck size={13} />} sub={<span>执行中 {claimedCount} · 待领取 {todoCount}</span>} />
        <Kpi label="今日发现异常项" value={abnormalFindings.length} unit="项" tone={abnormalFindings.length > 0 ? "amber" : "green"}
          icon={<AlertTriangle size={13} />} sub={<span>来自已提交巡检记录</span>} />
        <Kpi label="问题额外碳排" value={extraCarbonTotal.toFixed(1)} unit="kgCO₂e/日" tone="amber"
          sub={<span>{openLinkCount} 项未闭环问题合计（模拟诊断）</span>} />
        <Kpi label="问题额外成本" value={extraCostTotal.toLocaleString("zh-CN")} unit="元/日"
          sub={<span>按现行能源单价折算</span>} />
      </div>

      {/* 计划区 + 执行区 */}
      <div className="grid cols-2" style={{ marginTop: 10 }}>
        <Panel
          title="巡检计划（计划区）"
          extra={
            <>
              {([["all", "全部"], ["daily", "日"], ["weekly", "周"], ["monthly", "月"], ["quarterly", "季"]] as const).map(([k, label]) => (
                <button key={k} className={`pf-btn ${freq === k ? "primary" : "ghost"}`} style={smallBtn}
                  onClick={() => setPageFilter(MODULE_ID, { freq: k })}>
                  {label}
                </button>
              ))}
            </>
          }
        >
          <div style={{ overflowX: "auto" }}>
            <table className="pf-table">
              <thead>
                <tr>
                  <th>计划 / 覆盖</th><th>频次</th><th>点位</th><th>责任班组</th><th>下次执行</th>
                </tr>
              </thead>
              <tbody>
                {plansShown.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <b style={{ color: "var(--ink-1)", fontWeight: 600 }}>{p.name}</b>
                      {p.keyArea && <Tag tone="danger">重点</Tag>}
                      <div style={dimText}>{p.systemLabel} · {p.buildingIds.map(buildingName).join("、")} · {p.durationMin} min/次</div>
                    </td>
                    <td><Tag tone={freqMeta[p.freq].tone}>{freqMeta[p.freq].name}</Tag></td>
                    <td className="num">{p.points}</td>
                    <td>{p.team}</td>
                    <td>
                      <span className="num" style={{ color: p.nextDue === demoAsOfDate ? "var(--cyan)" : undefined }}>{p.nextDue}</span>
                      <div style={dimText}>上次 {p.lastDone}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ ...dimText, margin: "8px 0 0" }}>
            重点覆盖：手术室净化空调 / ICU 换气 / 冷站 / 锅炉 / 医气；净化与医气回路巡检只记录、不做自动控制（保障优先）。
          </p>
        </Panel>

        <Panel title={`今日任务（执行区 · ${demoAsOfDate}）`} extra={<span>{writable ? "点击「领取」进入执行" : "当前角色无写权限，仅可查看"}</span>}>
          <table className="pf-table">
            <thead>
              <tr>
                <th>任务</th><th>点位</th><th>班组</th><th>进度</th><th>状态</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              {todayTasks.map((t) => {
                const r = records[t.id];
                const filled = r ? r.items.filter((i) => i.result).length : 0;
                return (
                  <tr key={t.id}>
                    <td>
                      <b style={{ color: "var(--ink-1)", fontWeight: 600 }}>{t.title}</b>
                      {t.type === "复测" && <Tag tone="warn">工单复测</Tag>}
                      {t.medicalSafetyNote && <Tag tone="danger">保障优先</Tag>}
                      <div style={dimText}>
                        {t.window}{t.relatedWorkOrderId ? ` · 关联 ${t.relatedWorkOrderId}` : ""}
                      </div>
                    </td>
                    <td className="num">{t.points}</td>
                    <td>{t.team}</td>
                    <td className="num">
                      {r?.status === "done" ? `提交于 ${r.submittedAt?.slice(11) ?? ""}` : r ? `${filled}/${r.items.length}` : "—"}
                    </td>
                    <td>
                      {r?.status === "done" ? <Tag tone="ok">已完成</Tag> : r ? <Tag tone="info">执行中</Tag> : <Tag tone="muted">待领取</Tag>}
                    </td>
                    <td>
                      {r ? (
                        <button className="pf-btn ghost" style={smallBtn} onClick={() => setActiveTaskId(t.id)}>
                          {r.status === "done" ? "查看记录" : "继续执行"}
                        </button>
                      ) : (
                        <button className="pf-btn primary" style={smallBtn} disabled={!writable}
                          title={writable ? undefined : "当前角色无写权限"} onClick={() => claim(t)}>
                          领取
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p style={{ ...dimText, margin: "8px 0 0" }}>
            执行时可逐条填写检查项（正常/异常 + 备注），并添加模拟拍照/录音/GPS 记录或本地文件元数据；提交后自动纳入今日巡检报告。
          </p>
        </Panel>
      </div>

      {/* 联动区 */}
      <div className="grid cols-3" style={{ marginTop: 10 }}>
        <Panel
          title="巡检问题-能效关联（联动区 · 模拟诊断）"
          style={{ gridColumn: "span 2" }}
          extra={
            <>
              {([["all", "全部"], ["pending", "未确认"], ["confirmed", "已确认"]] as const).map(([k, label]) => (
                <button key={k} className={`pf-btn ${linkScope === k ? "primary" : "ghost"}`} style={smallBtn}
                  onClick={() => setPageFilter(MODULE_ID, { linkScope: k })}>
                  {label}
                </button>
              ))}
            </>
          }
        >
          {linkShown.length === 0 ? (
            <EmptyState text={linkScope === "confirmed" ? "尚无已人工确认的关联" : "当前筛选下无关联记录"} />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="pf-table">
                <thead>
                  <tr>
                    <th>巡检发现</th><th>设备</th><th>额外能耗/日</th><th>额外碳排</th><th>额外成本</th><th>关联</th><th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {linkShown.map(({ link, impact }) => {
                    const a = link.anomalyId ? anomalyById[link.anomalyId] : undefined;
                    const meta = energyKindMeta[link.kind];
                    return (
                      <tr key={link.id} style={{ cursor: "pointer" }} onClick={() => setActiveLinkId(link.id)}
                        title="点击查看证据、置信度与人工确认">
                        <td>
                          <b style={{ color: "var(--ink-1)", fontWeight: 600 }}>{link.finding}</b>
                          <div style={dimText}>{link.foundBy}</div>
                        </td>
                        <td style={{ maxWidth: 150 }}>{deviceById[link.deviceId]?.name ?? link.deviceId}</td>
                        <td className="num">{impact.extraUsage.toLocaleString("zh-CN")} {meta.unit}</td>
                        <td className="num">{impact.extraCarbonKg > 0 ? `${impact.extraCarbonKg.toLocaleString("zh-CN")} kg` : "不计入*"}</td>
                        <td className="num">{impact.extraCostYuan.toLocaleString("zh-CN")} 元</td>
                        <td style={dimText}>
                          {link.anomalyId ?? "—"}{link.workOrderId ? <><br />{link.workOrderId}</> : null}
                        </td>
                        <td>
                          {a ? <Tag tone={anomalyStatusMeta[a.status].tone}>{anomalyStatusMeta[a.status].name}</Tag> : <Tag tone="muted">工程估算</Tag>}
                          {confirmedLinks[link.id] && <Tag tone="ok">已确认</Tag>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ ...dimText, margin: "8px 0 0" }}>
            * 水/医用气体在当前合规口径不计入碳排。影响量按异常注入系数与当日实际用量估算（模拟诊断，供人工复核）；
            整改不改变净化空调、医气等保障回路的运行下限。
          </p>
        </Panel>

        <Panel title="问题额外成本对比" extra={<span>元/日 · 点击柱体下钻</span>}>
          {linkShown.length === 0 ? (
            <EmptyState text="当前筛选下无数据" />
          ) : (
            <EChart
              height={252}
              option={chartOption}
              onClick={(p) => {
                const idx = typeof p.dataIndex === "number" ? p.dataIndex : -1;
                const row = linkShown[idx];
                if (row) setActiveLinkId(row.link.id);
              }}
            />
          )}
        </Panel>
      </div>

      {/* 报告区 */}
      <Panel
        title={`今日巡检报告（报告区 · 自动生成 · ${demoAsOfDate}）`}
        style={{ marginTop: 10 }}
        extra={
          <>
            <button className="pf-btn ghost" style={smallBtn} onClick={exportFindings}><FileDown size={12} />异常清单 CSV</button>
            <button className="pf-btn ghost" style={smallBtn} onClick={downloadReport}><FileText size={12} />文本报告</button>
          </>
        }
      >
        <div className="grid cols-3">
          <div>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--ink-2)", fontWeight: 600 }}>完成情况</p>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.9 }}>
              <li>今日任务 <b className="num">{todayTasks.length}</b> 项：已完成 <b className="num">{doneTasks.length}</b> · 执行中 <b className="num">{claimedCount}</b> · 待领取 <b className="num">{todoCount}</b></li>
              <li>已核查检查项 <b className="num">{checkedItems}</b> 项，其中异常 <b className="num" style={{ color: abnormalFindings.length ? "var(--amber)" : undefined }}>{abnormalFindings.length}</b> 项</li>
              <li>记录留痕：照片 <b className="num">{photoCount}</b> 张 · 录音 <b className="num">{audioCount}</b> 段 · GPS 打点 <b className="num">{gpsCount}</b> 次</li>
              <li style={{ color: "var(--ink-3)" }}>以上照片/录音/GPS 均为模拟记录，未调用真实权限</li>
            </ul>
          </div>
          <div>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--ink-2)", fontWeight: 600 }}>异常清单</p>
            {abnormalFindings.length === 0 ? (
              <EmptyState text={doneTasks.length ? "已提交记录全部正常" : "今日暂无已提交的巡检记录"} />
            ) : (
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.7 }}>
                {abnormalFindings.map((f) => (
                  <li key={`${f.task.id}-${f.item.id}`} style={{ marginBottom: 6 }}>
                    <b style={{ color: "var(--ink-1)" }}>{f.item.label}</b>
                    <Tag tone="warn">{f.task.team}</Tag>
                    <div style={dimText}>{f.task.title} · {f.note || "无备注"}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--ink-2)", fontWeight: 600 }}>处理建议与联动提示</p>
            {abnormalFindings.length === 0 ? (
              <p style={{ ...dimText, margin: 0 }}>暂无异常处理建议；巡检问题-能效关联仍有 {openLinkCount} 项未闭环，可在联动区逐项人工确认。</p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.7 }}>
                {abnormalFindings.map((f) => (
                  <li key={`adv-${f.task.id}-${f.item.id}`} style={{ marginBottom: 6 }}>
                    {f.advice}
                    {f.task.relatedWorkOrderId && <span style={dimText}>（关联工单 {f.task.relatedWorkOrderId}）</span>}
                  </li>
                ))}
              </ul>
            )}
            <p style={{ ...dimText, margin: "8px 0 0" }}>
              联动合计：额外碳排约 <b className="num" style={{ color: "var(--amber)" }}>{extraCarbonTotal.toFixed(1)}</b> kgCO₂e/日 ·
              额外成本约 <b className="num">{extraCostTotal.toLocaleString("zh-CN")}</b> 元/日（模拟诊断）。
              不影响医疗安全：整改均不触碰保障回路运行下限。
            </p>
          </div>
        </div>
      </Panel>

      {/* 执行 Modal */}
      {activeTask && activeRecord && (
        <ExecModal task={activeTask} record={activeRecord} writable={writable} onClose={() => setActiveTaskId(null)} />
      )}

      {/* 联动详情 Modal */}
      {activeLinkRow && (
        <LinkDetailModal row={activeLinkRow} writable={writable} onClose={() => setActiveLinkId(null)} />
      )}
    </>
  );
}

/* ================= 执行 Modal：检查项 + 模拟记录三件套 ================= */

function ExecModal({ task, record, writable, onClose }: {
  task: InspectionTask; record: TaskRecord; writable: boolean; onClose: () => void;
}) {
  const { setItem, addPhoto, removePhoto, addAudio, removeAudio, setGps, submitTask } = useInspectionStore();
  const { workOrders, pushToast } = useDemoStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const readOnly = record.status === "done" || !writable;

  const relatedWo = task.relatedWorkOrderId ? workOrders.find((w) => w.id === task.relatedWorkOrderId) : undefined;
  const filled = record.items.filter((i) => i.result).length;
  const abnormal = record.items.filter((i) => i.result === "abnormal").length;

  const addSimPhoto = () => {
    const n = record.photos.length + 1;
    addPhoto(task.id, {
      id: `IMG_${demoAsOfDate.replaceAll("-", "")}_${task.id.slice(-2)}${String(n).padStart(2, "0")}`,
      label: `巡检点位照片 ${n}（模拟占位）`,
      at: dayjs().format("HH:mm"),
      origin: "sim",
    });
  };

  const addSimAudio = () => {
    const n = record.audios.length + 1;
    const durationSec = 15 + Math.round(mulberry32(hashSeed(`${task.id}:audio:${n}`))() * 75);
    addAudio(task.id, {
      id: `REC_${demoAsOfDate.replaceAll("-", "")}_${task.id.slice(-2)}${String(n).padStart(2, "0")}`,
      durationSec,
      at: dayjs().format("HH:mm"),
      origin: "sim",
    });
  };

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    let accepted = 0;
    files.forEach((f) => {
      const kb = Math.max(1, Math.round(f.size / 1024));
      if (f.type.startsWith("image/")) {
        addPhoto(task.id, {
          id: `FILE_${hashSeed(`${task.id}:${f.name}:${f.size}:${f.lastModified}`)}`,
          label: f.name, at: dayjs().format("HH:mm"), origin: "file", meta: `${kb} KB · 仅元数据`,
        });
        accepted += 1;
      } else if (f.type.startsWith("audio/")) {
        addAudio(task.id, {
          id: `FILE_${hashSeed(`${task.id}:${f.name}:${f.size}:${f.lastModified}`)}`,
          durationSec: Math.max(5, Math.round(f.size / 32000)),
          at: dayjs().format("HH:mm"), origin: "file", meta: `${f.name} · ${kb} KB · 时长为估算`,
        });
        accepted += 1;
      }
    });
    if (accepted < files.length) pushToast("部分文件被忽略", "本地文件仅支持图片/音频，且只保留元数据", "warning");
    e.target.value = "";
  };

  const submit = () => {
    const unfilled = record.items.filter((i) => !i.result).length;
    if (unfilled > 0) {
      pushToast("无法提交", `还有 ${unfilled} 个检查项未选择结果`, "warning");
      return;
    }
    const missingNote = record.items.filter((i) => i.result === "abnormal" && !i.note.trim()).length;
    if (missingNote > 0) {
      pushToast("无法提交", "异常项必须填写现场备注说明", "warning");
      return;
    }
    submitTask(task.id, nowAt());
    pushToast(
      "巡检记录已提交",
      abnormal > 0 ? `发现 ${abnormal} 项异常，已纳入今日巡检报告与处理建议` : "全部正常，已纳入今日巡检报告",
      "success",
    );
    onClose();
  };

  return (
    <Modal title={`巡检执行 · ${task.title}`} onClose={onClose} width={760}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12, color: "var(--ink-2)", marginBottom: 10 }}>
        <Tag tone="info">{task.window}</Tag>
        <Tag tone="muted">{task.points} 个点位</Tag>
        <Tag tone="muted">{task.team}</Tag>
        <span>领取：{record.claimedBy}（{record.claimedAt}）</span>
        {relatedWo && (
          <span>关联工单 {relatedWo.id} <Tag tone="info">{workOrderStatusMeta[relatedWo.status]}</Tag></span>
        )}
      </div>
      {task.medicalSafetyNote && (
        <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--red)", display: "flex", gap: 6, alignItems: "center" }}>
          <ShieldCheck size={13} />不影响医疗安全 / 保障优先：{task.medicalSafetyNote}
        </p>
      )}

      {/* 模拟记录三件套 */}
      <div style={{ border: "1px solid var(--panel-border)", borderRadius: 6, padding: 10, marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className="pf-btn ghost" style={smallBtn} disabled={readOnly} onClick={addSimPhoto}>
            <Camera size={12} />拍照记录（模拟）
          </button>
          <button className="pf-btn ghost" style={smallBtn} disabled={readOnly} onClick={addSimAudio}>
            <Mic size={12} />录音记录（模拟）
          </button>
          <button className="pf-btn ghost" style={smallBtn} disabled={readOnly}
            onClick={() => { setGps(task.id, DEMO_GPS); }}>
            <MapPin size={12} />获取定位（模拟）
          </button>
          <button className="pf-btn ghost" style={smallBtn} disabled={readOnly} onClick={() => fileRef.current?.click()}>
            <Upload size={12} />本地文件（仅元数据）
          </button>
          <input ref={fileRef} type="file" accept="image/*,audio/*" multiple style={{ display: "none" }} onChange={onFiles} />
        </div>
        <p style={{ ...dimText, margin: "6px 0 0" }}>
          模拟记录，未调用真实相机/麦克风/定位权限；本地文件仅保留文件名与大小元数据，不上传内容。
        </p>
        <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "8px 0 0", display: "flex", gap: 6, alignItems: "center" }}>
          <MapPin size={12} />
          {record.gps ?? "尚未打点（点击「获取定位（模拟）」写入固定演示坐标）"}
        </p>
        {record.photos.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {record.photos.map((p) => (
              <div key={p.id} style={{ width: 128, border: "1px solid var(--panel-border)", borderRadius: 6, overflow: "hidden" }}>
                <div style={{
                  height: 54, display: "flex", alignItems: "center", justifyContent: "center",
                  background: "linear-gradient(135deg, rgba(41,211,232,0.22), rgba(139,141,240,0.22))", color: "var(--ink-2)",
                }}>
                  <Camera size={18} strokeWidth={1.5} />
                </div>
                <div style={{ padding: "4px 6px", fontSize: 10, color: "var(--ink-3)", lineHeight: 1.5 }}>
                  <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--ink-2)" }} title={p.label}>{p.label}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>{p.at}{p.meta ? ` · ${p.meta}` : p.origin === "sim" ? " · 模拟" : ""}</span>
                    {!readOnly && (
                      <button className="pf-btn ghost" style={{ padding: "0 3px", fontSize: 10 }} aria-label="删除照片"
                        onClick={() => removePhoto(task.id, p.id)}>
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {record.audios.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            {record.audios.map((a) => (
              <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, color: "var(--ink-2)" }}>
                <Mic size={12} />
                <div style={{ flex: "0 0 200px", height: 6, borderRadius: 3, background: "rgba(157,180,214,0.15)", overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, (a.durationSec / 90) * 100)}%`, height: "100%", background: "var(--cyan)" }} />
                </div>
                <span className="num">{fmtDur(a.durationSec)}</span>
                <span style={dimText}>{a.at}{a.meta ? ` · ${a.meta}` : " · 模拟录音"}</span>
                {!readOnly && (
                  <button className="pf-btn ghost" style={{ padding: "0 3px", fontSize: 10 }} aria-label="删除录音"
                    onClick={() => removeAudio(task.id, a.id)}>
                    <Trash2 size={10} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 检查项 */}
      <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {task.items.map((ci, idx) => {
          const st = record.items.find((i) => i.itemId === ci.id);
          if (!st) return null;
          return (
            <div key={ci.id} style={{ border: "1px solid var(--panel-border)", borderRadius: 6, padding: "8px 10px" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "var(--ink-1)", fontWeight: 600 }}>{idx + 1}. {ci.label}</span>
                <span style={dimText}>标准：{ci.spec}</span>
                <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <button className={`pf-btn ${st.result === "normal" ? "primary" : "ghost"}`} style={smallBtn} disabled={readOnly}
                    onClick={() => setItem(task.id, ci.id, { result: "normal" })}>
                    <CheckCircle2 size={11} />正常
                  </button>
                  <button className={`pf-btn ${st.result === "abnormal" ? "danger" : "ghost"}`} style={smallBtn} disabled={readOnly}
                    onClick={() => setItem(task.id, ci.id, { result: "abnormal" })}>
                    <AlertTriangle size={11} />异常
                  </button>
                </span>
              </div>
              {(st.result === "abnormal" || st.note) && (
                <div style={{ marginTop: 6 }}>
                  <input className="pf-input" style={{ width: "100%", fontSize: 12 }} disabled={readOnly}
                    placeholder="现场备注（异常项必填：现象、读数、位置）" value={st.note}
                    onChange={(e) => setItem(task.id, ci.id, { note: e.target.value })} />
                  {st.result === "abnormal" && (
                    <p style={{ ...dimText, margin: "4px 0 0" }}>建议：{ci.abnormalAdvice}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
        <span style={{ fontSize: 12, color: "var(--ink-2)" }}>
          已填 <b className="num">{filled}</b>/{record.items.length} · 异常 <b className="num" style={{ color: abnormal ? "var(--amber)" : undefined }}>{abnormal}</b> 项
          {record.status === "done" && record.submittedAt && ` · 已于 ${record.submittedAt} 提交`}
        </span>
        {record.status === "done" ? (
          <button className="pf-btn ghost" onClick={onClose}>关闭</button>
        ) : (
          <button className="pf-btn primary" disabled={!writable} title={writable ? undefined : "当前角色无写权限"} onClick={submit}>
            <ClipboardCheck size={13} />提交巡检记录
          </button>
        )}
      </div>
    </Modal>
  );
}

/* ================= 联动详情 Modal：证据 / 置信度 / 人工确认 ================= */

function LinkDetailModal({ row, writable, onClose }: { row: LinkRow; writable: boolean; onClose: () => void }) {
  const { workOrders, pushToast } = useDemoStore();
  const { confirmedLinks, confirmLink } = useInspectionStore();
  const { link, impact } = row;
  const a = link.anomalyId ? anomalyById[link.anomalyId] : undefined;
  const wo = link.workOrderId ? workOrders.find((w) => w.id === link.workOrderId) : undefined;
  const confirmedAt = confirmedLinks[link.id];
  const meta = energyKindMeta[link.kind];
  const device = deviceById[link.deviceId];

  return (
    <Modal title={`能效关联详情 · ${link.short}`} onClose={onClose} width={640}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <Tag tone="info">模拟诊断</Tag>
        {a ? <Tag tone="muted">置信度 {a.aiConfidencePct}%</Tag> : <Tag tone="muted">工程估算</Tag>}
        {a && <Tag tone={anomalyStatusMeta[a.status].tone}>{anomalyStatusMeta[a.status].name}</Tag>}
        {confirmedAt && <Tag tone="ok">已人工确认</Tag>}
      </div>
      <p style={{ margin: "0 0 4px", fontSize: 13, color: "var(--ink-1)", fontWeight: 600 }}>{link.finding}</p>
      <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--ink-2)" }}>
        {device ? `${device.name} · ${buildingName(device.buildingId)}` : link.deviceId} · {link.foundBy}
      </p>
      <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--ink-2)" }}>影响机理：{link.mechanism}</p>

      <div className="grid cols-3" style={{ marginBottom: 10 }}>
        <Kpi label={`额外${meta.name}`} value={impact.extraUsage.toLocaleString("zh-CN")} unit={`${meta.unit}/日`} />
        <Kpi label="额外碳排" value={impact.extraCarbonKg > 0 ? impact.extraCarbonKg.toLocaleString("zh-CN") : "不计入"}
          unit={impact.extraCarbonKg > 0 ? "kgCO₂e/日" : "（合规口径）"} tone={impact.extraCarbonKg > 0 ? "amber" : undefined} />
        <Kpi label="额外成本" value={impact.extraCostYuan.toLocaleString("zh-CN")} unit="元/日" />
      </div>

      {a ? (
        <>
          <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--ink-2)", fontWeight: 600 }}>证据（异常链 {a.id}）</p>
          <ul style={{ margin: "0 0 10px", paddingLeft: 16, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.7 }}>
            {a.evidence.map((e) => <li key={e}>{e}</li>)}
          </ul>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--ink-2)" }}>根因（模拟诊断）：{a.rootCause}</p>
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--ink-2)" }}>处置建议：{a.suggestion}</p>
          {a.medicalSafetyNote && (
            <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--red)", display: "flex", gap: 6, alignItems: "center" }}>
              <ShieldCheck size={13} />不影响医疗安全 / 保障优先：{a.medicalSafetyNote}
            </p>
          )}
        </>
      ) : (
        <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--ink-2)" }}>
          估算口径：{link.estimateNote}。建议纳入下轮周巡复核，确认后转工单处理。
        </p>
      )}

      {wo && (
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--ink-2)" }}>
          关联工单：{wo.id} <Tag tone="info">{workOrderStatusMeta[wo.status]}</Tag> · 责任 {wo.ownerTeam} {wo.owner} · 期限 {wo.dueAt}
        </p>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={dimText}>
          {confirmedAt ? `人工确认时间：${confirmedAt}` : "影响量为模拟诊断结果，需人工确认后作为整改依据"}
        </span>
        <button className="pf-btn primary" disabled={!writable || !!confirmedAt}
          title={writable ? undefined : "当前角色无写权限"}
          onClick={() => {
            confirmLink(link.id, nowAt());
            pushToast("已人工确认", `「${link.short}」与能效影响的关联已确认为整改依据`, "success");
          }}>
          <CheckCircle2 size={13} />{confirmedAt ? "已确认" : "人工确认关联"}
        </button>
      </div>
    </Modal>
  );
}
