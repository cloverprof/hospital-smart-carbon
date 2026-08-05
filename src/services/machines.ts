// 告警 / 工单 / 项目 状态机：集中定义合法流转，页面只能调用 transition。
import type { AlarmStatus, ProjectStage, WorkOrderStatus } from "../types/core";

export const alarmTransitions: Record<AlarmStatus, AlarmStatus[]> = {
  pending: ["processing", "acknowledged"],
  processing: ["acknowledged", "resolved"],
  acknowledged: ["processing", "resolved"],
  resolved: [],
};

export const workOrderTransitions: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  received: ["judging"],
  judging: ["assigned", "closed"],
  assigned: ["processing"],
  processing: ["retest"],
  retest: ["review", "processing"],
  review: ["closed", "processing"],
  closed: [],
};

export const projectStageOrder: ProjectStage[] = ["initiation", "design", "construction", "acceptance", "operation"];

export function canTransition<S extends string>(map: Record<S, S[]>, from: S, to: S): boolean {
  return (map[from] ?? []).includes(to);
}

export function nextProjectStage(stage: ProjectStage): ProjectStage | null {
  const i = projectStageOrder.indexOf(stage);
  return i >= 0 && i < projectStageOrder.length - 1 ? projectStageOrder[i + 1] : null;
}

export function assertTransition<S extends string>(map: Record<S, S[]>, from: S, to: S): void {
  if (!canTransition(map, from, to)) throw new Error(`非法状态流转: ${from} → ${to}`);
}
