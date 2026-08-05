// 6.5.3 项目库管理 + 7.5 碳减排方案计算器。
// 数据：demo store projects（种子 src/data/projects.ts）；计算：src/services/calculator.ts（纯函数）。
import type { EChartsCoreOption } from "echarts";
import {
  ArrowRight, Calculator, ChevronDown, ChevronUp, Download, FolderKanban,
  Plus, Table2, Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { EChart, CHART_COLORS } from "../../components/EChart";
import { EmptyState, Kpi, Modal, PageHead, Panel, Tag } from "../../components/kit";
import { anomalyById } from "../../data/anomalies";
import { buildingById, mainBuildings } from "../../data/buildings";
import { demoAsOfDate, energyKindMeta } from "../../data/config";
import { activeFactors } from "../../data/factors";
import { projectStageMeta } from "../../data/projects";
import { canWrite } from "../../data/navigation";
import { calcFormulas, calcReduction, type CalcInput } from "../../services/calculator";
import { nextProjectStage, projectStageOrder } from "../../services/machines";
import { useDemoStore } from "../../stores/demo";
import type { BuildingId, Project, ProjectStage, SystemKind } from "../../types/core";

const PAGE_ID = "project-library";
const ELEC_PRICE = energyKindMeta.electricity.price; // 0.72 元/kWh
const GRID_FACTOR = activeFactors.electricity; // 电网因子来自 data/factors.ts（2023 年公告，已核验）

const systemNames: Record<SystemKind, string> = {
  hvac: "暖通空调", purification: "净化空调", boiler: "锅炉蒸汽", chiller: "冷站",
  water: "给排水", medgas: "医用气体", elevator: "电梯", lighting: "照明",
  medical: "医疗设备", power: "动力配电", sewage: "污水处理",
};

const sourceMeta: Record<Project["source"], { name: string; tone: "info" | "warn" | "muted" }> = {
  diagnosis: { name: "诊断", tone: "info" },
  ai: { name: "AI", tone: "warn" },
  manual: { name: "人工", tone: "muted" },
};

/** 各阶段材料清单（演示模板，与项目当前阶段联动显示状态） */
const stageMaterials: Record<ProjectStage, string[]> = {
  initiation: ["节能潜力诊断报告", "立项申请与审批单", "投资与回收期测算书", "医疗安全影响预评估"],
  design: ["方案设计与图纸", "设备选型清单", "施工组织设计", "M&V 测量与验证计划"],
  construction: ["开工报告", "关键工序影像记录", "变更洽商单", "隐蔽工程验收记录"],
  acceptance: ["竣工验收报告", "调试与性能测试记录", "计量表具核定单", "结算审计报告"],
  operation: ["运行月报", "M&V 核验报告", "节能收益分账单", "运维保养记录"],
};

const safetySystems: SystemKind[] = ["purification", "medgas", "medical"];

const sub11: React.CSSProperties = { fontSize: 11, color: "var(--ink-3)" };
const label12: React.CSSProperties = { fontSize: 12, color: "var(--ink-2)" };

function fmt(n: number, digits = 0): string {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function nextProjectId(projects: Project[]): string {
  const year = demoAsOfDate.slice(0, 4);
  let max = 0;
  for (const p of projects) {
    const m = /^PRJ-(\d{4})-(\d+)$/.exec(p.id);
    if (m && m[1] === year) max = Math.max(max, Number(m[2]));
  }
  return `PRJ-${year}-${String(max + 1).padStart(2, "0")}`;
}

/* ---------------- 计算器方案 ---------------- */

interface Scheme {
  key: string;
  name: string;
  buildingId: BuildingId;
  system: SystemKind;
  input: CalcInput;
}

const schemePresets: Scheme[] = [
  {
    key: "A", name: "净化空调非术时段 setback", buildingId: "surgical", system: "purification",
    input: { baselineMwh: 758, savingRatePct: 24, factorKgPerKwh: GRID_FACTOR, pricePerKwh: ELEC_PRICE, investmentWanYuan: 68, omWanYuanPerYear: 1.5, lifeYears: 10, discountPct: 6 },
  },
  {
    key: "B", name: "冷站群控与水泵变频", buildingId: "power", system: "chiller",
    input: { baselineMwh: 3350, savingRatePct: 18.5, factorKgPerKwh: GRID_FACTOR, pricePerKwh: ELEC_PRICE, investmentWanYuan: 210, omWanYuanPerYear: 6, lifeYears: 12, discountPct: 6 },
  },
  {
    key: "C", name: "住院楼 LED 照明改造", buildingId: "inpatientA", system: "lighting",
    input: { baselineMwh: 1030, savingRatePct: 26, factorKgPerKwh: GRID_FACTOR, pricePerKwh: ELEC_PRICE, investmentWanYuan: 96, omWanYuanPerYear: 2, lifeYears: 10, discountPct: 6 },
  },
];

const calcFields: { key: keyof CalcInput; label: string; unit: string; min: number; max: number; step: number; digits: number }[] = [
  { key: "baselineMwh", label: "基线能耗", unit: "MWh/年", min: 0, max: 5000, step: 10, digits: 0 },
  { key: "savingRatePct", label: "计划节能率", unit: "%", min: 0, max: 60, step: 0.5, digits: 1 },
  { key: "factorKgPerKwh", label: "排放因子", unit: "kgCO₂e/kWh", min: 0, max: 1.2, step: 0.0001, digits: 4 },
  { key: "pricePerKwh", label: "能源单价", unit: "元/kWh", min: 0, max: 2, step: 0.01, digits: 2 },
  { key: "investmentWanYuan", label: "投资额", unit: "万元", min: 0, max: 500, step: 1, digits: 0 },
  { key: "omWanYuanPerYear", label: "年运维成本", unit: "万元/年", min: 0, max: 50, step: 0.1, digits: 1 },
  { key: "lifeYears", label: "项目寿命", unit: "年", min: 1, max: 20, step: 1, digits: 0 },
  { key: "discountPct", label: "折现率", unit: "%", min: 0, max: 15, step: 0.5, digits: 1 },
];

/* ---------------- 子组件 ---------------- */

function StageStepper({ stage }: { stage: ProjectStage }) {
  const idx = projectStageOrder.indexOf(stage);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
      {projectStageOrder.map((s, i) => (
        <div key={s} style={{ display: "flex", alignItems: "center", gap: 4, flex: i < projectStageOrder.length - 1 ? 1 : "0 0 auto" }}>
          <span style={{
            width: 20, height: 20, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 600, flex: "0 0 auto",
            background: i < idx ? "rgba(53,211,153,0.18)" : i === idx ? "var(--cyan)" : "rgba(157,180,214,0.12)",
            color: i < idx ? "var(--green)" : i === idx ? "#04121f" : "var(--ink-3)",
            border: i === idx ? "1px solid var(--cyan)" : "1px solid transparent",
          }}>{i + 1}</span>
          <span style={{ fontSize: 11, color: i === idx ? "var(--cyan)" : i < idx ? "var(--green)" : "var(--ink-3)", whiteSpace: "nowrap" }}>
            {projectStageMeta[s]}
          </span>
          {i < projectStageOrder.length - 1 && <span style={{ flex: 1, height: 1, background: i < idx ? "rgba(53,211,153,0.4)" : "rgba(56,116,178,0.25)" }} />}
        </div>
      ))}
    </div>
  );
}

function ProjectCard({ p, writable, onDetail, onAdvance }: {
  p: Project; writable: boolean; onDetail: () => void; onAdvance: () => void;
}) {
  const next = nextProjectStage(p.stage);
  return (
    <div style={{ border: "1px solid rgba(56,116,178,0.28)", borderRadius: 8, padding: "8px 9px", background: "rgba(13,30,56,0.55)", display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ fontSize: 12, color: "var(--ink-1)", lineHeight: 1.35, cursor: "pointer" }} onClick={onDetail} title="查看详情">{p.name}</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <Tag tone={sourceMeta[p.source].tone}>{sourceMeta[p.source].name}</Tag>
        {p.isEmc && <Tag tone="ok">EMC</Tag>}
        <Tag tone="muted">{systemNames[p.system]}</Tag>
      </div>
      <div className="num" style={{ fontSize: 11, color: "var(--ink-2)" }}>
        投资 {fmt(p.investmentWanYuan)} 万 · 节省 {fmt(p.annualSavingWanYuan, 1)} 万/年 · 减碳 {fmt(p.annualCarbonReductionT)} t
      </div>
      <div style={{ ...sub11, display: "flex", justifyContent: "space-between" }}>
        <span>{p.owner}</span>
        <span className="num">回收 {p.paybackYears} 年</span>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button className="pf-btn ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={onDetail}>详情</button>
        {next && (
          <button className="pf-btn" style={{ fontSize: 11, padding: "2px 8px" }} disabled={!writable} onClick={onAdvance}
            title={writable ? `推进到「${projectStageMeta[next]}」` : "当前角色无写权限"}>
            推进 <ArrowRight size={10} style={{ verticalAlign: -1 }} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------- 页面 ---------------- */

export function ProjectLibraryPage() {
  const { role, allPermissions, projects, setProjectStage, addProject, pageFilters, setPageFilter, pushToast } = useDemoStore();
  const writable = canWrite(PAGE_ID, role, allPermissions);

  const pf = pageFilters[PAGE_ID] ?? {};
  const view = (pf.view as string) ?? "kanban";
  const fSource = (pf.source as string) ?? "all";
  const fStage = (pf.stage as string) ?? "all";
  const fSystem = (pf.system as string) ?? "all";
  const fQuery = (pf.q as string) ?? "";

  const [detailId, setDetailId] = useState<string | null>(null);
  const [schemes, setSchemes] = useState<Scheme[]>(() => schemePresets.slice(0, 2).map((s) => ({ ...s, input: { ...s.input } })));
  const [activeScheme, setActiveScheme] = useState(0);
  const [showFormulas, setShowFormulas] = useState(false);

  const filtered = useMemo(() => projects.filter((p) => {
    if (fSource !== "all" && p.source !== fSource) return false;
    if (fStage !== "all" && p.stage !== fStage) return false;
    if (fSystem !== "all" && p.system !== fSystem) return false;
    if (fQuery && ![p.id, p.name, p.owner].some((t) => t.toLowerCase().includes(fQuery.toLowerCase()))) return false;
    return true;
  }), [projects, fSource, fStage, fSystem, fQuery]);

  /* KPI 汇总（全部项目口径） */
  const totals = useMemo(() => {
    const opWithMv = projects.filter((p) => p.stage === "operation" && p.mv);
    return {
      count: projects.length,
      running: projects.filter((p) => p.stage === "operation").length,
      invest: projects.reduce((s, p) => s + p.investmentWanYuan, 0),
      savingMwh: projects.reduce((s, p) => s + p.annualSavingMwh, 0),
      savingWan: projects.reduce((s, p) => s + p.annualSavingWanYuan, 0),
      reductionT: projects.reduce((s, p) => s + p.annualCarbonReductionT, 0),
      verifiedMwh: opWithMv.reduce((s, p) => s + (p.mv?.verifiedSavingMwh ?? 0), 0),
      verifiedT: opWithMv.reduce((s, p) => s + (p.mv?.verifiedReductionT ?? 0), 0),
    };
  }, [projects]);

  /* 收益回写（运行期 + M&V 核验） */
  const writebackRows = useMemo(() => projects
    .filter((p) => p.stage === "operation" && p.mv)
    .map((p) => {
      const incomeWan = ((p.mv?.verifiedSavingMwh ?? 0) * 1000 * ELEC_PRICE) / 10000;
      const retained = p.isEmc && p.emc ? incomeWan - p.emc.sharedWanYuan : incomeWan;
      return { p, incomeWan, retained };
    }), [projects]);

  /* 统计图（随筛选联动） */
  const yearOption = useMemo<EChartsCoreOption>(() => {
    const byYear = new Map<string, { invest: number; reduction: number; count: number }>();
    for (const p of filtered) {
      const y = p.createdAt.slice(0, 4);
      const row = byYear.get(y) ?? { invest: 0, reduction: 0, count: 0 };
      row.invest += p.investmentWanYuan; row.reduction += p.annualCarbonReductionT; row.count += 1;
      byYear.set(y, row);
    }
    const years = [...byYear.keys()].sort();
    return {
      legend: { data: ["投资额", "预期年减碳"] },
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: years.map((y) => `${y} 年`) },
      yAxis: [
        { type: "value", name: "万元", nameTextStyle: { color: "#5f7799", fontSize: 10 } },
        { type: "value", name: "tCO₂e", nameTextStyle: { color: "#5f7799", fontSize: 10 }, splitLine: { show: false } },
      ],
      series: [
        { name: "投资额", type: "bar", barWidth: 26, data: years.map((y) => Math.round(byYear.get(y)!.invest)), itemStyle: { color: CHART_COLORS[0] } },
        { name: "预期年减碳", type: "line", yAxisIndex: 1, data: years.map((y) => Math.round(byYear.get(y)!.reduction)), itemStyle: { color: CHART_COLORS[1] } },
      ],
    };
  }, [filtered]);

  const systemOption = useMemo<EChartsCoreOption>(() => {
    const bySystem = new Map<string, number>();
    for (const p of filtered) bySystem.set(systemNames[p.system], (bySystem.get(systemNames[p.system]) ?? 0) + p.investmentWanYuan);
    return {
      legend: false,
      tooltip: { trigger: "item", formatter: "{b}: {c} 万元 ({d}%)" },
      series: [{
        type: "pie", radius: ["38%", "66%"], center: ["50%", "54%"],
        label: { color: "#9db4d6", fontSize: 10, formatter: "{b}\n{d}%" },
        labelLine: { lineStyle: { color: "rgba(95,119,153,0.4)" } },
        data: [...bySystem.entries()].map(([name, value]) => ({ name, value: Math.round(value * 10) / 10 })),
      }],
    };
  }, [filtered]);

  const buildingOption = useMemo<EChartsCoreOption>(() => {
    const byBuilding = new Map<BuildingId, number>();
    for (const p of filtered) {
      for (const b of p.buildingIds) byBuilding.set(b, (byBuilding.get(b) ?? 0) + p.annualCarbonReductionT / p.buildingIds.length);
    }
    const rows = [...byBuilding.entries()].sort((a, b) => a[1] - b[1]);
    return {
      legend: false,
      tooltip: { trigger: "axis", valueFormatter: (v: unknown) => `${v} tCO₂e/年` },
      grid: { left: 70 },
      xAxis: { type: "value", name: "tCO₂e/年", nameTextStyle: { color: "#5f7799", fontSize: 10 } },
      yAxis: { type: "category", data: rows.map(([b]) => buildingById[b].shortName) },
      series: [{ type: "bar", barWidth: 12, data: rows.map(([, v]) => Math.round(v)), itemStyle: { color: CHART_COLORS[1], borderRadius: [0, 4, 4, 0] } }],
    };
  }, [filtered]);

  /* 计算器 */
  const results = useMemo(() => schemes.map((s) => calcReduction(s.input)), [schemes]);
  const active = schemes[activeScheme];
  const activeResult = results[activeScheme];

  const cashflowOption = useMemo<EChartsCoreOption>(() => {
    const maxLife = Math.max(...schemes.map((s) => Math.max(1, Math.round(s.input.lifeYears))));
    return {
      legend: { data: schemes.map((s) => s.name) },
      tooltip: { trigger: "axis", valueFormatter: (v: unknown) => (v == null ? "—" : `${v} 万元`) },
      xAxis: { type: "category", data: Array.from({ length: maxLife + 1 }, (_, y) => `第${y}年`) },
      yAxis: { type: "value", name: "累计净现金流（万元）", nameTextStyle: { color: "#5f7799", fontSize: 10 } },
      series: schemes.map((s, i) => {
        const r = results[i];
        const life = Math.max(1, Math.round(s.input.lifeYears));
        const data = Array.from({ length: life + 1 }, (_, y) => Math.round((-s.input.investmentWanYuan + y * r.annualSavingWanYuan) * 10) / 10);
        return {
          name: s.name, type: "line", data, symbolSize: 4,
          lineStyle: { width: i === activeScheme ? 2.5 : 1.5 },
          ...(i === 0 ? { markLine: { silent: true, symbol: "none", lineStyle: { color: "rgba(157,180,214,0.5)", type: "dashed" }, label: { formatter: "回本线", color: "#9db4d6", fontSize: 10 }, data: [{ yAxis: 0 }] } } : {}),
        };
      }),
    };
  }, [schemes, results, activeScheme]);

  const setFilter = (patch: Record<string, string>) => setPageFilter(PAGE_ID, patch);

  const advance = (p: Project) => {
    const next = nextProjectStage(p.stage);
    if (!next) return;
    setProjectStage(p.id, next);
    pushToast("阶段已推进", `${p.id}：${projectStageMeta[p.stage]} → ${projectStageMeta[next]}`, "success");
  };

  const updateScheme = (patch: Partial<Scheme>) =>
    setSchemes((list) => list.map((s, i) => (i === activeScheme ? { ...s, ...patch } : s)));
  const updateInput = (key: keyof CalcInput, value: number) =>
    setSchemes((list) => list.map((s, i) => (i === activeScheme ? { ...s, input: { ...s.input, [key]: Number.isFinite(value) ? value : 0 } } : s)));

  const addScheme = () => {
    if (schemes.length >= 3) return;
    const preset = schemePresets[schemes.length % schemePresets.length];
    const key = ["A", "B", "C"].find((k) => !schemes.some((s) => s.key === k)) ?? "C";
    setSchemes((list) => [...list, { ...preset, key, input: { ...preset.input } }]);
    setActiveScheme(schemes.length);
  };
  const removeScheme = (idx: number) => {
    if (schemes.length <= 1) return;
    setSchemes((list) => list.filter((_, i) => i !== idx));
    setActiveScheme((cur) => Math.max(0, cur > idx ? cur - 1 : Math.min(cur, schemes.length - 2)));
  };

  const generateProject = (idx: number) => {
    const s = schemes[idx];
    const r = results[idx];
    if (r.paybackYears === null) {
      pushToast("无法生成项目", "年净节省 ≤ 0（不可回收），请调整节能率、单价或运维成本", "warning");
      return;
    }
    const id = nextProjectId(projects);
    addProject({
      id, name: s.name, source: "manual", buildingIds: [s.buildingId], system: s.system,
      stage: "initiation", owner: "当前用户（演示）",
      investmentWanYuan: s.input.investmentWanYuan,
      annualSavingMwh: r.annualSavingMwh,
      annualSavingWanYuan: r.annualSavingWanYuan,
      annualCarbonReductionT: r.annualReductionT,
      paybackYears: r.paybackYears,
      createdAt: demoAsOfDate,
      calcParams: {
        baselineMwh: s.input.baselineMwh, savingRatePct: s.input.savingRatePct,
        factor: s.input.factorKgPerKwh, price: s.input.pricePerKwh,
        investment: s.input.investmentWanYuan, omCost: s.input.omWanYuanPerYear,
        lifeYears: s.input.lifeYears, discountPct: s.input.discountPct,
      },
    });
    pushToast("项目已生成", `${id} 已进入项目库「立项」阶段，计算参数已随项目保存`, "success");
  };

  const exportProjects = async () => {
    const { downloadWorkbook } = await import("../../utils/downloads");
    downloadWorkbook({
      项目清单: filtered.map((p) => ({
        编号: p.id, 名称: p.name, 来源: sourceMeta[p.source].name,
        楼宇: p.buildingIds.map((b) => buildingById[b].name).join("、"),
        系统: systemNames[p.system], 阶段: projectStageMeta[p.stage], 负责人: p.owner,
        "投资(万元)": p.investmentWanYuan, "预期年节能(MWh)": p.annualSavingMwh,
        "预期年节省(万元)": p.annualSavingWanYuan, "预期年减碳(t)": p.annualCarbonReductionT,
        "回收期(年)": p.paybackYears, EMC: p.isEmc ? "是" : "否", 创建日期: p.createdAt,
      })),
      收益回写: writebackRows.map(({ p, incomeWan, retained }) => ({
        编号: p.id, 名称: p.name, "核验节能(MWh)": p.mv?.verifiedSavingMwh ?? 0,
        "核验减碳(t)": p.mv?.verifiedReductionT ?? 0, "折算收益(万元)": Math.round(incomeWan * 10) / 10,
        "医院留存(万元)": Math.round(retained * 10) / 10, 核验方法: p.mv?.method ?? "",
      })),
    }, `项目库_${demoAsOfDate}.xlsx`);
    pushToast("导出完成", `已导出 ${filtered.length} 个项目（与当前筛选一致）`, "success");
  };

  const detail = detailId ? projects.find((p) => p.id === detailId) : undefined;

  return (
    <>
      <PageHead
        title="项目库管理"
        sub={`节能/减碳项目全生命周期 · M&V 核验 · EMC 合同 · 共 ${projects.length} 个项目`}
        actions={
          <>
            <button className={`pf-btn ${view === "kanban" ? "primary" : "ghost"}`} onClick={() => setFilter({ view: "kanban" })}>
              <FolderKanban size={13} style={{ verticalAlign: -2, marginRight: 4 }} />阶段看板
            </button>
            <button className={`pf-btn ${view === "table" ? "primary" : "ghost"}`} onClick={() => setFilter({ view: "table" })}>
              <Table2 size={13} style={{ verticalAlign: -2, marginRight: 4 }} />表格
            </button>
            <button className="pf-btn" onClick={exportProjects}>
              <Download size={13} style={{ verticalAlign: -2, marginRight: 4 }} />导出 Excel
            </button>
          </>
        }
      />

      {/* KPI 概览 */}
      <div className="grid cols-6">
        <Kpi label="项目总数" value={totals.count} unit="个" sub={<span>运行期 {totals.running} 个 · 筛选后 {filtered.length} 个</span>} />
        <Kpi label="总投资" value={fmt(totals.invest)} unit="万元" tone="cyan" sub={<span>全部阶段合计</span>} />
        <Kpi label="预期年节能" value={fmt(totals.savingMwh)} unit="MWh" sub={<span>电力当量口径</span>} />
        <Kpi label="预期年节省" value={fmt(totals.savingWan, 1)} unit="万元" sub={<span>已扣年运维成本</span>} />
        <Kpi label="预期年减碳" value={fmt(totals.reductionT)} unit="tCO₂e" tone="green" sub={<span>全部项目合计</span>} />
        <Kpi label="已核验节能" value={fmt(totals.verifiedMwh)} unit="MWh" tone="green"
          sub={<span><Tag tone="ok">已回写领导舱收益</Tag></span>} />
      </div>

      {/* 筛选行 */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "10px 0" }}>
        <select className="pf-select" value={fSource} onChange={(e) => setFilter({ source: e.target.value })}>
          <option value="all">全部来源</option>
          <option value="diagnosis">诊断</option>
          <option value="ai">AI</option>
          <option value="manual">人工</option>
        </select>
        <select className="pf-select" value={fStage} onChange={(e) => setFilter({ stage: e.target.value })}>
          <option value="all">全部阶段</option>
          {projectStageOrder.map((s) => <option key={s} value={s}>{projectStageMeta[s]}</option>)}
        </select>
        <select className="pf-select" value={fSystem} onChange={(e) => setFilter({ system: e.target.value })}>
          <option value="all">全部系统</option>
          {[...new Set(projects.map((p) => p.system))].map((s) => <option key={s} value={s}>{systemNames[s]}</option>)}
        </select>
        <input className="pf-input" style={{ width: 200 }} placeholder="搜索编号 / 名称 / 负责人"
          value={fQuery} onChange={(e) => setFilter({ q: e.target.value })} />
        <span style={sub11}>筛选条件已持久化；统计图与导出随筛选联动</span>
      </div>

      {/* 项目列表：看板 / 表格 */}
      {filtered.length === 0 ? (
        <Panel title="项目列表"><EmptyState text="当前筛选无匹配项目，请调整筛选条件" /></Panel>
      ) : view === "kanban" ? (
        <div className="grid cols-5">
          {projectStageOrder.map((stage) => {
            const list = filtered.filter((p) => p.stage === stage);
            return (
              <Panel key={stage} title={projectStageMeta[stage]} extra={<Tag tone={list.length ? "info" : "muted"}>{list.length} 个</Tag>}>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 60 }}>
                  {list.length === 0
                    ? <span style={{ ...sub11, textAlign: "center", padding: "16px 0" }}>本阶段暂无项目</span>
                    : list.map((p) => (
                      <ProjectCard key={p.id} p={p} writable={writable}
                        onDetail={() => setDetailId(p.id)} onAdvance={() => advance(p)} />
                    ))}
                </div>
              </Panel>
            );
          })}
        </div>
      ) : (
        <Panel title="项目列表（表格）" extra={<span style={sub11}>点击行查看详情</span>}>
          <div style={{ overflowX: "auto" }}>
            <table className="pf-table">
              <thead>
                <tr>
                  <th>编号</th><th>名称</th><th>来源</th><th>楼宇范围</th><th>系统</th>
                  <th>投资(万)</th><th>年节能(MWh)</th><th>年减碳(t)</th><th>回收期(年)</th>
                  <th>负责人</th><th>阶段</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const next = nextProjectStage(p.stage);
                  return (
                    <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => setDetailId(p.id)}>
                      <td className="num">{p.id}</td>
                      <td style={{ color: "var(--ink-1)" }}>{p.name}{p.isEmc && <Tag tone="ok">EMC</Tag>}</td>
                      <td><Tag tone={sourceMeta[p.source].tone}>{sourceMeta[p.source].name}</Tag></td>
                      <td>{p.buildingIds.map((b) => buildingById[b].shortName).join("、")}</td>
                      <td>{systemNames[p.system]}</td>
                      <td className="num">{fmt(p.investmentWanYuan)}</td>
                      <td className="num">{fmt(p.annualSavingMwh)}</td>
                      <td className="num">{fmt(p.annualCarbonReductionT)}</td>
                      <td className="num">{p.paybackYears}</td>
                      <td>{p.owner}</td>
                      <td><Tag tone={p.stage === "operation" ? "ok" : "info"}>{projectStageMeta[p.stage]}</Tag></td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="pf-btn ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={() => setDetailId(p.id)}>详情</button>
                          {next && (
                            <button className="pf-btn" style={{ fontSize: 11, padding: "2px 8px" }} disabled={!writable} onClick={() => advance(p)}>
                              推进→{projectStageMeta[next]}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* 统计区 + 收益回写 */}
      <div className="grid cols-4" style={{ marginTop: 10 }}>
        <Panel title="年度统计" extra={<span style={sub11}>投资（万元）/ 预期减碳（tCO₂e）</span>}>
          {filtered.length ? <EChart height={210} option={yearOption} /> : <EmptyState />}
        </Panel>
        <Panel title="类型统计" extra={<span style={sub11}>按系统 · 投资额（万元）</span>}>
          {filtered.length ? <EChart height={210} option={systemOption} /> : <EmptyState />}
        </Panel>
        <Panel title="楼宇统计" extra={<span style={sub11}>预期年减碳（多楼宇均摊）</span>}>
          {filtered.length ? <EChart height={210} option={buildingOption} /> : <EmptyState />}
        </Panel>
        <Panel title="收益回写" extra={<Tag tone="ok">已回写领导舱收益</Tag>}>
          {writebackRows.length === 0 ? <EmptyState text="暂无运行期核验项目" /> : (
            <>
              <table className="pf-table">
                <thead><tr><th>运行期项目</th><th>核验节能</th><th>折算收益</th><th>医院留存</th></tr></thead>
                <tbody>
                  {writebackRows.map(({ p, incomeWan, retained }) => (
                    <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => setDetailId(p.id)}>
                      <td title={p.name}>{p.id}{p.isEmc && <Tag tone="ok">EMC</Tag>}</td>
                      <td className="num">{fmt(p.mv?.verifiedSavingMwh ?? 0)} MWh</td>
                      <td className="num">{fmt(incomeWan, 1)} 万</td>
                      <td className="num">{fmt(retained, 1)} 万</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ color: "var(--ink-1)" }}>合计</td>
                    <td className="num">{fmt(totals.verifiedMwh)} MWh</td>
                    <td className="num">{fmt(writebackRows.reduce((s, r) => s + r.incomeWan, 0), 1)} 万</td>
                    <td className="num">{fmt(writebackRows.reduce((s, r) => s + r.retained, 0), 1)} 万</td>
                  </tr>
                </tbody>
              </table>
              <p style={{ ...sub11, marginTop: 6 }}>
                口径：M&V 核验节能 × 电价 {ELEC_PRICE} 元/kWh；EMC 项目扣除投资方分享后为医院留存。年核验减碳合计 {fmt(totals.verifiedT)} tCO₂e。
              </p>
            </>
          )}
        </Panel>
      </div>

      {/* 减排方案计算器 */}
      <Panel
        title="碳减排方案计算器"
        className="fadeup"
        style={{ marginTop: 10 }}
        extra={
          <>
            <Tag tone="warn">Demo 估算</Tag>
            {schemes.map((s, i) => (
              <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                <button className={`pf-btn ${i === activeScheme ? "primary" : "ghost"}`} style={{ fontSize: 11, padding: "2px 10px" }}
                  onClick={() => setActiveScheme(i)}>方案 {s.key}</button>
                {schemes.length > 1 && (
                  <button className="pf-btn ghost" style={{ fontSize: 11, padding: "2px 4px" }} title={`移除方案 ${s.key}`}
                    onClick={() => removeScheme(i)}><Trash2 size={11} /></button>
                )}
              </span>
            ))}
            {schemes.length < 3 && (
              <button className="pf-btn ghost" style={{ fontSize: 11, padding: "2px 8px" }} onClick={addScheme}>
                <Plus size={11} style={{ verticalAlign: -1 }} /> 添加方案
              </button>
            )}
          </>
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 360px) 1fr", gap: 14 }}>
          {/* 左：参数输入 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6 }}>
              <input className="pf-input" value={active.name} placeholder="方案名称"
                onChange={(e) => updateScheme({ name: e.target.value })} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <select className="pf-select" value={active.buildingId}
                  onChange={(e) => updateScheme({ buildingId: e.target.value as BuildingId })}>
                  {mainBuildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select className="pf-select" value={active.system}
                  onChange={(e) => updateScheme({ system: e.target.value as SystemKind })}>
                  {(Object.keys(systemNames) as SystemKind[]).map((s) => <option key={s} value={s}>{systemNames[s]}</option>)}
                </select>
              </div>
            </div>
            {calcFields.map((f) => (
              <div key={f.key} style={{ display: "grid", gridTemplateColumns: "88px 1fr 96px", gap: 8, alignItems: "center" }}>
                <span style={label12} title={`${f.min} ~ ${f.max} ${f.unit}`}>{f.label}<br /><span style={sub11}>{f.unit}</span></span>
                <input type="range" min={f.min} max={f.max} step={f.step} value={active.input[f.key]}
                  style={{ width: "100%", accentColor: "var(--cyan)" }}
                  onChange={(e) => updateInput(f.key, Number(e.target.value))} />
                <input className="pf-input num" type="number" min={f.min} max={f.max} step={f.step}
                  value={active.input[f.key]}
                  onChange={(e) => updateInput(f.key, e.target.value === "" ? 0 : Number(e.target.value))} />
              </div>
            ))}
            <p style={sub11}>
              基线碳排 ≈ <b className="num" style={{ color: "var(--ink-2)" }}>{fmt(active.input.baselineMwh * active.input.factorKgPerKwh)}</b> tCO₂e/年（基线能耗 × 因子推算）。
              默认电网因子 {GRID_FACTOR} kgCO₂e/kWh <Tag tone="warn">待标准确认（演示）</Tag>
            </p>
          </div>

          {/* 右：实时结果 + 对比图 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
            <div className="grid cols-3">
              <Kpi label="年节能量" value={fmt(activeResult.annualSavingMwh, 1)} unit="MWh" tone="cyan" sub={<span>方案 {active.key} 实时结果</span>} />
              <Kpi label="年节省费用" value={fmt(activeResult.annualSavingWanYuan, 1)} unit="万元" sub={<span>已扣年运维成本</span>} />
              <Kpi label="年减碳量" value={fmt(activeResult.annualReductionT, 1)} unit="tCO₂e" tone="green" sub={<span>按输入因子折算</span>} />
              <Kpi label="静态回收期"
                value={activeResult.paybackYears === null ? "不可回收" : fmt(activeResult.paybackYears, 1)}
                unit={activeResult.paybackYears === null ? undefined : "年"}
                tone={activeResult.paybackYears === null ? "red" : activeResult.paybackYears <= 5 ? "green" : "amber"}
                sub={<span>{activeResult.paybackYears === null ? "年净节省 ≤ 0" : "投资 ÷ 年净节省"}</span>} />
              <Kpi label="3 年累计净收益" value={fmt(activeResult.net3yWanYuan, 1)} unit="万元"
                tone={activeResult.net3yWanYuan >= 0 ? "green" : "amber"} sub={<span>不折现</span>} />
              <Kpi label={`NPV（${Math.round(active.input.lifeYears)} 年期）`} value={fmt(activeResult.npvWanYuan, 1)} unit="万元"
                tone={activeResult.npvWanYuan >= 0 ? "green" : "amber"}
                sub={<span>折现率 {active.input.discountPct}%</span>} />
            </div>
            <EChart height={220} option={cashflowOption} />

            {/* 方案对比表 */}
            <div style={{ overflowX: "auto" }}>
              <table className="pf-table">
                <thead>
                  <tr>
                    <th>指标</th>
                    {schemes.map((s, i) => (
                      <th key={s.key} style={i === activeScheme ? { color: "var(--cyan)" } : undefined}>
                        方案 {s.key} · {s.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {([
                    ["年节能量 (MWh)", (i: number) => fmt(results[i].annualSavingMwh, 1)],
                    ["年节省费用 (万元)", (i: number) => fmt(results[i].annualSavingWanYuan, 1)],
                    ["年减碳量 (tCO₂e)", (i: number) => fmt(results[i].annualReductionT, 1)],
                    ["静态回收期 (年)", (i: number) => results[i].paybackYears === null ? "不可回收" : fmt(results[i].paybackYears ?? 0, 1)],
                    ["3 年累计净收益 (万元)", (i: number) => fmt(results[i].net3yWanYuan, 1)],
                    ["NPV (万元)", (i: number) => fmt(results[i].npvWanYuan, 1)],
                    ["全寿命净收益 (万元)", (i: number) => fmt(results[i].lifetimeNetWanYuan, 1)],
                  ] as [string, (i: number) => string][]).map(([label, cell]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      {schemes.map((s, i) => (
                        <td key={s.key} className="num" style={i === activeScheme ? { color: "var(--ink-1)" } : undefined}>{cell(i)}</td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td>操作</td>
                    {schemes.map((s, i) => (
                      <td key={s.key}>
                        <button className="pf-btn primary" style={{ fontSize: 11, padding: "3px 10px" }}
                          disabled={!writable || results[i].paybackYears === null}
                          title={!writable ? "当前角色无写权限" : results[i].paybackYears === null ? "净节省 ≤ 0，不可生成" : "生成项目并携带计算参数"}
                          onClick={() => generateProject(i)}>
                          <Calculator size={11} style={{ verticalAlign: -1, marginRight: 3 }} />生成项目
                        </button>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 公式与假设 */}
            <div>
              <button className="pf-btn ghost" style={{ fontSize: 11 }} onClick={() => setShowFormulas((v) => !v)}>
                {showFormulas ? <ChevronUp size={12} style={{ verticalAlign: -2 }} /> : <ChevronDown size={12} style={{ verticalAlign: -2 }} />}
                公式与假设 <Tag tone="warn">Demo 估算</Tag>
              </button>
              {showFormulas && (
                <div style={{ marginTop: 6, padding: "8px 12px", border: "1px solid rgba(56,116,178,0.25)", borderRadius: 8, background: "rgba(13,30,56,0.4)" }}>
                  <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.9 }}>
                    {calcFormulas.map((f) => <li key={f} className="num">{f}</li>)}
                  </ol>
                  <p style={{ ...sub11, marginTop: 6, marginBottom: 0 }}>
                    假设：默认电价 {ELEC_PRICE} 元/kWh、电网因子 {GRID_FACTOR} kgCO₂e/kWh（待标准确认（演示））；静态回收期不计折现；
                    节能率恒定、不考虑设备衰减与电价波动。所有结果为 Demo 估算，不作为投资决策依据。
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </Panel>

      {/* 建设路线图 */}
      <Panel title="建设路线图" style={{ marginTop: 10 }} extra={<><Tag tone="info">产品建设计划</Tag><span style={sub11}>本 Demo 已演示三阶段核心能力</span></>}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 24px 1fr 24px 1fr", gap: 8, alignItems: "stretch" }}>
          {[
            {
              phase: "第一阶段 · 数据底座与监测", period: "0-6 个月",
              items: ["全院表计接入与五维分项计量", "能耗实时监测与七类告警", "数据质量治理与完整率考核", "楼宇/科室/系统分摊模型"],
            },
            {
              phase: "第二阶段 · 碳核算与诊断", period: "6-12 个月",
              items: ["组织级碳核算五步流程", "排放因子库与版本管理", "能效诊断、三线对标与根因分析", "M&V 节能核验（IPMVP 简化）"],
            },
            {
              phase: "第三阶段 · 闭环管理与 AI", period: "12-18 个月",
              items: ["诊断→工单→项目→核验业务闭环", "AI 预测、减排路径与决策建议", "EMC / 内部碳预算情景管理", "领导/后勤双驾驶舱决策支持"],
            },
          ].map((step, i, arr) => (
            [
              <div key={step.phase} style={{ border: "1px solid rgba(56,116,178,0.28)", borderRadius: 8, padding: "10px 12px", background: "rgba(13,30,56,0.45)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <b style={{ fontSize: 12, color: "var(--cyan)" }}>{step.phase}</b>
                  <Tag tone="muted">{step.period}</Tag>
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.9 }}>
                  {step.items.map((it) => <li key={it}>{it}</li>)}
                </ul>
              </div>,
              i < arr.length - 1
                ? <div key={`${step.phase}-arrow`} style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-3)" }}><ArrowRight size={16} /></div>
                : null,
            ]
          ))}
        </div>
      </Panel>

      {/* 项目详情 Modal */}
      {detail && (
        <Modal title={`${detail.id} · ${detail.name}`} width={880} onClose={() => setDetailId(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "72vh", overflowY: "auto" }}>
            {/* 基础信息 */}
            <div className="grid cols-4" style={{ gap: 8 }}>
              {([
                ["来源", <><Tag tone={sourceMeta[detail.source].tone}>{sourceMeta[detail.source].name}</Tag>{(detail.source === "ai" || detail.source === "diagnosis") && <Tag tone="warn">模拟诊断</Tag>}</>],
                ["系统", systemNames[detail.system]],
                ["楼宇范围", detail.buildingIds.map((b) => buildingById[b].name).join("、")],
                ["负责人", detail.owner],
                ["投资额", `${fmt(detail.investmentWanYuan)} 万元`],
                ["预期年节能 / 节省", `${fmt(detail.annualSavingMwh)} MWh / ${fmt(detail.annualSavingWanYuan, 1)} 万元`],
                ["预期年减碳 / 回收期", `${fmt(detail.annualCarbonReductionT)} t / ${detail.paybackYears} 年`],
                ["创建 / 关联", <span key="rel">{detail.createdAt}{detail.workOrderId ? ` · ${detail.workOrderId}` : ""}{detail.anomalyId ? ` · ${detail.anomalyId}` : ""}</span>],
              ] as [string, React.ReactNode][]).map(([k, v]) => (
                <div key={k}>
                  <div style={sub11}>{k}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-1)", marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>

            {/* 阶段进度 + 推进 */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1px solid rgba(56,116,178,0.25)", borderRadius: 8 }}>
              <StageStepper stage={detail.stage} />
              {nextProjectStage(detail.stage) ? (
                <button className="pf-btn primary" style={{ flex: "0 0 auto" }} disabled={!writable}
                  title={writable ? undefined : "当前角色无写权限"}
                  onClick={() => advance(detail)}>
                  推进到「{projectStageMeta[nextProjectStage(detail.stage)!]}」
                </button>
              ) : <Tag tone="ok">已投运</Tag>}
            </div>
            <p style={{ ...sub11, margin: "-6px 0 0" }}>
              人工确认：阶段推进、验收与核验均为人工操作，AI 仅提供建议，不自动下发任何控制。
              {(safetySystems.includes(detail.system)) && <Tag tone="warn">不影响医疗安全 · 保障优先</Tag>}
            </p>

            {/* 各阶段材料清单 */}
            <div>
              <div style={{ ...label12, marginBottom: 6 }}>各阶段材料清单（演示）</div>
              <div className="grid cols-5" style={{ gap: 8 }}>
                {projectStageOrder.map((s, i) => {
                  const cur = projectStageOrder.indexOf(detail.stage);
                  const tone = i < cur ? "ok" : i === cur ? "info" : "muted";
                  const status = i < cur ? "已归档" : i === cur ? "进行中" : "未开始";
                  return (
                    <div key={s} style={{ border: "1px solid rgba(56,116,178,0.22)", borderRadius: 8, padding: "8px 9px", opacity: i > cur ? 0.65 : 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <b style={{ fontSize: 11, color: "var(--ink-1)" }}>{projectStageMeta[s]}</b>
                        <Tag tone={tone}>{status}</Tag>
                      </div>
                      <ul style={{ margin: 0, paddingLeft: 14, fontSize: 11, color: "var(--ink-2)", lineHeight: 1.8 }}>
                        {stageMaterials[s].map((m) => <li key={m}>{m}</li>)}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* M&V + EMC */}
            <div className="grid cols-2" style={{ gap: 8 }}>
              <div style={{ border: "1px solid rgba(56,116,178,0.22)", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <b style={{ fontSize: 12, color: "var(--ink-1)" }}>M&V 节能核验</b>
                  {detail.mv && <Tag tone="info">{detail.mv.method}</Tag>}
                </div>
                {detail.mv ? (
                  <table className="pf-table">
                    <tbody>
                      <tr><td style={{ width: 92 }}>改造前基线</td><td>{detail.mv.baseline}</td></tr>
                      <tr><td>修正方式</td><td>{detail.mv.adjusted}</td></tr>
                      <tr><td>核验节能</td><td className="num">{fmt(detail.mv.verifiedSavingMwh)} MWh（预期 {fmt(detail.annualSavingMwh)}，达成 {detail.annualSavingMwh > 0 ? fmt((detail.mv.verifiedSavingMwh / detail.annualSavingMwh) * 100) : "—"}%）</td></tr>
                      <tr><td>核验减碳</td><td className="num">{fmt(detail.mv.verifiedReductionT)} tCO₂e</td></tr>
                    </tbody>
                  </table>
                ) : <EmptyState text="项目进入运行期并完成核验后生成 M&V 结果" />}
              </div>
              <div style={{ border: "1px solid rgba(56,116,178,0.22)", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <b style={{ fontSize: 12, color: "var(--ink-1)" }}>EMC 合同能源管理</b>
                  {detail.isEmc && <Tag tone="ok">EMC 项目</Tag>}
                </div>
                {detail.isEmc && detail.emc ? (
                  <table className="pf-table">
                    <tbody>
                      <tr><td style={{ width: 92 }}>投资方</td><td>{detail.emc.investor}</td></tr>
                      <tr><td>分享比例</td><td className="num">投资方 {detail.emc.sharePct}% / 医院 {100 - detail.emc.sharePct}%</td></tr>
                      <tr><td>合同期</td><td className="num">{detail.emc.contractYears} 年</td></tr>
                      <tr><td>实际分享金额</td><td className="num">{fmt(detail.emc.sharedWanYuan, 1)} 万元/年（医院留存约 {fmt(detail.annualSavingWanYuan - detail.emc.sharedWanYuan, 1)} 万元/年）</td></tr>
                    </tbody>
                  </table>
                ) : <EmptyState text="非 EMC 项目（医院自投资）" />}
              </div>
            </div>

            {/* 诊断/AI 证据 */}
            {detail.anomalyId && anomalyById[detail.anomalyId] && (() => {
              const an = anomalyById[detail.anomalyId!];
              return (
                <div style={{ border: "1px solid rgba(56,116,178,0.22)", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <b style={{ fontSize: 12, color: "var(--ink-1)" }}>关联异常与 AI 证据（{an.id}）</b>
                    <Tag tone="warn">模拟诊断</Tag>
                    <Tag tone="info">置信度 {an.aiConfidencePct}%</Tag>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "0 0 4px" }}>根因：{an.rootCause}</p>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: "var(--ink-2)", lineHeight: 1.8 }}>
                    {an.evidence.map((e) => <li key={e}>{e}</li>)}
                  </ul>
                  {an.medicalSafetyNote && <p style={{ ...sub11, marginTop: 6 }}><Tag tone="warn">保障优先</Tag> {an.medicalSafetyNote}</p>}
                </div>
              );
            })()}

            {/* 计算参数 */}
            {detail.calcParams && (
              <p className="num" style={{ ...sub11, margin: 0 }}>
                计算参数（来自减排计算器 · Demo 估算）：
                {Object.entries(detail.calcParams).map(([k, v]) => `${k}=${v}`).join("，")}
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
