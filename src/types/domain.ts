export type Role = "管理员" | "核算员" | "审核员" | "核查员";
export type OperationMode = "实时估算" | "正式核算";
export type DemoState = "normal" | "loading" | "empty" | "error" | "noPermission" | "unauthorized";
export type Scope = "范围一" | "范围二" | "范围三";
export type RecordStatus = "已采集" | "缺失" | "异常" | "估算值";
export type ReviewStatus = "草稿" | "待复核" | "已通过" | "已退回";
export type EvidenceStatus = "未关联" | "待审核" | "审核通过" | "异常";

export interface GlobalFilters {
  year: number;
  hospital: "总院" | "东院区" | "西院区";
  scope: "全院" | "院区" | "楼宇" | "科室";
  mode: OperationMode;
}

export interface EmissionFactor {
  id: string;
  name: string;
  category: string;
  value: number;
  unit: string;
  source: string;
  version: string;
  effectiveFrom: string;
  effectiveTo: string;
  gwp?: number;
}

export interface ActivityRecord {
  id: string;
  code: string;
  sourceName: string;
  category: string;
  scope: Scope;
  campus: GlobalFilters["hospital"];
  building: string;
  department: string;
  month: string;
  activity: number | null;
  unit: string;
  factorId: string;
  factorValue: number;
  factorSource: string;
  emission: number | null;
  status: RecordStatus;
  reviewStatus: ReviewStatus;
  evidenceStatus: EvidenceStatus;
  estimated: boolean;
  updatedAt: string;
}

export interface CalculationResult {
  batchId: string;
  calculatedAt: string;
  total: number;
  scope1: number;
  scope2: number;
  scope3: number;
  missingIds: string[];
  qualityScore: number;
}

export interface AuditLog {
  id: string;
  action: string;
  operator: string;
  detail: string;
  at: string;
}

export interface AssetTransaction {
  id: string;
  assetType: "碳信用" | "CCER" | "绿证" | "绿电" | "内部碳配额";
  direction: "买入" | "卖出";
  quantity: number;
  unitPrice: number;
  amount: number;
  date: string;
  counterparty: string;
  contractNo: string;
  attachment?: string;
  operator: string;
  reviewStatus: "待审核" | "已通过" | "已撤销";
}

export interface AnnualTask {
  id: string;
  title: string;
  dueDate: string;
  owner: string;
  progress: number;
  status: "待开始" | "进行中" | "已完成" | "已逾期";
  note: string;
  priority: "高" | "中" | "低";
}

export interface StrategyPlan {
  id: string;
  title: string;
  quantity: number;
  unitPrice: number;
  reduction: number;
  cycle: string;
  funding: string;
  department: string;
  createdAt: string;
}

export type WorkflowStatus = "草稿" | "已提交" | "待复核" | "复核通过" | "待核查" | "核查通过" | "已锁定" | "已归档";

export interface EvidenceRecord {
  id: string;
  code: string;
  name: string;
  type: string;
  dataSource: string;
  resultRef: string;
  campus: GlobalFilters["hospital"];
  period: string;
  format: string;
  size: string;
  uploader: string;
  uploadedAt: string;
  reviewer: string;
  reviewStatus: "草稿" | "待审核" | "审核通过" | "已退回";
  validUntil: string;
  hash: string;
  integrity: "完整" | "缺失关联" | "哈希异常";
  department: string;
  dataUrl?: string;
}

export interface MvrAnomaly {
  id: string;
  type: string;
  object: string;
  description: string;
  severity: "高" | "中" | "低";
  owner: string;
  status: "待处理" | "整改中" | "已忽略" | "已关闭";
  occurredAt: string;
  note: string;
}
