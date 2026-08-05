// 合规凭证看板（compliance-vault）模块 store。
// 只保存文件名/大小/类型等元数据：文件内容不读取、不持久化、不发送到任何外部服务。
// 持久化命名空间走 nsKey("compliance")，随"重置演示"一并清除。
import dayjs from "dayjs";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { nsKey } from "../data/config";

const SCHEMA_VERSION = 1;

export type CredLevel = "L1" | "L2" | "L3";
export type CredCampus = "main" | "east" | "all";
/** 四类状态：已上传（有效）/ 即将到期 / 已过期 / 未上传 */
export type CredStatus = "valid" | "expiring" | "expired" | "missing";

/** 到期预警窗口（天） */
export const WARN_DAYS = 90;

export const credLevelNames: Record<CredLevel, string> = {
  L1: "L1 基础合规",
  L2: "L2 能源与资源",
  L3: "L3 温室气体",
};

export const credCampusNames: Record<CredCampus, string> = {
  main: "主院区",
  east: "东院区",
  all: "全院共用",
};

export const credTypeNames: Record<string, string> = {
  eia: "环评批复",
  discharge: "排污许可",
  radiation: "辐射安全",
  medgasSafety: "医用气体安全",
  energyAudit: "能源审计",
  waterAudit: "用水审计",
  metering: "计量检测",
  greenProcure: "绿色采购",
  verification: "核查报告",
  greenPower: "绿电凭证",
};

export interface CredVersion {
  ver: number;
  fileName: string;
  /** 仅元数据：KB */
  sizeKb: number;
  /** 仅元数据：扩展名大写，如 PDF / XLSX */
  fileType: string;
  uploadedAt: string; // YYYY-MM-DD HH:mm
  uploader: string;
  note: string;
}

export interface Credential {
  id: string;
  name: string;
  typeId: keyof typeof credTypeNames;
  level: CredLevel;
  campusId: CredCampus;
  issuer: string;
  owner: string;
  issueDate?: string;
  /** 缺省 = 长期有效（或未取得） */
  validUntil?: string;
  cycleNote: string;
  relatedAnomalyId?: string;
  /** 置顶预警（能源审计 AN-010） */
  pinned?: boolean;
  riskNote?: string;
  versions: CredVersion[];
  /** 当前生效版本号；0 = 无版本（未上传） */
  currentVer: number;
}

/** 距到期天数（负数=已过期）；无有效期返回 null */
export function daysToExpiry(c: Credential, asOfDate: string): number | null {
  if (!c.validUntil) return null;
  return dayjs(c.validUntil).diff(dayjs(asOfDate), "day");
}

/** 指定日期视角下的凭证状态（用于当前看板与历史评分趋势，口径一致） */
export function credStatusAsOf(c: Credential, asOfDate: string): CredStatus {
  const uploaded = c.versions.some((v) => v.uploadedAt.slice(0, 10) <= asOfDate);
  if (!uploaded) return "missing";
  if (c.validUntil) {
    const days = dayjs(c.validUntil).diff(dayjs(asOfDate), "day");
    if (days < 0) return "expired";
    if (days <= WARN_DAYS) return "expiring";
  }
  return "valid";
}

/** 合规评分（演示口径）：有效×1 + 即将到期×0.6，除以凭证总数 ×100 */
export function complianceScoreAsOf(list: Credential[], asOfDate: string): number {
  if (!list.length) return 0;
  let pts = 0;
  for (const c of list) {
    const s = credStatusAsOf(c, asOfDate);
    if (s === "valid") pts += 1;
    else if (s === "expiring") pts += 0.6;
  }
  return Math.round((pts / list.length) * 100);
}

const V = (ver: number, fileName: string, sizeKb: number, fileType: string, uploadedAt: string, uploader: string, note: string): CredVersion => ({
  ver, fileName, sizeKb, fileType, uploadedAt, uploader, note,
});

