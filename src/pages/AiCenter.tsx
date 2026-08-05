// 6.3.1 AI 智能分析中心（moduleId: ai-center）
// 页首标注：确定性规则 + 预置问答演示，未调用真实 AI 服务。
import dayjs from "dayjs";
import { BrainCircuit, Pause, Play, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CHART_COLORS, EChart } from "../components/EChart";
import { Kpi, PageHead, Panel, Tag } from "../components/kit";
import { anomalyChains } from "../data/anomalies";
import { annualCarbonBudgetT, demoAsOfDate } from "../data/config";
import {
  adjustedForecast,
  aiCandidates,
  budgetTiers,
  buildProjectFromAnomaly,
  buildProjectFromCandidate,
  dailyBudgetT,
  forecastEvents,
  greedyPick,
  investPath,
  makeStreamEvent,
  matchQa,
  nextProjectId,
  pathwayCards,
  policyTimeline,
  qaPresets,
  riskCategories,
  riskCell,
  scenarioPool,
  type AiCandidate,
  type QaAnswer,
  type StreamEvent,
} from "../data/modules/ai-center";
import { canWrite } from "../data/navigation";
import { projectStageMeta } from "../data/projects";
import { workOrderStatusMeta } from "../data/workorders";
import { dailyCarbonSeries, outpatientVisits } from "../services/timeseries";
import { useDemoStore } from "../stores/demo";
import type { AnomalyChain } from "../types/core";

const PAGE_ID = "ai-center";
const STREAM_RING = 8;
const levelColor = { critical: "var(--red)", warning: "var(--amber)", info: "var(--cyan)" } as const;
const levelName = { critical: "严重", warning: "警告", info: "提示" } as const;
const levelTone = { critical: "danger", warning: "warn", info: "info" } as const;
const anomalyStatusName = { open: "待处理", handling: "处理中", closed: "已关闭" } as const;

