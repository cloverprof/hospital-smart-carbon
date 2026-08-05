// 碳核算工作台（6.2.1）模块内运行时状态：边界配置 / 补录估算 / 复核 / 试算快照 / 批次锁定 / 归档记录。
// 只存"用户操作产生"的状态；所有用量与排放数字由页面从 services/timeseries + data/factors 现算。
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { nsKey } from "../data/config";

const SCHEMA_VERSION = 1;

/** 缺失区间补录记录（演示主线 C：补录估算值后才允许锁定） */
export interface EstimateRecord {
  /** 绑定缺失区间：`AN-008:<segFrom>:<segTo>`，边界/周期变化后自动失配 */
  id: string;
  /** 人工采用的估算值（品种单位） */
  value: number;
  /** 系统按前后同型日插补的参考值 */
  suggested: number;
  unit: string;
  note: string;
  at: string;
  /** 缺失区间在各月份内的插补参考值拆分（用于把修正量按月分摊） */
  months: Record<string, number>;
}

export interface TrialMonthRow {
  month: string;
  /** Scope1 天然气，tCO2e */
  s1: number;
  /** Scope2 电力，tCO2e */
  s2e: number;
  /** Scope2 热力，tCO2e */
  s2h: number;
}

export interface TrialExtRow {
  id: string;
  name: string;
  t: number;
}

export interface TrialResult {
  at: string;
  /** 试算时的输入指纹；与当前边界/补录不一致即视为过期 */
  signature: string;
  months: TrialMonthRow[];
  includeS1: boolean;
  includeS2: boolean;
  scope1T: number;
  scope2T: number;
  /** 合规口径合计（只含勾选的 Scope1/2） */
  totalT: number;
  /** 扩展边界演示项（不入合规总量） */
  extItems: TrialExtRow[];
  extT: number;
  hasUnresolvedMissing: boolean;
  estimatedApplied: boolean;
}

export interface AccountingLog {
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface ArchiveRecord {
  id: string;
  at: string;
  format: string;
  file: string;
  note: string;
}

interface AccountingStore {
  schemaVersion: number;

  /** 东院区是否纳入组织边界（无计量楼宇，仅边界演示） */
  eastIncluded: boolean;
  /** 被排除的楼宇（默认全部纳入，记差集以便新增楼宇自动纳入） */
  buildingsOff: Record<string, boolean>;
  scope1On: boolean;
  scope2On: boolean;
  /** 扩展/Scope3 演示总开关（独立于合规口径） */
  extOn: boolean;
  /** 被关闭的扩展演示项 */
  extOff: Record<string, boolean>;

  estimates: Record<string, EstimateRecord>;
  /** 品种行复核时间（kind -> 时间字符串） */
  reviews: Record<string, string>;
  trial: TrialResult | null;

  locked: boolean;
  lockInfo: { batchId: string; at: string; by: string } | null;
  batchSeq: number;
  archSeq: number;
  logs: AccountingLog[];
  archives: ArchiveRecord[];

  toggleBuilding: (id: string) => void;
  setAllBuildings: (on: boolean, allIds: string[]) => void;
  setEastIncluded: (on: boolean) => void;
  setScope1On: (on: boolean) => void;
  setScope2On: (on: boolean) => void;
  setExtOn: (on: boolean) => void;
  toggleExtItem: (id: string) => void;

