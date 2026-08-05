// 巡检模块运行时状态：任务领取/检查项填写/模拟记录/提交 + 关联人工确认。
// 命名空间随全局（hospital-carbon-demo:v1），「重置演示」清 namespace 后自动回种子。
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { nsKey } from "../data/config";
import {
  seedInspectionRecords,
  type InspectItemResult,
  type InspectionTask,
  type SimAudio,
  type SimPhoto,
  type TaskRecord,
} from "../data/modules/inspection";

const SCHEMA_VERSION = 1;

interface InspectionStore {
  schemaVersion: number;
  /** taskId -> 执行记录（未领取的任务没有记录） */
  records: Record<string, TaskRecord>;
  /** linkId -> 人工确认时间（问题-能效关联的人工复核动作） */
  confirmedLinks: Record<string, string>;

  claimTask: (task: InspectionTask, actor: string, at: string) => void;
  setItem: (taskId: string, itemId: string, patch: Partial<InspectItemResult>) => void;
  addPhoto: (taskId: string, photo: SimPhoto) => void;
  removePhoto: (taskId: string, photoId: string) => void;
  addAudio: (taskId: string, audio: SimAudio) => void;
  removeAudio: (taskId: string, audioId: string) => void;
  setGps: (taskId: string, gps: string) => void;
  submitTask: (taskId: string, at: string) => void;
  confirmLink: (linkId: string, at: string) => void;
}

function patchRecord(
  records: Record<string, TaskRecord>,
  taskId: string,
  fn: (r: TaskRecord) => TaskRecord,
): Record<string, TaskRecord> {
  const r = records[taskId];
  if (!r) return records;
  return { ...records, [taskId]: fn(r) };
}

export const useInspectionStore = create<InspectionStore>()(
  persist(
    (set) => ({
      schemaVersion: SCHEMA_VERSION,
      records: seedInspectionRecords,
      confirmedLinks: {},

      claimTask: (task, actor, at) =>
        set((s) => ({
          records: {
            ...s.records,
            [task.id]: {
              taskId: task.id,
              status: "claimed",
              claimedBy: actor,
              claimedAt: at,
              items: task.items.map((it) => ({ itemId: it.id, result: "" as const, note: "" })),
              photos: [],
              audios: [],
            },
          },
        })),

      setItem: (taskId, itemId, patch) =>
        set((s) => ({
          records: patchRecord(s.records, taskId, (r) =>
            r.status === "done"
              ? r
              : { ...r, items: r.items.map((it) => (it.itemId === itemId ? { ...it, ...patch } : it)) },
          ),
        })),

      addPhoto: (taskId, photo) =>
        set((s) => ({ records: patchRecord(s.records, taskId, (r) => (r.status === "done" ? r : { ...r, photos: [...r.photos, photo] })) })),

      removePhoto: (taskId, photoId) =>
        set((s) => ({
          records: patchRecord(s.records, taskId, (r) =>
            r.status === "done" ? r : { ...r, photos: r.photos.filter((p) => p.id !== photoId) },
          ),
        })),

      addAudio: (taskId, audio) =>
        set((s) => ({ records: patchRecord(s.records, taskId, (r) => (r.status === "done" ? r : { ...r, audios: [...r.audios, audio] })) })),

      removeAudio: (taskId, audioId) =>
        set((s) => ({
          records: patchRecord(s.records, taskId, (r) =>
            r.status === "done" ? r : { ...r, audios: r.audios.filter((a) => a.id !== audioId) },
          ),
        })),

      setGps: (taskId, gps) =>
        set((s) => ({ records: patchRecord(s.records, taskId, (r) => (r.status === "done" ? r : { ...r, gps })) })),

      submitTask: (taskId, at) =>
        set((s) => ({
          records: patchRecord(s.records, taskId, (r) =>
            r.status === "done" ? r : { ...r, status: "done", submittedAt: at },
          ),
        })),

      confirmLink: (linkId, at) => set((s) => ({ confirmedLinks: { ...s.confirmedLinks, [linkId]: at } })),
    }),
    {
      name: nsKey("inspection"),
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => window.localStorage),
      migrate: (persisted, version) => {
        if (version !== SCHEMA_VERSION) return undefined as never;
        return persisted as never;
      },
    },
  ),
);