export function AiCenterPage() {
  const navigate = useNavigate();
  const { role, allPermissions, projects, workOrders, addProject, pushToast, pageFilters, setPageFilter } = useDemoStore();
  const writable = canWrite(PAGE_ID, role, allPermissions);

  const filters = pageFilters[PAGE_ID] ?? {};
  const budgetTier = typeof filters.budgetTier === "number" ? filters.budgetTier : 300;
  const levelFilter = typeof filters.levelFilter === "string" ? filters.levelFilter : "all";

  const [expandedAnomaly, setExpandedAnomaly] = useState<string | null>("AN-001");
  const [selectedBubble, setSelectedBubble] = useState<(string | number)[] | null>(null);
  const [qaInput, setQaInput] = useState("");
  const [chat, setChat] = useState<{ q: string; a: QaAnswer | null }[]>([]);
  const chatRef = useRef<HTMLDivElement>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    policyTimeline.forEach((p) => p.checklist.forEach((c, i) => { init[`${p.id}:${i}`] = !/未完成|未启动/.test(c); }));
    return init;
  });

  // ---------- 模拟实时数据流：4 秒轮播 + 固定长度环形缓冲 + 页面隐藏暂停 ----------
  const [stream, setStream] = useState<StreamEvent[]>(() => [makeStreamEvent(0), makeStreamEvent(1), makeStreamEvent(2)]);
  const [streamPaused, setStreamPaused] = useState(false);
  const manualPauseRef = useRef(false);
  const tickRef = useRef(2);
  useEffect(() => {
    let timer: number | undefined;
    const push = () => {
      tickRef.current += 1;
      setStream((s) => [...s.slice(-(STREAM_RING - 1)), makeStreamEvent(tickRef.current)]);
    };
    const start = () => { if (timer === undefined && !manualPauseRef.current) timer = window.setInterval(push, 4000); };
    const stop = () => { if (timer !== undefined) { window.clearInterval(timer); timer = undefined; } };
    const onVis = () => { if (document.hidden) { stop(); setStreamPaused(true); } else if (!manualPauseRef.current) { start(); setStreamPaused(false); } };
    document.addEventListener("visibilitychange", onVis);
    const onManual = (e: Event) => {
      const paused = (e as CustomEvent<boolean>).detail;
      manualPauseRef.current = paused;
      if (paused) { stop(); setStreamPaused(true); } else { start(); setStreamPaused(false); }
    };
    window.addEventListener("ai-center:stream-toggle", onManual);
    start();
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("ai-center:stream-toggle", onManual); };
  }, []);
  const toggleStream = () => window.dispatchEvent(new CustomEvent("ai-center:stream-toggle", { detail: !manualPauseRef.current }));

  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);

  // ---------- KPI ----------
  const kpi = useMemo(() => {
    const last14 = dailyCarbonSeries(dayjs(demoAsOfDate).subtract(13, "day").format("YYYY-MM-DD"), demoAsOfDate);
    const avg14 = Math.round((last14.reduce((s, p) => s + p.v, 0) / last14.length) * 10) / 10;
    const fc = adjustedForecast();
    const fcTotal = Math.round(fc.reduce((s, p) => s + p.v, 0));
    const sept = fc.filter((p) => p.t >= "2026-09-01");
    const septTotal = Math.round(sept.reduce((s, p) => s + p.v, 0));
    const septBudget = Math.round((annualCarbonBudgetT / 365) * 30);
    const open = anomalyChains.filter((a) => a.status !== "closed");
    const critical = open.filter((a) => a.level === "critical").length;
    const potential = Math.round(aiCandidates.reduce((s, c) => s + c.annualCarbonReductionT, 0));
    const aiProjects = projects.filter((p) => p.source === "ai").length;
    return { avg14, fcDays: fc.length, fcTotal, septTotal, septBudget, openCount: open.length, critical, potential, aiProjects };
  }, [projects]);

  // ---------- ① 三线碳排预测图 ----------
  const forecastOption = useMemo(() => {
    const actual = dailyCarbonSeries(dayjs(demoAsOfDate).subtract(89, "day").format("YYYY-MM-DD"), demoAsOfDate);
    const fc = adjustedForecast();
    const dates = [...actual.map((p) => p.t), ...fc.map((p) => p.t)];
    const actualData: (number | null)[] = [...actual.map((p) => p.v), ...fc.map(() => null)];
    const fcData: (number | null)[] = [...actual.map((p, i) => (i === actual.length - 1 ? p.v : null)), ...fc.map((p) => p.v)];
    return {
      grid: { right: 52, bottom: 30 },
      legend: {},
      xAxis: { type: "category", data: dates, axisLabel: { formatter: (v: string) => v.slice(5), interval: 13 } },
      yAxis: [
        { type: "value", name: "tCO₂e/日", nameTextStyle: { color: "#5f7799", fontSize: 10 } },
        { type: "value", name: "人次/日", nameTextStyle: { color: "#5f7799", fontSize: 10 }, splitLine: { show: false } },
      ],
      series: [
        { name: "实际（近 90 日）", type: "line", data: actualData, showSymbol: false, lineStyle: { width: 1.6 }, color: CHART_COLORS[0] },
        {
          name: "预测（至 9-30）", type: "line", data: fcData, showSymbol: false,
          lineStyle: { width: 1.6, type: "dashed" }, color: CHART_COLORS[3],
          markLine: {
            symbol: "none",
            lineStyle: { color: "#8b8df0", type: "dashed", width: 1 },
            label: { color: "#9db4d6", fontSize: 10 },
            data: forecastEvents.map((e) => ({ xAxis: e.date, label: { formatter: e.label } })),
          },
        },
        { name: "目标（预算日均）", type: "line", data: dates.map(() => dailyBudgetT), showSymbol: false, lineStyle: { width: 1, type: "dotted" }, color: CHART_COLORS[2] },
        { name: "门诊量（右轴）", type: "line", yAxisIndex: 1, data: dates.map((d) => outpatientVisits(d)), showSymbol: false, lineStyle: { width: 1, opacity: 0.55 }, color: CHART_COLORS[7] },
      ],
    };
  }, []);

  // ---------- ② 异常时间线 ----------
  const timelineAnomalies = useMemo(() => {
    const sorted = [...anomalyChains].sort((a, b) => (a.from < b.from ? 1 : -1));
    return levelFilter === "all" ? sorted : sorted.filter((a) => a.level === levelFilter);
  }, [levelFilter]);

  // ---------- ③ 气泡图 + 情景 ----------
  const bubbleOption = useMemo(() => {
    const projData = projects.map((p) => [p.investmentWanYuan, p.annualCarbonReductionT, p.paybackYears, p.name, p.annualSavingWanYuan, p.id]);
    const candData = aiCandidates
      .filter((c) => !projects.some((p) => p.name === c.name))
      .map((c) => [c.investmentWanYuan, c.annualCarbonReductionT, c.paybackYears, c.name, c.annualSavingWanYuan, c.key]);
    const size = (val: number[]) => 8 + val[2] * 3;
    return {
      grid: { bottom: 32 },
      legend: {},
      tooltip: {
        trigger: "item",
        formatter: (raw: unknown) => {
          const d = (raw as { data: (string | number)[] }).data;
          return `${d[3]}<br/>投资 ${d[0]} 万元 · 年减碳 ${d[1]} t<br/>年收益 ${d[4]} 万元 · 回收期 ${d[2]} 年`;
        },
      },
      xAxis: { type: "value", name: "投资（万元）", nameTextStyle: { color: "#5f7799", fontSize: 10 } },
      yAxis: { type: "value", name: "年减碳（t）", nameTextStyle: { color: "#5f7799", fontSize: 10 } },
      series: [
        { name: "项目库项目", type: "scatter", data: projData, symbolSize: size, itemStyle: { opacity: 0.85 }, color: CHART_COLORS[0] },
        { name: "AI 候选建议", type: "scatter", data: candData, symbolSize: size, itemStyle: { opacity: 0.85 }, color: CHART_COLORS[2] },
      ],
    };
  }, [projects]);

  const scenario = useMemo(() => greedyPick(budgetTier), [budgetTier]);
  const chosenIds = useMemo(() => new Set(scenario.chosen.map((c) => c.id)), [scenario]);
  const sortedPool = useMemo(
    () => [...scenarioPool].sort((a, b) => b.annualCarbonReductionT / b.investmentWanYuan - a.annualCarbonReductionT / a.investmentWanYuan),
    [],
  );

  const pathOption = useMemo(() => {
    const path = investPath();
    return {
      grid: { bottom: 30 },
      legend: false as const,
      tooltip: {
        trigger: "item",
        formatter: (raw: unknown) => {
          const p = raw as { dataIndex: number };
          const it = path[p.dataIndex];
          return `${it.name}<br/>累计投资 ${it.cumInvest} 万元 → 累计年减碳 ${it.cumReduction} t`;
        },
      },
      xAxis: { type: "value", name: "累计投资（万元）", nameTextStyle: { color: "#5f7799", fontSize: 10 } },
      yAxis: { type: "value", name: "累计年减碳（t）", nameTextStyle: { color: "#5f7799", fontSize: 10 } },
      series: [
        {
          name: "投资-减碳路径", type: "line", data: path.map((p) => [p.cumInvest, p.cumReduction]),
          symbolSize: 6, lineStyle: { width: 1.6 }, color: CHART_COLORS[1],
          markLine: {
            symbol: "none", lineStyle: { color: "#f5a524", type: "dashed" },
            label: { color: "#f5a524", fontSize: 10, formatter: `${budgetTier} 万预算` },
            data: [{ xAxis: budgetTier }],
          },
        },
      ],
    };
  }, [budgetTier]);

  // ---------- ⑤ 风险热力日历 ----------
  const heatOption = useMemo(() => {
    const dates: string[] = [];
    for (let i = 1; i <= 60; i++) dates.push(dayjs(demoAsOfDate).add(i, "day").format("YYYY-MM-DD"));
    const data: [number, number, number][] = [];
    dates.forEach((d, di) => riskCategories.forEach((c, ci) => data.push([di, ci, riskCell(c.id, d).level])));
    return {
      grid: { left: 64, right: 16, top: 10, bottom: 54 },
      legend: false as const,
      tooltip: {
        trigger: "item",
        formatter: (raw: unknown) => {
          const [di, ci] = (raw as { data: [number, number, number] }).data;
          const cat = riskCategories[ci];
          const cell = riskCell(cat.id, dates[di]);
          const lv = ["无", "低", "中", "高"][cell.level];
          return `${dates[di]} · ${cat.name}<br/>风险等级：${lv}<br/>${cell.reason}`;
        },
      },
      xAxis: { type: "category", data: dates, axisLabel: { formatter: (v: string) => v.slice(5), interval: 6 } },
      yAxis: { type: "category", data: riskCategories.map((c) => c.name), splitLine: { show: false } },
      visualMap: {
        type: "piecewise", min: 0, max: 3, bottom: 0, left: "center", orient: "horizontal",
        itemWidth: 12, itemHeight: 12, textStyle: { color: "#9db4d6", fontSize: 10 },
        pieces: [
          { value: 0, label: "无", color: "rgba(56,116,178,0.15)" },
          { value: 1, label: "低", color: "rgba(41,211,232,0.4)" },
          { value: 2, label: "中", color: "rgba(245,165,36,0.72)" },
          { value: 3, label: "高", color: "rgba(244,82,95,0.85)" },
        ],
      },
      series: [{ name: "风险", type: "heatmap", data, itemStyle: { borderColor: "rgba(6,13,27,0.6)", borderWidth: 1 } }],
    };
  }, []);

  // ---------- ⑧ 转为项目 ----------
  const convertAnomaly = (a: AnomalyChain) => {
    if (!writable) return;
    const existing = projects.find((p) => p.anomalyId === a.id);
    if (existing) { pushToast("无需重复转化", `${a.id} 已关联项目 ${existing.id}`, "info"); return; }
    const id = nextProjectId(projects);
    addProject(buildProjectFromAnomaly(a, id));
    pushToast("已转为项目", `${id} · ${a.title} 治理项目（立项阶段），可在项目库查看同一 ID`, "success");
  };

  const convertCandidate = (c: AiCandidate) => {
    if (!writable) return;
    const existing = projects.find((p) => p.name === c.name);
    if (existing) { pushToast("无需重复转化", `候选已转为项目 ${existing.id}`, "info"); return; }
    const id = nextProjectId(projects);
    addProject(buildProjectFromCandidate(c, id));
    pushToast("已转为项目", `${id} · ${c.name}（立项阶段），可在项目库查看同一 ID`, "success");
  };

  const ask = (text: string) => {
    const q = text.trim();
    if (!q) return;
    const preset = matchQa(q);
    setChat((c) => [...c, { q, a: preset ? preset.build() : null }]);
    setQaInput("");
  };

  const jumpAnomaly = (id: string) => {
    setPageFilter(PAGE_ID, { levelFilter: "all" });
    setExpandedAnomaly(id);
    window.setTimeout(() => document.getElementById(`an-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  };

  const exportScenario = async () => {
    const { downloadCsv } = await import("../utils/downloads");
    downloadCsv(
      sortedPool.map((it) => ({
        名称: it.name, 类型: it.kind === "project" ? "项目库" : "AI 候选",
        投资万元: it.investmentWanYuan, 年减碳t: it.annualCarbonReductionT,
        年收益万元: it.annualSavingWanYuan, 回收期年: it.paybackYears,
        [`${budgetTier}万预算入选`]: chosenIds.has(it.id) ? "是" : "否",
      })),
      `AI减排组合_${budgetTier}万预算_${demoAsOfDate}.csv`,
    );
    pushToast("导出完成", `已导出 ${budgetTier} 万预算情景组合（${sortedPool.length} 项）`, "success");
  };

  const selectedCandidate = selectedBubble ? aiCandidates.find((c) => c.key === selectedBubble[5] || c.name === selectedBubble[3]) : undefined;

  return (
    <>
      <PageHead
        title="AI 智能分析中心"
        sub="确定性规则 + 预置问答演示，未调用真实 AI 服务 · 所有诊断为模拟诊断，医疗安全保障优先"
        actions={
          <>
            <Tag tone="warn">模拟诊断</Tag>
            <Tag tone="ok">不影响医疗安全 / 保障优先</Tag>
          </>
        }
      />

      <div className="grid cols-5">
        <Kpi label="近 14 日日均碳排" value={kpi.avg14} unit="t/日" tone={kpi.avg14 > dailyBudgetT ? "amber" : "green"}
          sub={<span>预算日均 {dailyBudgetT} t · 偏差 {Math.round(((kpi.avg14 - dailyBudgetT) / dailyBudgetT) * 1000) / 10}%</span>} />
        <Kpi label="预测期总碳排（至 9-30）" value={kpi.fcTotal.toLocaleString("zh-CN")} unit="t" tone="cyan"
          sub={<span>{kpi.fcDays} 天 · 已叠加 {forecastEvents.length} 项投运/整改事件</span>} />
        <Kpi label="9 月预测碳排" value={kpi.septTotal.toLocaleString("zh-CN")} unit="t" tone={kpi.septTotal > kpi.septBudget ? "amber" : "green"}
          sub={<span>9 月预算 {kpi.septBudget.toLocaleString("zh-CN")} t · {kpi.septTotal > kpi.septBudget ? "超" : "余"} {Math.abs(kpi.septTotal - kpi.septBudget).toLocaleString("zh-CN")} t</span>} />
        <Kpi label="未关闭异常" value={kpi.openCount} unit="条" tone={kpi.critical > 0 ? "red" : "amber"}
          sub={<span>严重 {kpi.critical} 条 · 全链路关联告警/工单</span>} />
        <Kpi label="AI 候选减排潜力" value={kpi.potential.toLocaleString("zh-CN")} unit="t/年" tone="cyan"
          sub={<span>{aiCandidates.length} 项候选 · 已转化 {kpi.aiProjects} 项</span>} />
      </div>

      {/* ① 三线碳排预测 */}
      <Panel title="碳排预测：实际 / 目标 / 预测 三线（叠加门诊量副轴）" style={{ marginTop: 10 }}
        extra={<span>预测 = 近 14 日基线 × 季节/星期修正 × 整改收敛 + 事件叠加（确定性规则）</span>}>
        <EChart height={280} option={forecastOption} />
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6, fontSize: 11, color: "var(--ink-3)" }}>
          {forecastEvents.map((e) => (
            <span key={e.date}>
              <Tag tone={e.deltaT < 0 ? "ok" : "warn"}>{dayjs(e.date).format("MM-DD")} {e.label} {e.deltaT > 0 ? "+" : ""}{e.deltaT} t/日</Tag>{" "}
              {e.detail}
            </span>
          ))}
        </div>
      </Panel>

      {/* ② 异常时间线 + 模拟实时流 */}
      <div className="grid cols-2" style={{ marginTop: 10 }}>
        <Panel
          title="异常时间线（10 条预置异常链）"
          extra={
            <select className="pf-select" value={levelFilter} onChange={(e) => setPageFilter(PAGE_ID, { levelFilter: e.target.value })}>
              <option value="all">全部等级</option>
              <option value="critical">严重</option>
              <option value="warning">警告</option>
              <option value="info">提示</option>
            </select>
          }
        >
          <div style={{ maxHeight: 430, overflowY: "auto", paddingRight: 4 }}>
            {timelineAnomalies.map((a) => {
              const open = expandedAnomaly === a.id;
              const linked = projects.find((p) => p.anomalyId === a.id);
              const convertible = a.estReductionTPerYear > 0 || a.estSavingWanYuanPerYear > 0;
              return (
                <div key={a.id} id={`an-${a.id}`} style={{ position: "relative", marginLeft: 6, paddingLeft: 16, paddingBottom: 10, borderLeft: "1px solid var(--panel-border)" }}>
                  <span style={{ position: "absolute", left: -5, top: 4, width: 9, height: 9, borderRadius: 999, background: levelColor[a.level], boxShadow: `0 0 6px ${levelColor[a.level]}` }} />
                  <div style={{ cursor: "pointer", display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }} onClick={() => setExpandedAnomaly(open ? null : a.id)}>
                    <span className="num" style={{ fontSize: 11, color: "var(--ink-3)" }}>{a.from}</span>
                    <span style={{ fontSize: 12, color: "var(--ink-1)" }}>{a.title}</span>
                    <Tag tone={levelTone[a.level]}>{levelName[a.level]}</Tag>
                    <Tag tone={a.status === "closed" ? "muted" : a.status === "handling" ? "info" : "warn"}>{anomalyStatusName[a.status]}</Tag>
                  </div>
                  {open && (
                    <div style={{ marginTop: 6, padding: "8px 10px", background: "rgba(10,20,40,0.55)", border: "1px solid var(--panel-border)", borderRadius: 6, fontSize: 11, color: "var(--ink-2)", display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: "var(--ink-3)" }}>AI 置信度（模拟）</span>
                        <div style={{ flex: "0 0 110px", height: 6, background: "rgba(56,116,178,0.2)", borderRadius: 3 }}>
                          <div style={{ width: `${a.aiConfidencePct}%`, height: 6, borderRadius: 3, background: a.aiConfidencePct >= 90 ? "var(--green)" : "var(--cyan)" }} />
                        </div>
                        <span className="num">{a.aiConfidencePct}%</span>
                        <span style={{ color: "var(--ink-3)" }}>· 责任 {a.owner}</span>
                      </div>
                      <div><span style={{ color: "var(--ink-3)" }}>证据链：</span>{a.evidence.map((e, i) => <div key={i} style={{ paddingLeft: 8 }}>· {e}</div>)}</div>
                      <div><span style={{ color: "var(--ink-3)" }}>根因：</span>{a.rootCause}</div>
                      <div><span style={{ color: "var(--ink-3)" }}>建议：</span>{a.suggestion}</div>
                      {a.medicalSafetyNote && <div><Tag tone="danger">医疗安全</Tag> {a.medicalSafetyNote}</div>}
                      {(a.estReductionTPerYear > 0 || a.estSavingWanYuanPerYear > 0) && (
                        <div style={{ color: "var(--ink-3)" }}>
                          测算：年节能 {a.estSavingMwhPerYear} MWh · 年收益 {a.estSavingWanYuanPerYear} 万元 · 年减碳 {a.estReductionTPerYear} t
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <button className="pf-btn ghost" onClick={() => navigate("/app/energy/monitoring")}>告警 {a.alarmId}</button>
                        {a.workOrderId && (
                          <button className="pf-btn ghost" onClick={() => navigate("/app/operations/workorders")}>
                            工单 {a.workOrderId}（{workOrderStatusMeta[workOrders.find((w) => w.id === a.workOrderId)?.status ?? "received"]}）
                          </button>
                        )}
                        {(a.projectId || linked) && (
                          <button className="pf-btn ghost" onClick={() => navigate("/app/operations/projects")}>
                            项目 {a.projectId ?? linked!.id}
                          </button>
                        )}
                        {!a.projectId && !linked && convertible && (
                          <button className="pf-btn primary" disabled={!writable} title={writable ? "生成立项项目并写入项目库" : "当前角色无写权限"} onClick={() => convertAnomaly(a)}>
                            转为项目
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel
          title="模拟实时数据流（预置事件轮播，非真实采集）"
          extra={
            <>
              <span>4s 轮播 · 环形缓冲 {STREAM_RING} 条 · 页面隐藏自动暂停</span>
              <button className="pf-btn ghost" onClick={toggleStream}>
                {streamPaused ? <Play size={12} /> : <Pause size={12} />} {streamPaused ? "继续" : "暂停"}
              </button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minHeight: 300 }}>
            {[...stream].reverse().map((ev) => (
              <div key={ev.key} className="fadeup" style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12, padding: "6px 8px", background: "rgba(10,20,40,0.5)", border: "1px solid var(--panel-border)", borderRadius: 6 }}>
                <span className="num" style={{ color: "var(--ink-3)", fontSize: 11 }}>{ev.time}</span>
                <Tag tone={ev.tone === "danger" ? "danger" : ev.tone === "warn" ? "warn" : "info"}>{ev.tag}</Tag>
                <span style={{ color: "var(--ink-2)" }}>{ev.text}</span>
              </div>
            ))}
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--ink-3)" }}>
            事件池 12 条与异常链/预测口径一致；时间戳为演示时钟（基准 {demoAsOfDate} 14:00）。
          </p>
        </Panel>
      </div>

      {/* ③ 减排气泡图 + 投资情景 */}
      <div className="grid cols-2" style={{ marginTop: 10 }}>
        <Panel title="减排项目气泡图（x 投资 / y 年减碳 / 气泡大小 = 回收期）" extra={<span>点击气泡查看详情</span>}>
          <EChart
            height={260}
            option={bubbleOption}
            onClick={(p) => setSelectedBubble((p.data as (string | number)[]) ?? null)}
          />
          {selectedBubble ? (
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--ink-2)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Tag tone={selectedCandidate ? "warn" : "info"}>{selectedCandidate ? "AI 候选" : "项目库"}</Tag>
              <span>{selectedBubble[3]}</span>
              <span className="num" style={{ color: "var(--ink-3)" }}>
                投资 {selectedBubble[0]} 万 · 年减碳 {selectedBubble[1]} t · 回收期 {selectedBubble[2]} 年
              </span>
              {selectedCandidate ? (
                <button className="pf-btn primary" disabled={!writable} onClick={() => convertCandidate(selectedCandidate)}>转为项目</button>
              ) : (
                <button className="pf-btn ghost" onClick={() => navigate("/app/operations/projects")}>在项目库查看</button>
              )}
            </div>
          ) : (
            <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--ink-3)" }}>数据：项目库 {projects.length} 项 + AI/诊断候选 {aiCandidates.length} 项；候选测算依据见情景表。</p>
          )}
        </Panel>

        <Panel
          title="投资情景对比（贪心组合：按年减碳/投资性价比装入预算）"
          extra={
            <>
              {budgetTiers.map((t) => (
                <button key={t} className={`pf-btn ${budgetTier === t ? "primary" : "ghost"}`} onClick={() => setPageFilter(PAGE_ID, { budgetTier: t })}>
                  {t} 万
                </button>
              ))}
              <button className="pf-btn ghost" onClick={() => void exportScenario()}>导出 CSV</button>
            </>
          }
        >
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--ink-2)", marginBottom: 6, flexWrap: "wrap" }}>
            <span>入选 <b className="num" style={{ color: "var(--ink-1)" }}>{scenario.chosen.length}</b> 项</span>
            <span>投资 <b className="num" style={{ color: "var(--cyan)" }}>{scenario.totalInvest}</b> / {budgetTier} 万元</span>
            <span>年减碳 <b className="num" style={{ color: "var(--green)" }}>{scenario.totalReduction.toLocaleString("zh-CN")}</b> t</span>
            <span>年收益 <b className="num" style={{ color: "var(--ink-1)" }}>{scenario.totalSaving}</b> 万元</span>
            <span>组合回收期 <b className="num" style={{ color: "var(--ink-1)" }}>{scenario.totalSaving > 0 ? Math.round((scenario.totalInvest / scenario.totalSaving) * 10) / 10 : "-"}</b> 年</span>
          </div>
          <EChart height={132} option={pathOption} />
          <div style={{ maxHeight: 130, overflowY: "auto", marginTop: 4 }}>
            <table className="pf-table">
              <thead>
                <tr><th>名称（按性价比排序）</th><th>投资</th><th>年减碳</th><th>回收期</th><th>入选</th></tr>
              </thead>
              <tbody>
                {sortedPool.map((it) => (
                  <tr key={it.id}>
                    <td>{it.name} {it.kind === "candidate" && <Tag tone="warn">候选</Tag>}</td>
                    <td className="num">{it.investmentWanYuan} 万</td>
                    <td className="num">{it.annualCarbonReductionT} t</td>
                    <td className="num">{it.paybackYears} 年</td>
                    <td>{chosenIds.has(it.id) ? <Tag tone="ok">入选</Tag> : <Tag tone="muted">未入选</Tag>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {/* ④ 医院专项减排路径 */}
      <Panel title="医院专项减排路径（五大方向，含关联项目/工单）" style={{ marginTop: 10 }}
        extra={<span>状态实时取自项目库/工单 store，与对应模块看到同一 ID</span>}>
        <div className="grid cols-5">
          {pathwayCards.map((c) => {
            const proj = c.projectId ? projects.find((p) => p.id === c.projectId) : undefined;
            const cand = c.candidateKey ? aiCandidates.find((x) => x.key === c.candidateKey) : undefined;
            const candProj = cand ? projects.find((p) => p.name === cand.name) : undefined;
            const wo = c.workOrderId ? workOrders.find((w) => w.id === c.workOrderId) : undefined;
            return (
              <div key={c.key} style={{ background: "var(--panel)", border: "1px solid var(--panel-border)", borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                  <b style={{ fontSize: 13, color: "var(--ink-1)" }}>{c.name}</b>
                  <Tag tone={c.tone}>{proj ? `项目${projectStageMeta[proj.stage]}` : candProj ? `项目${projectStageMeta[candProj.stage]}` : c.statusText}</Tag>
                </div>
                <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{c.measure}</span>
                <span className="num" style={{ fontSize: 18, color: "var(--cyan)" }}>{c.reductionT}<small style={{ fontSize: 11, color: "var(--ink-3)" }}> t/年 减碳测算</small></span>
                {c.safety && <span style={{ fontSize: 10, color: "var(--ink-3)" }}><Tag tone="danger">安全</Tag> {c.safety}</span>}
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: "auto" }}>
                  {(proj || candProj) && (
                    <button className="pf-btn ghost" onClick={() => navigate("/app/operations/projects")}>{(proj ?? candProj)!.id}</button>
                  )}
                  {wo && (
                    <button className="pf-btn ghost" onClick={() => navigate("/app/operations/workorders")}>{wo.id}（{workOrderStatusMeta[wo.status]}）</button>
                  )}
                  {c.anomalyId && <button className="pf-btn ghost" onClick={() => jumpAnomaly(c.anomalyId!)}>{c.anomalyId}</button>}
                  {cand && !candProj && (
                    <button className="pf-btn primary" disabled={!writable} onClick={() => convertCandidate(cand)}>候选转项目</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* ⑤ 风险热力日历 + ⑥ 政策时间线 */}
      <div className="grid cols-2" style={{ marginTop: 10 }}>
        <Panel title="风险热力日历（未来 60 天 × 4 类风险，确定性规则打分）" extra={<span>悬停查看打分依据</span>}>
          <EChart height={250} option={heatOption} />
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--ink-3)" }}>
            规则：碳预算=预测/预算比值；设备=在障设备与维保窗口；合规=能源审计 2026-09-15 到期倒计时（AN-010）；医疗高峰=门诊量阈值与周一效应。
          </p>
        </Panel>

        <Panel title="政策时间线（全部待核验 / 演示口径）" extra={<Tag tone="warn">待核验（演示）</Tag>}>
          <div style={{ maxHeight: 300, overflowY: "auto", paddingRight: 4 }}>
            {policyTimeline.map((p) => {
              const done = p.checklist.filter((_, i) => checks[`${p.id}:${i}`]).length;
              return (
                <div key={p.id} style={{ position: "relative", marginLeft: 6, paddingLeft: 16, paddingBottom: 12, borderLeft: "1px solid var(--panel-border)" }}>
                  <span style={{ position: "absolute", left: -4, top: 5, width: 7, height: 7, borderRadius: 999, background: "var(--violet)" }} />
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                    <span className="num" style={{ fontSize: 11, color: "var(--ink-3)" }}>{p.date}</span>
                    <b style={{ fontSize: 12, color: "var(--ink-1)" }}>{p.name}</b>
                    <Tag tone="warn">待核验（演示）</Tag>
                    <Tag tone={done === p.checklist.length ? "ok" : "muted"}>自检 {done}/{p.checklist.length}</Tag>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 4 }}>影响范围：{p.scope}</div>
                  <div style={{ fontSize: 11, color: "var(--amber)", marginTop: 2 }}>差距：{p.gap}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
                    {p.checklist.map((c, i) => (
                      <label key={i} style={{ fontSize: 11, color: "var(--ink-3)", display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={!!checks[`${p.id}:${i}`]}
                          onChange={() => setChecks((s) => ({ ...s, [`${p.id}:${i}`]: !s[`${p.id}:${i}`] }))}
                        />
                        {c}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      {/* ⑦ 中文问答演示 */}
      <Panel title="中文问答演示（预置 Q&A · 关键词匹配，未调用真实大模型）" style={{ marginTop: 10 }}
        extra={<span><BrainCircuit size={12} style={{ verticalAlign: -2 }} /> 每个回答附引用数据 / 计算过程 / 置信度 / 适用边界</span>}>
        <div className="grid cols-2">
          <div>
            <div ref={chatRef} style={{ height: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: "4px 6px 4px 0" }}>
              {chat.length === 0 && (
                <p style={{ fontSize: 12, color: "var(--ink-3)", margin: 0 }}>
                  从右侧预置问题开始，或输入含关键词的问题（如「上月碳排」「手术楼为什么高」「怎么降低」）。
                </p>
              )}
              {chat.map((m, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ alignSelf: "flex-end", maxWidth: "85%", background: "var(--cyan-dim)", border: "1px solid rgba(41,211,232,0.35)", borderRadius: "8px 8px 2px 8px", padding: "6px 10px", fontSize: 12, color: "var(--ink-1)" }}>
                    {m.q}
                  </div>
                  {m.a ? (
                    <div style={{ alignSelf: "flex-start", maxWidth: "94%", background: "rgba(10,20,40,0.6)", border: "1px solid var(--panel-border)", borderRadius: "8px 8px 8px 2px", padding: "8px 12px", fontSize: 12, color: "var(--ink-2)", display: "flex", flexDirection: "column", gap: 5 }}>
                      <b style={{ color: "var(--ink-1)" }}>{m.a.title}</b>
                      {m.a.points.map((p, j) => <span key={j}>· {p}</span>)}
                      <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                        {m.a.cites.map((c, j) => <div key={j}>{c}</div>)}
                      </div>
                      <div className="num" style={{ fontSize: 11, color: "var(--ink-3)", background: "rgba(6,13,27,0.6)", borderRadius: 4, padding: "4px 8px" }}>
                        {m.a.calc.map((c, j) => <div key={j}>{c}</div>)}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>置信度</span>
                        <div style={{ flex: "0 0 110px", height: 6, background: "rgba(56,116,178,0.2)", borderRadius: 3 }}>
                          <div style={{ width: `${m.a.confidencePct}%`, height: 6, borderRadius: 3, background: m.a.confidencePct >= 90 ? "var(--green)" : m.a.confidencePct >= 80 ? "var(--cyan)" : "var(--amber)" }} />
                        </div>
                        <span className="num" style={{ fontSize: 11 }}>{m.a.confidencePct}%</span>
                      </div>
                      <span style={{ fontSize: 11, color: "var(--ink-3)" }}>适用边界：{m.a.boundary}</span>
                      {m.a.action && (
                        <button className="pf-btn" style={{ alignSelf: "flex-start" }} onClick={() => navigate(m.a!.action!.route)}>
                          下一步：{m.a.action.label}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ alignSelf: "flex-start", maxWidth: "94%", background: "rgba(10,20,40,0.6)", border: "1px solid var(--panel-border)", borderRadius: "8px 8px 8px 2px", padding: "8px 12px", fontSize: 12, color: "var(--ink-2)" }}>
                      未命中预置问答。本演示仅支持关键词匹配，可尝试：{qaPresets.map((p) => `「${p.q}」`).join(" ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input
                className="pf-input"
                style={{ flex: 1 }}
                placeholder="输入问题，例如：上月碳排是多少？"
                value={qaInput}
                onChange={(e) => setQaInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") ask(qaInput); }}
              />
              <button className="pf-btn primary" onClick={() => ask(qaInput)}><Send size={12} /> 提问</button>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>预置问题（{qaPresets.length} 条，点击直接提问）：</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {qaPresets.map((p) => (
                <button key={p.q} className="pf-btn ghost" onClick={() => ask(p.q)}>{p.q}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", background: "rgba(10,20,40,0.5)", border: "1px solid var(--panel-border)", borderRadius: 6, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
              <b style={{ color: "var(--ink-2)" }}>能力边界声明</b>
              <span>· 问答为预置内容 + 关键词匹配，未调用任何真实 AI 服务；</span>
              <span>· 回答中的数字全部来自确定性数据层（timeseries / 种子数据），与其他模块口径一致；</span>
              <span>· 涉及手术室、ICU、医用气体的建议均为「人工确认后执行」，系统不做任何自动控制；</span>
              <span>· 减排测算基于演示因子与近 90 日基线，实施前需现场核实并制定 M&V 方案。</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
              「转为项目」说明：异常链转项目时投资按年收益 × 2.5 估算（演示口径）；生成的项目 ID 与项目库中完全一致，可跳转核对。
            </div>
          </div>
        </div>
      </Panel>
    </>
  );
}
