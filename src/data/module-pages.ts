export type ModulePageConfig = {
  title: string;
  subtitle: string;
  scope: string;
  tabs: string[];
  kpis: { label: string; value: string; unit: string; change: string; note: string }[];
  primaryTitle: string;
  series: { label: string; value: number; color: string }[];
  rankingTitle: string;
  ranking: { name: string; value: string; percent: number; state: string }[];
  tableTitle: string;
  columns: string[];
  rows: string[][];
  actionTitle: string;
  actions: { title: string; meta: string; status: string }[];
};

export const modulePages: Record<string, ModulePageConfig> = {
  operations: {
    title: "后勤运行驾驶舱", subtitle: "保障优先 · 能效协同 · 异常闭环", scope: "全院实时",
    tabs: ["运行总览", "负荷态势", "保障风险"],
    kpis: [
      { label:"实时总负荷",value:"4.82",unit:"MW",change:"+2.6%",note:"需量控制线 5.60 MW" },
      { label:"今日综合能耗",value:"42.6",unit:"tce",change:"-3.8%",note:"较昨日同期" },
      { label:"保障系统在线率",value:"99.2",unit:"%",change:"+0.3%",note:"关键设备 126 台" },
      { label:"待处置告警",value:"7",unit:"条",change:"-4",note:"高风险 1 条" },
    ],
    primaryTitle:"24 小时能源负荷与医疗活动", series:[
      {label:"00:00",value:34,color:"#34d6e8"},{label:"04:00",value:29,color:"#34d6e8"},{label:"08:00",value:68,color:"#34d6e8"},{label:"12:00",value:82,color:"#34d6e8"},{label:"16:00",value:93,color:"#34d6e8"},{label:"20:00",value:65,color:"#34d6e8"},{label:"24:00",value:39,color:"#34d6e8"}],
    rankingTitle:"保障系统负荷",ranking:[{name:"中央冷站",value:"1.86 MW",percent:86,state:"高效"},{name:"洁净空调",value:"1.22 MW",percent:72,state:"关注"},{name:"医用气体",value:"0.48 MW",percent:43,state:"正常"},{name:"锅炉蒸汽",value:"0.39 MW",percent:35,state:"正常"}],
    tableTitle:"实时运行事件",columns:["时间","系统","事件","等级","责任组"],rows:[["14:26","手术中心","洁净空调压差波动","关注","暖通组"],["14:08","医技楼","冷冻水温差偏低","预警","能源班"],["13:42","住院二部","生活水瞬时流量突增","关注","维修组"],["12:55","动力站","2# 锅炉效率下降","提示","动力组"]],
    actionTitle:"今日保障任务",actions:[{title:"手术中心压差复核",meta:"暖通组 · 15:00 前",status:"处理中"},{title:"医技楼冷站策略校准",meta:"能源班 · 17:00 前",status:"待执行"},{title:"柴油发电机周检",meta:"动力组 · 今日",status:"已计划"}],
  },
  energy: {
    title:"能源监测",subtitle:"院区—楼宇—系统—设备—表计五级追踪",scope:"主院区",
    tabs:["能源总览","楼宇分项","表计台账"],
    kpis:[{label:"今日用电",value:"86,420",unit:"kWh",change:"-4.2%",note:"峰值 4.82 MW"},{label:"今日用水",value:"1,286",unit:"m³",change:"+1.8%",note:"非诊疗时段占比 21%"},{label:"今日天然气",value:"8,460",unit:"m³",change:"-2.6%",note:"锅炉效率 92.4%"},{label:"绿电与光伏",value:"12,680",unit:"kWh",change:"+8.4%",note:"清洁能源占比 14.7%"}],
    primaryTitle:"分时能源趋势",series:[{label:"0时",value:28,color:"#34d6e8"},{label:"4时",value:23,color:"#34d6e8"},{label:"8时",value:55,color:"#34d6e8"},{label:"12时",value:78,color:"#34d6e8"},{label:"16时",value:87,color:"#34d6e8"},{label:"20时",value:63,color:"#34d6e8"},{label:"24时",value:32,color:"#34d6e8"}],
    rankingTitle:"楼宇能耗排名",ranking:[{name:"门诊医技楼",value:"28,450 kWh",percent:91,state:"偏高"},{name:"住院一部",value:"21,680 kWh",percent:76,state:"正常"},{name:"手术中心",value:"18,920 kWh",percent:68,state:"关注"},{name:"科研教学楼",value:"12,360 kWh",percent:48,state:"正常"}],
    tableTitle:"表计异常",columns:["测点","位置","当前值","异常类型","状态"],rows:[["EM-MT-031","医技楼冷站","486.2 kW","偏离基线","待复核"],["WM-IP-205","住院二部 5F","18.6 m³/h","用水突增","处理中"],["GM-PW-012","动力站 2# 锅炉","692 m³/h","效率下降","已派单"],["EM-OR-008","手术中心","126.8 kW","夜间基荷","待确认"]],
    actionTitle:"数据接入状态",actions:[{title:"电力表计",meta:"684 / 692 在线",status:"98.8%"},{title:"水务表计",meta:"218 / 224 在线",status:"97.3%"},{title:"气热表计",meta:"76 / 78 在线",status:"97.4%"}],
  },
  department: {
    title:"科室能效",subtitle:"将能源消耗与医疗服务量放在同一口径下评价",scope:"临床与医技科室",
    tabs:["业务量耦合","科室对标","改善机会"],
    kpis:[{label:"单位门急诊能耗",value:"2.84",unit:"kWh/人次",change:"-3.1%",note:"门急诊 12,846 人次"},{label:"单位床日能耗",value:"18.6",unit:"kgce/床日",change:"-2.4%",note:"实际占用床日 3,286"},{label:"单位手术能耗",value:"86.4",unit:"kWh/台次",change:"+4.8%",note:"三级及以上手术占比 42%"},{label:"能耗业务弹性",value:"0.82",unit:"",change:"改善",note:"业务增速高于能耗增速"}],
    primaryTitle:"医疗服务量与能耗耦合",series:[{label:"1月",value:52,color:"#42d9ad"},{label:"2月",value:48,color:"#42d9ad"},{label:"3月",value:61,color:"#42d9ad"},{label:"4月",value:68,color:"#42d9ad"},{label:"5月",value:72,color:"#42d9ad"},{label:"6月",value:78,color:"#42d9ad"},{label:"7月",value:82,color:"#42d9ad"}],
    rankingTitle:"科室单位业务量能耗",ranking:[{name:"医学影像科",value:"14.8 kWh/检查",percent:92,state:"偏高"},{name:"手术麻醉科",value:"86.4 kWh/台",percent:81,state:"关注"},{name:"检验科",value:"2.6 kWh/标本",percent:66,state:"正常"},{name:"消毒供应中心",value:"4.8 kgce/包",percent:58,state:"正常"}],
    tableTitle:"科室异常解释",columns:["科室","指标","当前值","主要影响因素","建议"],rows:[["医学影像科","单位检查能耗","14.8","MRI 夜间待机偏高","优化待机策略"],["手术麻醉科","单位手术能耗","86.4","洁净空调延时过长","校准排程联动"],["检验科","非工作时段占比","31%","流水线持续保温","分区启停"],["消毒供应中心","单位包能耗","4.8","蒸汽疏水损失","检查疏水阀"]],
    actionTitle:"对标范围",actions:[{title:"同级三甲医院",meta:"综合排名",status:"P38"},{title:"院内同类科室",meta:"按业务量归一",status:"可比"},{title:"天气与床位修正",meta:"模型覆盖率",status:"96%"}],
  },
  systems: {
    title:"重点系统",subtitle:"医疗保障系统运行安全与能源效率协同管理",scope:"六大重点系统",
    tabs:["系统总览","运行工况","维保协同"],
    kpis:[{label:"冷站综合 COP",value:"4.72",unit:"",change:"+0.18",note:"目标值 ≥ 4.50"},{label:"洁净空调合规率",value:"99.6",unit:"%",change:"+0.2%",note:"压差与温湿度"},{label:"锅炉综合效率",value:"92.4",unit:"%",change:"-0.6%",note:"2# 锅炉需关注"},{label:"医用氧气压力",value:"0.48",unit:"MPa",change:"正常",note:"储备可用 4.6 天"}],
    primaryTitle:"系统效率趋势",series:[{label:"周一",value:74,color:"#42d9ad"},{label:"周二",value:79,color:"#42d9ad"},{label:"周三",value:83,color:"#42d9ad"},{label:"周四",value:81,color:"#42d9ad"},{label:"周五",value:88,color:"#42d9ad"},{label:"周六",value:84,color:"#42d9ad"},{label:"周日",value:91,color:"#42d9ad"}],
    rankingTitle:"系统运行评价",ranking:[{name:"中央冷站",value:"COP 4.72",percent:92,state:"高效"},{name:"锅炉蒸汽",value:"效率 92.4%",percent:78,state:"关注"},{name:"洁净空调",value:"合规 99.6%",percent:96,state:"正常"},{name:"污水处理",value:"达标 100%",percent:88,state:"正常"}],
    tableTitle:"关键运行参数",columns:["系统","参数","当前值","控制区间","状态"],rows:[["洁净空调","手术部压差","8.6 Pa","5–15 Pa","正常"],["中央冷站","供回水温差","4.2 ℃","4.5–5.5 ℃","关注"],["医用氧气","主管压力","0.48 MPa","0.45–0.55 MPa","正常"],["污水处理","出水余氯","5.8 mg/L","4–8 mg/L","正常"]],
    actionTitle:"维保窗口",actions:[{title:"2# 锅炉燃烧校准",meta:"7月30日 22:00",status:"已审批"},{title:"冷站 3# 泵检查",meta:"7月31日 01:00",status:"待确认"},{title:"医气站过滤器更换",meta:"8月2日 14:00",status:"已计划"}],
  },
  equipment: {
    title:"医疗设备能效",subtitle:"大型医疗设备运行、待机与检查业务量协同分析",scope:"影像与治疗设备",
    tabs:["设备总览","待机分析","检查效能"],
    kpis:[{label:"纳管大型设备",value:"68",unit:"台",change:"+4",note:"在线率 98.5%"},{label:"今日设备用电",value:"12,860",unit:"kWh",change:"-1.8%",note:"占全院用电 14.9%"},{label:"非诊疗时段占比",value:"28.6",unit:"%",change:"-3.2%",note:"目标 ≤ 25%"},{label:"单位检查能耗",value:"9.42",unit:"kWh/人次",change:"-2.1%",note:"已做天气修正"}],
    primaryTitle:"运行、待机与检查量趋势",series:[{label:"8时",value:40,color:"#7ca8ff"},{label:"10时",value:82,color:"#7ca8ff"},{label:"12时",value:67,color:"#7ca8ff"},{label:"14时",value:91,color:"#7ca8ff"},{label:"16时",value:86,color:"#7ca8ff"},{label:"18时",value:58,color:"#7ca8ff"},{label:"20时",value:31,color:"#7ca8ff"}],
    rankingTitle:"设备能耗排名",ranking:[{name:"3.0T MRI-01",value:"1,286 kWh",percent:94,state:"关注"},{name:"直线加速器-02",value:"986 kWh",percent:79,state:"正常"},{name:"CT-03",value:"842 kWh",percent:72,state:"正常"},{name:"DSA-01",value:"684 kWh",percent:59,state:"正常"}],
    tableTitle:"设备待机异常",columns:["设备","科室","待机时长","待机功率","建议"],rows:[["3.0T MRI-01","医学影像科","10.6 h","38.2 kW","优化低功耗模式"],["CT-03","医学影像科","6.4 h","12.6 kW","联动检查排程"],["直线加速器-02","放疗科","5.8 h","18.4 kW","校准预热时段"],["全自动流水线","检验科","8.2 h","9.8 kW","分区关停"]],
    actionTitle:"设备策略",actions:[{title:"MRI 低功耗策略",meta:"预计节省 18.6 万/年",status:"待验证"},{title:"CT 排程联动",meta:"预计节省 8.2 万/年",status:"试运行"},{title:"检验流水线分区",meta:"预计节省 6.4 万/年",status:"建议"}],
  },
  alarms: {
    title:"告警中心",subtitle:"发现—确认—派单—处置—复核—关闭全流程",scope:"全院告警",
    tabs:["实时告警","工单处置","规则管理"],
    kpis:[{label:"今日告警",value:"26",unit:"条",change:"-18%",note:"高风险 2 条"},{label:"待确认",value:"7",unit:"条",change:"-3",note:"最早 12 分钟前"},{label:"闭环率",value:"92.6",unit:"%",change:"+4.1%",note:"近 30 日"},{label:"平均处置时长",value:"38",unit:"分钟",change:"-12 分钟",note:"目标 ≤ 45 分钟"}],
    primaryTitle:"近 24 小时告警分布",series:[{label:"0时",value:18,color:"#ff7b64"},{label:"4时",value:26,color:"#ff7b64"},{label:"8时",value:55,color:"#ff7b64"},{label:"12时",value:73,color:"#ff7b64"},{label:"16时",value:62,color:"#ff7b64"},{label:"20时",value:39,color:"#ff7b64"},{label:"24时",value:21,color:"#ff7b64"}],
    rankingTitle:"告警类型",ranking:[{name:"能耗异常",value:"12 条",percent:86,state:"5 待处置"},{name:"设备异常",value:"7 条",percent:62,state:"1 高风险"},{name:"数据质量",value:"4 条",percent:38,state:"处理中"},{name:"保障参数",value:"3 条",percent:29,state:"1 高风险"}],
    tableTitle:"告警处置队列",columns:["等级","告警","位置","持续时间","处置状态"],rows:[["高","手术中心洁净压差波动","手术部 8 区","12 分钟","处理中"],["高","医用氧气站备用汇流排异常","医气站","18 分钟","已派单"],["中","医技楼夜间基荷偏高","门诊医技楼","2.4 小时","待确认"],["中","住院二部用水突增","住院二部 5F","46 分钟","处理中"]],
    actionTitle:"值班处置",actions:[{title:"暖通组",meta:"在岗 4 人 · 工单 3",status:"在线"},{title:"动力组",meta:"在岗 3 人 · 工单 2",status:"在线"},{title:"维修组",meta:"在岗 6 人 · 工单 4",status:"在线"}],
  },
  ai: {
    title:"AI 节能诊断",subtitle:"基于运行证据生成可解释、可审核的节能建议",scope:"模拟诊断",
    tabs:["异常诊断","节能机会","智能问数"],
    kpis:[{label:"识别节能机会",value:"18",unit:"项",change:"+3",note:"高价值 5 项"},{label:"预计节省",value:"186.4",unit:"万元/年",change:"+12.8%",note:"不含投资成本"},{label:"预计减排",value:"1,642",unit:"tCO₂e/年",change:"+8.6%",note:"按当前排放因子"},{label:"建议采纳率",value:"72.8",unit:"%",change:"+6.2%",note:"近 90 日"}],
    primaryTitle:"异常基线与预测偏差",series:[{label:"周一",value:42,color:"#b389ff"},{label:"周二",value:58,color:"#b389ff"},{label:"周三",value:49,color:"#b389ff"},{label:"周四",value:73,color:"#b389ff"},{label:"周五",value:86,color:"#b389ff"},{label:"周六",value:61,color:"#b389ff"},{label:"周日",value:44,color:"#b389ff"}],
    rankingTitle:"节能机会价值",ranking:[{name:"医技楼夜间待机",value:"38.6 万/年",percent:96,state:"置信度 92%"},{name:"冷站泵组策略",value:"21.4 万/年",percent:82,state:"置信度 87%"},{name:"洁净空调排程联动",value:"18.2 万/年",percent:76,state:"置信度 89%"},{name:"蒸汽疏水阀治理",value:"12.8 万/年",percent:58,state:"置信度 84%"}],
    tableTitle:"诊断证据链",columns:["诊断对象","异常模式","关键证据","影响","下一步"],rows:[["MRI-01","夜间基荷","连续 14 日待机功率 38 kW","18.6 万/年","生成方案"],["冷站 3# 泵","低温差高流量","温差 4.2℃，阀位 82%","21.4 万/年","模拟策略"],["手术部 AHU-08","排程脱节","末台手术后延时 4.6h","18.2 万/年","发起确认"],["2# 蒸汽支路","疑似泄漏","夜间流量基线抬升 18%","12.8 万/年","现场复核"]],
    actionTitle:"安全约束",actions:[{title:"医疗安全优先",meta:"建议不自动下控",status:"已启用"},{title:"人工审核",meta:"高风险动作双人确认",status:"已启用"},{title:"诊断可追溯",meta:"保留模型、数据和证据",status:"完整"}],
  },
  projects: {
    title:"节能项目",subtitle:"从机会识别到 M&V 核验的项目全生命周期",scope:"年度项目池",
    tabs:["项目看板","收益核验","项目储备"],
    kpis:[{label:"在管项目",value:"16",unit:"项",change:"+3",note:"实施中 6 项"},{label:"年度投资",value:"1,286",unit:"万元",change:"+8.2%",note:"预算执行率 64%"},{label:"核验节能收益",value:"368",unit:"万元",change:"+16.4%",note:"已扣除运营影响"},{label:"综合回收期",value:"2.8",unit:"年",change:"-0.4 年",note:"目标 ≤ 3.5 年"}],
    primaryTitle:"项目投资与收益累计",series:[{label:"1月",value:18,color:"#42d9ad"},{label:"2月",value:26,color:"#42d9ad"},{label:"3月",value:35,color:"#42d9ad"},{label:"4月",value:48,color:"#42d9ad"},{label:"5月",value:62,color:"#42d9ad"},{label:"6月",value:78,color:"#42d9ad"},{label:"7月",value:91,color:"#42d9ad"}],
    rankingTitle:"项目收益排名",ranking:[{name:"冷站群控优化",value:"86.4 万/年",percent:94,state:"核验中"},{name:"照明节能改造",value:"62.8 万/年",percent:78,state:"已核验"},{name:"蒸汽管网治理",value:"48.6 万/年",percent:66,state:"实施中"},{name:"光伏二期",value:"42.4 万/年",percent:58,state:"设计中"}],
    tableTitle:"项目执行看板",columns:["项目","责任部门","投资","进度","M&V 状态"],rows:[["冷站群控优化","后勤保障部","286 万","92%","基线复核"],["手术部排程联动","手术麻醉科","48 万","68%","采集期"],["蒸汽管网治理","动力组","126 万","54%","待实施"],["光伏二期","基建处","520 万","32%","方案审批"]],
    actionTitle:"阶段闸门",actions:[{title:"机会评审",meta:"待评审 4 项",status:"本周"},{title:"投资审批",meta:"待审批 2 项",status:"院务会"},{title:"收益核验",meta:"待核验 3 项",status:"M&V"}],
  },
  quality: {
    title:"数据质量",subtitle:"监测、报告、核查全过程的数据可信度管理",scope:"1,286 个测点",
    tabs:["质量总览","异常治理","审计追踪"],
    kpis:[{label:"综合质量分",value:"92.4",unit:"分",change:"+2.8",note:"A级数据 86.2%"},{label:"数据完整率",value:"98.7",unit:"%",change:"+0.9%",note:"缺失测点 16 个"},{label:"数据及时率",value:"96.8",unit:"%",change:"-0.4%",note:"延迟接口 3 个"},{label:"异常闭环率",value:"94.2",unit:"%",change:"+4.6%",note:"待治理 12 项"}],
    primaryTitle:"数据质量趋势",series:[{label:"1月",value:76,color:"#75a8ff"},{label:"2月",value:81,color:"#75a8ff"},{label:"3月",value:84,color:"#75a8ff"},{label:"4月",value:87,color:"#75a8ff"},{label:"5月",value:89,color:"#75a8ff"},{label:"6月",value:91,color:"#75a8ff"},{label:"7月",value:92,color:"#75a8ff"}],
    rankingTitle:"质量问题分布",ranking:[{name:"通讯中断",value:"16 项",percent:82,state:"8 处理中"},{name:"数据缺失",value:"12 项",percent:64,state:"5 处理中"},{name:"突变异常",value:"8 项",percent:46,state:"待复核"},{name:"台账不一致",value:"5 项",percent:31,state:"责任人确认"}],
    tableTitle:"异常治理队列",columns:["数据项","问题类型","影响范围","责任人","状态"],rows:[["EM-MT-031","15 分钟数据缺失","医技楼冷站","张工","处理中"],["WM-IP-205","瞬时值突变","住院二部 5F","李工","待复核"],["麻醉气体台账","月度数据缺失","手术部 3 间","王老师","待补录"],["医废处置联单","凭证晚到","6 月核算批次","赵老师","催办中"]],
    actionTitle:"接口健康",actions:[{title:"能源监测平台",meta:"最后同步 14:32",status:"正常"},{title:"设备管理平台",meta:"最后同步 14:28",status:"正常"},{title:"医疗业务量接口",meta:"最后同步 14:20",status:"延迟"}],
  },
};
