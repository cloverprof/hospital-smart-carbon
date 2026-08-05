// 场景层：高清静态夜景 + 楼宇悬浮名牌（DOM 热区）+ 领导/后勤两种弹窗。
// 3D 环绕方案因 .max 源文件无合法转换路径暂缺（见 IMPLEMENTATION_GAPS.md），
// sceneMode 架构保留：未来提供 GLB 后在此挂 3D 层即可，名牌/弹窗两模式共用。
import dayjs from "dayjs";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { openAnomaliesByBuilding } from "../data/anomalies";
import { mainBuildings } from "../data/buildings";
import { demoAsOfDate } from "../data/config";
import { workOrderStatusMeta } from "../data/workorders";
import { useDemoStore } from "../stores/demo";
import { dailyCarbonSeries, dailyCarbonKg, yoyPct } from "../services/timeseries";
import type { Building, BuildingId } from "../types/core";
import { EChart } from "./EChart";
import { Tag } from "./kit";

const NIGHT_IMAGE = `${import.meta.env.BASE_URL}dashboard/hospital-night-campus.webp`;

export type SceneVariant = "leader" | "operations" | "spatial";

function plateStatus(buildingId: BuildingId): "ok" | "warn" | "danger" {
  const open = openAnomaliesByBuilding(buildingId);
  if (open.some((a) => a.level === "critical")) return "danger";
  if (open.length) return "warn";
  return "ok";
}

