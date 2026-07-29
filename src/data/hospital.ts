export type NavItem = { id: string; label: string; icon: string };

export const navItems: NavItem[] = [
  { id: "leader", label: "领导驾驶舱", icon: "LayoutDashboard" },
  { id: "operations", label: "后勤驾驶舱", icon: "Activity" },
  { id: "energy", label: "能源监测", icon: "Gauge" },
  { id: "department", label: "科室能效", icon: "Hospital" },
  { id: "systems", label: "重点系统", icon: "Cpu" },
  { id: "equipment", label: "医疗设备", icon: "ScanLine" },
  { id: "carbon", label: "碳核算", icon: "Leaf" },
  { id: "alarms", label: "告警中心", icon: "BellRing" },
  { id: "ai", label: "AI 节能诊断", icon: "Sparkles" },
  { id: "projects", label: "节能项目", icon: "ClipboardCheck" },
  { id: "quality", label: "数据质量", icon: "DatabaseZap" },
];

export const kpis = [
  { label: "综合能耗", value: "12,842", unit: "tce", delta: "-4.8%", tone: "cyan", note: "年度预算 64.2%" },
  { label: "能源费用", value: "8,736", unit: "万元", delta: "-3.1%", tone: "blue", note: "较预算节省 286 万" },
  { label: "碳排放", value: "31,755", unit: "tCO₂e", delta: "-5.6%", tone: "green", note: "年度配额 68.7%" },
  { label: "单位床日能耗", value: "18.6", unit: "kgce/床日", delta: "-2.4%", tone: "amber", note: "优于同级医院 7.2%" },
  { label: "数据完整率", value: "98.7", unit: "%", delta: "+0.9%", tone: "cyan", note: "1,286 个有效测点" },
];

export const trend = [
  { m: "1月", energy: 7.8, service: 8.1, target: 7.6 },
  { m: "2月", energy: 7.4, service: 7.2, target: 7.3 },
  { m: "3月", energy: 8.2, service: 8.8, target: 7.9 },
  { m: "4月", energy: 8.5, service: 9.4, target: 8.1 },
  { m: "5月", energy: 8.8, service: 9.8, target: 8.3 },
  { m: "6月", energy: 9.1, service: 10.4, target: 8.6 },
  { m: "7月", energy: 9.4, service: 10.9, target: 8.8 },
  { m: "8月", energy: 9.3, service: 11.2, target: 9.0 },
  { m: "9月", energy: 9.7, service: 11.8, target: 9.2 },
  { m: "10月", energy: 9.9, service: 12.3, target: 9.4 },
  { m: "11月", energy: 10.1, service: 12.7, target: 9.6 },
  { m: "12月", energy: 10.4, service: 13.2, target: 9.8 },
];

export const buildings = [
  { name: "门诊医技楼", value: 2840, rate: 78, status: "关注", x: 48, y: 55, color: "#f2b640" },
  { name: "住院一部", value: 2360, rate: 64, status: "正常", x: 34, y: 16, color: "#20d7c5" },
  { name: "住院二部", value: 2210, rate: 58, status: "正常", x: 53, y: 20, color: "#20d7c5" },
  { name: "手术中心", value: 1960, rate: 86, status: "预警", x: 75, y: 52, color: "#ff6b52" },
  { name: "科研教学楼", value: 1420, rate: 45, status: "正常", x: 23, y: 34, color: "#20d7c5" },
  { name: "急诊中心", value: 1685, rate: 71, status: "关注", x: 62, y: 57, color: "#f2b640" },
  { name: "后勤动力中心", value: 986, rate: 42, status: "正常", x: 83, y: 39, color: "#20d7c5" },
];

export const systemRows = [
  { name: "中央冷站", metric: "COP", value: "4.72", state: "高效", load: 82 },
  { name: "洁净空调", metric: "运行机组", value: "18 / 21", state: "关注", load: 74 },
  { name: "锅炉蒸汽", metric: "效率", value: "92.4%", state: "正常", load: 68 },
  { name: "医用氧气", metric: "管网压力", value: "0.48 MPa", state: "正常", load: 56 },
];

export const alarms = [
  { level: "高", title: "手术中心夜间基荷持续偏高", time: "12 分钟前", owner: "暖通组" },
  { level: "中", title: "医技楼冷冻水供回温差偏低", time: "26 分钟前", owner: "能源班" },
  { level: "中", title: "住院二部 5F 用水突增", time: "44 分钟前", owner: "维修组" },
  { level: "低", title: "2 号锅炉燃烧效率轻微下降", time: "1 小时前", owner: "动力组" },
];

export const insights = [
  { title: "医技楼夜间待机优化", saving: "预计节省 38.6 万元/年", confidence: "92%", tag: "高价值" },
  { title: "冷站 3# 泵变频策略调整", saving: "预计节省 21.4 万元/年", confidence: "87%", tag: "易实施" },
  { title: "住院一部空调启停校准", saving: "预计节省 12.8 万元/年", confidence: "84%", tag: "低风险" },
];
