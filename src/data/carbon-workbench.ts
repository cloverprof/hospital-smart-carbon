export const carbonSteps = [
  { id: 1, name: "核算边界", desc: "院区、楼宇与组织边界", status: "done" },
  { id: 2, name: "活动数据", desc: "能源与排放源归集", status: "done" },
  { id: 3, name: "质量校验", desc: "完整性与异常复核", status: "active" },
  { id: 4, name: "排放核算", desc: "因子匹配与结果试算", status: "waiting" },
  { id: 5, name: "报告归档", desc: "审核、锁定与报告", status: "waiting" },
];

export const sourceProgress = [
  { name: "边界与业务量", detail: "院区、面积、床日、门急诊人次", total: 24, ready: 24, color: "#42d9ad" },
  { name: "能源活动数据", detail: "电、气、蒸汽、柴油、光伏", total: 86, ready: 82, color: "#34d6e8" },
  { name: "医疗特征排放", detail: "麻醉气体、制冷剂、医废、污水", total: 31, ready: 23, color: "#f2b640" },
  { name: "因子与凭证", detail: "排放因子、账单、台账、核验证据", total: 38, ready: 34, color: "#75a8ff" },
];

export const carbonBatches = [
  { name: "2026 年度温室气体盘查", standard: "ISO 14064-1", period: "2026年度", emission: "31,755.2", complete: 88.5, quality: 89, status: "质量复核" },
  { name: "2026 年 6 月院级核算", standard: "GHG Protocol", period: "2026-06", emission: "2,850.6", complete: 96.2, quality: 94, status: "已审核" },
  { name: "2026 年 5 月院级核算", standard: "GHG Protocol", period: "2026-05", emission: "2,681.4", complete: 100, quality: 96, status: "已锁定" },
];

export const carbonRisks = [
  { level: "高", source: "七氟烷使用台账", owner: "手术麻醉科", issue: "6 月 3 个手术间数据缺失", action: "补录" },
  { level: "中", source: "医技楼制冷剂", owner: "暖通组", issue: "补充量与维修单据不一致", action: "复核" },
  { level: "中", source: "医疗废物处置", owner: "院感办", issue: "处置联单晚于核算周期", action: "催办" },
  { level: "低", source: "柴油发电机", owner: "动力组", issue: "月末库存盘点待确认", action: "确认" },
];

export const emissionSources = [
  { name: "外购电力", value: 21_894, share: 69, scope: "Scope 2", color: "#34d6e8" },
  { name: "天然气与蒸汽", value: 5_304, share: 17, scope: "Scope 1", color: "#f2b640" },
  { name: "制冷剂与麻醉气体", value: 2_196, share: 7, scope: "Scope 1", color: "#ff7b64" },
  { name: "医废、污水及其他", value: 2_361, share: 7, scope: "Scope 3", color: "#7ca8ff" },
];
