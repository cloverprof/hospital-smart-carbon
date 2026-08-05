import { create } from "zustand";
import { persist } from "zustand/middleware";
import { initialActivityRecords, initialAnomalies, initialEvidence, initialTasks, initialTransactions } from "../data/carbon-platform";
import { EmissionCalculationService } from "../services/emission-calculation";
import type { ActivityRecord, AnnualTask, AssetTransaction, AuditLog, CalculationResult, DemoState, EvidenceRecord, GlobalFilters, MvrAnomaly, Role, StrategyPlan, WorkflowStatus } from "../types/domain";

type ToastTone = "success" | "warning" | "danger" | "info";
export interface ToastItem { id: string; title: string; message: string; tone: ToastTone }

interface PlatformState {
  filters: GlobalFilters;
  role: Role;
  theme: "dark" | "light";
  demoState: DemoState;
  records: ActivityRecord[];
  calculation: CalculationResult;
  batchLocked: boolean;
  transactions: AssetTransaction[];
  tasks: AnnualTask[];
  strategies: StrategyPlan[];
  evidences: EvidenceRecord[];
  anomalies: MvrAnomaly[];
  workflow: WorkflowStatus;
  auditLogs: AuditLog[];
  toasts: ToastItem[];
  setFilter: <K extends keyof GlobalFilters>(key: K, value: GlobalFilters[K]) => void;
  setRole: (role: Role) => void;
  toggleTheme: () => void;
  setDemoState: (state: DemoState) => void;
  calculate: () => CalculationResult;
  restoreDemo: () => void;
  addRecord: (record: ActivityRecord) => void;
  updateRecord: (record: ActivityRecord) => void;
  deleteRecord: (id: string) => void;
  reviewRecords: (ids: string[], decision: "通过" | "退回修改", note: string) => void;
  setBatchLocked: (locked: boolean, reason: string) => void;
  addTransaction: (transaction: AssetTransaction) => void;
  updateTransaction: (transaction: AssetTransaction) => void;
  voidTransaction: (id: string) => void;
  updateTask: (task: AnnualTask) => void;
  addTask: (task: AnnualTask) => void;
  addStrategy: (strategy: StrategyPlan) => void;
  addEvidence: (evidence: EvidenceRecord) => void;
  updateEvidence: (evidence: EvidenceRecord) => void;
  deleteEvidence: (id: string) => void;
  updateAnomaly: (anomaly: MvrAnomaly) => void;
  setWorkflow: (status: WorkflowStatus, reason?: string) => void;
  pushToast: (title: string, message: string, tone?: ToastTone) => void;
  dismissToast: (id: string) => void;
}

const initialCalculation = EmissionCalculationService.calculateBatch(initialActivityRecords, "HSC-2026-07-DRAFT");
const log = (action: string, detail: string, operator = "当前用户"): AuditLog => ({ id: crypto.randomUUID(), action, detail, operator, at: new Date().toLocaleString("zh-CN", { hour12: false }) });

