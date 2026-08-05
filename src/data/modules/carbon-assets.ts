// 碳资产管理模块（carbon-assets）专用静态数据：履约任务种子、转派候选人、演示碳价、碳金融工具说明。
// 仅本模块使用；行情数据为确定性伪随机（rng.ts），非真实市场数据。
import dayjs from "dayjs";
import { demoAsOfDate } from "../config";
import { signedNoise } from "../rng";

export type AssetTaskStatus = "待开始" | "进行中" | "已完成";

export interface AssetComplianceTask {
  id: string;
  title: string;
  /** 年度履约里程碑（M1-M6） */
  milestone: string;
  dueDate: string;
  owner: string;
  dept: string;
  /** 完成度 0-100 */
  progress: number;
  status: AssetTaskStatus;
  priority: "高" | "中" | "低";
  note: string;
}

/** 年度履约任务种子。CT-04 关联异常链 AN-010（能源审计 9-15 截止）。 */
export const assetTaskSeeds: AssetComplianceTask[] = [
  { id: "CT-01", title: "一季度内部碳盘查归档", milestone: "M1", dueDate: "2026-03-31", owner: "李工", dept: "碳核算组", progress: 100, status: "已完成", priority: "中", note: "2026Q1 盘查已归档，凭证 MRV-2026-0001" },
  { id: "CT-02", title: "月度活动数据上报（8 月）", milestone: "M2", dueDate: "2026-08-08", owner: "李工", dept: "碳核算组", progress: 88, status: "进行中", priority: "高", note: "待复核麻醉气体台账" },
  { id: "CT-03", title: "年度核查准备（内部预核查）", milestone: "M3", dueDate: "2026-08-18", owner: "王主任", dept: "审计合规部", progress: 72, status: "进行中", priority: "高", note: "范围三凭证仍需补齐" },
  { id: "CT-04", title: "能源审计报告更新（关联 AN-010）", milestone: "M3", dueDate: "2026-09-15", owner: "李科长", dept: "总务处", progress: 35, status: "进行中", priority: "高", note: "三年周期审计到期，里程碑 M3 依赖该凭证；责任人已收到 42 天倒计时提醒" },
  { id: "CT-05", title: "碳资产盘点与绿证余额核对", milestone: "M4", dueDate: "2026-09-30", owner: "周敏", dept: "财务资产部", progress: 42, status: "进行中", priority: "中", note: "核对绿证与 CCER 净持仓" },
  { id: "CT-06", title: "减排项目验收（冷站群控 M&V）", milestone: "M4", dueDate: "2026-07-28", owner: "赵工", dept: "设备动力科", progress: 63, status: "进行中", priority: "高", note: "PRJ-2025-08 M&V 报告待完成" },
  { id: "CT-07", title: "绿证采购计划审批", milestone: "M5", dueDate: "2026-10-10", owner: "陈杰", dept: "采购中心", progress: 18, status: "待开始", priority: "中", note: "等待采购预算审批" },
  { id: "CT-08", title: "年度碳预算执行报告", milestone: "M6", dueDate: "2026-12-20", owner: "核算组", dept: "碳核算组", progress: 10, status: "待开始", priority: "低", note: "汇总全年预算执行与情景复盘" },
];

/** 转派候选人（责任人 + 部门） */
export const taskOwnerOptions: { owner: string; dept: string }[] = [
  { owner: "李工", dept: "碳核算组" },
  { owner: "王主任", dept: "审计合规部" },
  { owner: "李科长", dept: "总务处" },
  { owner: "周敏", dept: "财务资产部" },
  { owner: "赵工", dept: "设备动力科" },
  { owner: "陈杰", dept: "采购中心" },
  { owner: "核算组", dept: "碳核算组" },
  { owner: "后勤值班长", dept: "后勤保障部" },
];

/** 演示碳价月度序列（元/tCO2e）：近 12 个月，确定性伪随机，非真实行情 */
export function carbonPriceSeries(): { t: string; v: number }[] {
  const out: { t: string; v: number }[] = [];
  let m = dayjs(demoAsOfDate).startOf("month").subtract(11, "month");
  for (let i = 0; i < 12; i++) {
    const key = m.format("YYYY-MM");
    const v = 62 + i * 2.1 + signedNoise(`cprice:${key}`) * 4.5;
    out.push({ t: key, v: Math.round(v * 10) / 10 });
    m = m.add(1, "month");
  }
  return out;
}

export interface FinanceTool {
  id: string;
  name: string;
  tag: string;
  brief: string;
  detail: string;
}

/** 碳金融工具说明（演示口径，非法律/投资建议） */
export const financeTools: FinanceTool[] = [
  {
    id: "ccer", name: "CCER（国家核证自愿减排量）", tag: "抵销工具",
    brief: "用核证减排量抵销部分排放",
    detail: "重点排放单位可用 CCER 抵销不超过应清缴配额 5% 的排放量（全国碳市场口径）。医院当前未纳入强制履约（待核验），本页 CCER 策略仅为内部情景演练；实际交易须经审批并在合规交易机构完成。",
  },
  {
    id: "cea", name: "碳配额（CEA）", tag: "履约资产",
    brief: "全国碳市场的强制履约配额",
    detail: "CEA 仅对纳入全国碳市场的重点排放单位分配与交易。医院不是配额管控单位（待核验），无法直接持有 CEA；本页购买配额策略只用于估算若未来纳入履约时的资金敞口。",
  },
  {
    id: "gec", name: "绿证（GEC）", tag: "环境权益",
    brief: "可再生能源电力消费凭证",
    detail: "购买绿证可主张绿色电力消费，配合市场法核算降低范围二排放（须避免与绿电直购重复主张）。绿证价格波动较大，采购前需财务与合规双审批。",
  },
  {
    id: "pledge", name: "碳资产质押融资", tag: "融资工具",
    brief: "以碳资产为质押物获取贷款",
    detail: "部分银行支持以 CCER、绿证等碳资产质押融资，用于节能改造项目垫资。公立医院适用性受财务制度约束，演示环境仅作知识性说明，不构成任何融资建议。",
  },
  {
    id: "emc", name: "合同能源管理（EMC）", tag: "项目模式",
    brief: "节能服务公司投资、按分成回收",
    detail: "由节能服务公司出资改造、按节能收益分成（如院内 PRJ-2025-08 冷站群控项目，分成 65%、合同期 6 年）。适合投资额大、回收期长的改造，医院无需一次性出资。",
  },
];