/** 凭证种子：覆盖 10 类材料，L1/L2/L3 三层，四类状态均有样本 */
export const credentialSeeds: Credential[] = [
  {
    id: "CV-L1-01", name: "环评批复（主院区改扩建工程）", typeId: "eia", level: "L1", campusId: "main",
    issuer: "市生态环境局", owner: "李科长（总务处）", issueDate: "2018-05-02",
    cycleNote: "长期有效；重大改扩建需重新报批",
    versions: [V(1, "环评批复文-主院区改扩建-2018.pdf", 4820, "PDF", "2024-03-12 10:24", "王档案员", "历史档案扫描入库")],
    currentVer: 1,
  },
  {
    id: "CV-L1-02", name: "环评批复（东院区二期工程）", typeId: "eia", level: "L1", campusId: "east",
    issuer: "市生态环境局", owner: "李科长（总务处）",
    cycleNote: "开工前须取得批复",
    riskNote: "东院区二期开工前必须取得，预计 2026-Q4 报批",
    versions: [], currentVer: 0,
  },
  {
    id: "CV-L1-03", name: "排污许可证", typeId: "discharge", level: "L1", campusId: "main",
    issuer: "市生态环境局", owner: "赵工（给排水组）", issueDate: "2023-04-01", validUntil: "2028-03-31",
    cycleNote: "五年一换发，重大变更需重新载明",
    versions: [
      V(1, "排污许可证-正本扫描.pdf", 2110, "PDF", "2024-03-12 10:31", "王档案员", "换发后正本扫描"),
      V(2, "排污许可证-变更载明-2025.pdf", 2350, "PDF", "2025-06-15 15:02", "赵工（给排水组）", "新增污水处理设施变更载明"),
    ],
    currentVer: 2,
  },
  {
    id: "CV-L1-04", name: "辐射安全许可证", typeId: "radiation", level: "L1", campusId: "main",
    issuer: "省生态环境厅", owner: "周工（医工科）", issueDate: "2021-07-01", validUntil: "2026-06-30",
    cycleNote: "五年有效期，届满前 30 日申请延续",
    riskNote: "延续申请已于 2026-06 提交省厅，处于受理公示期",
    versions: [V(1, "辐射安全许可证-2021.pdf", 1980, "PDF", "2024-03-12 10:36", "王档案员", "历史档案扫描入库")],
    currentVer: 1,
  },
  {
    id: "CV-L1-05", name: "医用气体系统安全检验报告（2026 年度）", typeId: "medgasSafety", level: "L1", campusId: "main",
    issuer: "市特种设备检验研究院", owner: "孙工（医气组）", issueDate: "2026-01-20", validUntil: "2027-01-19",
    cycleNote: "年度检验",
    versions: [V(1, "医用气体系统安全检验报告-2026.pdf", 6340, "PDF", "2026-01-22 09:12", "孙工（医气组）", "2026 年度检验合格")],
    currentVer: 1,
  },
  {
    id: "CV-L2-01", name: "能源审计报告（2023—2026 周期）", typeId: "energyAudit", level: "L2", campusId: "main",
    issuer: "省节能监察中心备案审计机构", owner: "李科长（总务处）", issueDate: "2023-09-15", validUntil: "2026-09-15",
    cycleNote: "三年一轮，须在到期前完成新一轮审计",
    relatedAnomalyId: "AN-010", pinned: true,
    riskNote: "年度履约里程碑 M3 依赖该凭证，需 9 月前完成审计机构比选与现场审计",
    versions: [
      V(1, "能源审计报告-2023-初稿.pdf", 8420, "PDF", "2023-09-20 14:05", "审计机构项目组", "初稿提交"),
      V(2, "能源审计报告-2023-终稿.pdf", 8960, "PDF", "2023-10-11 11:40", "李科长（总务处）", "采纳 6 条整改意见后的终稿"),
    ],
    currentVer: 2,
  },
  {
    id: "CV-L2-02", name: "用水审计（水平衡测试）报告", typeId: "waterAudit", level: "L2", campusId: "main",
    issuer: "市节水事务管理中心", owner: "赵工（给排水组）", issueDate: "2023-10-10", validUntil: "2026-10-12",
    cycleNote: "不超过三年开展一次水平衡测试",
    riskNote: "水平衡测试需委托第三方机构，建议 9 月启动比选",
    versions: [V(1, "水平衡测试报告-2023.pdf", 5210, "PDF", "2023-11-05 16:20", "赵工（给排水组）", "测试合格备案稿")],
    currentVer: 1,
  },
  {
    id: "CV-L2-03", name: "计量器具检定证书（主院区台账）", typeId: "metering", level: "L2", campusId: "main",
    issuer: "市计量检定测试所", owner: "吴工（计量组）", issueDate: "2026-05-06", validUntil: "2027-05-05",
    cycleNote: "关口表年检、分项表按周期轮检",
    versions: [
      V(1, "计量检定证书汇编-2024.pdf", 3120, "PDF", "2024-05-10 10:00", "吴工（计量组）", "2024 年度轮检"),
      V(2, "计量检定证书汇编-2025.pdf", 3355, "PDF", "2025-05-12 10:30", "吴工（计量组）", "2025 年度轮检"),
      V(3, "计量检定证书汇编-2026.pdf", 3410, "PDF", "2026-05-08 09:47", "吴工（计量组）", "2026 年度轮检，含新增 12 块分项表"),
    ],
    currentVer: 3,
  },
  {
    id: "CV-L2-04", name: "绿色采购证明材料（2026 上半年汇编）", typeId: "greenProcure", level: "L2", campusId: "main",
    issuer: "采购中心", owner: "张主任（采购中心）", issueDate: "2026-06-30", validUntil: "2026-12-31",
    cycleNote: "半年度汇编归档",
    versions: [V(1, "绿色采购目录符合性汇编-2026H1.xlsx", 890, "XLSX", "2026-06-30 17:10", "采购中心", "含节能产品政府采购清单比对")],
    currentVer: 1,
  },
  {
    id: "CV-L2-05", name: "计量器具检定证书（东院区）", typeId: "metering", level: "L2", campusId: "east",
    issuer: "市计量检定测试所", owner: "吴工（计量组）",
    cycleNote: "工程交付后首检",
    riskNote: "东院区计量器具随工程安装后统一送检",
    versions: [], currentVer: 0,
  },
  {
    id: "CV-L3-01", name: "温室气体核查报告（2025 年度）", typeId: "verification", level: "L3", campusId: "all",
    issuer: "第三方核查机构（演示）", owner: "能源管理员（核算组）", issueDate: "2026-03-15", validUntil: "2027-03-31",
    cycleNote: "年度核查；次年核查报告出具前有效（演示口径）",
    versions: [
      V(1, "2025年度温室气体核查报告-送审稿.pdf", 7420, "PDF", "2026-03-18 14:30", "核查机构项目组", "送审稿"),
      V(2, "2025年度温室气体核查报告-终稿.pdf", 7660, "PDF", "2026-04-02 10:05", "能源管理员（核算组）", "不符合项关闭后终稿"),
    ],
    currentVer: 2,
  },
  {
    id: "CV-L3-02", name: "绿电交易结算凭证（2026 上半年）", typeId: "greenPower", level: "L3", campusId: "all",
    issuer: "电力交易中心", owner: "能源管理员（核算组）", issueDate: "2026-07-05", validUntil: "2026-12-31",
    cycleNote: "半年度结算归档，计入当年核算",
    versions: [V(1, "绿电交易结算凭证-2026H1.pdf", 1240, "PDF", "2026-07-08 11:26", "能源管理员（核算组）", "上半年绿电交易结算凭证")],
    currentVer: 1,
  },
  {
    id: "CV-L3-03", name: "绿证（GEC）核销记录（2026 下半年）", typeId: "greenPower", level: "L3", campusId: "all",
    issuer: "绿证核发机构", owner: "能源管理员（核算组）", validUntil: "2027-01-31",
    cycleNote: "半年度核销后归档",
    riskNote: "下半年核销记录尚未产生，2027-01-31 前归档",
    versions: [], currentVer: 0,
  },
];

