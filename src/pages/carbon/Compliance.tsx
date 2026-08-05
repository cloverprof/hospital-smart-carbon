// 6.2.4 合规凭证看板（moduleId: compliance-vault）
// L1/L2/L3 分级凭证清单、到期预警、拖拽上传演示（仅元数据）、版本记录/对比/回退、趋势与导出。
// 文件内容不读取、不离开浏览器；导出物均标注“Demo 模拟”。
import dayjs from "dayjs";
import type { EChartsCoreOption } from "echarts";
import {
  AlarmClock, CheckCircle2, Download, FileCode2, FileQuestion, FileSearch, FileSpreadsheet,
  FileText, FileUp, FileX2, Gauge, History, ShieldCheck, Undo2, UploadCloud,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { EChart } from "../../components/EChart";
import { EmptyState, Kpi, Modal, PageHead, Panel, Tag } from "../../components/kit";
import { anomalyChains } from "../../data/anomalies";
import { buildings } from "../../data/buildings";
import { annualCarbonBudgetT, demoAsOfDate } from "../../data/config";
import { canWrite } from "../../data/navigation";
import { monthlyCarbonSeries, monthlySeries, toTce } from "../../services/timeseries";
import type { CredStatus, CredVersion, Credential } from "../../stores/compliance";
import {
  WARN_DAYS, complianceScoreAsOf, credCampusNames, credLevelNames, credStatusAsOf,
  credTypeNames, daysToExpiry, useComplianceStore,
} from "../../stores/compliance";
import { useDemoStore } from "../../stores/demo";
import type { CredLevel } from "../../stores/compliance";
import type { EnergyKind } from "../../types/core";

const MODULE_ID = "compliance-vault";

const statusMeta: Record<CredStatus, { name: string; tone: "ok" | "warn" | "danger" | "muted" }> = {
  valid: { name: "已上传", tone: "ok" },
  expiring: { name: "即将到期", tone: "warn" },
  expired: { name: "已过期", tone: "danger" },
  missing: { name: "未上传", tone: "muted" },
};

const fmtSize = (kb: number) => (kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`);

interface Row {
  cred: Credential;
  status: CredStatus;
  days: number | null;
}

/** 小趋势图统一配置（单序列，无图例，单位放 y 轴名） */
function trendOption(x: string[], data: number[], unit: string, color: string, fill: string, opts?: { max?: number; mark?: { value: number; label: string } }): EChartsCoreOption {
  return {
    legend: false,
    grid: { left: 46, right: 12, top: 26, bottom: 20 },
    tooltip: { valueFormatter: (v: unknown) => `${v} ${unit}` },
    xAxis: { type: "category", data: x, axisLabel: { formatter: (s: string) => s.slice(2) } },
    yAxis: { type: "value", name: unit, nameGap: 8, nameTextStyle: { color: "#5f7799", fontSize: 10, align: "right" }, scale: true, max: opts?.max },
    series: [{
      type: "line", data, smooth: true, symbol: "none",
      lineStyle: { width: 2, color },
      areaStyle: { color: fill },
      markLine: opts?.mark
        ? {
            silent: true, symbol: "none",
            lineStyle: { type: "dashed", color: "rgba(157,180,214,0.55)" },
            label: { formatter: opts.mark.label, color: "#9db4d6", fontSize: 10, position: "insideEndTop" },
            data: [{ yAxis: opts.mark.value }],
          }
        : undefined,
    }],
  };
}

function daysCell(row: Row) {
  if (row.days === null) return <span style={{ color: "var(--ink-3)" }}>{row.status === "missing" ? "—" : "长期"}</span>;
  if (row.days < 0) return <span className="num" style={{ color: "var(--red)" }}>已过期 {-row.days} 天</span>;
  if (row.days <= WARN_DAYS) return <span className="num" style={{ color: "var(--amber)" }}>{row.days} 天</span>;
  return <span className="num">{row.days} 天</span>;
}

/* ---------------- 上传演示弹窗（仅元数据，文件不离开浏览器） ---------------- */

const UPLOAD_EXTS = ["pdf", "ofd", "jpg", "jpeg", "png", "xlsx", "docx"];

function UploadModal({ cred, onClose, onSubmit }: {
  cred: Credential;
  onClose: () => void;
  onSubmit: (meta: { fileName: string; sizeKb: number; fileType: string; note: string }) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<{ fileName: string; sizeKb: number; fileType: string } | null>(null);
  const [note, setNote] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");

  const handle = (file?: File | null) => {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!UPLOAD_EXTS.includes(ext)) {
      setError(`不支持的文件类型 .${ext}（支持 ${UPLOAD_EXTS.join(" / ")}）`);
      setPicked(null);
      return;
    }
    setError("");
    setPicked({ fileName: file.name, sizeKb: Math.max(1, Math.round(file.size / 1024)), fileType: ext.toUpperCase() });
  };

  return (
    <Modal title={`上传新版本 · ${cred.name}`} onClose={onClose} width={560}>
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handle(e.dataTransfer.files?.[0]); }}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          padding: "24px 16px", borderRadius: 8, cursor: "pointer", textAlign: "center",
          border: `1.5px dashed ${dragOver ? "var(--cyan)" : "rgba(157,180,214,0.35)"}`,
          background: dragOver ? "rgba(41,211,232,0.06)" : "rgba(157,180,214,0.04)",
          color: "var(--ink-2)",
        }}
      >
        <UploadCloud size={26} strokeWidth={1.5} />
        <b style={{ fontSize: 13, color: "var(--ink-1)" }}>{picked ? picked.fileName : "拖拽文件到此处，或点击选择"}</b>
        <small style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {picked ? `${fmtSize(picked.sizeKb)} · ${picked.fileType} · 点击重新选择` : "支持 PDF / OFD / JPG / PNG / XLSX / DOCX"}
        </small>
      </div>
      <input ref={fileRef} hidden type="file" accept={UPLOAD_EXTS.map((e) => `.${e}`).join(",")} onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ""; }} />
      {error && <p style={{ fontSize: 12, color: "var(--red)", margin: "8px 0 0" }}>{error}</p>}
      <label style={{ display: "block", fontSize: 12, color: "var(--ink-2)", marginTop: 10 }}>
        版本说明
        <input className="pf-input" style={{ width: "100%", marginTop: 4 }} value={note} placeholder="如：新一轮审计终稿 / 延续换证扫描件" onChange={(e) => setNote(e.target.value)} />
      </label>
      <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "10px 0 0", lineHeight: 1.6 }}>
        文件不离开浏览器：本演示只读取文件名/大小/类型元数据并保存到本地浏览器存储，不读取文件内容、不上传到任何服务器。请勿使用真实医院凭证。
      </p>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button className="pf-btn ghost" onClick={onClose}>取消</button>
        <button className="pf-btn primary" disabled={!picked} onClick={() => picked && onSubmit({ ...picked, note: note.trim() || "例行更新" })}>
          <FileUp size={13} /> 保存版本元数据
        </button>
      </div>
    </Modal>
  );
}

/* ---------------- 版本记录弹窗：列表 / 对比 / 回退 / 预览 / 下载 ---------------- */

function VersionModal({ cred, writable, onClose, onRollback, onDownload, onOpenUpload }: {
  cred: Credential;
  writable: boolean;
  onClose: () => void;
  onRollback: (ver: number) => void;
  onDownload: (ver: number) => void;
  onOpenUpload: () => void;
}) {
  const vs = [...cred.versions].sort((a, b) => b.ver - a.ver);
  const [diffA, setDiffA] = useState(vs[1]?.ver ?? 0);
  const [diffB, setDiffB] = useState(vs[0]?.ver ?? 0);
  const [previewVer, setPreviewVer] = useState<number | null>(null);
  const [rollbackVer, setRollbackVer] = useState<number | null>(null);

  const va = vs.find((v) => v.ver === diffA);
  const vb = vs.find((v) => v.ver === diffB);
  const preview = previewVer !== null ? vs.find((v) => v.ver === previewVer) : undefined;
  const diffFields: [string, (v: CredVersion) => string][] = [
    ["文件名", (v) => v.fileName],
    ["类型", (v) => v.fileType],
    ["大小", (v) => fmtSize(v.sizeKb)],
    ["上传人", (v) => v.uploader],
    ["上传时间", (v) => v.uploadedAt],
    ["版本说明", (v) => v.note],
  ];

  return (
    <Modal title={`版本记录 · ${cred.name}`} onClose={onClose} width={880}>
      <p style={{ fontSize: 12, color: "var(--ink-3)", margin: "0 0 10px" }}>
        {cred.id} · {credTypeNames[cred.typeId]} · {cred.issuer} · 有效期至 {cred.validUntil ?? "长期"} · {cred.cycleNote}
      </p>
      {vs.length === 0 ? (
        <>
          <EmptyState text="该凭证尚无版本记录" />
          {writable && (
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <button className="pf-btn primary" onClick={onOpenUpload}><FileUp size={13} /> 上传首个版本</button>
            </div>
          )}
        </>
      ) : (
        <>
          <table className="pf-table">
            <thead>
              <tr><th>版本</th><th>文件名</th><th>类型</th><th>大小</th><th>上传人</th><th>上传时间</th><th>说明</th><th>操作</th></tr>
            </thead>
            <tbody>
              {vs.map((v) => (
                <tr key={v.ver}>
                  <td className="num">v{v.ver} {v.ver === cred.currentVer && <Tag tone="ok">当前</Tag>}</td>
                  <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v.fileName}>{v.fileName}</td>
                  <td>{v.fileType}</td>
                  <td className="num">{fmtSize(v.sizeKb)}</td>
                  <td>{v.uploader}</td>
                  <td className="num">{v.uploadedAt}</td>
                  <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v.note}>{v.note}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="pf-btn ghost" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => setPreviewVer(v.ver)}><FileSearch size={12} /> 预览</button>
                      <button className="pf-btn ghost" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => onDownload(v.ver)}><Download size={12} /> 下载</button>
                      <button
                        className="pf-btn ghost" style={{ fontSize: 11, padding: "2px 6px" }}
                        disabled={!writable || v.ver === cred.currentVer}
                        title={!writable ? "当前角色无写权限" : v.ver === cred.currentVer ? "已是当前版本" : "将当前版本指针回退到该版本"}
                        onClick={() => setRollbackVer(v.ver)}
                      >
                        <Undo2 size={12} /> 回退
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {rollbackVer !== null && (
            <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 6, border: "1px solid rgba(245,165,36,0.4)", background: "rgba(245,165,36,0.08)", display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--ink-1)" }}>
              <span>确认将当前版本指针回退到 v{rollbackVer}？版本记录不会删除，操作会写入操作日志。</span>
              <button className="pf-btn primary" style={{ fontSize: 11, padding: "3px 10px" }} onClick={() => { onRollback(rollbackVer); setRollbackVer(null); }}>确认回退</button>
              <button className="pf-btn ghost" style={{ fontSize: 11, padding: "3px 10px" }} onClick={() => setRollbackVer(null)}>取消</button>
            </div>
          )}

          {preview && (
            <div style={{ marginTop: 10, padding: "16px 14px", borderRadius: 8, border: "1px solid rgba(157,180,214,0.25)", background: "rgba(157,180,214,0.05)", display: "flex", gap: 12, alignItems: "flex-start" }}>
              <FileSearch size={30} strokeWidth={1.4} style={{ color: "var(--ink-3)", flexShrink: 0 }} />
              <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.7 }}>
                <b style={{ color: "var(--ink-1)" }}>预览占位 · v{preview.ver} {preview.fileName}</b>
                <p style={{ margin: "4px 0 0" }}>
                  演示环境仅保存元数据（文件名 {preview.fileName} / {preview.fileType} / {fmtSize(preview.sizeKb)}），未保存文件内容，无法渲染原件。
                  正式环境将在此内嵌 PDF/图片预览。
                </p>
                <button className="pf-btn ghost" style={{ fontSize: 11, padding: "2px 8px", marginTop: 6 }} onClick={() => setPreviewVer(null)}>关闭预览</button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--ink-2)", marginBottom: 6 }}>
              <History size={13} /> 版本对比（元数据 diff 演示）
              {vs.length >= 2 ? (
                <>
                  <select className="pf-select" value={diffA} onChange={(e) => setDiffA(Number(e.target.value))}>
                    {vs.map((v) => <option key={v.ver} value={v.ver}>v{v.ver}</option>)}
                  </select>
                  <span>对比</span>
                  <select className="pf-select" value={diffB} onChange={(e) => setDiffB(Number(e.target.value))}>
                    {vs.map((v) => <option key={v.ver} value={v.ver}>v{v.ver}</option>)}
                  </select>
                </>
              ) : (
                <span style={{ color: "var(--ink-3)" }}>至少两个版本才能对比</span>
              )}
            </div>
            {va && vb && vs.length >= 2 && (
              diffA === diffB ? (
                <p style={{ fontSize: 12, color: "var(--ink-3)", margin: 0 }}>两侧为同一版本，请选择不同版本进行对比。</p>
              ) : (
                <table className="pf-table">
                  <thead><tr><th>字段</th><th>v{va.ver}</th><th>v{vb.ver}</th><th>差异</th></tr></thead>
                  <tbody>
                    {diffFields.map(([label, pick]) => {
                      const a = pick(va);
                      const b = pick(vb);
                      return (
                        <tr key={label}>
                          <td>{label}</td>
                          <td style={{ color: a !== b ? "var(--amber)" : undefined }}>{a}</td>
                          <td style={{ color: a !== b ? "var(--amber)" : undefined }}>{b}</td>
                          <td>{a !== b ? <Tag tone="warn">变更</Tag> : <Tag tone="muted">一致</Tag>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

/* ---------------- 页面主体 ---------------- */

export function CompliancePage() {
  const { role, allPermissions, pageFilters, setPageFilter, pushToast } = useDemoStore();
  const { credentials, logs, addVersion, rollbackTo, addLog } = useComplianceStore();
  const writable = canWrite(MODULE_ID, role, allPermissions);

  const f = pageFilters[MODULE_ID] ?? {};
  const fLevel = String(f.level ?? "all");
  const fCampus = String(f.campus ?? "all");
  const fType = String(f.type ?? "all");
  const fStatus = String(f.status ?? "all");
  const fWindow = String(f.window ?? "all");
  const fQuery = String(f.q ?? "");
  const setF = (patch: Record<string, string>) => setPageFilter(MODULE_ID, patch);

  const [uploadForId, setUploadForId] = useState<string | null>(null);
  const [versionsForId, setVersionsForId] = useState<string | null>(null);

  const withStatus = useMemo<Row[]>(
    () => credentials.map((cred) => ({ cred, status: credStatusAsOf(cred, demoAsOfDate), days: daysToExpiry(cred, demoAsOfDate) })),
    [credentials],
  );

  const filtered = useMemo(() => {
    const q = fQuery.trim().toLowerCase();
    return withStatus.filter((row) => {
      const c = row.cred;
      if (fLevel !== "all" && c.level !== fLevel) return false;
      if (fCampus !== "all" && c.campusId !== fCampus) return false;
      if (fType !== "all" && c.typeId !== fType) return false;
      if (fStatus !== "all" && row.status !== fStatus) return false;
      if (fWindow === "d30" && !(row.days !== null && row.days >= 0 && row.days <= 30)) return false;
      if (fWindow === "d90" && !(row.days !== null && row.days >= 0 && row.days <= 90)) return false;
      if (fWindow === "d180" && !(row.days !== null && row.days >= 0 && row.days <= 180)) return false;
      if (fWindow === "expired" && !(row.days !== null && row.days < 0)) return false;
      if (fWindow === "forever" && row.days !== null) return false;
      if (q) {
        const hay = `${c.id} ${c.name} ${c.owner} ${c.issuer} ${credTypeNames[c.typeId]}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [withStatus, fLevel, fCampus, fType, fStatus, fWindow, fQuery]);

  const sorted = useMemo(() => {
    const rank: Record<CredStatus, number> = { expired: 0, expiring: 1, missing: 2, valid: 3 };
    return [...filtered].sort((a, b) => {
      if (!!a.cred.pinned !== !!b.cred.pinned) return a.cred.pinned ? -1 : 1;
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      const da = a.days ?? 9999;
      const db = b.days ?? 9999;
      if (a.status === "expiring" && da !== db) return da - db;
      if (a.status === "expired" && da !== db) return db - da;
      return a.cred.id.localeCompare(b.cred.id);
    });
  }, [filtered]);

  const counts = useMemo(() => {
    const c: Record<CredStatus, number> = { valid: 0, expiring: 0, expired: 0, missing: 0 };
    withStatus.forEach((r) => { c[r.status] += 1; });
    return c;
  }, [withStatus]);

  const score = useMemo(() => complianceScoreAsOf(credentials, demoAsOfDate), [credentials]);
  const typeCount = useMemo(() => new Set(credentials.map((c) => c.typeId)).size, [credentials]);
  const riskRows = useMemo(() => {
    const rank: Record<CredStatus, number> = { expired: 0, expiring: 1, missing: 2, valid: 3 };
    return withStatus
      .filter((r) => r.status !== "valid")
      .sort((a, b) => (rank[a.status] - rank[b.status]) || (a.days ?? 9999) - (b.days ?? 9999));
  }, [withStatus]);

  const pinnedRow = withStatus.find((r) => r.cred.pinned);
  const pinnedAnomaly = pinnedRow?.cred.relatedAnomalyId
    ? anomalyChains.find((a) => a.id === pinnedRow.cred.relatedAnomalyId)
    : undefined;

  /* 趋势区：完整月口径（截至上月末），monthlyCarbonSeries / monthlySeries 派生 */
  const trends = useMemo(() => {
    const toM = dayjs(demoAsOfDate).subtract(1, "month").format("YYYY-MM");
    const fromM = dayjs(`${toM}-01`).subtract(11, "month").format("YYYY-MM");
    const carbon = monthlyCarbonSeries(fromM, toM);
    const x = carbon.map((p) => p.t);

    const year = demoAsOfDate.slice(0, 4);
    const ytd = monthlyCarbonSeries(`${year}-01`, toM);
    let cum = 0;
    const budget = ytd.map((p) => { cum += p.v; return Math.round((cum / annualCarbonBudgetT) * 1000) / 10; });
    const lastFullEnd = dayjs(`${toM}-01`).endOf("month");
    const timeProgress = Math.round(((lastFullEnd.diff(`${year}-01-01`, "day") + 1) / 365) * 1000) / 10;

    const totalArea = buildings.reduce((s, b) => s + b.areaM2, 0);
    const kinds: EnergyKind[] = ["electricity", "water", "gas", "heat", "medgas"];
    const kindSeries = kinds.map((k) => monthlySeries(k, fromM, toM));
    const intensity = x.map((_, i) => {
      const tce = kinds.reduce((s, k, ki) => s + toTce(k, kindSeries[ki][i]?.v ?? 0), 0);
      return Math.round(((tce * 1000) / totalArea) * 100) / 100;
    });

    const scoreTrend = x.map((m) => {
      const end = dayjs(`${m}-01`).endOf("month").format("YYYY-MM-DD");
      return complianceScoreAsOf(credentials, end > demoAsOfDate ? demoAsOfDate : end);
    });

    return {
      carbon: trendOption(x, carbon.map((p) => p.v), "tCO₂e", "#29d3e8", "rgba(41,211,232,0.12)"),
      carbonLatest: `${carbon[carbon.length - 1]?.v.toLocaleString("zh-CN")} tCO₂e`,
      budget: trendOption(ytd.map((p) => p.t), budget, "%", "#f5a524", "rgba(245,165,36,0.12)", { max: 100, mark: { value: timeProgress, label: `时间进度 ${timeProgress}%` } }),
      budgetLatest: `${budget[budget.length - 1]}%`,
      intensity: trendOption(x, intensity, "kgce/m²", "#8b8df0", "rgba(139,141,240,0.12)"),
      intensityLatest: `${intensity[intensity.length - 1]} kgce/m²`,
      score: trendOption(x, scoreTrend, "分", "#35d399", "rgba(53,211,153,0.12)", { max: 100 }),
      scoreLatest: `${scoreTrend[scoreTrend.length - 1]} 分`,
    };
  }, [credentials]);

  const levelRows = useMemo(
    () => (["L1", "L2", "L3"] as CredLevel[]).map((lv) => {
      const items = withStatus.filter((r) => r.cred.level === lv);
      return {
        lv,
        total: items.length,
        valid: items.filter((r) => r.status === "valid").length,
        score: complianceScoreAsOf(items.map((r) => r.cred), demoAsOfDate),
        risks: items.filter((r) => r.status !== "valid"),
      };
    }),
    [withStatus],
  );

  const uploadFor = uploadForId ? credentials.find((c) => c.id === uploadForId) : undefined;
  const versionsFor = versionsForId ? credentials.find((c) => c.id === versionsForId) : undefined;

  /* ---------------- 动作 ---------------- */

  const submitUpload = (credId: string, meta: { fileName: string; sizeKb: number; fileType: string; note: string }) => {
    addVersion(credId, meta);
    setUploadForId(null);
    pushToast("版本元数据已保存", `${meta.fileName}（${fmtSize(meta.sizeKb)}）仅保存文件名/大小/类型，文件未离开浏览器。`, "success");
  };

  const doRollback = (credId: string, ver: number) => {
    rollbackTo(credId, ver);
    pushToast("版本已回退", `当前版本指针已指向 v${ver}，历史版本全部保留。`, "success");
  };

  const downloadVersion = async (cred: Credential, ver: number) => {
    const v = cred.versions.find((x) => x.ver === ver);
    if (!v) return;
    const { downloadBlob } = await import("../../utils/downloads");
    const text = [
      "合规凭证下载占位（Demo 模拟）",
      `凭证编号：${cred.id}`,
      `凭证名称：${cred.name}`,
      `版本：v${v.ver}${cred.currentVer === v.ver ? "（当前）" : ""}`,
      `原文件名：${v.fileName}`,
      `类型/大小：${v.fileType} / ${fmtSize(v.sizeKb)}`,
      `上传：${v.uploader} · ${v.uploadedAt}`,
      `说明：${v.note}`,
      "",
      "演示环境仅保存元数据，本文件为生成的占位文本，不含原件内容。",
    ].join("\r\n");
    downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), `${cred.id}_v${v.ver}_演示占位.txt`);
    addLog("下载演示文件", `${cred.name} v${v.ver}（占位文本）`);
    pushToast("已生成演示下载", "内容为元数据占位文本（Demo 模拟），不含原件。", "info");
  };

  const exportRows = () => sorted.map(({ cred, status, days }) => ({
    编号: cred.id,
    凭证名称: cred.name,
    层级: credLevelNames[cred.level],
    类型: credTypeNames[cred.typeId],
    院区: credCampusNames[cred.campusId],
    出具机构: cred.issuer,
    责任人: cred.owner,
    生效日期: cred.issueDate ?? "—",
    有效期至: cred.validUntil ?? "长期",
    剩余天数: days ?? "—",
    状态: statusMeta[status].name,
    当前版本: cred.currentVer ? `v${cred.currentVer}` : "—",
    版本数: cred.versions.length,
    关联异常: cred.relatedAnomalyId ?? "—",
    周期说明: cred.cycleNote,
  }));

  const guardEmpty = () => {
    if (!sorted.length) {
      pushToast("无数据可导出", "当前筛选条件下没有凭证，请调整筛选后重试。", "warning");
      return true;
    }
    return false;
  };

  const doExportCsv = async () => {
    if (guardEmpty()) return;
    const { downloadCsv } = await import("../../utils/downloads");
    downloadCsv(exportRows(), `合规凭证清单_${demoAsOfDate}.csv`);
    addLog("导出 CSV", `${sorted.length} 项（当前筛选）`);
    pushToast("CSV 已导出", `包含当前筛选的 ${sorted.length} 项凭证。`, "success");
  };

  const doExportXlsx = async () => {
    if (guardEmpty()) return;
    const { downloadWorkbook } = await import("../../utils/downloads");
    const versionRows = sorted.flatMap(({ cred }) => cred.versions.map((v) => ({
      凭证编号: cred.id, 凭证名称: cred.name, 版本: `v${v.ver}`, 是否当前: v.ver === cred.currentVer ? "是" : "否",
      文件名: v.fileName, 类型: v.fileType, 大小: fmtSize(v.sizeKb), 上传人: v.uploader, 上传时间: v.uploadedAt, 说明: v.note,
    })));
    downloadWorkbook(
      { 凭证清单: exportRows(), 版本记录: versionRows.length ? versionRows : [{ 提示: "当前筛选无版本记录" }] },
      `合规凭证台账_${demoAsOfDate}.xlsx`,
    );
    addLog("导出 Excel", `${sorted.length} 项凭证 + ${versionRows.length} 条版本记录（当前筛选）`);
    pushToast("Excel 已导出", "包含凭证清单与版本记录两张工作表。", "success");
  };

  const doExportPdf = async () => {
    if (guardEmpty()) return;
    const { downloadBlob } = await import("../../utils/downloads");
    const rows = sorted.map(({ cred, status, days }) =>
      `<tr><td>${cred.id}</td><td>${cred.name}</td><td>${credLevelNames[cred.level]}</td><td>${credCampusNames[cred.campusId]}</td><td>${cred.validUntil ?? "长期"}</td><td>${days ?? "—"}</td><td>${statusMeta[status].name}</td></tr>`).join("");
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>合规凭证看板报告（Demo 模拟）</title><style>body{font-family:"Microsoft YaHei",sans-serif;margin:40px;color:#142033}h1{font-size:22px;border-bottom:3px solid #1268e8;padding-bottom:10px}table{border-collapse:collapse;width:100%;margin:14px 0}th,td{border:1px solid #cad4e3;padding:7px;font-size:12px;text-align:left}.meta{color:#61718a;font-size:12px}.demo{color:#b8860b;font-weight:700}</style></head><body><h1>合规凭证看板报告 <span class="demo">（Demo 模拟）</span></h1><p class="meta">基准日：${demoAsOfDate} ｜ 筛选后 ${sorted.length} 项 ｜ 已上传 ${counts.valid} · 即将到期 ${counts.expiring} · 已过期 ${counts.expired} · 未上传 ${counts.missing} ｜ 合规评分 ${score} 分</p><table><tr><th>编号</th><th>凭证名称</th><th>层级</th><th>院区</th><th>有效期至</th><th>剩余天数</th><th>状态</th></tr>${rows}</table><p class="meta">声明：本文件为前端演示环境生成的占位报告（Demo 模拟），仅含凭证元数据，不含任何真实医院凭证内容，不构成正式合规文件。</p></body></html>`;
    downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `合规凭证报告_Demo模拟_${demoAsOfDate}.html`);
    addLog("导出 PDF 演示占位", `${sorted.length} 项（HTML 占位文件）`);
    pushToast("PDF 演示占位已生成", "已下载带“Demo 模拟”标注的 HTML 报告占位文件。", "info");
  };

  const doExportXml = async () => {
    if (guardEmpty()) return;
    const { downloadBlob } = await import("../../utils/downloads");
    const esc = (s: unknown) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const body = sorted.map(({ cred, status, days }) => [
      `  <credential id="${esc(cred.id)}" level="${cred.level}" type="${esc(credTypeNames[cred.typeId])}" campus="${esc(credCampusNames[cred.campusId])}" status="${esc(statusMeta[status].name)}" validUntil="${esc(cred.validUntil ?? "长期")}" daysLeft="${days ?? ""}">`,
      `    <name>${esc(cred.name)}</name>`,
      `    <issuer>${esc(cred.issuer)}</issuer>`,
      `    <owner>${esc(cred.owner)}</owner>`,
      ...cred.versions.map((v) => `    <version ver="${v.ver}" current="${v.ver === cred.currentVer}" fileType="${esc(v.fileType)}" sizeKb="${v.sizeKb}" uploadedAt="${esc(v.uploadedAt)}">${esc(v.fileName)}</version>`),
      "  </credential>",
    ].join("\n")).join("\n");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Demo 模拟导出：前端演示占位文件，非正式报送 -->\n<complianceVault asOf="${demoAsOfDate}" count="${sorted.length}" score="${score}">\n${body}\n</complianceVault>\n`;
    downloadBlob(new Blob([xml], { type: "application/xml;charset=utf-8" }), `合规凭证数据_Demo模拟_${demoAsOfDate}.xml`);
    addLog("导出 XML 演示占位", `${sorted.length} 项`);
    pushToast("XML 演示占位已生成", "已下载带“Demo 模拟”注释的 XML 占位文件。", "info");
  };

  /* ---------------- 渲染 ---------------- */

  return (
    <>
      <PageHead
        title="合规凭证看板"
        sub={`L1/L2/L3 分级凭证 · 版本管理与到期预警（预警窗 ${WARN_DAYS} 天）· 基准日 ${demoAsOfDate} · 文件不离开浏览器（仅元数据演示）`}
        actions={
          <>
            <button className="pf-btn ghost" onClick={doExportCsv}><Download size={13} /> CSV</button>
            <button className="pf-btn ghost" onClick={doExportXlsx}><FileSpreadsheet size={13} /> Excel</button>
            <button className="pf-btn ghost" onClick={doExportPdf}><FileText size={13} /> PDF（演示）</button>
            <button className="pf-btn ghost" onClick={doExportXml}><FileCode2 size={13} /> XML（演示）</button>
          </>
        }
      />

      <div className="grid cols-6">
        <Kpi label="凭证总数" value={credentials.length} unit="项" icon={<FileText size={14} />} sub={`覆盖 ${typeCount} 类材料 · 3 个层级`} />
        <Kpi label="已上传（有效）" value={counts.valid} unit="项" tone="green" icon={<ShieldCheck size={14} />} sub="含长期有效凭证" />
        <Kpi label="即将到期" value={counts.expiring} unit="项" tone="amber" icon={<AlarmClock size={14} />} sub={`${WARN_DAYS} 天预警窗内`} />
        <Kpi label="已过期" value={counts.expired} unit="项" tone={counts.expired > 0 ? "red" : "green"} icon={<FileX2 size={14} />}
          sub={counts.expired > 0 ? withStatus.filter((r) => r.status === "expired").map((r) => credTypeNames[r.cred.typeId]).join("、") : "无"} />
        <Kpi label="未上传" value={counts.missing} unit="项" icon={<FileQuestion size={14} />} sub="含在建项目前置件" />
        <Kpi label="合规评分" value={score} unit="分" tone={score >= 80 ? "green" : "amber"} icon={<Gauge size={14} />} sub="有效×1＋临期×0.6 / 总数" />
      </div>

      {(pinnedRow || riskRows.length > 0) && (
        <Panel title="到期预警与风险摘要" style={{ marginTop: 10, borderColor: "rgba(245,165,36,0.45)" }}
          extra={<span style={{ fontSize: 11, color: "var(--ink-3)" }}>风险项 {riskRows.length} 个 · 按紧急度排序</span>}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 300px) 1fr 1fr", gap: 14 }}>
            {pinnedRow && (
              <div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Tag tone="warn">置顶预警</Tag>
                  {pinnedRow.cred.relatedAnomalyId && <Tag tone="info">关联 {pinnedRow.cred.relatedAnomalyId}</Tag>}
                  <Tag tone={statusMeta[pinnedRow.status].tone}>{statusMeta[pinnedRow.status].name}</Tag>
                </div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-1)", margin: "8px 0 4px" }}>{pinnedRow.cred.name}</p>
                <p style={{ margin: "2px 0" }}>
                  <span className="num" style={{ fontSize: 30, fontWeight: 700, color: "var(--amber)" }}>{pinnedRow.days ?? "—"}</span>
                  <span style={{ fontSize: 12, color: "var(--ink-2)", marginLeft: 6 }}>天后到期（{pinnedRow.cred.validUntil}）</span>
                </p>
                <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "4px 0" }}>责任人：{pinnedRow.cred.owner} · {pinnedRow.cred.cycleNote}</p>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button className="pf-btn primary" style={{ fontSize: 12 }} disabled={!writable} title={writable ? undefined : "当前角色无写权限"}
                    onClick={() => setUploadForId(pinnedRow.cred.id)}>
                    <FileUp size={13} /> 上传新版本
                  </button>
                  <button className="pf-btn ghost" style={{ fontSize: 12 }} onClick={() => setVersionsForId(pinnedRow.cred.id)}>
                    <History size={13} /> 版本记录
                  </button>
                </div>
              </div>
            )}
            {pinnedAnomaly && (
              <div style={{ borderLeft: "1px solid rgba(157,180,214,0.18)", paddingLeft: 14 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Tag tone="muted">模拟诊断</Tag>
                  <Tag tone="info">置信度 {pinnedAnomaly.aiConfidencePct}%</Tag>
                  <Tag tone={pinnedAnomaly.status === "closed" ? "ok" : "warn"}>{pinnedAnomaly.status === "open" ? "待处理" : pinnedAnomaly.status === "handling" ? "处理中" : "已关闭"}</Tag>
                </div>
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-1)", margin: "8px 0 4px" }}>{pinnedAnomaly.id} · {pinnedAnomaly.title}</p>
                <ul style={{ margin: "4px 0", paddingLeft: 16, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.7 }}>
                  {pinnedAnomaly.evidence.map((e) => <li key={e}>{e}</li>)}
                </ul>
                <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "4px 0" }}>建议：{pinnedAnomaly.suggestion}</p>
                <button className="pf-btn ghost" style={{ fontSize: 12, marginTop: 4 }}
                  onClick={() => { addLog("人工确认", `${pinnedAnomaly.id} ${pinnedAnomaly.title}（知悉并纳入整改计划）`); pushToast("已人工确认", "该模拟诊断已记录为“知悉并纳入整改计划”。", "success"); }}>
                  <CheckCircle2 size={13} /> 知悉并纳入整改计划
                </button>
              </div>
            )}
            <div style={{ borderLeft: "1px solid rgba(157,180,214,0.18)", paddingLeft: 14 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-1)", margin: "0 0 6px" }}>风险摘要</p>
              {riskRows.length === 0 ? (
                <EmptyState text="当前无到期或缺失风险" />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {riskRows.map((r) => (
                    <div key={r.cred.id} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12 }}>
                      <Tag tone={statusMeta[r.status].tone}>{statusMeta[r.status].name}</Tag>
                      <span style={{ color: "var(--ink-1)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.cred.riskNote ?? r.cred.name}>
                        {r.cred.name}
                      </span>
                      <span className="num" style={{ color: r.status === "expired" ? "var(--red)" : r.status === "expiring" ? "var(--amber)" : "var(--ink-3)", whiteSpace: "nowrap" }}>
                        {r.days === null ? "待取得" : r.days < 0 ? `逾期 ${-r.days} 天` : `${r.days} 天`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Panel>
      )}

      <div className="grid cols-4" style={{ marginTop: 10 }}>
        <Panel title="碳排趋势（tCO₂e/月）" extra={<span className="num" style={{ fontSize: 11, color: "var(--ink-3)" }}>上月 {trends.carbonLatest}</span>}>
          <EChart height={150} option={trends.carbon} />
        </Panel>
        <Panel title="碳预算消耗（年度累计 %）" extra={<span className="num" style={{ fontSize: 11, color: "var(--ink-3)" }}>已用 {trends.budgetLatest}</span>}>
          <EChart height={150} option={trends.budget} />
        </Panel>
        <Panel title="能耗强度（kgce/m²·月）" extra={<span className="num" style={{ fontSize: 11, color: "var(--ink-3)" }}>上月 {trends.intensityLatest}</span>}>
          <EChart height={150} option={trends.intensity} />
        </Panel>
        <Panel title="合规评分趋势（分）" extra={<span className="num" style={{ fontSize: 11, color: "var(--ink-3)" }}>当前 {trends.scoreLatest}</span>}>
          <EChart height={150} option={trends.score} />
        </Panel>
      </div>

      <Panel title="分级凭证清单" style={{ marginTop: 10 }}
        extra={<span style={{ fontSize: 11, color: "var(--ink-3)" }}>筛选后 {sorted.length} / 共 {credentials.length} 项</span>}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <select className="pf-select" value={fLevel} onChange={(e) => setF({ level: e.target.value })}>
            <option value="all">全部层级</option>
            {(Object.keys(credLevelNames) as CredLevel[]).map((lv) => <option key={lv} value={lv}>{credLevelNames[lv]}</option>)}
          </select>
          <select className="pf-select" value={fCampus} onChange={(e) => setF({ campus: e.target.value })}>
            <option value="all">全部院区</option>
            {Object.entries(credCampusNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select className="pf-select" value={fType} onChange={(e) => setF({ type: e.target.value })}>
            <option value="all">全部类型</option>
            {Object.entries(credTypeNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select className="pf-select" value={fStatus} onChange={(e) => setF({ status: e.target.value })}>
            <option value="all">全部状态</option>
            {(Object.keys(statusMeta) as CredStatus[]).map((s) => <option key={s} value={s}>{statusMeta[s].name}</option>)}
          </select>
          <select className="pf-select" value={fWindow} onChange={(e) => setF({ window: e.target.value })}>
            <option value="all">全部到期窗口</option>
            <option value="d30">30 天内到期</option>
            <option value="d90">90 天内到期</option>
            <option value="d180">180 天内到期</option>
            <option value="expired">已过期</option>
            <option value="forever">长期有效</option>
          </select>
          <input className="pf-input" style={{ width: 220 }} value={fQuery} placeholder="搜索名称 / 编号 / 责任人 / 机构"
            onChange={(e) => setF({ q: e.target.value })} />
          <button className="pf-btn ghost" onClick={() => setF({ level: "all", campus: "all", type: "all", status: "all", window: "all", q: "" })}>重置筛选</button>
        </div>

        {sorted.length === 0 ? (
          <EmptyState text="当前筛选条件下没有凭证，请调整筛选" />
        ) : (
          <table className="pf-table">
            <thead>
              <tr>
                <th>编号</th><th>凭证</th><th>层级</th><th>院区</th><th>责任人</th><th>有效期至</th><th>剩余</th><th>状态</th><th>版本</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const c = row.cred;
                return (
                  <tr key={c.id} style={c.pinned ? { background: "rgba(245,165,36,0.05)" } : undefined}>
                    <td className="num">{c.id}</td>
                    <td>
                      <div style={{ maxWidth: 300 }}>
                        <span style={{ color: "var(--ink-1)" }}>{c.name}</span>
                        {c.pinned && <Tag tone="warn">置顶</Tag>}
                        {c.relatedAnomalyId && <Tag tone="info">{c.relatedAnomalyId}</Tag>}
                        <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{credTypeNames[c.typeId]} · {c.issuer}</div>
                      </div>
                    </td>
                    <td><Tag tone="muted">{c.level}</Tag></td>
                    <td>{credCampusNames[c.campusId]}</td>
                    <td>{c.owner}</td>
                    <td className="num" title={c.cycleNote}>{c.validUntil ?? "长期"}</td>
                    <td>{daysCell(row)}</td>
                    <td><Tag tone={statusMeta[row.status].tone}>{statusMeta[row.status].name}</Tag></td>
                    <td className="num">{c.currentVer ? `v${c.currentVer} · ${c.versions.length} 版` : "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="pf-btn ghost" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => setVersionsForId(c.id)}>
                          <History size={12} /> 版本
                        </button>
                        <button className="pf-btn ghost" style={{ fontSize: 11, padding: "2px 6px" }} disabled={!writable}
                          title={writable ? "拖拽上传演示（仅元数据）" : "当前角色无写权限"} onClick={() => setUploadForId(c.id)}>
                          <FileUp size={12} /> 上传
                        </button>
                        <button className="pf-btn ghost" style={{ fontSize: 11, padding: "2px 6px" }} disabled={!c.currentVer}
                          title={c.currentVer ? "下载当前版本（演示占位文本）" : "尚无版本可下载"} onClick={() => downloadVersion(c, c.currentVer)}>
                          <Download size={12} /> 下载
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "10px 0 0", lineHeight: 1.6 }}>
          拖拽上传仅保存文件名/大小/类型元数据，文件内容不读取、不离开浏览器；请勿使用真实医院凭证。所有导出物均带“Demo 模拟”标注，非正式报送。
        </p>
      </Panel>

      <div className="grid cols-2" style={{ marginTop: 10 }}>
        <Panel title="分级完备度" extra={<span style={{ fontSize: 11, color: "var(--ink-3)" }}>评分口径与总评分一致</span>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {levelRows.map((r) => (
              <div key={r.lv}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 4 }}>
                  <Tag tone="muted">{credLevelNames[r.lv]}</Tag>
                  <span style={{ color: "var(--ink-2)" }}>有效 {r.valid}/{r.total}</span>
                  <span className="num" style={{ marginLeft: "auto", color: r.score >= 80 ? "var(--green)" : "var(--amber)" }}>{r.score} 分</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "rgba(157,180,214,0.15)" }}>
                  <div style={{ width: `${r.score}%`, height: 6, borderRadius: 3, background: r.score >= 80 ? "var(--green)" : "var(--amber)" }} />
                </div>
                {r.risks.length > 0 && (
                  <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "4px 0 0" }}>
                    风险项：{r.risks.map((x) => `${credTypeNames[x.cred.typeId]}（${statusMeta[x.status].name}）`).join("、")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="操作日志（本地演示）" extra={<span style={{ fontSize: 11, color: "var(--ink-3)" }}>最近 {Math.min(logs.length, 8)} / {logs.length} 条</span>}>
          {logs.length === 0 ? (
            <EmptyState text="暂无操作记录：上传、回退、确认与导出会在此留痕" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {logs.slice(0, 8).map((l, i) => (
                <div key={`${l.at}-${i}`} style={{ display: "flex", gap: 8, fontSize: 12, alignItems: "baseline" }}>
                  <span className="num" style={{ color: "var(--ink-3)", whiteSpace: "nowrap" }}>{l.at}</span>
                  <b style={{ color: "var(--ink-1)", whiteSpace: "nowrap" }}>{l.action}</b>
                  <span style={{ color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.detail}>{l.detail}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {uploadFor && (
        <UploadModal cred={uploadFor} onClose={() => setUploadForId(null)} onSubmit={(meta) => submitUpload(uploadFor.id, meta)} />
      )}
      {versionsFor && !uploadFor && (
        <VersionModal
          cred={versionsFor}
          writable={writable}
          onClose={() => setVersionsForId(null)}
          onRollback={(ver) => doRollback(versionsFor.id, ver)}
          onDownload={(ver) => downloadVersion(versionsFor, ver)}
          onOpenUpload={() => setUploadForId(versionsFor.id)}
        />
      )}
    </>
  );
}