  saveEstimate: (rec: EstimateRecord, actor: string) => void;
  setReviewed: (kinds: string[], actor: string) => void;
  setTrial: (trial: TrialResult, actor: string) => void;
  lockBatch: (periodLabel: string, actor: string) => string;
  unlockBatch: (reason: string, actor: string) => void;
  addArchive: (format: string, file: string, note: string, actor: string) => void;
}

const now = () => new Date().toLocaleString("zh-CN", { hour12: false });

function withLog(logs: AccountingLog[], actor: string, action: string, detail: string): AccountingLog[] {
  return [{ at: now(), actor, action, detail }, ...logs].slice(0, 40);
}

export const useAccountingStore = create<AccountingStore>()(
  persist(
    (set, get) => ({
      schemaVersion: SCHEMA_VERSION,
      eastIncluded: false,
      buildingsOff: {},
      scope1On: true,
      scope2On: true,
      extOn: true,
      extOff: {},
      estimates: {},
      reviews: {},
      trial: null,
      locked: false,
      lockInfo: null,
      batchSeq: 0,
      archSeq: 0,
      logs: [],
      archives: [],

      toggleBuilding: (id) =>
        set((s) => ({ buildingsOff: { ...s.buildingsOff, [id]: !s.buildingsOff[id] } })),
      setAllBuildings: (on, allIds) =>
        set(() => ({ buildingsOff: on ? {} : Object.fromEntries(allIds.map((id) => [id, true])) })),
      setEastIncluded: (eastIncluded) => set({ eastIncluded }),
      setScope1On: (scope1On) => set({ scope1On }),
      setScope2On: (scope2On) => set({ scope2On }),
      setExtOn: (extOn) => set({ extOn }),
      toggleExtItem: (id) => set((s) => ({ extOff: { ...s.extOff, [id]: !s.extOff[id] } })),

      saveEstimate: (rec, actor) =>
        set((s) => ({
          estimates: { ...s.estimates, [rec.id]: rec },
          logs: withLog(s.logs, actor, "补录估算值", `${rec.id} 采用 ${rec.value.toLocaleString("zh-CN")} ${rec.unit}（插补参考 ${rec.suggested.toLocaleString("zh-CN")}）`),
        })),

      setReviewed: (kinds, actor) =>
        set((s) => ({
          reviews: { ...s.reviews, ...Object.fromEntries(kinds.map((k) => [k, now()])) },
          logs: withLog(s.logs, actor, "批量复核", `复核通过 ${kinds.length} 个品种行`),
        })),

      setTrial: (trial, actor) =>
        set((s) => ({
          trial,
          logs: withLog(s.logs, actor, "一键试算", `Scope1+2 合计 ${trial.totalT.toLocaleString("zh-CN")} tCO2e${trial.hasUnresolvedMissing ? "（存在缺失，草稿）" : ""}`),
        })),

      lockBatch: (periodLabel, actor) => {
        const seq = get().batchSeq + 1;
        const batchId = `HSC-${periodLabel}-B${String(seq).padStart(2, "0")}`;
        set((s) => ({
          locked: true,
          batchSeq: seq,
          lockInfo: { batchId, at: now(), by: actor },
          logs: withLog(s.logs, actor, "锁定批次", `${batchId} 已锁定，活动数据转为只读`),
        }));
        return batchId;
      },

      unlockBatch: (reason, actor) =>
        set((s) => ({
          locked: false,
          lockInfo: null,
          logs: withLog(s.logs, actor, "申请解锁（演示自动审批）", `原因：${reason}`),
        })),

      addArchive: (format, file, note, actor) => {
        const seq = get().archSeq + 1;
        set((s) => ({
          archSeq: seq,
          archives: [{ id: `AR-${String(seq).padStart(3, "0")}`, at: now(), format, file, note }, ...s.archives].slice(0, 20),
          logs: withLog(s.logs, actor, "导出归档", `${format}：${file}`),
        }));
      },
    }),
    {
      name: nsKey("accounting"),
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => moduleStorage()),
      migrate: (persisted, version) => {
        if (version !== SCHEMA_VERSION) return undefined as never;
        return persisted as never;
      },
    },
  ),
);

/** localStorage 不可用（隐私模式/被禁用/容量满）时回退到内存，与 demo store 同策略 */
function moduleStorage(): Storage {
  try {
    const probe = nsKey("accounting-probe");
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      get length() { return mem.size; },
      clear: () => mem.clear(),
      getItem: (k: string) => mem.get(k) ?? null,
      key: (i: number) => [...mem.keys()][i] ?? null,
      removeItem: (k: string) => void mem.delete(k),
      setItem: (k: string, v: string) => void mem.set(k, v),
    } as Storage;
  }
}
