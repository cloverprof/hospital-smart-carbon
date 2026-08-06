import type { ModuleCategory, ModuleDef, RoleId } from "../types/core";

export const roleMeta: Record<RoleId, { name: string; desc: string; defaultRoute: string }> = {
  leader: { name: "院领导", desc: "全院碳排态势、目标风险与投资决策", defaultRoute: "/cockpit/leader" },
  logistics: { name: "后勤负责人", desc: "运行偏差、告警、工单与今日任务", defaultRoute: "/cockpit/operations" },
  department: { name: "科室负责人", desc: "本科室单位业务量能耗与整改确认", defaultRoute: "/app/department/workbench" },
  energyAdmin: { name: "能源管理员", desc: "表计、数据质量、核算与节能核验", defaultRoute: "/app/portal" },
};

export const moduleCategories: ModuleCategory[] = [
  { id: "energy", name: "能源管理", icon: "Zap" },
  { id: "carbon", name: "碳管理", icon: "Leaf" },
  { id: "ai", name: "AI 智能分析", icon: "BrainCircuit" },
  { id: "spatial", name: "空间可视化", icon: "Map" },
  { id: "ops", name: "后勤运维", icon: "Wrench" },
  { id: "cockpit", name: "驾驶舱与门户", icon: "Gauge" },
];

// 18 个二级模块注册表。roles = 关闭「全部权限」时可见的角色。
export const modules: ModuleDef[] = [
  { id: "energy-monitoring", categoryId: "energy", name: "能源监测中心", route: "/app/energy/monitoring", icon: "Activity", summary: "五维能源 KPI、实时负荷、设备状态与七类告警", roles: ["leader", "logistics", "energyAdmin"] },
  { id: "energy-diagnosis", categoryId: "energy", name: "能源诊断中心", route: "/app/energy/diagnosis", icon: "Stethoscope", summary: "能效评分、三线对标、能源桑基与 AI 根因", roles: ["logistics", "energyAdmin"] },
  { id: "medical-gas", categoryId: "energy", name: "医用气体管理", route: "/app/energy/medical-gas", icon: "Wind", summary: "氧气/笑气/压缩空气/负压全链路与泄漏检测", roles: ["logistics", "energyAdmin"] },
  { id: "key-areas", categoryId: "energy", name: "重点区域能耗管理", route: "/app/energy/key-areas", icon: "HeartPulse", summary: "手术室、ICU 与大型医疗设备专项能耗", roles: ["logistics", "department", "energyAdmin"] },
  { id: "energy-calendar", categoryId: "energy", name: "用能日历与排班联动", route: "/app/energy/calendar", icon: "CalendarDays", summary: "逐日热力日历与门诊/手术/床位业务联动", roles: ["logistics", "department", "energyAdmin"] },
  { id: "department-workbench", categoryId: "energy", name: "科室负责人工作台", route: "/app/department/workbench", icon: "HeartPulse", summary: "单位业务量能耗、科室对标、异常确认与整改任务", roles: ["department", "logistics", "energyAdmin"] },
  { id: "carbon-accounting", categoryId: "carbon", name: "碳核算工作台", route: "/app/carbon/accounting", icon: "Calculator", summary: "边界-活动数据-校验-核算-归档五步流程", roles: ["energyAdmin"] },
  { id: "green-rating", categoryId: "carbon", name: "绿色低碳医院评价", route: "/app/carbon/green-rating", icon: "Award", summary: "L1/L2/L3 三层评价、雷达图与三线对标", roles: ["leader", "energyAdmin"] },
  { id: "carbon-assets", categoryId: "carbon", name: "碳资产管理", route: "/app/carbon/assets", icon: "WalletCards", summary: "内部碳预算、情景模拟、履约任务与策略对比", roles: ["leader", "energyAdmin"] },
  { id: "compliance-vault", categoryId: "carbon", name: "合规凭证看板", route: "/app/carbon/compliance", icon: "FileCheck2", summary: "分级凭证清单、版本管理与到期预警", roles: ["energyAdmin"] },
  { id: "ai-center", categoryId: "ai", name: "AI 智能分析中心", route: "/app/ai", icon: "BrainCircuit", summary: "碳排预测、异常时间线、减排路径与中文问答", roles: ["leader", "logistics", "energyAdmin"] },
  { id: "spatial", categoryId: "spatial", name: "院区碳空间视图", route: "/app/spatial", icon: "Map", summary: "夜景建筑群固定视角与楼宇碳排名牌", roles: ["leader", "logistics", "department", "energyAdmin"] },
  { id: "asset-workorders", categoryId: "ops", name: "设备台账与工单联动", route: "/app/operations/workorders", icon: "ClipboardList", summary: "设备台账、能耗异常自动工单与状态机闭环", roles: ["logistics", "energyAdmin"] },
  { id: "inspection", categoryId: "ops", name: "巡检管理与能效联动", route: "/app/operations/inspection", icon: "Route", summary: "PC 巡检计划、问题-能耗关联与巡检报告", roles: ["logistics"] },
  { id: "project-library", categoryId: "ops", name: "项目库管理", route: "/app/operations/projects", icon: "FolderKanban", summary: "节能项目全周期、M&V 核验与 EMC 合同", roles: ["leader", "logistics", "energyAdmin"] },
  { id: "cockpit-leader", categoryId: "cockpit", name: "领导驾驶舱", route: "/cockpit/leader", icon: "Crown", summary: "战略决策支持：总量、偏离、风险与投资", roles: ["leader"] },
  { id: "cockpit-operations", categoryId: "cockpit", name: "后勤驾驶舱", route: "/cockpit/operations", icon: "Gauge", summary: "能耗-碳排-设备一体化运营实时监测", roles: ["logistics"] },
  { id: "portal", categoryId: "cockpit", name: "功能门户", route: "/app/portal", icon: "LayoutGrid", summary: "六大板块 18 模块工作入口", roles: ["leader", "logistics", "department", "energyAdmin"] },
];

export const moduleById = Object.fromEntries(modules.map((m) => [m.id, m]));

export function visibleModules(role: RoleId, allPermissions: boolean): ModuleDef[] {
  if (allPermissions) return modules;
  return modules.filter((m) => m.roles.includes(role));
}

/** 各角色可操作性（写操作）矩阵：模块 id -> 允许写操作的角色 */
export const writableRoles: Record<string, RoleId[]> = {
  "energy-monitoring": ["logistics", "energyAdmin"],
  "energy-diagnosis": ["energyAdmin"],
  "medical-gas": ["logistics", "energyAdmin"],
  "key-areas": ["logistics", "energyAdmin"],
  "energy-calendar": ["logistics", "energyAdmin"],
  "department-workbench": ["department"],
  "carbon-accounting": ["energyAdmin"],
  "green-rating": ["energyAdmin"],
  "carbon-assets": ["energyAdmin"],
  "compliance-vault": ["energyAdmin"],
  "ai-center": ["leader", "logistics", "energyAdmin"],
  spatial: [],
  "asset-workorders": ["logistics"],
  inspection: ["logistics"],
  "project-library": ["leader", "logistics", "energyAdmin"],
};

export function canWrite(moduleId: string, role: RoleId, allPermissions: boolean): boolean {
  if (allPermissions) return true;
  return (writableRoles[moduleId] ?? []).includes(role);
}
