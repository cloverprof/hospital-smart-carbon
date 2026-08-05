// 碳资产管理模块运行时状态：履约任务与交易台账的修改持久化。
// 命名空间走 nsKey("carbon-assets")，随全局「重置演示」一并清除。
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { initialTransactions } from "../data/carbon-platform";
import { nsKey } from "../data/config";
import { assetTaskSeeds, type AssetComplianceTask } from "../data/modules/carbon-assets";
import type { AssetTransaction } from "../types/domain";

interface CarbonAssetsStore {
  tasks: AssetComplianceTask[];
  transactions: AssetTransaction[];
  completeTask: (id: string) => void;
  reassignTask: (id: string, owner: string, dept: string) => void;
  addTask: (task: AssetComplianceTask) => void;
  addTransaction: (tx: AssetTransaction) => void;
  approveTransaction: (id: string) => void;
  voidTransaction: (id: string) => void;
  resetModule: () => void;
}

export const useCarbonAssetsStore = create<CarbonAssetsStore>()(
  persist(
    (set) => ({
      tasks: assetTaskSeeds,
      transactions: initialTransactions,

      completeTask: (id) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, status: "已完成" as const, progress: 100 } : t)) })),
      reassignTask: (id, owner, dept) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, owner, dept } : t)) })),
      addTask: (task) => set((s) => ({ tasks: [task, ...s.tasks] })),

      addTransaction: (tx) => set((s) => ({ transactions: [tx, ...s.transactions] })),
      approveTransaction: (id) =>
        set((s) => ({ transactions: s.transactions.map((t) => (t.id === id ? { ...t, reviewStatus: "已通过" as const } : t)) })),
      voidTransaction: (id) =>
        set((s) => ({ transactions: s.transactions.map((t) => (t.id === id ? { ...t, reviewStatus: "已撤销" as const } : t)) })),

      resetModule: () => set({ tasks: assetTaskSeeds, transactions: initialTransactions }),
    }),
    { name: nsKey("carbon-assets"), version: 1 },
  ),
);
