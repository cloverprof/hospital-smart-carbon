// 设备台账与工单联动（asset-workorders）模块专属静态数据。
// 只被 src/pages/operations/WorkOrders.tsx 使用；运行时工单流转仍走 demo store。
import type { EnergyKind, SystemKind } from "../../types/core";

/** 系统类型中文名（台账/工单/绑定链统一叫法） */
export const systemNames: Record<SystemKind, string> = {
  hvac: "暖通空调",
  purification: "净化空调",
  chiller: "冷站",
  boiler: "锅炉蒸汽",
  water: "给排水",
  sewage: "污水处理",
  medgas: "医用气体",
  elevator: "电梯",
  lighting: "照明",
  medical: "大型医疗设备",
  power: "配电",
};

/** 台账筛选 Tab：一个 Tab 覆盖一个或多个 SystemKind */
export const systemTabs: { id: string; name: string; systems: SystemKind[] }[] = [
  { id: "all", name: "全部", systems: [] },
  { id: "hvac", name: "暖通", systems: ["hvac", "purification", "chiller"] },
  { id: "boiler", name: "锅炉/蒸汽", systems: ["boiler"] },
  { id: "water", name: "给排水", systems: ["water", "sewage"] },
  { id: "medgas", name: "医用气体", systems: ["medgas"] },
  { id: "elevator", name: "电梯", systems: ["elevator"] },
  { id: "lighting", name: "照明", systems: ["lighting"] },
  { id: "medical", name: "大型医疗设备", systems: ["medical"] },
  { id: "power", name: "配电", systems: ["power"] },
];

export const deviceStatusMeta: Record<string, { name: string; tone: "ok" | "warn" | "danger" | "muted" }> = {
  online: { name: "在线", tone: "ok" },
  fault: { name: "故障", tone: "danger" },
  maintenance: { name: "维保中", tone: "warn" },
  offline: { name: "离线", tone: "muted" },
};

/** 计量点编码第三段 -> 能源品种（MT-<楼>-<E|W|G|H|MG>-<序号>） */
export const meterCodeKind: Record<string, { kind: EnergyKind; label: string }> = {
  E: { kind: "electricity", label: "电表" },
  W: { kind: "water", label: "水表" },
  G: { kind: "gas", label: "燃气表" },
  H: { kind: "heat", label: "热量表" },
  MG: { kind: "medgas", label: "医气流量计" },
};

export function meterInfo(meterId: string): { kind: EnergyKind; label: string } {
  const seg = /^MT-[A-Z]+-([A-Z]+)-\d+$/.exec(meterId)?.[1] ?? "E";
  return meterCodeKind[seg] ?? meterCodeKind.E;
}

/** 历史（已归档）维修工单：与 store 内在办工单合并后用于识别同一设备反复故障 */
export interface HistoricalWorkOrder {
  id: string;
  deviceId: string;
  title: string;
  closedAt: string; // YYYY-MM-DD
  durationH: number;
  result: string;
  owner: string;
}

export const historicalWorkOrders: HistoricalWorkOrder[] = [
  { id: "WO-2025-0312", deviceId: "DEV-SUR-AHU-03", title: "AHU-03 送风机轴承异响更换", closedAt: "2025-11-08", durationH: 6, result: "更换轴承并做动平衡，振动恢复正常", owner: "王工（暖通组）" },
  { id: "WO-2026-0405", deviceId: "DEV-SUR-AHU-03", title: "AHU-03 变频器过热报警处理", closedAt: "2026-04-22", durationH: 4, result: "清理散热风道、更换散热风扇", owner: "王工（暖通组）" },
  { id: "WO-2025-0288", deviceId: "DEV-PWR-BLR-02", title: "2# 锅炉点火失败抢修", closedAt: "2025-10-19", durationH: 8, result: "更换点火电极并重调风门开度", owner: "陈工（锅炉班）" },
  { id: "WO-2026-0331", deviceId: "DEV-PWR-BLR-02", title: "2# 锅炉排烟温度偏高清灰", closedAt: "2026-03-15", durationH: 12, result: "受热面清灰、烟道检查，排烟温度回落 21℃", owner: "陈工（锅炉班）" },
  { id: "WO-2026-0219", deviceId: "DEV-PWR-PUMP-03", title: "3# 冷冻泵机械密封渗漏更换", closedAt: "2026-02-27", durationH: 5, result: "更换机械密封，跑冒滴漏消除", owner: "刘工（冷站班）" },
  { id: "WO-2025-0341", deviceId: "DEV-CSD-TRAP-07", title: "7# 疏水阀内漏检修（临时处理）", closedAt: "2025-12-05", durationH: 3, result: "阀芯研磨临时处理，建议纳入更换计划", owner: "陈工（锅炉班）" },
  { id: "WO-2026-0158", deviceId: "DEV-IMG-MRI-02", title: "MRI-02 冷头压缩机保养", closedAt: "2026-01-20", durationH: 6, result: "冷头保养并补充液氦，待机功率未见改善", owner: "周工（医工科）" },
  { id: "WO-2026-0102", deviceId: "DEV-SUR-O2-MAN", title: "氧气汇流排切换阀检修", closedAt: "2026-01-11", durationH: 3, result: "更换密封圈，切换测试通过", owner: "孙工（医气组）" },
  { id: "WO-2026-0247", deviceId: "DEV-IPA-ELE-01", title: "住院 A 3# 电梯门机故障", closedAt: "2026-03-02", durationH: 2, result: "更换门机皮带，恢复运行", owner: "郑工（配电班）" },
];

/** 工单状态机看板：列顺序与流转按钮文案 */
export const kanbanStatusOrder = ["received", "judging", "assigned", "processing", "retest", "review", "closed"] as const;

export const transitionLabels: Record<string, string> = {
  "received->judging": "开始判断",
  "judging->assigned": "确认指派",
  "judging->closed": "误报关闭",
  "assigned->processing": "开始处理",
  "processing->retest": "提交复测",
  "retest->review": "复测通过",
  "retest->processing": "复测退回",
  "review->closed": "复核关闭",
  "review->processing": "复核退回",
};
