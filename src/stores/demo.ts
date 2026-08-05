// 全局演示 store：角色 / 全部权限 / 场景模式 / 院区 / 告警-工单-项目运行时状态。
// 持久化统一走 hospital-carbon-demo:v1 命名空间；重置演示只清本命名空间。
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { alarmSeeds } from "../data/alarms";
import { STORAGE_NS, nsKey } from "../data/config";
import { projectSeeds } from "../data/projects";
import { workOrderSeeds } from "../data/workorders";
import { assertTransition, alarmTransitions, workOrderTransitions } from "../services/machines";
import type { Alarm, AlarmStatus, CampusId, Project, ProjectStage, RoleId, SceneMode, WorkOrder, WorkOrderStatus } from "../types/core";

const SCHEMA_VERSION = 1;

interface DemoStore {
  schemaVersion: number;
  role: RoleId;
  allPermissions: boolean;
  sceneMode: SceneMode;
  campus: CampusId;
  /** 各页面筛选条件（pageId -> 任意可序列化对象） */
  pageFilters: Record<string, Record<string, string | number | boolean>>;
  recentModuleIds: string[];
  alarms: Alarm[];
  workOrders: WorkOrder[];
  projects: Project[];
  toasts: { id: string; title: string; message: string; tone: "success" | "warning" | "danger" | "info" }[];

  setRole: (role: RoleId) => void;
  setAllPermissions: (on: boolean) => void;
  setSceneMode: (mode: SceneMode) => void;
  setCampus: (campus: CampusId) => void;
  setPageFilter: (pageId: string, patch: Record<string, string | number | boolean>) => void;
  touchModule: (moduleId: string) => void;

  transitionAlarm: (id: string, to: AlarmStatus) => void;
  transitionWorkOrder: (id: string, to: WorkOrderStatus, note?: string, actor?: string) => void;
  addWorkOrderLog: (id: string, action: string, note: string, actor?: string) => void;
  addProject: (project: Project) => void;
  setProjectStage: (id: string, stage: ProjectStage) => void;
  updateProject: (project: Project) => void;

  pushToast: (title: string, message: string, tone?: "success" | "warning" | "danger" | "info") => void;
  dismissToast: (id: string) => void;

  /** 一键重置演示：仅清除本系统命名空间 key，恢复种子数据 */
  resetDemo: () => void;
}

let toastSeq = 0;
const now = () => new Date().toLocaleString("zh-CN", { hour12: false });

export const useDemoStore = create<DemoStore>()(
  persist(
    (set, get) => ({
      schemaVersion: SCHEMA_VERSION,
      role: "energyAdmin",
      allPermissions: true,
      sceneMode: "image",
      campus: "main",
      pageFilters: {},
      recentModuleIds: [],
      alarms: alarmSeeds,
      workOrders: workOrderSeeds,
      projects: projectSeeds,
      toasts: [],

      setRole: (role) => set({ role }),
      setAllPermissions: (allPermissions) => set({ allPermissions }),
      setSceneMode: (sceneMode) => set({ sceneMode }),
      setCampus: (campus) => set({ campus }),
      setPageFilter: (pageId, patch) =>
        set((s) => ({ pageFilters: { ...s.pageFilters, [pageId]: { ...s.pageFilters[pageId], ...patch } } })),
      touchModule: (moduleId) =>
        set((s) => ({ recentModuleIds: [moduleId, ...s.recentModuleIds.filter((m) => m !== moduleId)].slice(0, 8) })),

      transitionAlarm: (id, to) => {
        const alarm = get().alarms.find((a) => a.id === id);
        if (!alarm) return;
        try {
          assertTransition(alarmTransitions, alarm.status, to);
        } catch {
          get().pushToast("流转被拒绝", `告警不允许从当前状态直接变为目标状态`, "warning");
          return;
        }
        set((s) => ({ alarms: s.alarms.map((a) => (a.id === id ? { ...a, status: to } : a)) }));
      },

      transitionWorkOrder: (id, to, note = "", actor = "当前用户") => {
        const wo = get().workOrders.find((w) => w.id === id);
        if (!wo) return;
        try {
          assertTransition(workOrderTransitions, wo.status, to);
        } catch {
          get().pushToast("流转被拒绝", "工单状态机不允许该流转", "warning");
          return;
        }
        set((s) => ({
          workOrders: s.workOrders.map((w) =>
            w.id === id
              ? { ...w, status: to, logs: [...w.logs, { at: now(), actor, action: to, note: note || `状态流转为 ${to}` }] }
              : w,
          ),
        }));
      },

      addWorkOrderLog: (id, action, note, actor = "当前用户") =>
        set((s) => ({
          workOrders: s.workOrders.map((w) => (w.id === id ? { ...w, logs: [...w.logs, { at: now(), actor, action, note }] } : w)),
        })),

      addProject: (project) => set((s) => ({ projects: [project, ...s.projects] })),
      setProjectStage: (id, stage) => set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, stage } : p)) })),
      updateProject: (project) => set((s) => ({ projects: s.projects.map((p) => (p.id === project.id ? project : p)) })),

      pushToast: (title, message, tone = "info") =>
        set((s) => ({ toasts: [...s.toasts, { id: `t${++toastSeq}`, title, message, tone }] })),
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      resetDemo: () => {
        clearNamespace();
        set({
          role: "energyAdmin",
          allPermissions: true,
          sceneMode: "image",
          campus: "main",
          pageFilters: {},
          recentModuleIds: [],
          alarms: alarmSeeds,
          workOrders: workOrderSeeds,
          projects: projectSeeds,
        });
        get().pushToast("演示已重置", "已恢复固定初始数据与默认设置", "success");
      },
    }),
    {
      name: nsKey("demo"),
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => safeStorage()),
      partialize: (s) => ({
        schemaVersion: s.schemaVersion,
        role: s.role,
        allPermissions: s.allPermissions,
        sceneMode: s.sceneMode,
        campus: s.campus,
        pageFilters: s.pageFilters,
        recentModuleIds: s.recentModuleIds,
        alarms: s.alarms,
        workOrders: s.workOrders,
        projects: s.projects,
      }),
      migrate: (persisted, version) => {
        // 旧 schema：直接丢弃，回到种子数据（最小迁移策略，见 docs/DECISIONS.md）
        if (version !== SCHEMA_VERSION) return undefined as never;
        return persisted as never;
      },
    },
  ),
);

/** localStorage 不可用（隐私模式/被禁用/容量满）时回退到内存，保证不白屏 */
function safeStorage(): Storage {
  try {
    const probe = nsKey("probe");
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

/** 只删除本系统命名空间的 key，绝不 localStorage.clear() */
export function clearNamespace(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(`${STORAGE_NS}:`)) doomed.push(k);
    }
    doomed.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // 存储不可用时无事可做
  }
}
