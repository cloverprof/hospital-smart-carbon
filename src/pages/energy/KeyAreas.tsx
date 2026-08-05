// 6.1.4 重点区域能耗管理：手术室 / ICU / 大型医疗设备三个页签 + 口径说明与旁路冗余（只读）。
// 数据来源：services/timeseries（时序）+ data/anomalies（AN-001/AN-006）+ data/modules/key-areas（静态领域数据）。
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import {
  Activity, AlertTriangle, BedDouble, Download, Fan, HeartPulse, Lock, MoonStar,
  Recycle, ScanLine, ShieldAlert, Slice, Thermometer, Wind, Zap,
} from "lucide-react";
import { EChart } from "../../components/EChart";
import { Delta, Kpi, PageHead, Panel, Tag } from "../../components/kit";
import { anomalyById } from "../../data/anomalies";
import { mainBuildings } from "../../data/buildings";
import { demoAsOfDate, energyKindMeta } from "../../data/config";
import { deviceById } from "../../data/devices";
import { activeFactors } from "../../data/factors";
import {
  cleanZones, ICU_BEDS, ICU_METER_SHARE, ICU_TEMP_DEFAULT, ICU_TEMP_MAX, ICU_TEMP_MIN,
  ICU_TEMP_SAVING_PER_DEG, icuDevices, icuEnv, icuTierMeta, icuWasteHeat, largeEquipSpecs,
  OR_BASELINE_DATE, orEquipCards, orPhases, PURIFICATION_SHARE, redundancyRows, sleepStrategies,
} from "../../data/modules/key-areas";
import { canWrite } from "../../data/navigation";
import { unitNoise } from "../../data/rng";
import {
  bedOccupancy, dailyUsage, hourlySeries, outpatientVisits, sumUsage, surgeryCount, yoyPct,
} from "../../services/timeseries";
import { useDemoStore } from "../../stores/demo";
import type { Device, SeriesPoint } from "../../types/core";

const MODULE_ID = "key-areas";

const noteStyle: CSSProperties = { fontSize: 11, color: "var(--ink-3)", lineHeight: 1.6, margin: "8px 0 0" };
const safetyBoxStyle: CSSProperties = {
  border: "1px solid rgba(245, 165, 36, 0.45)", background: "rgba(245, 165, 36, 0.08)",
  borderRadius: 6, padding: "6px 10px", fontSize: 11, color: "var(--amber)",
  display: "flex", gap: 6, alignItems: "flex-start", marginTop: 8, lineHeight: 1.6,
};

const fmt = (n: number, digits = 0) => n.toLocaleString("zh-CN", { maximumFractionDigits: digits });

/** 分时段平均功率（kW）：小时序列在窗口内取均值，支持跨零点窗口 */
function phaseAvgKw(series: SeriesPoint[], [s, e]: [number, number]): number {
  const hours: number[] = [];
  for (let h = 0; h < 24; h++) {
    const inWin = e > s ? h >= s && h < e : h >= s || h < e;
    if (inWin) hours.push(h);
  }
  const sum = hours.reduce((acc, h) => acc + (series[h]?.v ?? 0), 0);
  return Math.round(sum / hours.length);
}

