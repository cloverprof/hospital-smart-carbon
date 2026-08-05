// 6.4.1 院区碳空间视图（moduleId: spatial）
// 复用 SceneStage（variant="spatial"，领导式弹窗）；固定斜向全景，禁止缩放/拖拽/俯视图。
// 名牌坐标为配置化近似映射（buildings.ts anchor），映射假设见 docs/DECISIONS.md。
import dayjs from "dayjs";
import { Download, MapPin } from "lucide-react";
import { useMemo } from "react";
import { EChart } from "../components/EChart";
import { Delta, EmptyState, Kpi, PageHead, Panel, Tag } from "../components/kit";
import { SceneStage } from "../components/SceneStage";
import { anomalyChains, openAnomaliesByBuilding } from "../data/anomalies";
import { mainBuildings } from "../data/buildings";
import { demoAsOfDate } from "../data/config";
import { dailyCarbonKg, dailyCarbonSeries, hospitalDailyCarbonT, yoyPct } from "../services/timeseries";
import { useDemoStore } from "../stores/demo";
import type { Building } from "../types/core";

const PAGE_ID = "spatial";

const asOf = dayjs(demoAsOfDate);
const monthStart = asOf.startOf("month").format("YYYY-MM-DD");
const yearStart = asOf.startOf("year").format("YYYY-MM-DD");

type PlateStatus = "ok" | "warn" | "danger";

const statusMeta: Record<PlateStatus, { label: string; tone: "ok" | "warn" | "danger"; color: string; rule: string }> = {
  ok: { label: "正常", tone: "ok", color: "var(--green)", rule: "无未关闭异常，按常规巡检运行" },
  warn: { label: "关注", tone: "warn", color: "var(--amber)", rule: "存在未关闭异常（警告/提示级）" },
  danger: { label: "高风险", tone: "danger", color: "var(--red)", rule: "存在未关闭的严重级异常" },
};

type SortKey = "today" | "month" | "intensity" | "yoy" | "anomalies";

interface BuildingRow {
  b: Building;
  status: PlateStatus;
  todayKg: number;
  sharePct: number;
  monthT: number;
  intensity: number; // kg/m²·a（年累计口径，与场景弹窗一致）
  yoy: number; // 本月电耗同比 %（yoyPct，与场景弹窗一致）
  openCount: number;
  criticalCount: number;
}

/** 与 SceneStage 名牌圆点同一判定：严重级未关闭 = 高风险；其余未关闭 = 关注 */
function plateStatus(buildingId: Building["id"]): PlateStatus {
  const open = openAnomaliesByBuilding(buildingId);
  if (open.some((a) => a.level === "critical")) return "danger";
  if (open.length) return "warn";
  return "ok";
}

function buildRows(): { rows: BuildingRow[]; todayTotalKg: number } {
  const todayTotalKg = mainBuildings.reduce((s, b) => s + dailyCarbonKg(b.id, demoAsOfDate), 0);
  const rows = mainBuildings.map((b) => {
    const open = openAnomaliesByBuilding(b.id);
    const todayKg = dailyCarbonKg(b.id, demoAsOfDate);
    const monthT = dailyCarbonSeries(monthStart, demoAsOfDate, b.id).reduce((s, p) => s + p.v, 0) / 1000;
    const yearT = dailyCarbonSeries(yearStart, demoAsOfDate, b.id).reduce((s, p) => s + p.v, 0) / 1000;
    return {
      b,
      status: plateStatus(b.id),
      todayKg,
      sharePct: (todayKg / todayTotalKg) * 100,
      monthT,
      intensity: (yearT * 1000) / b.areaM2,
      yoy: yoyPct("electricity", monthStart, demoAsOfDate, b.id),
      openCount: open.length,
      criticalCount: open.filter((a) => a.level === "critical").length,
    };
  });
  return { rows, todayTotalKg };
}

