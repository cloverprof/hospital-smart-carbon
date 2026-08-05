// 平台统一域模型：hospital -> campus -> building -> system -> device -> meter
// -> energy/carbon -> alarm -> workOrder -> project
// 所有页面共享这些 ID 与类型，禁止用名称字符串拼接对象关系。

export type CampusId = "main" | "east";

export type BuildingId =
  | "outpatient"
  | "inpatientA"
  | "inpatientB"
  | "surgical"
  | "lab"
  | "imaging"
  | "cssd"
  | "admin"
  | "power"
  | "emergency";

export type EnergyKind = "electricity" | "water" | "gas" | "heat" | "medgas";

export type SystemKind =
  | "hvac"
  | "purification"
  | "boiler"
  | "chiller"
  | "water"
  | "medgas"
  | "elevator"
  | "lighting"
  | "medical"
  | "power"
  | "sewage";

export type RoleId = "leader" | "logistics" | "department" | "energyAdmin";

export type SceneMode = "image" | "3d";

export interface Campus {
  id: CampusId;
  name: string;
  buildings: BuildingId[];
}

export interface Building {
  id: BuildingId;
  campusId: CampusId;
  name: string;
  shortName: string;
  functionLabel: string;
  areaM2: number;
  floors: number;
  beds: number;
  yearBuilt: number;
  /** 各能源品种日基准用量（主导驱动，见 timeseries） */
  baseDaily: Record<EnergyKind, number>;
  /** 名牌在夜景图上的锚点，百分比坐标（配置化，映射假设见 docs/DECISIONS.md） */
  anchor: { x: number; y: number };
  systems: SystemKind[];
}

export interface Device {
  id: string;
  name: string;
  buildingId: BuildingId;
  system: SystemKind;
  category: string;
  ratedPowerKw: number;
  status: "online" | "offline" | "fault" | "maintenance";
  commissionYear: number;
  designLifeYears: number;
  runHours: number;
  efficiencyDecayPct: number;
  meterId: string;
  isLargeMedical?: boolean;
  standbyPowerKw?: number;
  lastHeartbeat?: string;
}

export type AlarmCategory =
  | "energy"
  | "device"
  | "environment"
  | "data"
  | "medgasPressure"
  | "cleanliness"
  | "ups";

export type AlarmLevel = "critical" | "warning" | "info";
export type AlarmStatus = "pending" | "processing" | "acknowledged" | "resolved";

export interface Alarm {
  id: string;
  title: string;
  category: AlarmCategory;
  level: AlarmLevel;
  status: AlarmStatus;
  buildingId: BuildingId;
  system: SystemKind;
  deviceId?: string;
  meterId?: string;
  startAt: string; // ISO
  detail: string;
  owner: string;
  ownerTeam: string;
  workOrderId?: string;
  anomalyId?: string;
  /** 估算额外碳排 kgCO2e/日 */
  extraCarbonKgPerDay?: number;
  extraEnergyPerDay?: string;
}

export type WorkOrderStatus =
  | "received"
  | "judging"
  | "assigned"
  | "processing"
  | "retest"
  | "review"
  | "closed";

export interface WorkOrder {
  id: string;
  title: string;
  buildingId: BuildingId;
  system: SystemKind;
  deviceId?: string;
  alarmId?: string;
  anomalyId?: string;
  status: WorkOrderStatus;
  priority: "high" | "medium" | "low";
  owner: string;
  ownerTeam: string;
  createdAt: string;
  dueAt: string;
  eta?: string;
  logs: { at: string; actor: string; action: string; note: string }[];
  projectId?: string;
}

export type ProjectStage = "initiation" | "design" | "construction" | "acceptance" | "operation";

export interface Project {
  id: string;
  name: string;
  source: "diagnosis" | "ai" | "manual";
  buildingIds: BuildingId[];
  system: SystemKind;
  stage: ProjectStage;
  owner: string;
  investmentWanYuan: number;
  annualSavingMwh: number;
  annualSavingWanYuan: number;
  annualCarbonReductionT: number;
  paybackYears: number;
  isEmc?: boolean;
  emc?: { investor: string; sharePct: number; contractYears: number; sharedWanYuan: number };
  mv?: { baseline: string; adjusted: string; verifiedSavingMwh: number; verifiedReductionT: number; method: string };
  createdAt: string;
  workOrderId?: string;
  anomalyId?: string;
  calcParams?: Record<string, number>;
}

/** 10 条预置演示异常链（见提示词 7.4） */
export interface AnomalyChain {
  id: string;
  title: string;
  buildingId: BuildingId;
  system: SystemKind;
  deviceId: string;
  meterId: string;
  energyKind: EnergyKind;
  /** 异常生效日期范围（含端点，ISO 日期） */
  from: string;
  to?: string;
  /** 影响时段（24h 制，[startHour, endHour)）；不填为全天 */
  hours?: [number, number];
  /** 该时段能耗放大系数，例如 1.18 = +18% */
  factor: number;
  level: AlarmLevel;
  alarmId: string;
  workOrderId?: string;
  projectId?: string;
  owner: string;
  ownerTeam: string;
  evidence: string[];
  aiConfidencePct: number;
  rootCause: string;
  suggestion: string;
  estSavingMwhPerYear: number;
  estSavingWanYuanPerYear: number;
  estReductionTPerYear: number;
  medicalSafetyNote?: string;
  status: "open" | "handling" | "closed";
}

export interface EmissionFactorRecord {
  id: string;
  name: string;
  scope: 1 | 2 | 3 | "ext";
  value: number;
  unit: string;
  version: string;
  applicableYear: string;
  source: string;
  sourceUrl: string;
  verified: boolean;
  note?: string;
}

export interface ComplianceSource {
  id: string;
  name: string;
  code: string;
  status: "现行" | "已废止" | "待核验";
  verified: boolean;
  publishDate?: string;
  sourceUrl?: string;
  accessDate?: string;
  scopeNote: string;
  usage: string;
  fallback?: string;
}

export interface SeriesPoint {
  /** ISO 日期或 "HH:mm" */
  t: string;
  v: number;
}

export interface ModuleDef {
  id: string;
  categoryId: string;
  name: string;
  route: string;
  icon: string;
  summary: string;
  /** 可见角色；all-permissions 开关开启时忽略 */
  roles: RoleId[];
}

export interface ModuleCategory {
  id: string;
  name: string;
  icon: string;
}