function StatusDot({ tone }: { tone: "ok" | "warn" | "danger" }) {
  const color = tone === "ok" ? "var(--green)" : tone === "warn" ? "var(--amber)" : "var(--red)";
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}`, marginRight: 5, verticalAlign: "middle" }} />;
}

function Stat({ label, value, unit, tone }: { label: string; value: string | number; unit?: string; tone?: "green" | "red" | "amber" | "cyan" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{label}</span>
      <span className="num" style={{ fontSize: 16, fontWeight: 700, color: tone ? `var(--${tone})` : "var(--ink-1)" }}>
        {value}
        {unit && <small style={{ fontSize: 10, fontWeight: 400, color: "var(--ink-3)", marginLeft: 3 }}>{unit}</small>}
      </span>
    </div>
  );
}

function devStatusTag(status?: Device["status"]) {
  if (!status) return <Tag tone="muted">分散机组</Tag>;
  if (status === "online") return <Tag tone="ok">在线</Tag>;
  if (status === "fault") return <Tag tone="danger">故障</Tag>;
  if (status === "maintenance") return <Tag tone="warn">维护中</Tag>;
  return <Tag tone="muted">离线</Tag>;
}

const anomalyStatusText = { open: "待处理", handling: "处理中", closed: "已闭环" } as const;

export function KeyAreasPage() {
  const { role, allPermissions, pageFilters, setPageFilter, pushToast } = useDemoStore();
  const writable = canWrite(MODULE_ID, role, allPermissions);
  const pf = pageFilters[MODULE_ID] ?? {};
  const tab = pf.tab === "icu" || pf.tab === "equip" ? pf.tab : "or";
  const simTemp = typeof pf.simTemp === "number" ? pf.simTemp : ICU_TEMP_DEFAULT;
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});

  // 全部派生数据确定性来自数据层，只算一次
  const D = useMemo(() => {
    const asOf = demoAsOfDate;
    const monthStart = `${asOf.slice(0, 7)}-01`;

    // ---- 手术室 ----
    const surgicalToday = dailyUsage("surgical", "electricity", asOf);
    const hourlyToday = hourlySeries("surgical", "electricity", asOf);
    const hourlyBase = hourlySeries("surgical", "electricity", OR_BASELINE_DATE);
    const surgToday = surgeryCount(asOf);
    const ovToday = outpatientVisits(asOf);
    const purElec = Math.round(surgicalToday * PURIFICATION_SHARE);
    const zoneWeightSum = cleanZones.reduce((s, z) => s + z.weight, 0);
    const zoneRows = cleanZones.map((z) => {
      const tempOk = z.env.tempC >= 21 && z.env.tempC <= 25;
      const rhOk = z.env.rhPct >= 30 && z.env.rhPct <= 60;
      const dpOk = z.env.pressurePa >= 5;
      return {
        ...z,
        kwh: Math.round((purElec * z.weight) / zoneWeightSum),
        tempOk, rhOk, dpOk,
        envOk: tempOk && rhOk && dpOk && z.env.particleOk,
      };
    });
    const phaseToday = orPhases.map((p) => phaseAvgKw(hourlyToday, p.hours));
    const phaseBase = orPhases.map((p) => phaseAvgKw(hourlyBase, p.hours));
    const idleToday = phaseToday[3];
    const idleBase = phaseBase[3];
    const idleUpliftPct = Math.round((idleToday / idleBase - 1) * 100);
    const orYoy = yoyPct("electricity", monthStart, asOf, "surgical");
    const orCards = orEquipCards.map((c) => {
      const hours = Math.round(surgToday * c.hoursPerSurgery);
      const kwh = Math.round(hours * c.unitKw);
      return { ...c, hours, kwh, sharePct: (kwh / surgicalToday) * 100 };
    });

    const phaseBarOption = {
      legend: {},
      xAxis: { type: "category", data: orPhases.map((p) => p.name) },
      yAxis: { type: "value", name: "kW" },
      series: [
        {
          name: `今日 ${asOf.slice(5)}`, type: "bar", barWidth: 20,
          data: phaseToday.map((v, i) => (i === 3 ? { value: v, itemStyle: { color: "#f4525f" } } : v)),
        },
        { name: `setback 正常期 ${OR_BASELINE_DATE.slice(5)}`, type: "bar", barWidth: 20, data: phaseBase },
      ],
    };

    const hourLineOption = {
      legend: {},
      grid: { top: 26, bottom: 20 },
      xAxis: { type: "category", data: hourlyToday.map((p) => p.t) },
      yAxis: { type: "value", name: "kWh/h" },
      series: [
        {
          name: `今日 ${asOf.slice(5)}`, type: "line", smooth: true, showSymbol: false,
          data: hourlyToday.map((p) => p.v),
          markArea: {
            silent: true,
            itemStyle: { color: "rgba(244, 82, 95, 0.08)" },
            label: { color: "#9db4d6", fontSize: 10 },
            data: [
              [{ name: "setback 窗口", xAxis: "22:00" }, { xAxis: "23:00" }],
              [{ xAxis: "00:00" }, { xAxis: "06:00" }],
            ],
          },
        },
        {
          name: `正常基线 ${OR_BASELINE_DATE.slice(5)}`, type: "line", smooth: true, showSymbol: false,
          lineStyle: { type: "dashed" }, data: hourlyBase.map((p) => p.v),
        },
      ],
    };

    // ---- ICU ----
    const occ = bedOccupancy(asOf);
    const icuMeterElec = Math.round(surgicalToday * ICU_METER_SHARE);
    const icuRows = icuDevices.map((r) => ({ ...r, kwh: Math.round(r.count * r.unitKw * r.hoursPerDay * 10) / 10 }));
    const icuDeviceSum = Math.round(icuRows.reduce((s, r) => s + r.kwh, 0));
    const icuCoveragePct = Math.round((icuDeviceSum / icuMeterElec) * 100);
    const icuAhuDaily = icuRows.find((r) => r.name.startsWith("恒温恒湿"))?.kwh ?? 0;
    const heatDayKwhTh = icuAhuDaily * icuWasteHeat.condenserHeatRatio * icuWasteHeat.recoveryRatio;
    const heatYearGj = Math.round(heatDayKwhTh * 0.0036 * icuWasteHeat.seasonDays);
    const gasSavedM3 = Math.round((heatYearGj / (icuWasteHeat.gasLhvGjPerM3 * icuWasteHeat.boilerEff)) / 10) * 10;
    const gasSavedWan = Math.round((gasSavedM3 * energyKindMeta.gas.price) / 1000) / 10;
    const gasCo2T = Math.round((gasSavedM3 * activeFactors.gas) / 100) / 10;
    const wastePaybackYears = Math.round((icuWasteHeat.investWanYuan / gasSavedWan) * 10) / 10;

    // ---- 大型医疗设备 ----
    const imagingToday = dailyUsage("imaging", "electricity", asOf);
    const ovRatio = ovToday / 8200;
    const equipRows = largeEquipSpecs.map((s) => {
      const dev = deviceById[s.deviceId];
      const maintenance = dev?.status === "maintenance";
      const exams = maintenance ? 0 : Math.round(s.dailyExamBase * ovRatio * (0.9 + unitNoise(`ka-exam:${s.deviceId}:${asOf}`) * 0.2));
      const scanKwhDay = Math.round(exams * s.scanKwh);
      const standbyH = Math.max(0, 24 - (exams * s.scanMin) / 60);
      const standbyKw = dev?.standbyPowerKw ?? s.baselineStandbyKw;
      const standbyKwhDay = Math.round(standbyKw * standbyH);
      return {
        ...s, dev, maintenance, exams, scanKwhDay, standbyH, standbyKw, standbyKwhDay,
        standbyOverPct: Math.round((standbyKw / s.baselineStandbyKw - 1) * 100),
        scanCo2Kg: Math.round(s.scanKwh * activeFactors.electricity * 10) / 10,
      };
    });
    const bySh = (short: string) => equipRows.find((r) => r.short === short) ?? equipRows[0];
    const scanTotal = equipRows.reduce((s, r) => s + r.scanKwhDay, 0);
    const standbyTotal = equipRows.reduce((s, r) => s + r.standbyKwhDay, 0);
    const examTotal = equipRows.reduce((s, r) => s + r.exams, 0);
    const otherImaging = Math.max(0, Math.round(imagingToday - scanTotal - standbyTotal));
    const largeDevToday = scanTotal + standbyTotal;
    const imgYoy = yoyPct("electricity", monthStart, asOf, "imaging");
    const mri02 = bySh("MRI-02");
    const ct01 = bySh("CT-01");
    const ct02 = bySh("CT-02");

    const standbyBarOption = {
      legend: {},
      xAxis: { type: "category", data: equipRows.map((r) => r.short) },
      yAxis: { type: "value", name: "kW" },
      series: [
        {
          name: "当前待机功率", type: "bar", barWidth: 16,
          data: equipRows.map((r) => (r.standbyOverPct >= 30 ? { value: r.standbyKw, itemStyle: { color: "#f4525f" } } : r.standbyKw)),
        },
        { name: "同型基线", type: "bar", barWidth: 16, data: equipRows.map((r) => r.baselineStandbyKw) },
      ],
    };

    const imagingPieOption = {
      tooltip: { trigger: "item", formatter: "{b}：{c} kWh（{d}%）" },
      legend: { orient: "vertical", right: 0, top: "middle" },
      series: [
        {
          type: "pie", radius: ["42%", "68%"], center: ["34%", "52%"],
          label: { color: "#9db4d6", fontSize: 10, formatter: "{c} kWh" },
          data: [
            { name: "检查扫描用电", value: scanTotal },
            { name: "待机用电", value: standbyTotal },
            { name: "机房空调/冷却与其他", value: otherImaging },
          ],
        },
      ],
    };

    // ---- 口径说明 ----
    const hospitalToday = sumUsage("electricity", asOf, asOf);
    const totalArea = mainBuildings.reduce((s, b) => s + b.areaM2, 0);
    const intensityAll = hospitalToday / totalArea;
    const intensityRegular = (hospitalToday - largeDevToday) / totalArea;
    const largeSharePct = (largeDevToday / hospitalToday) * 100;

    return {
      surgicalToday, surgToday, ovToday, purElec, zoneRows, phaseBarOption, hourLineOption,
      idleToday, idleUpliftPct, orYoy, orCards,
      occ, icuMeterElec, icuRows, icuDeviceSum, icuCoveragePct, icuAhuDaily,
      heatYearGj, gasSavedM3, gasSavedWan, gasCo2T, wastePaybackYears,
      imagingToday, equipRows, scanTotal, standbyTotal, examTotal, largeDevToday, imgYoy,
      mri02, ct01, ct02, standbyBarOption, imagingPieOption,
      hospitalToday, totalArea, intensityAll, intensityRegular, largeSharePct,
    };
  }, []);

  const an001 = anomalyById["AN-001"];
  const an006 = anomalyById["AN-006"];

  // ICU 温控模拟（允许范围内模拟，不下发真实控制）
  const tempDelta = simTemp - ICU_TEMP_DEFAULT;
  const simSaveKwh = Math.round(tempDelta * ICU_TEMP_SAVING_PER_DEG * D.icuAhuDaily);
  const simSaveYuan = Math.round(simSaveKwh * energyKindMeta.electricity.price);
  const simSaveCo2 = Math.round(simSaveKwh * activeFactors.electricity);

  // 休眠策略勾选（持久化在 pageFilters）
  const stratOn = (id: string) => {
    const v = pf[`strat_${id}`];
    return typeof v === "boolean" ? v : id === "nightSleep";
  };
  const toggleStrat = (id: string) => setPageFilter(MODULE_ID, { [`strat_${id}`]: !stratOn(id) });
  const selectedStrats = sleepStrategies.filter((s) => stratOn(s.id));
  const stratMwh = Math.round(selectedStrats.reduce((s, x) => s + x.savingMwhPerYear, 0) * 10) / 10;
  const stratWan = Math.round(stratMwh * 1000 * energyKindMeta.electricity.price / 1000) / 10;
  const stratCo2T = Math.round(stratMwh * activeFactors.electricity * 10) / 10;

  const setTab = (t: string) => setPageFilter(MODULE_ID, { tab: t });

  const confirm = (id: string, title: string) => {
    setConfirmed((s) => ({ ...s, [id]: true }));
    pushToast("已记录人工确认", `${title}：确认结论仅用于演示，不下发任何控制指令`, "success");
  };

  const onExport = async () => {
    const { downloadCsv } = await import("../../utils/downloads");
    if (tab === "or") {
      downloadCsv(
        D.zoneRows.map((z) => ({
          洁净级别: z.level, 手术间数: z.rooms || "—", 净化机组: z.ahuLabel,
          换气标准: z.airChangeStd, 压差要求: z.pressureStd, "今日净化电耗(kWh)": z.kwh,
          "温度(℃)": z.env.tempC, "湿度(%)": z.env.rhPct, "压差(Pa)": z.env.pressurePa,
          环境合规: z.envOk ? "达标" : "异常", 备注: z.envNote ?? "",
        })),
        `重点区域_手术室洁净分区_${demoAsOfDate}.csv`,
      );
    } else if (tab === "icu") {
      downloadCsv(
        D.icuRows.map((r) => ({
          分级: icuTierMeta[r.tier].name, 设备: r.name, 台数: r.count, "单台功率(kW)": r.unitKw,
          "运行台时(h/日)": r.hoursPerDay, "今日能耗(kWh)": r.kwh, 调整策略: icuTierMeta[r.tier].policy,
        })),
        `重点区域_ICU设备分级_${demoAsOfDate}.csv`,
      );
    } else {
      downloadCsv(
        D.equipRows.map((r) => ({
          设备: r.short, 型号: r.modality, 状态: r.maintenance ? "维护中" : "在线",
          "单次检查能耗(kWh)": r.scanKwh, "单次时长(min)": r.scanMin, "今日检查(次)": r.exams,
          "检查用电(kWh)": r.scanKwhDay, "待机功率(kW)": r.standbyKw, "同型基线(kW)": r.baselineStandbyKw,
          "待机用电(kWh)": r.standbyKwhDay, "单次碳排(kgCO2e)": r.scanCo2Kg,
        })),
        `重点区域_大型医疗设备_${demoAsOfDate}.csv`,
      );
    }
    pushToast("导出完成", "已按当前页签生成 CSV（Demo 模拟数据）", "success");
  };

  const TABS = [
    { id: "or", name: "手术室", icon: <Slice size={14} /> },
    { id: "icu", name: "ICU", icon: <HeartPulse size={14} /> },
    { id: "equip", name: "大型医疗设备", icon: <ScanLine size={14} /> },
  ];

  return (
    <>
      <PageHead
        title="重点区域能耗管理"
        sub={`手术室、ICU 与大型医疗设备专项能耗 · 基准日 ${demoAsOfDate}`}
        actions={
          <>
            <Tag tone="danger">医疗安全优先 · 不做真实控制</Tag>
            <button className="pf-btn ghost" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} onClick={onExport}>
              <Download size={14} /> 导出当前页签 CSV
            </button>
          </>
        }
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`pf-btn ${tab === t.id ? "primary" : "ghost"}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            onClick={() => setTab(t.id)}
          >
            {t.icon}
            {t.name}
          </button>
        ))}
      </div>

      {tab === "or" && (
        <>
          <div className="grid cols-4">
            <Kpi label="手术医技楼今日电耗" icon={<Zap size={14} />} value={fmt(D.surgicalToday)} unit="kWh" sub={<Delta pct={D.orYoy} label="月累计同比" />} />
            <Kpi label="今日手术台次" icon={<Slice size={14} />} value={D.surgToday} unit="台" sub={`门诊 ${fmt(D.ovToday)} 人次`} />
            <Kpi label="净化空调电耗（估算）" icon={<Fan size={14} />} value={fmt(D.purElec)} unit="kWh" sub={`占楼宇 ${Math.round(PURIFICATION_SHARE * 100)}%（演示分摊）`} />
            <Kpi tone="red" label="非使用时段平均负荷" icon={<MoonStar size={14} />} value={D.idleToday} unit="kW" sub={`较 setback 正常期 +${D.idleUpliftPct}%（AN-001）`} />
          </div>

          <div className="grid cols-2" style={{ marginTop: 10 }}>
            <Panel title="洁净级别分区与净化机组" extra={<span>阈值为演示配置，正式部署按 GB 50333 现行版核验</span>}>
              <table className="pf-table">
                <thead>
                  <tr><th>洁净级别</th><th>手术间</th><th>净化机组</th><th>机组状态</th><th>换气标准</th><th>压差要求</th><th style={{ textAlign: "right" }}>今日电耗 kWh</th><th>环境</th></tr>
                </thead>
                <tbody>
                  {D.zoneRows.map((z) => (
                    <tr key={z.id}>
                      <td>{z.level}</td>
                      <td className="num">{z.rooms || "—"}</td>
                      <td>{z.ahuLabel}</td>
                      <td>{devStatusTag(z.ahuDeviceId ? deviceById[z.ahuDeviceId]?.status : undefined)}</td>
                      <td>{z.airChangeStd}</td>
                      <td>{z.pressureStd}</td>
                      <td className="num" style={{ textAlign: "right" }}>{fmt(z.kwh)}</td>
                      <td>{z.envOk ? <Tag tone="ok">达标</Tag> : <Tag tone="warn">湿度超限</Tag>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={noteStyle}>净化电耗按机组额定功率权重分摊（演示口径），合计 {fmt(D.purElec)} kWh。AHU-03（万级）故障检修中，备用机组旁路供风，见页底冗余状态。</p>
            </Panel>

            <Panel title="分时段平均功率对比（手术医技楼 · 电）">
              <EChart height={252} option={D.phaseBarOption} />
              <p style={noteStyle}>
                非使用时段（22:00-06:00）今日平均负荷 <b className="num" style={{ color: "var(--red)" }}>{D.idleToday} kW</b>，较 setback 正常期（{OR_BASELINE_DATE}）高 {D.idleUpliftPct}%，未见夜间降载——评估见左下 AN-001 卡片。
              </p>
            </Panel>
          </div>

          <div className="grid cols-2" style={{ marginTop: 10 }}>
            <Panel
              title="setback 策略评估（AN-001 · 模拟诊断）"
              extra={
                <>
                  <Tag tone="info">模拟诊断</Tag>
                  <Tag tone="warn">置信度 {an001.aiConfidencePct}%</Tag>
                  <Tag tone={an001.status === "closed" ? "ok" : "warn"}>{anomalyStatusText[an001.status]}</Tag>
                </>
              }
            >
              <EChart height={182} option={D.hourLineOption} />
              <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "8px 0 4px" }}><b>根因：</b>{an001.rootCause}</p>
              <ul style={{ margin: "0 0 6px", paddingLeft: 18, fontSize: 11, color: "var(--ink-3)", lineHeight: 1.7 }}>
                {an001.evidence.map((e) => <li key={e}>{e}</li>)}
              </ul>
              <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "0 0 8px" }}><b>建议：</b>{an001.suggestion}</p>
              <div style={{ display: "flex", gap: 22, marginBottom: 4 }}>
                <Stat label="节能潜力" value={an001.estSavingMwhPerYear} unit="MWh/年" tone="green" />
                <Stat label="费用节省" value={an001.estSavingWanYuanPerYear} unit="万元/年" tone="green" />
                <Stat label="减碳量" value={an001.estReductionTPerYear} unit="tCO2e/年" tone="green" />
                <Stat label="责任人" value={an001.owner} />
              </div>
              <div style={safetyBoxStyle}>
                <ShieldAlert size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{an001.medicalSafetyNote}——不影响医疗安全 / 保障优先。</span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
                {confirmed["an001"] ? (
                  <Tag tone="ok">已人工确认（演示）</Tag>
                ) : (
                  <button className="pf-btn primary" disabled={!writable} title={writable ? undefined : "当前角色无本模块写权限"} onClick={() => confirm("an001", "AN-001 setback 恢复建议")}>
                    人工确认建议
                  </button>
                )}
                <span style={{ fontSize: 11, color: "var(--ink-3)" }}>关联：{an001.alarmId} · {an001.workOrderId} · {an001.projectId}</span>
              </div>
            </Panel>

            <Panel title="温湿度 / 压差 / 洁净度合规状态" extra={<span>标准：21-25℃ · 30-60% · ≥ +5 Pa</span>}>
              <table className="pf-table">
                <thead>
                  <tr><th>区域</th><th>温度</th><th>湿度</th><th>压差</th><th>洁净度</th></tr>
                </thead>
                <tbody>
                  {D.zoneRows.map((z) => (
                    <tr key={z.id}>
                      <td>{z.level}</td>
                      <td className="num"><StatusDot tone={z.tempOk ? "ok" : "warn"} />{z.env.tempC.toFixed(1)}℃</td>
                      <td className="num"><StatusDot tone={z.rhOk ? "ok" : "warn"} />{z.env.rhPct.toFixed(1)}%</td>
                      <td className="num"><StatusDot tone={z.dpOk ? "ok" : "danger"} />+{z.env.pressurePa.toFixed(1)} Pa</td>
                      <td><StatusDot tone={z.env.particleOk ? "ok" : "danger"} />{z.env.particleOk ? "达标" : "超标"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {D.zoneRows.filter((z) => z.envNote).map((z) => (
                <p key={z.id} style={{ ...noteStyle, margin: "6px 0 0" }}>
                  <AlertTriangle size={11} style={{ verticalAlign: -1, marginRight: 4, color: "var(--amber)" }} />
                  {z.level}：{z.envNote}
                </p>
              ))}
              <p style={noteStyle}>手术室压差与洁净度属感染控制红线，只允许人工检修流程，平台不做任何自动调节。</p>
            </Panel>
          </div>

          <div className="grid cols-3" style={{ marginTop: 10 }}>
            {D.orCards.map((c) => (
              <Panel key={c.id} title={c.name} extra={c.safety ? <Tag tone="danger">医疗安全优先</Tag> : undefined}>
                <div style={{ display: "flex", gap: 22, marginBottom: 6 }}>
                  <Stat label="配置" value={`${c.count} 台 × ${c.unitKw} kW`} />
                  <Stat label="今日台时" value={c.hours} unit="h" />
                  <Stat label="今日能耗" value={fmt(c.kwh)} unit="kWh" tone="cyan" />
                </div>
                <p style={{ fontSize: 11, color: "var(--ink-3)", margin: 0 }}>
                  按 {D.surgToday} 台手术 × {c.hoursPerSurgery} h/台估算 · 占楼宇电耗 {c.sharePct.toFixed(1)}%
                </p>
                <p style={{ ...noteStyle, margin: "4px 0 0" }}>{c.note}</p>
              </Panel>
            ))}
          </div>
        </>
      )}

      {tab === "icu" && (
        <>
          <div
            style={{
              border: "1px solid rgba(244, 82, 95, 0.5)", background: "rgba(244, 82, 95, 0.08)",
              borderRadius: 8, padding: "10px 14px", display: "flex", gap: 10, alignItems: "center",
              marginBottom: 10, color: "var(--red)", fontSize: 13, fontWeight: 600,
            }}
          >
            <ShieldAlert size={18} style={{ flexShrink: 0 }} />
            任何节能建议不得影响生命支持和感染控制——生命支持设备一律不列入调整范围；温控仅做允许范围内模拟，不下发真实控制。
          </div>

          <div className="grid cols-4">
            <Kpi label="ICU 床位" icon={<BedDouble size={14} />} value={ICU_BEDS} unit="张" sub={`床位使用率 ${D.occ.toFixed(1)}%`} />
            <Kpi label="ICU 区域计量电耗（今日估算）" icon={<Zap size={14} />} value={fmt(D.icuMeterElec)} unit="kWh" sub={`占手术医技楼 ${Math.round(ICU_METER_SHARE * 100)}%（演示分摊）`} />
            <Kpi label="换气次数" icon={<Wind size={14} />} value={icuEnv.airChangeMeasured} unit="次/h" sub={`设计 ${icuEnv.airChangeDesign} 次/h · 正压 +${icuEnv.pressureMeasuredPa} Pa`} />
            <Kpi label="恒温恒湿（实测）" icon={<Thermometer size={14} />} value={`${icuEnv.tempMeasuredC}℃ / ${icuEnv.rhMeasuredPct}%`} sub={`设定 ${icuEnv.tempSetC}℃ / ${icuEnv.rhSetPct}%`} />
          </div>

          <div className="grid cols-2" style={{ marginTop: 10 }}>
            <Panel title="设备三级清单（生命支持 / 治疗 / 辅助）">
              <table className="pf-table">
                <thead>
                  <tr><th>分级</th><th>设备</th><th style={{ textAlign: "right" }}>台数</th><th style={{ textAlign: "right" }}>单台 kW</th><th style={{ textAlign: "right" }}>台时/日</th><th style={{ textAlign: "right" }}>今日 kWh</th><th>调整策略</th></tr>
                </thead>
                <tbody>
                  {D.icuRows.map((r) => (
                    <tr key={r.name}>
                      <td><Tag tone={icuTierMeta[r.tier].tone}>{icuTierMeta[r.tier].name}</Tag></td>
                      <td title={r.note}>{r.name}</td>
                      <td className="num" style={{ textAlign: "right" }}>{r.count}</td>
                      <td className="num" style={{ textAlign: "right" }}>{r.unitKw}</td>
                      <td className="num" style={{ textAlign: "right" }}>{r.hoursPerDay}</td>
                      <td className="num" style={{ textAlign: "right" }}>{fmt(r.kwh)}</td>
                      <td style={{ fontSize: 11 }}>{icuTierMeta[r.tier].policy}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={5} style={{ fontWeight: 600, color: "var(--ink-1)" }}>设备负荷合计</td>
                    <td className="num" style={{ textAlign: "right", fontWeight: 700, color: "var(--ink-1)" }}>{fmt(D.icuDeviceSum)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
              <p style={noteStyle}>
                以上设备负荷占 ICU 区域计量电耗（{fmt(D.icuMeterElec)} kWh）约 {D.icuCoveragePct}%，其余为插座、医气终端与公共负荷。恒温恒湿机组为独立冷热源（{icuEnv.coolingSource}）。
              </p>
            </Panel>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Panel title="恒温恒湿参数与温控模拟" extra={<Tag tone="info">仅模拟 · 不下发控制</Tag>}>
                <div style={{ display: "flex", gap: 22, marginBottom: 10 }}>
                  <Stat label="换气次数" value={`${icuEnv.airChangeMeasured} / ${icuEnv.airChangeDesign}`} unit="实测/设计 次/h" />
                  <Stat label="正压" value={`+${icuEnv.pressureMeasuredPa}`} unit="Pa" />
                  <Stat label="温度" value={`${icuEnv.tempMeasuredC} / ${icuEnv.tempSetC}`} unit="实测/设定 ℃" />
                  <Stat label="湿度" value={`${icuEnv.rhMeasuredPct} / ${icuEnv.rhSetPct}`} unit="实测/设定 %" />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--ink-2)" }}>
                  <span style={{ whiteSpace: "nowrap" }}>模拟设定 <b className="num" style={{ color: "var(--cyan)" }}>{simTemp.toFixed(1)}℃</b></span>
                  <input
                    type="range" min={ICU_TEMP_MIN} max={ICU_TEMP_MAX} step={0.5} value={simTemp}
                    style={{ flex: 1, accentColor: "var(--cyan)" }}
                    onChange={(e) => setPageFilter(MODULE_ID, { simTemp: Number(e.target.value) })}
                  />
                  <span style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" }}>{ICU_TEMP_MIN}-{ICU_TEMP_MAX}℃</span>
                </div>
                <p style={{ fontSize: 12, margin: "8px 0 0", color: simSaveKwh > 0 ? "var(--green)" : simSaveKwh < 0 ? "var(--red)" : "var(--ink-3)" }}>
                  {simSaveKwh === 0
                    ? `与基准 ${ICU_TEMP_DEFAULT}℃ 一致，恒温恒湿能耗无变化`
                    : simSaveKwh > 0
                      ? `较基准 ${ICU_TEMP_DEFAULT}℃ 估算节电 ${simSaveKwh} kWh/日（约 ${simSaveYuan} 元/日 · 减碳 ${simSaveCo2} kgCO2e/日）`
                      : `较基准 ${ICU_TEMP_DEFAULT}℃ 估算增加能耗 ${Math.abs(simSaveKwh)} kWh/日（约 ${Math.abs(simSaveYuan)} 元/日 · 增碳 ${Math.abs(simSaveCo2)} kgCO2e/日）`}
                </p>
                <p style={noteStyle}>
                  允许范围内模拟（{ICU_TEMP_MIN}-{ICU_TEMP_MAX}℃），不下发真实控制。设定调整须经 ICU 医护与院感科确认体感与感染控制要求后由现场执行。
                </p>
              </Panel>

              <Panel
                title="余热利用评估（模拟诊断）"
                extra={
                  <>
                    <Tag tone="info">模拟诊断</Tag>
                    <Tag tone="warn">置信度 {icuWasteHeat.confidencePct}%</Tag>
                  </>
                }
              >
                <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "0 0 8px", display: "flex", gap: 6, alignItems: "center" }}>
                  <Recycle size={14} style={{ color: "var(--green)", flexShrink: 0 }} />
                  恒温恒湿机组冷凝热回收 → 生活热水预热：按机组日耗电 {fmt(D.icuAhuDaily)} kWh、冷凝热倍率 {icuWasteHeat.condenserHeatRatio}、可回收比例 {Math.round(icuWasteHeat.recoveryRatio * 100)}%、制冷季 {icuWasteHeat.seasonDays} 天估算。
                </p>
                <div style={{ display: "flex", gap: 22, marginBottom: 4 }}>
                  <Stat label="年可回收热量" value={fmt(D.heatYearGj)} unit="GJ" tone="green" />
                  <Stat label="折减天然气" value={fmt(D.gasSavedM3)} unit="m³/年" tone="green" />
                  <Stat label="费用节省" value={D.gasSavedWan} unit="万元/年" tone="green" />
                  <Stat label="减碳" value={D.gasCo2T} unit="t/年" tone="green" />
                </div>
                <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "0 0 2px" }}>投资估算 {icuWasteHeat.investWanYuan} 万元 · 静态回收期 {D.wastePaybackYears} 年</p>
                <div style={safetyBoxStyle}>
                  <ShieldAlert size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>采用旁通设计，机组冗余、供冷可靠性与感染控制参数不变——不影响医疗安全 / 保障优先。</span>
                </div>
                <div style={{ marginTop: 10 }}>
                  {confirmed["icuWaste"] ? (
                    <Tag tone="ok">已人工确认（演示）</Tag>
                  ) : (
                    <button className="pf-btn primary" disabled={!writable} title={writable ? undefined : "当前角色无本模块写权限"} onClick={() => confirm("icuWaste", "ICU 余热利用评估")}>
                      人工确认评估
                    </button>
                  )}
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}

      {tab === "equip" && (
        <>
          <div className="grid cols-4">
            <Kpi label="影像中心今日电耗" icon={<Zap size={14} />} value={fmt(D.imagingToday)} unit="kWh" sub={<Delta pct={D.imgYoy} label="月累计同比" />} />
            <Kpi label="今日检查用电" icon={<Activity size={14} />} value={fmt(D.scanTotal)} unit="kWh" sub={`${D.examTotal} 次检查`} />
            <Kpi label="今日待机用电" icon={<MoonStar size={14} />} value={fmt(D.standbyTotal)} unit="kWh" sub={`占影像中心 ${((D.standbyTotal / D.imagingToday) * 100).toFixed(1)}%`} />
            <Kpi tone="red" label="MRI-02 待机功率" icon={<AlertTriangle size={14} />} value={D.mri02.standbyKw} unit="kW" sub={`同型基线 ${D.mri02.baselineStandbyKw} kW · +${D.mri02.standbyOverPct}%（AN-006）`} />
          </div>

          <Panel title="单次检查能耗估算（CT / MRI / DSA / 直线加速器 · 独立计量）" style={{ marginTop: 10 }}>
            <table className="pf-table">
              <thead>
                <tr>
                  <th>设备</th><th>型号</th><th>状态</th>
                  <th style={{ textAlign: "right" }}>单次能耗 kWh</th><th style={{ textAlign: "right" }}>单次时长 min</th>
                  <th style={{ textAlign: "right" }}>今日检查 次</th><th style={{ textAlign: "right" }}>检查用电 kWh</th>
                  <th style={{ textAlign: "right" }}>待机功率 kW</th><th style={{ textAlign: "right" }}>待机用电 kWh</th>
                  <th style={{ textAlign: "right" }}>单次碳排 kgCO2e</th>
                </tr>
              </thead>
              <tbody>
                {D.equipRows.map((r) => (
                  <tr key={r.deviceId}>
                    <td style={{ fontWeight: 600, color: "var(--ink-1)" }}>{r.short}</td>
                    <td>{r.modality}</td>
                    <td>{r.maintenance ? <Tag tone="warn">维护中</Tag> : <Tag tone="ok">在线</Tag>}</td>
                    <td className="num" style={{ textAlign: "right" }}>{r.scanKwh}</td>
                    <td className="num" style={{ textAlign: "right" }}>{r.scanMin}</td>
                    <td className="num" style={{ textAlign: "right" }}>{r.exams}</td>
                    <td className="num" style={{ textAlign: "right" }}>{fmt(r.scanKwhDay)}</td>
                    <td className="num" style={{ textAlign: "right", color: r.standbyOverPct >= 30 ? "var(--red)" : undefined, fontWeight: r.standbyOverPct >= 30 ? 700 : undefined }}>
                      {r.standbyKw}
                      {r.standbyOverPct >= 30 && <span style={{ marginLeft: 6 }}><Tag tone="danger">+{r.standbyOverPct}%</Tag></span>}
                    </td>
                    <td className="num" style={{ textAlign: "right" }}>{fmt(r.standbyKwhDay)}</td>
                    <td className="num" style={{ textAlign: "right" }}>{r.scanCo2Kg}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={noteStyle}>
              单次检查能耗为含图像重建与冷却增量的演示估算参数；检查次数按当日门诊量联动生成。DSA-01 今日计划维护，检查为 0、保持低功率维护供电。
            </p>
          </Panel>

          <div className="grid cols-2" style={{ marginTop: 10 }}>
            <Panel title="待机功耗对比（当前 vs 同型基线）">
              <EChart height={230} option={D.standbyBarOption} />
              <p style={noteStyle}>
                MRI-02 待机 {D.mri02.standbyKw} kW，超同型基线 {D.mri02.standbyOverPct}%（AN-006，标红）；其余设备待机处于基线 ±20% 正常带。
              </p>
            </Panel>
            <Panel title="影像中心今日用电结构">
              <EChart height={230} option={D.imagingPieOption} />
              <p style={noteStyle}>
                检查扫描 {fmt(D.scanTotal)} + 待机 {fmt(D.standbyTotal)} + 机房空调/冷却与其他 {fmt(D.imagingToday - D.scanTotal - D.standbyTotal)} = 影像中心 {fmt(D.imagingToday)} kWh（与楼宇计量一致）。
              </p>
            </Panel>
          </div>

          <div className="grid cols-3" style={{ marginTop: 10 }}>
            <Panel
              title="MRI-02 待机偏高（AN-006 · 模拟诊断）"
              extra={
                <>
                  <Tag tone="info">模拟诊断</Tag>
                  <Tag tone="warn">置信度 {an006.aiConfidencePct}%</Tag>
                  <Tag tone={an006.status === "closed" ? "ok" : "warn"}>{anomalyStatusText[an006.status]}</Tag>
                </>
              }
            >
              <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "0 0 4px" }}><b>根因：</b>{an006.rootCause}</p>
              <ul style={{ margin: "0 0 6px", paddingLeft: 18, fontSize: 11, color: "var(--ink-3)", lineHeight: 1.7 }}>
                {an006.evidence.map((e) => <li key={e}>{e}</li>)}
              </ul>
              <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "0 0 8px" }}><b>建议：</b>{an006.suggestion}</p>
              <div style={{ display: "flex", gap: 18, marginBottom: 4 }}>
                <Stat label="节能潜力" value={an006.estSavingMwhPerYear} unit="MWh/年" tone="green" />
                <Stat label="费用节省" value={an006.estSavingWanYuanPerYear} unit="万元/年" tone="green" />
                <Stat label="减碳" value={an006.estReductionTPerYear} unit="t/年" tone="green" />
              </div>
              <div style={safetyBoxStyle}>
                <ShieldAlert size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{an006.medicalSafetyNote}——不影响医疗安全 / 保障优先。</span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
                {confirmed["an006"] ? (
                  <Tag tone="ok">已人工确认（演示）</Tag>
                ) : (
                  <button className="pf-btn primary" disabled={!writable} title={writable ? undefined : "当前角色无本模块写权限"} onClick={() => confirm("an006", "AN-006 分级待机建议")}>
                    人工确认建议
                  </button>
                )}
                <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{an006.alarmId} · {an006.workOrderId}</span>
              </div>
            </Panel>

            <Panel title="休眠策略与预约制运行评估" extra={<Tag tone="info">模拟叠加测算</Tag>}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sleepStrategies.map((s) => (
                  <label key={s.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "var(--ink-2)", cursor: "pointer" }}>
                    <input type="checkbox" checked={stratOn(s.id)} onChange={() => toggleStrat(s.id)} style={{ accentColor: "var(--cyan)", marginTop: 2 }} />
                    <span style={{ flex: 1 }}>
                      <b style={{ color: "var(--ink-1)" }}>{s.name}</b>
                      <Tag tone={s.risk === "low" ? "ok" : "warn"}>{s.risk === "low" ? "低风险" : "中风险"}</Tag>{" "}
                      <Tag tone="muted">{s.status}</Tag>
                      <span style={{ display: "block", fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                        适用 {s.targets} · 预计 {s.savingMwhPerYear} MWh/年
                      </span>
                      <span style={{ display: "block", fontSize: 11, color: "var(--amber)", marginTop: 2 }}>{s.safetyNote}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div style={{ borderTop: "1px solid var(--panel-border)", marginTop: 10, paddingTop: 8, display: "flex", gap: 18 }}>
                <Stat label="勾选策略叠加节省" value={stratMwh} unit="MWh/年" tone={stratMwh > 0 ? "green" : undefined} />
                <Stat label="折费用" value={stratWan} unit="万元/年" tone={stratMwh > 0 ? "green" : undefined} />
                <Stat label="折减碳" value={stratCo2T} unit="tCO2e/年" tone={stratMwh > 0 ? "green" : undefined} />
              </div>
              <p style={noteStyle}>叠加测算为模拟诊断结果；实施前须医学工程科与设备厂商双确认，急诊通道设备保留即时开机能力。</p>
            </Panel>

            <Panel title="新旧设备对比：CT-01 vs CT-02">
              <table className="pf-table">
                <thead>
                  <tr><th>指标</th><th style={{ textAlign: "right" }}>CT-01（2021）</th><th style={{ textAlign: "right" }}>CT-02（2017）</th></tr>
                </thead>
                <tbody>
                  <tr><td>额定功率 kW</td><td className="num" style={{ textAlign: "right" }}>{D.ct01.dev?.ratedPowerKw}</td><td className="num" style={{ textAlign: "right" }}>{D.ct02.dev?.ratedPowerKw}</td></tr>
                  <tr><td>单次检查能耗 kWh</td><td className="num" style={{ textAlign: "right" }}>{D.ct01.scanKwh}</td><td className="num" style={{ textAlign: "right", color: "var(--amber)" }}>{D.ct02.scanKwh}</td></tr>
                  <tr><td>单次碳排 kgCO2e</td><td className="num" style={{ textAlign: "right" }}>{D.ct01.scanCo2Kg}</td><td className="num" style={{ textAlign: "right" }}>{D.ct02.scanCo2Kg}</td></tr>
                  <tr><td>待机功率 kW</td><td className="num" style={{ textAlign: "right" }}>{D.ct01.standbyKw}</td><td className="num" style={{ textAlign: "right" }}>{D.ct02.standbyKw}</td></tr>
                  <tr><td>今日检查 次</td><td className="num" style={{ textAlign: "right" }}>{D.ct01.exams}</td><td className="num" style={{ textAlign: "right" }}>{D.ct02.exams}</td></tr>
                  <tr><td>累计运行小时</td><td className="num" style={{ textAlign: "right" }}>{fmt(D.ct01.dev?.runHours ?? 0)}</td><td className="num" style={{ textAlign: "right" }}>{fmt(D.ct02.dev?.runHours ?? 0)}</td></tr>
                  <tr><td>效率衰减</td><td className="num" style={{ textAlign: "right" }}>{D.ct01.dev?.efficiencyDecayPct}%</td><td className="num" style={{ textAlign: "right", color: "var(--amber)" }}>{D.ct02.dev?.efficiencyDecayPct}%</td></tr>
                </tbody>
              </table>
              <p style={noteStyle}>
                同类检查 CT-02 单次能耗高 {Math.round((D.ct02.scanKwh / D.ct01.scanKwh - 1) * 100)}%。建议常规检查优先排至 CT-01，CT-02 承接错峰与备份；排班调整不影响急诊即时检查。
              </p>
            </Panel>
          </div>
        </>
      )}

      <div className="grid cols-2" style={{ marginTop: 10 }}>
        <Panel title="统计口径说明：大型医疗设备单列" extra={<Tag tone="info">口径卡</Tag>}>
          <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "0 0 10px", lineHeight: 1.7 }}>
            大型医疗设备用电<b style={{ color: "var(--ink-1)" }}>计入综合能耗</b>，但与"常规用能系统单位建筑面积电耗"<b style={{ color: "var(--ink-1)" }}>分开统计</b>，避免影像设备密集导致单位面积强度被错误高估。
          </p>
          <div style={{ display: "flex", gap: 26 }}>
            <Stat label="综合口径（含大型设备）" value={D.intensityAll.toFixed(2)} unit="kWh/m²·日" tone="cyan" />
            <Stat label="常规用能口径（剔除后）" value={D.intensityRegular.toFixed(2)} unit="kWh/m²·日" tone="green" />
            <Stat label="大型设备占全院电耗" value={D.largeSharePct.toFixed(1)} unit="%" />
          </div>
          <p style={noteStyle}>
            今日全院电耗 {fmt(D.hospitalToday)} kWh，其中大型医疗设备（检查 + 待机）{fmt(D.largeDevToday)} kWh；建筑面积合计 {fmt(D.totalArea)} m²。两套口径同源同日，对标时须注明口径。
          </p>
        </Panel>

        <Panel
          title="关键区域旁路 / 冗余状态"
          extra={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Lock size={12} />
              <Tag tone="muted">只读 · 不做控制</Tag>
            </span>
          }
        >
          <table className="pf-table">
            <thead>
              <tr><th>区域 / 回路</th><th>主用</th><th>备用 / 旁路</th><th>状态</th><th>最近切换测试</th></tr>
            </thead>
            <tbody>
              {redundancyRows.map((r) => (
                <tr key={r.area}>
                  <td>{r.area}</td>
                  <td>{r.main}</td>
                  <td>{r.backup}</td>
                  <td>
                    {r.status === "ok" && <Tag tone="ok">正常</Tag>}
                    {r.status === "bypass" && <Tag tone="warn">旁路运行</Tag>}
                    {r.status === "fault" && <Tag tone="danger">冗余降级</Tag>}
                  </td>
                  <td style={{ fontSize: 11 }} className="num">{r.lastTest} · {r.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={noteStyle}>
            关键区域计量与配电以供电安全为红线：本平台仅只读展示旁路/冗余状态，不提供任何远程分合闸、旁路切换或负荷控制功能。
          </p>
        </Panel>
      </div>
    </>
  );
}