export function SpatialPage() {
  const pageFilters = useDemoStore((s) => s.pageFilters[PAGE_ID]);
  const setPageFilter = useDemoStore((s) => s.setPageFilter);
  const pushToast = useDemoStore((s) => s.pushToast);

  const statusFilter = (pageFilters?.status as PlateStatus | "all") ?? "all";
  const sortKey = (pageFilters?.sortKey as SortKey) ?? "today";
  const sortDesc = (pageFilters?.sortDesc as boolean) ?? true;

  // 数据层确定性：基准日固定，整表只算一次
  const { rows, todayTotalKg } = useMemo(buildRows, []);

  const kpis = useMemo(() => {
    const curMtdT = dailyCarbonSeries(monthStart, demoAsOfDate).reduce((s, p) => s + p.v, 0);
    const prevMtdT = dailyCarbonSeries(
      asOf.startOf("month").subtract(1, "year").format("YYYY-MM-DD"),
      asOf.subtract(1, "year").format("YYYY-MM-DD"),
    ).reduce((s, p) => s + p.v, 0);
    const openAll = anomalyChains.filter((a) => a.status !== "closed");
    return {
      todayT: hospitalDailyCarbonT(demoAsOfDate),
      curMtdT,
      mtdYoy: prevMtdT ? Math.round(((curMtdT - prevMtdT) / prevMtdT) * 1000) / 10 : 0,
      openTotal: openAll.length,
      criticalTotal: openAll.filter((a) => a.level === "critical").length,
      okCount: rows.filter((r) => r.status === "ok").length,
      warnCount: rows.filter((r) => r.status === "warn").length,
      dangerCount: rows.filter((r) => r.status === "danger").length,
    };
  }, [rows]);

  const sortedRows = useMemo(() => {
    const pick = (r: BuildingRow): number =>
      sortKey === "today" ? r.todayKg
        : sortKey === "month" ? r.monthT
          : sortKey === "intensity" ? r.intensity
            : sortKey === "yoy" ? r.yoy
              : r.openCount;
    return rows
      .filter((r) => statusFilter === "all" || r.status === statusFilter)
      .sort((a, b) => (sortDesc ? pick(b) - pick(a) : pick(a) - pick(b)));
  }, [rows, statusFilter, sortKey, sortDesc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setPageFilter(PAGE_ID, { sortDesc: !sortDesc });
    else setPageFilter(PAGE_ID, { sortKey: key, sortDesc: true });
  };

  const hintToScene = (b: Building) =>
    pushToast("在场景中查看", `楼宇详情弹窗在夜景场景中打开：请点击「${b.shortName}」名牌`, "info");

  const exportCsv = async () => {
    const { downloadCsv } = await import("../utils/downloads");
    downloadCsv(
      sortedRows.map((r) => ({
        楼宇: r.b.name,
        功能: r.b.functionLabel,
        状态: statusMeta[r.status].label,
        "今日碳排(kgCO2e)": r.todayKg,
        "今日占比(%)": r.sharePct.toFixed(1),
        "本月累计(tCO2e)": r.monthT.toFixed(1),
        "排放强度(kg/m2·a)": r.intensity.toFixed(1),
        "本月电耗同比(%)": r.yoy.toFixed(1),
        开放异常数: r.openCount,
        其中严重级: r.criticalCount,
      })),
      `院区碳空间_楼宇碳排_${demoAsOfDate}.csv`,
    );
    pushToast("导出完成", `已导出 ${sortedRows.length} 座楼宇（筛选：${statusFilter === "all" ? "全部状态" : statusMeta[statusFilter].label}）`, "success");
  };

  const sortMark = (key: SortKey) => (sortKey === key ? (sortDesc ? " ▼" : " ▲") : "");
  const thSortStyle: React.CSSProperties = { cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" };

  const barRows = useMemo(() => [...rows].sort((a, b) => b.todayKg - a.todayKg), [rows]);

  return (
    <>
      <PageHead
        title="院区碳空间视图"
        sub={`固定斜向全景 · 静态夜景模式（3D 待 GLB 资产）· 数据基准日 ${demoAsOfDate}`}
        actions={<Tag tone="muted">视角固定 · 不支持缩放/拖拽/俯视图</Tag>}
      />

      <div className="grid cols-4">
        <Kpi label="全院今日碳排" value={kpis.todayT} unit="tCO₂e" tone="cyan" sub={`${rows.length} 座楼宇合计（Scope1+2：电/气/热）`} />
        <Kpi
          label="本月累计碳排"
          value={kpis.curMtdT.toFixed(1)}
          unit="tCO₂e"
          sub={<><Delta pct={kpis.mtdYoy} label="同比" /><span>较去年同期（{asOf.format("M")} 月同区间）</span></>}
        />
        <Kpi label="未关闭异常" value={kpis.openTotal} unit="项" tone={kpis.openTotal ? "amber" : "green"} sub={`严重级 ${kpis.criticalTotal} 项 · 全链路关联告警/工单`} />
        <Kpi label="高风险楼宇" value={kpis.dangerCount} unit="座" tone={kpis.dangerCount ? "red" : "green"} sub={`关注 ${kpis.warnCount} 座 · 正常 ${kpis.okCount} 座`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 330px", gap: 10, marginTop: 10 }}>
        {/* 16:9 场景容器：SceneStage 内部为绝对定位的场景层/名牌层/弹窗 */}
        <div
          style={{
            position: "relative",
            overflow: "hidden",
            borderRadius: 8,
            minHeight: 520,
            aspectRatio: "16 / 9",
            border: "1px solid var(--panel-border)",
            background: "var(--bg-0)",
          }}
        >
          <SceneStage variant="spatial" />
          <span
            style={{
              position: "absolute", top: 10, left: 12, zIndex: 6, pointerEvents: "none",
              fontSize: 11, color: "var(--ink-2)", background: "rgba(8, 18, 36, 0.72)",
              border: "1px solid var(--panel-border)", borderRadius: 6, padding: "3px 8px",
              display: "inline-flex", alignItems: "center", gap: 5,
            }}
          >
            <MapPin size={12} /> 点击楼宇名牌查看碳排详情弹窗 · 名牌圆点 = 碳排状态
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <Panel title="楼宇碳排状态图例">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(Object.keys(statusMeta) as PlateStatus[]).map((st) => {
                const count = st === "ok" ? kpis.okCount : st === "warn" ? kpis.warnCount : kpis.dangerCount;
                return (
                  <div key={st} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <i style={{ width: 8, height: 8, borderRadius: "50%", background: statusMeta[st].color, marginTop: 4, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "var(--ink-1)" }}>
                        {statusMeta[st].label} <b className="num">{count}</b> 座
                      </div>
                      <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{statusMeta[st].rule}</div>
                    </div>
                  </div>
                );
              })}
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--ink-3)" }}>
                状态来源：异常链未关闭记录，与名牌圆点判定一致；状态色仅用于名牌，不覆盖建筑贴图。
              </p>
            </div>
          </Panel>

          <Panel title="今日楼宇碳排排序" extra={<span>kgCO₂e · 点击条形定位</span>}>
            <EChart
              height={228}
              onClick={(p) => {
                const hit = barRows.find((r) => r.b.shortName === p.name);
                if (hit) hintToScene(hit.b);
              }}
              option={{
                legend: false,
                grid: { left: 64, right: 44, top: 6, bottom: 20 },
                tooltip: {
                  valueFormatter: (v: unknown) => `${Number(v).toLocaleString()} kgCO₂e`,
                },
                xAxis: {
                  type: "value",
                  name: "kgCO₂e",
                  nameTextStyle: { fontSize: 9, color: "#5f7799" },
                  axisLabel: { formatter: (v: number) => `${Math.round(v / 1000)}k` },
                },
                yAxis: { type: "category", inverse: true, data: barRows.map((r) => r.b.shortName) },
                series: [
                  {
                    type: "bar",
                    name: "今日碳排",
                    barWidth: 9,
                    data: barRows.map((r) => ({
                      value: r.todayKg,
                      itemStyle: { color: statusMeta[r.status].color, opacity: r.status === "ok" ? 0.55 : 0.9, borderRadius: 2 },
                    })),
                  },
                ],
              }}
            />
          </Panel>

          <Panel title="映射假设说明">
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: "var(--ink-2)", display: "flex", flexDirection: "column", gap: 4 }}>
              <li>名牌坐标为配置化近似映射（buildings.ts 的 anchor 百分比锚点），非测绘定位，见 docs/DECISIONS.md。</li>
              <li>固定斜向全景，不提供缩放、拖拽与 2D 俯视图。</li>
              <li>3D 环绕待 GLB 资产接入，sceneMode 架构已预留，名牌/弹窗两模式共用。</li>
            </ul>
          </Panel>
        </div>
      </div>

      <Panel
        title="楼宇碳排清单"
        style={{ marginTop: 10 }}
        extra={
          <>
            <select
              className="pf-select"
              value={statusFilter}
              onChange={(e) => setPageFilter(PAGE_ID, { status: e.target.value })}
              aria-label="按状态筛选"
            >
              <option value="all">全部状态（{rows.length}）</option>
              <option value="ok">正常（{kpis.okCount}）</option>
              <option value="warn">关注（{kpis.warnCount}）</option>
              <option value="danger">高风险（{kpis.dangerCount}）</option>
            </select>
            <button className="pf-btn ghost" onClick={exportCsv} disabled={!sortedRows.length}>
              <Download size={13} /> 导出 CSV
            </button>
          </>
        }
      >
        {sortedRows.length ? (
          <>
            <table className="pf-table">
              <thead>
                <tr>
                  <th>楼宇</th>
                  <th>功能</th>
                  <th>状态</th>
                  <th style={thSortStyle} onClick={() => toggleSort("today")} title="点击排序">今日碳排 kgCO₂e{sortMark("today")}</th>
                  <th>今日占比</th>
                  <th style={thSortStyle} onClick={() => toggleSort("month")} title="点击排序">本月累计 tCO₂e{sortMark("month")}</th>
                  <th style={thSortStyle} onClick={() => toggleSort("intensity")} title="点击排序">强度 kg/m²·a{sortMark("intensity")}</th>
                  <th style={thSortStyle} onClick={() => toggleSort("yoy")} title="点击排序">本月电耗同比{sortMark("yoy")}</th>
                  <th style={thSortStyle} onClick={() => toggleSort("anomalies")} title="点击排序">开放异常{sortMark("anomalies")}</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr
                    key={r.b.id}
                    onClick={() => hintToScene(r.b)}
                    style={{ cursor: "pointer" }}
                    title={`点击场景中「${r.b.shortName}」名牌查看弹窗`}
                  >
                    <td style={{ whiteSpace: "nowrap" }}>{r.b.name}</td>
                    <td style={{ color: "var(--ink-3)" }}>{r.b.functionLabel}</td>
                    <td><Tag tone={statusMeta[r.status].tone}>{statusMeta[r.status].label}</Tag></td>
                    <td className="num">{r.todayKg.toLocaleString("zh-CN")}</td>
                    <td className="num" style={{ color: "var(--ink-3)" }}>{r.sharePct.toFixed(1)}%</td>
                    <td className="num">{r.monthT.toFixed(1)}</td>
                    <td className="num">{r.intensity.toFixed(1)}</td>
                    <td className="num" style={{ color: r.yoy > 0 ? "var(--amber)" : "var(--green)" }}>
                      {r.yoy > 0 ? "+" : ""}{r.yoy.toFixed(1)}%
                    </td>
                    <td className="num">
                      {r.openCount}
                      {r.criticalCount > 0 && <span style={{ color: "var(--red)" }}>（严重 {r.criticalCount}）</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--ink-3)" }}>
              合计今日 {todayTotalKg.toLocaleString("zh-CN")} kgCO₂e（= {kpis.todayT} t，总量与分楼宇之和一致）·
              强度为年累计口径，与场景弹窗一致 · 点击表格行后请到场景中点击对应名牌查看弹窗详情。
            </p>
          </>
        ) : (
          <EmptyState text="当前筛选状态下暂无楼宇，请切换状态筛选" />
        )}
      </Panel>
    </>
  );
}
