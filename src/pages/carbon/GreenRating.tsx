// 绿色低碳医院评价（moduleId: green-rating）
// L1/L2/L3 三层递进评价 + 创新加分 + 六维雷达 + 单位面积/床日碳排三线对标。
// 全部阈值为演示参数（待标准确认）；判定只用"演示达标/演示未达标"，不出合规结论。
import dayjs from "dayjs";
import type { EChartsCoreOption } from "echarts";
import { Download, RotateCcw } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { EChart } from "../../components/EChart";
import { Kpi, Modal, PageHead, Panel, Tag } from "../../components/kit";
import { mainBuildings } from "../../data/buildings";
import { demoAsOfDate } from "../../data/config";
import {
  benchmarkFor,
  climateZones,
  dimensions,
  docParamDefaults,
  hospitalLevels,
  ratingItems,
  ratingOf,
  stateMeta,
  tierMeta,
  tierOrder,
  type BenchmarkTriple,
  type ClimateZoneId,
  type HospitalLevelId,
  type ItemState,
  type RatingItemDef,
  type RatingTier,
} from "../../data/modules/green-rating";
import { canWrite } from "../../data/navigation";
import { bedOccupancy, monthlyCarbonSeries, sumUsage, toTce } from "../../services/timeseries";
import { useDemoStore } from "../../stores/demo";
import { useGreenRatingStore } from "../../stores/green-rating";
import type { BuildingId, EnergyKind } from "../../types/core";

const PAGE_ID = "green-rating";

// 评价期：演示基准日的上一个完整自然年
const evalYear = dayjs(demoAsOfDate).year() - 1;
const evalFrom = `${evalYear}-01-01`;
const evalTo = `${evalYear}-12-31`;

/** 床日耗水口径：住院相关楼宇（住院 A/B、手术医技、急诊） */
const bedWaterBuildings: BuildingId[] = ["inpatientA", "inpatientB", "surgical", "emergency"];

const nextState: Record<ItemState, ItemState> = { met: "partial", partial: "unmet", unmet: "met" };

const fmt = (n: number, d = 1) => n.toLocaleString("zh-CN", { maximumFractionDigits: d });
const round1 = (n: number) => Math.round(n * 10) / 10;

const smallBtn: CSSProperties = { padding: "2px 8px", fontSize: 11 };
const linkBtn: CSSProperties = {
  background: "none", border: "none", color: "var(--cyan)", cursor: "pointer",
  padding: 0, fontSize: 12, textAlign: "left",
};
const noteStyle: CSSProperties = { margin: "8px 0 0", fontSize: 11, color: "var(--ink-3)", lineHeight: 1.6 };

function verdictOf(value: number, b: BenchmarkTriple): { label: string; tone: "ok" | "warn" | "danger" } {
  if (value <= b.advanced) return { label: "达到先进值（演示）", tone: "ok" };
  if (value <= b.average) return { label: "优于平均值（演示）", tone: "ok" };
  if (value <= b.constraint) return { label: "介于平均与约束（演示）", tone: "warn" };
  return { label: "超出约束值（演示）", tone: "danger" };
}

function benchOption(unit: string, value: number, b: BenchmarkTriple): EChartsCoreOption {
  const bars = [
    { name: "先进值", value: b.advanced, color: "#35d399" },
    { name: "平均值", value: b.average, color: "#4da3ff" },
    { name: "约束值", value: b.constraint, color: "#f5a524" },
    { name: "本院测算", value: round1(value), color: "#29d3e8" },
  ];
  return {
    legend: false,
    grid: { left: 46, right: 12, top: 30, bottom: 22 },
    xAxis: { type: "category", data: bars.map((d) => d.name) },
    yAxis: { type: "value", name: unit, nameTextStyle: { color: "#5f7799", fontSize: 10, align: "left" } },
    series: [
      {
        type: "bar",
        barWidth: 24,
        data: bars.map((d, i) => ({
          value: d.value,
          itemStyle: { color: d.color, opacity: i === 3 ? 1 : 0.8, borderRadius: [3, 3, 0, 0] },
        })),
        label: { show: true, position: "top", color: "#9db4d6", fontSize: 10 },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: "rgba(245,165,36,0.55)", type: "dashed" },
          label: { show: true, position: "insideEndTop", color: "#f5a524", fontSize: 9, formatter: "约束值（演示）" },
          data: [{ yAxis: b.constraint }],
        },
      },
    ],
  };
}

