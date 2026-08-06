import type { BuildingId } from "../../types/core";

export type DepartmentId =
  | "surgery"
  | "outpatient"
  | "inpatient"
  | "imaging"
  | "laboratory"
  | "emergency"
  | "cssd";

export type WorkloadDriver = "outpatient" | "surgery" | "occupied-bed";

export interface DepartmentProfile {
  id: DepartmentId;
  name: string;
  shortName: string;
  buildingId: BuildingId;
  /** 科室在所属楼宇用电中的演示分摊比例。 */
  electricityShare: number;
  workload: {
    driver: WorkloadDriver;
    label: string;
    unit: string;
    /** 从全院统一业务量确定性派生本科室业务量。 */
    multiplier: number;
  };
  /** 院内年度改善目标；仅用于演示基准，不是合规标准。 */
  improvementTargetPct: number;
  safetyNote: string;
}

export const departmentProfiles: DepartmentProfile[] = [
  {
    id: "surgery",
    name: "手术部",
    shortName: "手术部",
    buildingId: "surgical",
    electricityShare: 0.62,
    workload: { driver: "surgery", label: "手术台次", unit: "台次", multiplier: 1 },
    improvementTargetPct: 3,
    safetyNote: "洁净度、压差和急诊手术保障优先；任何节能建议均须人工复核。",
  },
  {
    id: "outpatient",
    name: "门诊部",
    shortName: "门诊部",
    buildingId: "outpatient",
    electricityShare: 0.78,
    workload: { driver: "outpatient", label: "门诊人次", unit: "人次", multiplier: 0.86 },
    improvementTargetPct: 2.5,
    safetyNote: "诊疗开放时段与患者舒适度优先，不以压缩诊疗服务换取能耗下降。",
  },
  {
    id: "inpatient",
    name: "住院内科",
    shortName: "住院内科",
    buildingId: "inpatientA",
    electricityShare: 0.68,
    workload: { driver: "occupied-bed", label: "实际床日", unit: "床日", multiplier: 1 },
    improvementTargetPct: 2,
    safetyNote: "病房温湿度、供氧和护理连续性优先，禁止自动关闭生命保障相关设备。",
  },
  {
    id: "imaging",
    name: "医学影像科",
    shortName: "影像科",
    buildingId: "imaging",
    electricityShare: 0.84,
    workload: { driver: "outpatient", label: "影像检查人次", unit: "人次", multiplier: 0.068 },
    improvementTargetPct: 3.5,
    safetyNote: "磁体冷却与设备安全优先；待机策略须经厂商和医工部门确认。",
  },
  {
    id: "laboratory",
    name: "检验科",
    shortName: "检验科",
    buildingId: "lab",
    electricityShare: 0.82,
    workload: { driver: "outpatient", label: "检验标本量", unit: "份", multiplier: 1.42 },
    improvementTargetPct: 2.5,
    safetyNote: "样本质量、冷链和生物安全优先，节能动作不得影响检验流程连续性。",
  },
  {
    id: "emergency",
    name: "急诊医学科",
    shortName: "急诊科",
    buildingId: "emergency",
    electricityShare: 0.76,
    workload: { driver: "outpatient", label: "急诊人次", unit: "人次", multiplier: 0.14 },
    improvementTargetPct: 1.5,
    safetyNote: "急救响应和抢救设备连续运行优先，不设置自动节能控制。",
  },
  {
    id: "cssd",
    name: "消毒供应中心",
    shortName: "消供中心",
    buildingId: "cssd",
    electricityShare: 0.72,
    workload: { driver: "surgery", label: "灭菌装载批次", unit: "批次", multiplier: 0.42 },
    improvementTargetPct: 3,
    safetyNote: "灭菌质量和蒸汽连续性优先，任何调整不得降低消毒供应保障等级。",
  },
];

export const departmentById = Object.fromEntries(
  departmentProfiles.map((profile) => [profile.id, profile]),
) as Record<DepartmentId, DepartmentProfile>;

export const departmentWindowOptions = [7, 14, 30] as const;
export type DepartmentWindowDays = (typeof departmentWindowOptions)[number];

export const defaultDepartmentId: DepartmentId = "surgery";
export const defaultDepartmentWindowDays: DepartmentWindowDays = 14;

export const departmentWorkbenchCopy = {
  title: "科室负责人工作台",
  subtitle: "把科室业务量、用电强度、异常证据与整改任务放在同一条确认链上",
  benchmarkNote: "院内能效基准（演示）= 前一等长周期单位业务量用电 × 年度改善目标；不作为合规结论。",
  diagnosisLabel: "模拟诊断",
} as const;
