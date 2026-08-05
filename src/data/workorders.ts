import type { WorkOrder } from "../types/core";
import { anomalyChains } from "./anomalies";

// 工单种子：异常链派生 + 例行工单。运行时流转由 demo store overrides 承载。
const statusByAnomaly: Record<string, WorkOrder["status"]> = {
  "AN-001": "processing",
  "AN-002": "assigned",
  "AN-003": "judging",
  "AN-004": "processing",
  "AN-005": "processing",
  "AN-006": "received",
  "AN-007": "retest",
  "AN-008": "closed",
  "AN-009": "closed",
};

const chainOrders: WorkOrder[] = anomalyChains
  .filter((a) => a.workOrderId)
  .map((a) => ({
    id: a.workOrderId!,
    title: `${a.title} 处置工单`,
    buildingId: a.buildingId,
    system: a.system,
    deviceId: a.deviceId,
    alarmId: a.alarmId,
    anomalyId: a.id,
    status: statusByAnomaly[a.id] ?? "received",
    priority: a.level === "critical" ? "high" : a.level === "warning" ? "medium" : "low",
    owner: a.owner,
    ownerTeam: a.ownerTeam,
    createdAt: `${a.from} 10:00`,
    dueAt: a.level === "critical" ? "2026-08-05 18:00" : "2026-08-08 18:00",
    eta: a.level === "critical" ? "2026-08-05 12:00" : "2026-08-07 17:00",
    projectId: a.projectId,
    logs: [
      { at: `${a.from} 10:00`, actor: "系统", action: "接收", note: `由告警 ${a.alarmId} 自动生成` },
      { at: `${a.from} 10:20`, actor: "后勤调度", action: "判断", note: "确认为有效异常，转指派" },
      ...(statusByAnomaly[a.id] !== "received" && statusByAnomaly[a.id] !== "judging"
        ? [{ at: `${a.from} 11:00`, actor: "后勤调度", action: "指派", note: `指派给${a.ownerTeam} ${a.owner}` }]
        : []),
      ...(statusByAnomaly[a.id] === "retest"
        ? [{ at: "2026-08-02 15:40", actor: a.owner, action: "处理", note: "已更换部件，进入复测观察期" }]
        : []),
      ...(statusByAnomaly[a.id] === "closed"
        ? [
            { at: "2026-08-02 16:00", actor: a.owner, action: "处理", note: "故障处理完成" },
            { at: "2026-08-03 09:30", actor: "能源管理员", action: "复核", note: "能耗回落至基线，确认关闭" },
          ]
        : []),
    ],
  }));

const routineOrders: WorkOrder[] = [
  {
    id: "WO-2026-0721", title: "冷却塔填料季度清洗", buildingId: "power", system: "chiller", status: "assigned",
    priority: "low", owner: "刘工（冷站班）", ownerTeam: "冷站运行班", createdAt: "2026-08-01 09:00",
    dueAt: "2026-08-10 18:00", logs: [{ at: "2026-08-01 09:00", actor: "计划任务", action: "接收", note: "季度保养计划生成" }],
  },
  {
    id: "WO-2026-0722", title: "住院 A 楼电梯年检配合", buildingId: "inpatientA", system: "elevator", status: "received",
    priority: "medium", owner: "郑工（配电班）", ownerTeam: "配电运行班", createdAt: "2026-08-03 14:00",
    dueAt: "2026-08-15 18:00", logs: [{ at: "2026-08-03 14:00", actor: "计划任务", action: "接收", note: "年检窗口预约" }],
  },
];

export const workOrderSeeds: WorkOrder[] = [...chainOrders, ...routineOrders];
export const workOrderById = Object.fromEntries(workOrderSeeds.map((w) => [w.id, w]));

export const workOrderStatusMeta: Record<WorkOrder["status"], string> = {
  received: "接收",
  judging: "判断",
  assigned: "已指派",
  processing: "处理中",
  retest: "复测",
  review: "复核",
  closed: "已关闭",
};