const tierTone = (rate: number): "green" | "cyan" | "amber" => (rate >= 80 ? "green" : rate >= 60 ? "cyan" : "amber");

export function GreenRatingPage() {
  const { role, allPermissions, projects, pageFilters, setPageFilter, pushToast } = useDemoStore();
  const { overrides, setItemState, clearOverride, resetOverrides } = useGreenRatingStore();
  const [detailId, setDetailId] = useState<string | null>(null);

  const writable = canWrite(PAGE_ID, role, allPermissions);
  const filters = pageFilters[PAGE_ID] ?? {};
  const level: HospitalLevelId = hospitalLevels.some((l) => l.id === filters.level) ? (filters.level as HospitalLevelId) : "tier3";
  const zone: ClimateZoneId = climateZones.some((z) => z.id === filters.zone) ? (filters.zone as ClimateZoneId) : "cold";
  const tab: RatingTier = tierOrder.some((t) => t === filters.tab) ? (filters.tab as RatingTier) : "L1";
  const pAreaEnergy = typeof filters.pAreaEnergy === "number" ? filters.pAreaEnergy : docParamDefaults.areaEnergy;
  const pBedWater = typeof filters.pBedWater === "number" ? filters.pBedWater : docParamDefaults.bedWater;
  const pAreaCarbon = typeof filters.pAreaCarbon === "number" ? filters.pAreaCarbon : docParamDefaults.areaCarbon;

  const levelName = hospitalLevels.find((l) => l.id === level)?.name ?? level;
  const zoneName = climateZones.find((z) => z.id === zone)?.name ?? zone;

  // 评价期强度指标：全部由数据层测算（确定性）
  const metrics = useMemo(() => {
    const kinds: EnergyKind[] = ["electricity", "water", "gas", "heat", "medgas"];
    const totalTce = kinds.reduce((s, k) => s + toTce(k, sumUsage(k, evalFrom, evalTo)), 0);
    const areaM2 = mainBuildings.reduce((s, b) => s + b.areaM2, 0);
    const beds = mainBuildings.reduce((s, b) => s + b.beds, 0);
    let bedDays = 0;
    let d = dayjs(evalFrom);
    const end = dayjs(evalTo);
    while (!d.isAfter(end)) {
      bedDays += (beds * bedOccupancy(d.format("YYYY-MM-DD"))) / 100;
      d = d.add(1, "day");
    }
    const inpatientWaterM3 = bedWaterBuildings.reduce((s, id) => s + sumUsage("water", evalFrom, evalTo, id), 0);
    const carbonT = monthlyCarbonSeries(`${evalYear}-01`, `${evalYear}-12`).reduce((s, p) => s + p.v, 0);
    return {
      areaM2,
      beds,
      bedDays: Math.round(bedDays),
      totalTce: Math.round(totalTce),
      carbonT: Math.round(carbonT),
      areaEnergyKgce: (totalTce * 1000) / areaM2,
      bedWaterL: (inpatientWaterM3 * 1000) / bedDays,
      areaCarbonKg: (carbonT * 1000) / areaM2,
      bedCarbonKg: (carbonT * 1000) / bedDays,
    };
  }, []);

  const bench = useMemo(() => benchmarkFor(level, zone), [level, zone]);

  const projectCount = projects.length;
  const projectReductionT = Math.round(projects.reduce((s, p) => s + p.annualCarbonReductionT, 0));

  // 每条评价项：计算判定 + 人工切换（override）+ 动态现状/要求文案
  const rows = useMemo(() => {
    const computedOf = (item: RatingItemDef): ItemState => {
      switch (item.metric) {
        case "areaEnergy": return metrics.areaEnergyKgce <= pAreaEnergy ? "met" : "unmet";
        case "bedWater": return metrics.bedWaterL <= pBedWater ? "met" : "unmet";
        case "areaCarbon": return metrics.areaCarbonKg <= pAreaCarbon ? "met" : "unmet";
        case "bedCarbon":
          if (metrics.bedCarbonKg <= bench.bedCarbon.advanced) return "met";
          if (metrics.bedCarbonKg <= bench.bedCarbon.average) return "partial";
          return "unmet";
        default: return item.defaultState;
      }
    };
    const currentOf = (item: RatingItemDef): string => {
      switch (item.metric) {
        case "areaEnergy": return `${fmt(metrics.areaEnergyKgce)} kgce/m²·a（${evalYear} 年测算）`;
        case "bedWater": return `${fmt(metrics.bedWaterL, 0)} L/床日（住院相关楼宇口径）`;
        case "areaCarbon": return `${fmt(metrics.areaCarbonKg)} kgCO₂/m²·a（Scope1+2 测算）`;
        case "bedCarbon": return `${fmt(metrics.bedCarbonKg)} kgCO₂/床日（Scope1+2 测算）`;
        default:
          return item.projectLinked
            ? `项目库在库 ${projectCount} 项，合计年减排 ${fmt(projectReductionT, 0)} tCO₂e（演示）`
            : item.current;
      }
    };
    const requirementOf = (item: RatingItemDef): string => {
      switch (item.metric) {
        case "areaEnergy": return `≤ ${pAreaEnergy} kgce/m²·a（文档引用，演示参数）`;
        case "bedWater": return `≤ ${pBedWater} L/床日（文档引用，演示参数）`;
        case "areaCarbon": return `≤ ${pAreaCarbon} kgCO₂/m²·a（文档引用，演示参数）`;
        case "bedCarbon": return `≤ 平均值 ${bench.bedCarbon.average} kgCO₂/床日（等级×气候区演示阈值）`;
        default: return item.requirement;
      }
    };
    return ratingItems.map((item) => {
      const computed = computedOf(item);
      const state = overrides[item.id] ?? computed;
      return {
        item,
        computed,
        state,
        requirement: requirementOf(item),
        current: currentOf(item),
        score: round1(item.maxScore * stateMeta[state].factor),
        overridden: item.id in overrides,
      };
    });
  }, [metrics, bench, overrides, pAreaEnergy, pBedWater, pAreaCarbon, projectCount, projectReductionT]);

  const tierStats = useMemo(() => {
    const stats = Object.fromEntries(
      tierOrder.map((t) => [t, { earned: 0, max: 0, met: 0, partial: 0, unmet: 0, overridden: 0 }]),
    ) as Record<RatingTier, { earned: number; max: number; met: number; partial: number; unmet: number; overridden: number }>;
    for (const r of rows) {
      const s = stats[r.item.tier];
      s.earned = round1(s.earned + r.score);
      s.max += r.item.maxScore;
      s[r.state] += 1;
      if (r.overridden) s.overridden += 1;
    }
    return stats;
  }, [rows]);

  const coreScore = round1(tierStats.L1.earned + tierStats.L2.earned + tierStats.L3.earned);
  const bonusScore = tierStats.bonus.earned;
  const overall = round1(coreScore + bonusScore);
  const rating = ratingOf(overall);
  const overriddenTotal = rows.filter((r) => r.overridden).length;

  const dimStats = useMemo(
    () =>
      dimensions.map((d) => {
        const list = rows.filter((r) => r.item.dimension === d.id);
        const max = list.reduce((s, r) => s + r.item.maxScore, 0);
        const earned = round1(list.reduce((s, r) => s + r.score, 0));
        return { ...d, max, earned, pct: max ? Math.round((earned / max) * 100) : 0 };
      }),
    [rows],
  );

  const radarOption = useMemo<EChartsCoreOption>(
    () => ({
      legend: false,
      tooltip: { trigger: "item" },
      radar: {
        indicator: dimStats.map((d) => ({ name: `${d.name}\n${d.pct}%`, max: 100 })),
        radius: "62%",
        center: ["50%", "54%"],
        axisName: { color: "#9db4d6", fontSize: 10, lineHeight: 14 },
        splitArea: { areaStyle: { color: ["rgba(41,211,232,0.03)", "rgba(41,211,232,0.07)"] } },
        splitLine: { lineStyle: { color: "rgba(56,116,178,0.25)" } },
        axisLine: { lineStyle: { color: "rgba(56,116,178,0.35)" } },
      },
      series: [
        {
          type: "radar",
          data: [
            {
              value: dimStats.map((d) => d.pct),
              name: "六维得分率 %（演示）",
              areaStyle: { color: "rgba(41,211,232,0.18)" },
              lineStyle: { color: "#29d3e8", width: 2 },
              itemStyle: { color: "#29d3e8" },
            },
          ],
        },
      ],
    }),
    [dimStats],
  );

  const benchAreaOption = useMemo(() => benchOption("kgCO₂/m²·a", metrics.areaCarbonKg, bench.areaCarbon), [metrics, bench]);
  const benchBedOption = useMemo(() => benchOption("kgCO₂/床日", metrics.bedCarbonKg, bench.bedCarbon), [metrics, bench]);
  const areaVerdict = verdictOf(metrics.areaCarbonKg, bench.areaCarbon);
  const bedVerdict = verdictOf(metrics.bedCarbonKg, bench.bedCarbon);

  const tabRows = rows.filter((r) => r.item.tier === tab);
  const tabStat = tierStats[tab];
  const tabRate = tabStat.max ? Math.round((tabStat.earned / tabStat.max) * 100) : 0;
  const tabDims = dimensions
    .map((d) => {
      const list = tabRows.filter((r) => r.item.dimension === d.id);
      return {
        ...d,
        max: list.reduce((s, r) => s + r.item.maxScore, 0),
        earned: round1(list.reduce((s, r) => s + r.score, 0)),
      };
    })
    .filter((d) => d.max > 0);
  const detailRow = detailId ? rows.find((r) => r.item.id === detailId) : undefined;

  const onRestoreTier = (t: RatingTier) => {
    rows.filter((r) => r.item.tier === t && r.overridden).forEach((r) => clearOverride(r.item.id));
    pushToast("已恢复计算判定", `${tierMeta[t].name}的人工切换状态已清除`, "success");
  };

  const onRestoreAll = () => {
    resetOverrides();
    pushToast("已恢复全部判定", "所有人工切换的达标状态已清除，恢复数据层计算判定", "success");
  };

  const onExport = async () => {
    const { downloadWorkbook } = await import("../../utils/downloads");
    downloadWorkbook(
      {
        评价明细: rows.map((r) => ({
          层级: tierMeta[r.item.tier].name,
          编号: r.item.id,
          评价项: r.item.name,
          要求_演示阈值: r.requirement,
          现状_演示: r.current,
          分值: r.item.maxScore,
          得分_演示: r.score,
          状态_演示: stateMeta[r.state].label,
          计算判定_演示: stateMeta[r.computed].label,
          人工切换: r.overridden ? "是" : "否",
        })),
        三线对标: [
          {
            指标: "单位面积碳排（kgCO₂/m²·a）",
            本院测算_演示: round1(metrics.areaCarbonKg),
            先进值_演示: bench.areaCarbon.advanced,
            平均值_演示: bench.areaCarbon.average,
            约束值_演示: bench.areaCarbon.constraint,
            判定_演示: areaVerdict.label,
            医院等级: levelName,
            气候区: zoneName,
          },
          {
            指标: "床日碳排（kgCO₂/床日）",
            本院测算_演示: round1(metrics.bedCarbonKg),
            先进值_演示: bench.bedCarbon.advanced,
            平均值_演示: bench.bedCarbon.average,
            约束值_演示: bench.bedCarbon.constraint,
            判定_演示: bedVerdict.label,
            医院等级: levelName,
            气候区: zoneName,
          },
        ],
        汇总: [
          { 项目: "评价期", 内容: `${evalYear} 自然年（演示）` },
          { 项目: "综合得分（演示）", 内容: `${overall} / 110（基础 ${coreScore}/100 + 加分 ${bonusScore}/10）` },
          { 项目: "演示评级", 内容: `${rating.label}（不构成合规结论）` },
          ...tierOrder.map((t) => ({ 项目: tierMeta[t].name, 内容: `${tierStats[t].earned} / ${tierStats[t].max} 分` })),
          ...dimStats.map((d) => ({ 项目: `${d.name}得分率`, 内容: `${d.pct}%（${d.earned}/${d.max}）` })),
          { 项目: "医院等级 / 气候区", 内容: `${levelName} / ${zoneName}` },
          {
            项目: "文档引用参数（演示，待标准确认）",
            内容: `单位面积能耗≤${pAreaEnergy} kgce/m²·a；床日耗水≤${pBedWater} L/床日；单位面积碳排≤${pAreaCarbon} kgCO₂/m²·a`,
          },
          { 项目: "声明", 内容: "Demo 模拟数据；全部阈值为演示参数，待标准确认后方可用于正式判定；不构成合规结论" },
        ],
      },
      `绿色低碳医院评价_演示_${dayjs(demoAsOfDate).format("YYYYMMDD")}.xlsx`,
    );
    pushToast("导出完成", "已按当前等级/气候区与切换状态导出演示评价表", "success");
  };

  const paramInput = (key: "pAreaEnergy" | "pBedWater" | "pAreaCarbon", value: number, label: string, unit: string) => (
    <label style={{ display: "inline-flex", gap: 4, alignItems: "center", fontSize: 11, color: "var(--ink-3)" }}>
      {label} ≤
      <input
        type="number"
        className="pf-input"
        style={{ width: 64, padding: "3px 6px", fontSize: 11 }}
        value={value}
        min={1}
        disabled={!writable}
        title={writable ? "演示参数，待标准确认" : "当前角色无写权限"}
        onChange={(e) => setPageFilter(PAGE_ID, { [key]: Math.max(1, Number(e.target.value) || 1) })}
      />
      {unit}
    </label>
  );

  return (
    <>
      <PageHead
        title="绿色低碳医院评价"
        sub={`评价期 ${evalYear} 自然年 · L1/L2/L3 三层递进评价 · 全部阈值为演示参数（待标准确认），不构成合规结论`}
        actions={
          <>
            <select
              className="pf-select"
              value={level}
              title="医院等级（影响三线对标与 L3-03 判定）"
              onChange={(e) => setPageFilter(PAGE_ID, { level: e.target.value })}
            >
              {hospitalLevels.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <select
              className="pf-select"
              value={zone}
              title="气候区（影响三线对标与 L3-03 判定）"
              onChange={(e) => setPageFilter(PAGE_ID, { zone: e.target.value })}
            >
              {climateZones.map((z) => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
            </select>
            <button
              className="pf-btn ghost"
              disabled={!writable || overriddenTotal === 0}
              title={overriddenTotal ? `清除 ${overriddenTotal} 项人工切换` : "当前没有人工切换"}
              onClick={onRestoreAll}
            >
              <RotateCcw size={13} /> 恢复全部判定
            </button>
            <button className="pf-btn primary" onClick={onExport}>
              <Download size={14} /> 导出评价表
            </button>
          </>
        }
      />

      <div className="grid cols-5">
        <Kpi
          label="综合得分（演示）"
          value={overall.toFixed(1)}
          unit="/ 110"
          tone="cyan"
          sub={
            <>
              <Tag tone={rating.tone}>{rating.label}</Tag>
              <span>基础 {coreScore}/100 + 加分 {bonusScore}/10</span>
            </>
          }
        />
        {(["L1", "L2", "L3"] as RatingTier[]).map((t) => {
          const s = tierStats[t];
          const rate = s.max ? Math.round((s.earned / s.max) * 100) : 0;
          return (
            <Kpi
              key={t}
              label={tierMeta[t].name}
              value={s.earned.toFixed(1)}
              unit={`/ ${s.max}`}
              tone={tierTone(rate)}
              sub={<span>得分率 {rate}% · 达标 {s.met} / 部分 {s.partial} / 未达 {s.unmet}</span>}
            />
          );
        })}
        <Kpi
          label="创新加分（演示）"
          value={`+${bonusScore.toFixed(1)}`}
          unit="/ 10"
          tone="green"
          sub={<span>储能 / 报告 / 逸散控制 / 沼气 4 项</span>}
        />
      </div>

      <div className="grid cols-2" style={{ marginTop: 10 }}>
        <Panel title="六维评价雷达（演示得分率）" extra={<Tag tone="muted">演示口径 · 含创新加分</Tag>}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 200px", gap: 8, alignItems: "center" }}>
            <EChart height={272} option={radarOption} />
            <table className="pf-table">
              <thead>
                <tr><th>维度</th><th className="num">得分</th><th className="num">得分率</th></tr>
              </thead>
              <tbody>
                {dimStats.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td className="num">{d.earned}/{d.max}</td>
                    <td className="num">{d.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          title="碳排强度三线对标（约束值 / 平均值 / 先进值）"
          extra={<span>{levelName} · {zoneName} · 演示参数，待标准确认</span>}
        >
          <div className="grid cols-2">
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "var(--ink-2)", marginBottom: 2 }}>
                <span>单位面积碳排（Scope1+2）</span>
                <Tag tone={areaVerdict.tone}>{areaVerdict.label}</Tag>
              </div>
              <EChart height={208} option={benchAreaOption} />
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "var(--ink-2)", marginBottom: 2 }}>
                <span>床日碳排（Scope1+2）</span>
                <Tag tone={bedVerdict.tone}>{bedVerdict.label}</Tag>
              </div>
              <EChart height={208} option={benchBedOption} />
            </div>
          </div>
          <p style={noteStyle}>
            阈值按医院等级 × 气候区演示映射生成，切换上方下拉即变；该组阈值同时用于 L3-03 床日碳排强度判定。
            床日口径 = 年 Scope1+2 碳排（{fmt(metrics.carbonT, 0)} tCO₂e）÷ 占用床日（{fmt(metrics.bedDays, 0)}）；
            面积口径按总建筑面积 {fmt(metrics.areaM2, 0)} m²。
          </p>
        </Panel>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
        {tierOrder.map((t) => (
          <button
            key={t}
            className={`pf-btn ${tab === t ? "primary" : "ghost"}`}
            onClick={() => setPageFilter(PAGE_ID, { tab: t })}
          >
            {tierMeta[t].name} {tierStats[t].earned}/{tierStats[t].max}
          </button>
        ))}
        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>状态切换仅用于评审演示，不改变数据层计算值</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "290px minmax(0,1fr)", gap: 10, marginTop: 10 }}>
        <Panel title={`${tierMeta[tab].name} · 得分卡`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <span className="num" style={{ fontSize: 30, fontWeight: 700, color: "var(--ink-1)" }}>{tabStat.earned}</span>
              <span style={{ color: "var(--ink-3)", fontSize: 12 }}> / {tabStat.max} 分 · 得分率 {tabRate}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "rgba(56,116,178,0.2)" }}>
              <div style={{ width: `${tabRate}%`, height: "100%", borderRadius: 3, background: "var(--cyan)" }} />
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Tag tone="ok">演示达标 {tabStat.met}</Tag>
              <Tag tone="warn">部分 {tabStat.partial}</Tag>
              <Tag tone="muted">未达标 {tabStat.unmet}</Tag>
              {tabStat.overridden > 0 && <Tag tone="info">人工切换 {tabStat.overridden}</Tag>}
            </div>
            <p style={{ margin: 0, fontSize: 11, color: "var(--ink-3)", lineHeight: 1.7 }}>{tierMeta[tab].desc}</p>
            <table className="pf-table">
              <thead>
                <tr><th>本层维度构成</th><th className="num">得分</th></tr>
              </thead>
              <tbody>
                {tabDims.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td className="num">{d.earned}/{d.max}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              className="pf-btn ghost"
              disabled={!writable || tabStat.overridden === 0}
              title={writable ? "清除本层人工切换，恢复计算判定" : "当前角色无写权限"}
              onClick={() => onRestoreTier(tab)}
            >
              <RotateCcw size={13} /> 恢复本层计算判定
            </button>
          </div>
        </Panel>

        <Panel
          title={`${tierMeta[tab].name} · 明细（达标状态可切换演示）`}
          extra={
            <>
              {tab === "L2" && paramInput("pAreaEnergy", pAreaEnergy, "单位面积能耗", "kgce/m²·a")}
              {tab === "L2" && paramInput("pBedWater", pBedWater, "床日耗水", "L/床日")}
              {tab === "L3" && paramInput("pAreaCarbon", pAreaCarbon, "单位面积碳排", "kgCO₂/m²·a")}
              {(tab === "L2" || tab === "L3") && <Tag tone="muted">演示参数，待标准确认</Tag>}
            </>
          }
        >
          <div style={{ overflowX: "auto" }}>
            <table className="pf-table">
              <thead>
                <tr>
                  <th>编号</th><th>评价项</th><th>要求（演示阈值）</th><th>现状 / 证据摘要</th>
                  <th className="num">分值</th><th className="num">得分</th><th>状态</th><th>操作</th>
                </tr>
              </thead>
              <tbody>
                {tabRows.map((r) => (
                  <tr key={r.item.id}>
                    <td className="num">{r.item.id}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button style={linkBtn} title="查看评价项详情" onClick={() => setDetailId(r.item.id)}>
                        {r.item.name}
                      </button>
                    </td>
                    <td style={{ maxWidth: 220 }}>{r.requirement}</td>
                    <td style={{ maxWidth: 240 }}>{r.current}</td>
                    <td className="num">{r.item.maxScore}</td>
                    <td className="num">{r.score}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <Tag tone={stateMeta[r.state].tone}>{stateMeta[r.state].label}</Tag>
                      {r.overridden && (
                        <span title="人工切换（与计算判定可能不同）" style={{ color: "var(--cyan)", marginLeft: 3 }}>*</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button
                        className="pf-btn ghost"
                        style={smallBtn}
                        disabled={!writable}
                        title={writable ? "循环切换：达标 → 部分 → 未达标" : "当前角色无写权限"}
                        onClick={() => setItemState(r.item.id, nextState[r.state])}
                      >
                        切换
                      </button>
                      {r.overridden && (
                        <button
                          className="pf-btn ghost"
                          style={{ ...smallBtn, marginLeft: 4 }}
                          disabled={!writable}
                          onClick={() => clearOverride(r.item.id)}
                        >
                          恢复
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={noteStyle}>
            表中阈值（含 16 kgce/m²·a、370 L/床日、55 kgCO₂/m²·a 等文档引用值）均为演示参数，待标准确认后方可用于正式判定；
            带 * 的状态为人工切换，仅用于评审演示。指标类条目的测算值来自平台数据层（{evalYear} 自然年）。
          </p>
        </Panel>
      </div>

      {detailRow && (
        <Modal title={`${detailRow.item.id} ${detailRow.item.name}`} onClose={() => setDetailId(null)} width={560}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12, color: "var(--ink-2)" }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Tag tone="info">{tierMeta[detailRow.item.tier].name}</Tag>
              <Tag tone="muted">{dimensions.find((d) => d.id === detailRow.item.dimension)?.name}</Tag>
              <Tag tone={stateMeta[detailRow.state].tone}>{stateMeta[detailRow.state].label}</Tag>
              {detailRow.item.docParam && <Tag tone="muted">演示参数，待标准确认</Tag>}
            </div>
            <p style={{ margin: 0 }}>
              <b style={{ color: "var(--ink-1)" }}>要求（演示）：</b>{detailRow.requirement}
            </p>
            <p style={{ margin: 0 }}>
              <b style={{ color: "var(--ink-1)" }}>现状：</b>{detailRow.current}
            </p>
            {detailRow.item.metric && (
              <p style={{ margin: 0 }}>
                <b style={{ color: "var(--ink-1)" }}>计算判定：</b>
                {stateMeta[detailRow.computed].label}（由数据层 {evalYear} 年测算值与演示阈值比较得出）
              </p>
            )}
            <div>
              <b style={{ color: "var(--ink-1)" }}>建议佐证材料：</b>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18, lineHeight: 1.8 }}>
                {detailRow.item.evidence.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span>演示状态切换：</span>
              {(["met", "partial", "unmet"] as ItemState[]).map((s) => (
                <button
                  key={s}
                  className={`pf-btn ${detailRow.state === s ? "primary" : "ghost"}`}
                  style={smallBtn}
                  disabled={!writable}
                  onClick={() => setItemState(detailRow.item.id, s)}
                >
                  {stateMeta[s].label}
                </button>
              ))}
              {detailRow.overridden && (
                <button className="pf-btn ghost" style={smallBtn} disabled={!writable} onClick={() => clearOverride(detailRow.item.id)}>
                  恢复计算判定
                </button>
              )}
            </div>
            <p style={{ margin: 0, fontSize: 11, color: "var(--ink-3)" }}>
              切换仅用于评审演示，不改变数据层计算值，不构成合规结论。
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