export const usePlatformStore = create<PlatformState>()(persist((set, get) => ({
  filters: { year: 2026, hospital: "总院", scope: "全院", mode: "实时估算" },
  role: "管理员",
  theme: "dark",
  demoState: "normal",
  records: initialActivityRecords,
  calculation: initialCalculation,
  batchLocked: false,
  transactions: initialTransactions,
  tasks: initialTasks,
  strategies: [],
  evidences: initialEvidence,
  anomalies: initialAnomalies,
  workflow: "待复核",
  auditLogs: [log("初始化演示批次", "载入 2026 年医院温室气体核算演示数据", "系统")],
  toasts: [],
  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
  setRole: (role) => set({ role }),
  toggleTheme: () => set((state) => ({ theme: state.theme === "dark" ? "light" : "dark" })),
  setDemoState: (demoState) => set({ demoState }),
  calculate: () => {
    const recalculated = get().records.map((record) => EmissionCalculationService.calculateRecord(record));
    const calculation = EmissionCalculationService.calculateBatch(recalculated);
    set((state) => ({ records: recalculated, calculation, auditLogs: [log("执行一键试算", `批次 ${calculation.batchId}，排放总量 ${calculation.total} tCO₂e`), ...state.auditLogs] }));
    return calculation;
  },
  restoreDemo: () => set({ records: initialActivityRecords, calculation: initialCalculation, batchLocked: false, workflow: "待复核", transactions: initialTransactions, tasks: initialTasks, evidences: initialEvidence, anomalies: initialAnomalies, strategies: [], auditLogs: [log("恢复演示数据", "恢复系统初始数据", "系统")] }),
  addRecord: (record) => set((state) => ({ records: [EmissionCalculationService.calculateRecord(record), ...state.records], auditLogs: [log("新增活动数据", record.sourceName), ...state.auditLogs] })),
  updateRecord: (record) => set((state) => ({ records: state.records.map((item) => item.id === record.id ? EmissionCalculationService.calculateRecord(record) : item), auditLogs: [log("编辑活动数据", record.sourceName), ...state.auditLogs] })),
  deleteRecord: (id) => set((state) => ({ records: state.records.filter((item) => item.id !== id), auditLogs: [log("删除活动数据", id), ...state.auditLogs] })),
  reviewRecords: (ids, decision, note) => set((state) => ({ records: state.records.map((item) => ids.includes(item.id) ? { ...item, reviewStatus: decision === "通过" ? "已通过" : "已退回" } : item), auditLogs: [log(decision === "通过" ? "批量复核通过" : "批量退回修改", `${ids.length} 条；意见：${note}`), ...state.auditLogs] })),
  setBatchLocked: (batchLocked, reason) => set((state) => ({ batchLocked, workflow: batchLocked ? "已锁定" : "待复核", auditLogs: [log(batchLocked ? "锁定核算批次" : "解锁核算批次", reason || "按流程操作"), ...state.auditLogs] })),
  addTransaction: (transaction) => set((state) => ({ transactions: [transaction, ...state.transactions], auditLogs: [log("新增碳资产交易", `${transaction.assetType} ${transaction.direction} ${transaction.quantity}`), ...state.auditLogs] })),
  updateTransaction: (transaction) => set((state) => ({ transactions: state.transactions.map((item) => item.id === transaction.id ? transaction : item), auditLogs: [log("编辑碳资产交易", transaction.contractNo), ...state.auditLogs] })),
  voidTransaction: (id) => set((state) => ({ transactions: state.transactions.map((item) => item.id === id ? { ...item, reviewStatus: "已撤销" } : item), auditLogs: [log("撤销碳资产交易", id), ...state.auditLogs] })),
  updateTask: (task) => set((state) => ({ tasks: state.tasks.map((item) => item.id === task.id ? task : item), auditLogs: [log("更新年度任务", `${task.title}：${task.status}`), ...state.auditLogs] })),
  addTask: (task) => set((state) => ({ tasks: [task, ...state.tasks], auditLogs: [log("新增年度任务", task.title), ...state.auditLogs] })),
  addStrategy: (strategy) => set((state) => ({ strategies: [strategy, ...state.strategies], auditLogs: [log("策略加入方案", strategy.title), ...state.auditLogs] })),
  addEvidence: (evidence) => set((state) => ({ evidences: [evidence, ...state.evidences], auditLogs: [log("上传 MRV 凭证", evidence.name), ...state.auditLogs] })),
  updateEvidence: (evidence) => set((state) => ({ evidences: state.evidences.map((item) => item.id === evidence.id ? evidence : item), auditLogs: [log("更新 MRV 凭证", evidence.code), ...state.auditLogs] })),
  deleteEvidence: (id) => set((state) => ({ evidences: state.evidences.filter((item) => item.id !== id), auditLogs: [log("删除草稿凭证", id), ...state.auditLogs] })),
  updateAnomaly: (anomaly) => set((state) => ({ anomalies: state.anomalies.map((item) => item.id === anomaly.id ? anomaly : item), auditLogs: [log("更新异常", `${anomaly.object}：${anomaly.status}`), ...state.auditLogs] })),
  setWorkflow: (workflow, reason = "按审核流程流转") => set((state) => ({ workflow, auditLogs: [log("MRV 状态流转", `${state.workflow} → ${workflow}；${reason}`), ...state.auditLogs] })),
  pushToast: (title, message, tone = "info") => set((state) => ({ toasts: [...state.toasts, { id: crypto.randomUUID(), title, message, tone }] })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}), {
  name: "hospital-smart-carbon-platform-v2",
  partialize: (state) => ({ filters:state.filters,role:state.role,theme:state.theme,records:state.records,calculation:state.calculation,batchLocked:state.batchLocked,transactions:state.transactions,tasks:state.tasks,strategies:state.strategies,evidences:state.evidences,anomalies:state.anomalies,workflow:state.workflow,auditLogs:state.auditLogs }),
}));
