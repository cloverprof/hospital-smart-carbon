// 绿色低碳医院评价：达标状态人工切换（评审演示用）的持久化 store。
// 只存 override；计算判定始终来自数据层，切换不改变计算值。
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { nsKey } from "../data/config";
import type { ItemState } from "../data/modules/green-rating";

interface GreenRatingStore {
  /** itemId -> 人工切换后的状态（无记录 = 使用计算/默认判定） */
  overrides: Record<string, ItemState>;
  setItemState: (id: string, state: ItemState) => void;
  clearOverride: (id: string) => void;
  resetOverrides: () => void;
}

export const useGreenRatingStore = create<GreenRatingStore>()(
  persist(
    (set) => ({
      overrides: {},
      setItemState: (id, state) => set((s) => ({ overrides: { ...s.overrides, [id]: state } })),
      clearOverride: (id) =>
        set((s) => {
          const next = { ...s.overrides };
          delete next[id];
          return { overrides: next };
        }),
      resetOverrides: () => set({ overrides: {} }),
    }),
    { name: nsKey("green-rating"), storage: createJSONStorage(() => window.localStorage) },
  ),
);