export function SceneStage({ variant }: { variant: SceneVariant }) {
  const [selected, setSelected] = useState<BuildingId | null>(null);
  const selectedBuilding = selected ? mainBuildings.find((b) => b.id === selected) ?? null : null;

  return (
    <>
      <div className="scene-layer" style={{ backgroundImage: `url(${NIGHT_IMAGE})` }} aria-label="医院园区夜景（静态模式）" />
      <div className="plate-layer">
        {mainBuildings.map((b) => {
          const st = plateStatus(b.id);
          const todayT = Math.round(dailyCarbonKg(b.id, demoAsOfDate) / 100) / 10;
          return (
            <button
              key={b.id}
              className={`plate status-${st === "ok" ? "ok" : st} ${selected === b.id ? "selected" : ""}`}
              style={{ left: `${b.anchor.x}%`, top: `${b.anchor.y}%`, background: "none", border: "none", padding: 0 }}
              onClick={() => setSelected(selected === b.id ? null : b.id)}
              aria-label={`${b.name} 详情`}
            >
              <span className="plate-card">
                <i className="dot" />
                {b.shortName}
                <small className="num">{todayT}t</small>
              </span>
              <span className="plate-pin" />
            </button>
          );
        })}
      </div>
      {selectedBuilding && (
        <BuildingPopup building={selectedBuilding} variant={variant} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function popPosition(b: Building): React.CSSProperties {
  const left = b.anchor.x > 55 ? `${b.anchor.x - 30}%` : `${Math.min(b.anchor.x + 4, 58)}%`;
  const top = `${Math.min(Math.max(b.anchor.y - 8, 8), 42)}%`;
  return { left, top };
}

function BuildingPopup({ building, variant, onClose }: { building: Building; variant: SceneVariant; onClose: () => void }) {
  return (
    <div className="building-pop fadeup" style={popPosition(building)}>
      <header>
        <div>
          <h4>{building.name}</h4>
          <p>
            {building.functionLabel} · {building.areaM2.toLocaleString()} m²
            {building.beds > 0 && ` · ${building.beds} 床`}
          </p>
        </div>
        <button className="pop-close" onClick={onClose} aria-label="关闭"><X size={15} /></button>
      </header>
      {variant === "operations" ? <OpsPopBody building={building} /> : <LeaderPopBody building={building} />}
    </div>
  );
}

/** 领导舱弹窗：碳排信息 + 过去 1 个月日碳排折线（提示词 6.6.1） */
function LeaderPopBody({ building }: { building: Building }) {
  const asOf = dayjs(demoAsOfDate);
  const monthCum = useMemo(() => {
    const from = asOf.startOf("month").format("YYYY-MM-DD");
    return dailyCarbonSeries(from, demoAsOfDate, building.id).reduce((s, p) => s + p.v, 0) / 1000;
  }, [building.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const yearCum = useMemo(() => {
    return dailyCarbonSeries(asOf.startOf("year").format("YYYY-MM-DD"), demoAsOfDate, building.id).reduce((s, p) => s + p.v, 0) / 1000;
  }, [building.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const series = useMemo(
    () => dailyCarbonSeries(asOf.subtract(30, "day").format("YYYY-MM-DD"), demoAsOfDate, building.id),
    [building.id], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const yoy = yoyPct("electricity", asOf.startOf("month").format("YYYY-MM-DD"), demoAsOfDate, building.id);
  const intensity = (yearCum * 1000) / building.areaM2;
  const baseline = series.reduce((s, p) => s + p.v, 0) / series.length;
  const anomalies = openAnomaliesByBuilding(building.id);

  return (
    <>
      <div className="pop-metrics">
        <div><p>本月累计碳排</p><b className="num">{monthCum.toFixed(1)}<small> tCO₂e</small></b></div>
        <div><p>年度累计碳排</p><b className="num">{yearCum.toFixed(0)}<small> tCO₂e</small></b></div>
        <div><p>排放强度</p><b className="num">{intensity.toFixed(1)}<small> kg/m²·a</small></b></div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
        <Tag tone={yoy > 0 ? "warn" : "ok"}>本月电耗同比 {yoy > 0 ? "+" : ""}{yoy.toFixed(1)}%</Tag>
        <Tag tone={anomalies.length ? "warn" : "ok"}>{anomalies.length ? `${anomalies.length} 项异常影响中` : "运行正常"}</Tag>
      </div>
      <EChart
        height={140}
        option={{
          legend: false,
          grid: { left: 40, right: 8, top: 12, bottom: 20 },
          xAxis: { type: "category", data: series.map((p) => p.t.slice(5)), axisLabel: { interval: 6 } },
          yAxis: { type: "value", name: "kgCO₂e", nameTextStyle: { fontSize: 9, color: "#5f7799" } },
          tooltip: { valueFormatter: (v: unknown) => `${Number(v).toLocaleString()} kgCO₂e` },
          series: [
            { type: "line", data: series.map((p) => p.v), smooth: true, symbol: "none", lineStyle: { width: 1.6, color: "#29d3e8" }, areaStyle: { opacity: 0.12, color: "#29d3e8" } },
            { type: "line", data: series.map(() => Math.round(baseline)), symbol: "none", lineStyle: { width: 1, type: "dashed", color: "#5f7799" }, tooltip: { show: false } },
          ],
        }}
      />
      <p className="pop-note">
        {anomalies.length
          ? `影响因素：${anomalies[0].title}（${anomalies[0].ownerTeam}处置中）`
          : "影响因素：业务量与季节性空调负荷为主，无异常事件。"}
        <span style={{ color: "#5f7799" }}> · 近 31 日，虚线为期间均值基线</span>
      </p>
    </>
  );
}

/** 后勤舱弹窗：当前故障/问题 + 工单与碳影响（提示词 6.6.2），不展示领导趋势图 */
function OpsPopBody({ building }: { building: Building }) {
  const anomalies = openAnomaliesByBuilding(building.id);
  const workOrders = useDemoStore((s) => s.workOrders);
  if (!anomalies.length) {
    return <p className="pop-note">当前无影响碳排的故障或异常。设备运行正常，纳入常规巡检计划。</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, overflowY: "auto" }}>
      {anomalies.map((a) => {
        const wo = workOrders.find((w) => w.id === a.workOrderId);
        const days = dayjs(demoAsOfDate).diff(dayjs(a.from), "day");
        const extraKg = a.estReductionTPerYear > 0 ? Math.round((a.estReductionTPerYear * 1000) / 365) : 0;
        return (
          <div key={a.id} style={{ border: "1px solid rgba(56,116,178,0.25)", borderRadius: 6, padding: "8px 10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 6, alignItems: "center" }}>
              <b style={{ fontSize: 12 }}>{a.title}</b>
              <Tag tone={a.level === "critical" ? "danger" : a.level === "warning" ? "warn" : "info"}>
                {a.level === "critical" ? "严重" : a.level === "warning" ? "警告" : "提示"}
              </Tag>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#9db4d6" }}>
              开始 {a.from} · 持续 {days} 天 · {a.deviceId}
            </p>
            <p style={{ margin: "3px 0 0", fontSize: 11, color: "#9db4d6" }}>
              {extraKg > 0 ? <>估算额外碳排 <b className="num" style={{ color: "#f5a524" }}>{extraKg} kg/日</b>{a.estSavingMwhPerYear > 0 && <> · 额外能耗约 {Math.round((a.estSavingMwhPerYear * 1000) / 365)} kWh/日</>}</> : "以保障为主，无节能量核算"}
            </p>
            <div style={{ display: "flex", gap: 6, marginTop: 5, alignItems: "center", flexWrap: "wrap" }}>
              <Tag tone="muted">{a.owner}</Tag>
              {wo ? (
                <Tag tone={wo.status === "closed" ? "ok" : "info"}>{wo.id} · {workOrderStatusMeta[wo.status]}</Tag>
              ) : (
                <Tag tone="muted">未建工单</Tag>
              )}
              {wo?.eta && wo.status !== "closed" && <span style={{ fontSize: 10, color: "#5f7799" }}>预计完成 {wo.eta}</span>}
            </div>
            {a.medicalSafetyNote && (
              <p style={{ margin: "5px 0 0", fontSize: 10, color: "#f5a524" }}>⚕ {a.medicalSafetyNote}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