export interface ComplianceLog {
  at: string;
  action: string;
  detail: string;
}

interface ComplianceStore {
  schemaVersion: number;
  credentials: Credential[];
  logs: ComplianceLog[];
  /** 上传演示：仅追加元数据版本并指向新版本 */
  addVersion: (credId: string, meta: { fileName: string; sizeKb: number; fileType: string; note: string }, actor?: string) => void;
  /** 回退：当前版本指针指向历史版本（版本记录保留） */
  rollbackTo: (credId: string, ver: number, actor?: string) => void;
  addLog: (action: string, detail: string) => void;
}

const now = () => dayjs().format("YYYY-MM-DD HH:mm");

export const useComplianceStore = create<ComplianceStore>()(
  persist(
    (set) => ({
      schemaVersion: SCHEMA_VERSION,
      credentials: credentialSeeds,
      logs: [],

      addVersion: (credId, meta, actor = "当前用户") =>
        set((s) => {
          const cred = s.credentials.find((c) => c.id === credId);
          if (!cred) return s;
          const ver = cred.versions.reduce((m, v) => Math.max(m, v.ver), 0) + 1;
          const version: CredVersion = { ver, uploadedAt: now(), uploader: actor, ...meta };
          return {
            credentials: s.credentials.map((c) => (c.id === credId ? { ...c, versions: [...c.versions, version], currentVer: ver } : c)),
            logs: [{ at: now(), action: "上传新版本", detail: `${cred.name} → v${ver}（${meta.fileName}，仅保存元数据）` }, ...s.logs].slice(0, 60),
          };
        }),

      rollbackTo: (credId, ver, actor = "当前用户") =>
        set((s) => {
          const cred = s.credentials.find((c) => c.id === credId);
          if (!cred || !cred.versions.some((v) => v.ver === ver)) return s;
          return {
            credentials: s.credentials.map((c) => (c.id === credId ? { ...c, currentVer: ver } : c)),
            logs: [{ at: now(), action: "版本回退", detail: `${cred.name}：v${cred.currentVer} → v${ver}（${actor}）` }, ...s.logs].slice(0, 60),
          };
        }),

      addLog: (action, detail) =>
        set((s) => ({ logs: [{ at: now(), action, detail }, ...s.logs].slice(0, 60) })),
    }),
    {
      name: nsKey("compliance"),
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => safeStorage()),
      migrate: (persisted, version) => {
        if (version !== SCHEMA_VERSION) return undefined as never;
        return persisted as never;
      },
    },
  ),
);

/** localStorage 不可用时回退内存（与 demo store 同策略，保证不白屏） */
function safeStorage(): Storage {
  try {
    const probe = nsKey("compliance-probe");
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
