import dayjs from "dayjs";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import type { ActivityRecord, CalculationResult, EvidenceRecord } from "../types/domain";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [headers.map(escape).join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\r\n");
  downloadBlob(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }), filename);
}

export function downloadWorkbook(sheets: Record<string, Record<string, unknown>[]>, filename: string) {
  const workbook = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name, rows]) => XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name.slice(0, 31)));
  XLSX.writeFile(workbook, filename);
}

export function downloadComplianceReport(result: CalculationResult, records: ActivityRecord[], includeScope3: boolean, includeAnomalies: boolean) {
  const anomalyRows = records.filter((record) => record.status === "异常" || record.status === "缺失");
  const body = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>医院温室气体排放核算报告</title><style>body{font-family:"Microsoft YaHei",sans-serif;margin:48px;color:#142033}h1{font-size:26px;border-bottom:3px solid #1268e8;padding-bottom:14px}h2{margin-top:30px;color:#16488c}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #cad4e3;padding:9px;text-align:left}.meta{color:#61718a}.total{font-size:28px;color:#1268e8}</style></head><body><h1>医院温室气体排放核算报告</h1><p class="meta">报告批次：${result.batchId} / 生成时间：${dayjs().format("YYYY-MM-DD HH:mm:ss")}</p><h2>一、核算结果摘要</h2><p class="total">${result.total.toLocaleString()} tCO₂e</p><table><tr><th>排放范围</th><th>排放量（tCO₂e）</th><th>占比</th></tr><tr><td>范围一</td><td>${result.scope1}</td><td>${(result.scope1/result.total*100).toFixed(1)}%</td></tr><tr><td>范围二</td><td>${result.scope2}</td><td>${(result.scope2/result.total*100).toFixed(1)}%</td></tr>${includeScope3?`<tr><td>范围三</td><td>${result.scope3}</td><td>${(result.scope3/result.total*100).toFixed(1)}%</td></tr>`:""}</table><h2>二、核算边界与方法</h2><p>本报告覆盖总院、东院区和西院区的运营控制边界。排放量依据活动数据乘以已配置排放因子计算；因子版本、来源和有效期均在 MRV 台账留痕。</p><h2>三、数据质量</h2><p>综合质量评分 ${result.qualityScore} 分；缺失数据 ${result.missingIds.length} 项。估算数据已与实测数据分别标识。</p>${includeAnomalies?`<h2>四、异常说明</h2><table><tr><th>数据源</th><th>状态</th><th>审核状态</th></tr>${anomalyRows.map((r)=>`<tr><td>${r.sourceName}</td><td>${r.status}</td><td>${r.reviewStatus}</td></tr>`).join("")}</table>`:""}<h2>五、声明</h2><p>本文件为前端演示环境生成的可复核报告，正式申报前应完成内部复核和第三方核查。</p></body></html>`;
  downloadBlob(new Blob([body], { type: "application/pdf;charset=utf-8" }), `医院碳核算报告_${dayjs().format("YYYYMMDD_HHmm")}.pdf`);
}

export async function downloadEvidencePackage(options: Record<string, boolean | string>, evidences: EvidenceRecord[], records: ActivityRecord[]) {
  const zip = new JSZip();
  zip.file("00_证据包清单.json", JSON.stringify({ generatedAt: new Date().toISOString(), options, evidenceCount: evidences.length, recordCount: records.length }, null, 2));
  if (options.rawData) zip.file("01_原始活动数据.csv", toCsv(records.map((r) => ({ 编号:r.code,数据源:r.sourceName,账期:r.month,活动数据:r.activity,单位:r.unit,排放量:r.emission }))));
  if (options.evidence) zip.file("02_凭证台账.csv", toCsv(evidences.map((e) => ({ 凭证编号:e.code,凭证名称:e.name,类型:e.type,哈希:e.hash,审核状态:e.reviewStatus }))));
  if (options.audit) zip.file("03_审核记录.txt", "内部审核记录\r\n生成时间：" + dayjs().format("YYYY-MM-DD HH:mm:ss") + "\r\n状态链：草稿 → 已提交 → 待复核 → 复核通过 → 待核查");
  if (options.anomaly) zip.file("04_异常整改记录.txt", "异常整改记录由 MRV 异常中心导出，包含责任人、整改说明和关闭时间。\r\n");
  if (options.formula) zip.file("05_核算公式.md", "# 核算公式\n\n排放量 = 活动数据 × 排放因子\n\n制冷剂与麻醉气体排放量 = 补充或逸散量 × GWP。\n");
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, `医院MRV证据包_${dayjs().format("YYYYMMDD_HHmm")}.zip`);
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return "\ufeff" + [headers.map(escape).join(","), ...rows.map((row) => headers.map((header) => escape(row[header])).join(","))].join("\r\n");
}

export async function hashFile(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
