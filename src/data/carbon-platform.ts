import type { ActivityRecord, AnnualTask, AssetTransaction, EmissionFactor, EvidenceRecord, MvrAnomaly } from "../types/domain";

export const emissionFactors: EmissionFactor[] = [
  { id: "ef-electricity", name: "外购电力排放因子", category: "外购电力", value: 0.0005703, unit: "tCO₂e/kWh", source: "生态环境部全国电网平均排放因子", version: "2025.1", effectiveFrom: "2025-01-01", effectiveTo: "2026-12-31" },
  { id: "ef-gas", name: "天然气排放因子", category: "天然气", value: 0.002162, unit: "tCO₂e/m³", source: "GB/T 32151.10", version: "2024.2", effectiveFrom: "2024-01-01", effectiveTo: "2027-12-31" },
  { id: "ef-heat", name: "外购热力排放因子", category: "外购热力／蒸汽", value: 0.11, unit: "tCO₂e/GJ", source: "北京市地方标准 DB11/T 1785", version: "2026.1", effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" },
  { id: "ef-diesel", name: "柴油排放因子", category: "柴油", value: 0.00273, unit: "tCO₂e/L", source: "IPCC 2006 Guidelines", version: "2019 refinement", effectiveFrom: "2024-01-01", effectiveTo: "2028-12-31" },
  { id: "ef-water", name: "供水排放因子", category: "用水", value: 0.000168, unit: "tCO₂e/m³", source: "公共机构温室气体核算指南", version: "2025.1", effectiveFrom: "2025-01-01", effectiveTo: "2026-12-31" },
  { id: "ef-waste", name: "医疗废物处置因子", category: "医疗废物", value: 0.812, unit: "tCO₂e/t", source: "医院废弃物生命周期数据库", version: "2025.3", effectiveFrom: "2025-01-01", effectiveTo: "2027-12-31" },
  { id: "ef-refrigerant", name: "R134a 制冷剂 GWP", category: "制冷剂逸散", value: 1.43, unit: "tCO₂e/kg", source: "IPCC AR6", version: "AR6", effectiveFrom: "2023-01-01", effectiveTo: "2030-12-31", gwp: 1430 },
  { id: "ef-anesthetic", name: "七氟烷 GWP", category: "麻醉气体", value: 0.195, unit: "tCO₂e/kg", source: "IPCC AR6 / 医院麻醉气体指南", version: "AR6", effectiveFrom: "2023-01-01", effectiveTo: "2030-12-31", gwp: 195 },
  { id: "ef-commute", name: "员工通勤综合因子", category: "员工通勤", value: 0.000142, unit: "tCO₂e/km", source: "医院通勤调查模型", version: "2026.1", effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" },
  { id: "ef-laundry", name: "外包洗涤因子", category: "外包洗涤", value: 0.00084, unit: "tCO₂e/kg", source: "供应商 EPD 与行业均值", version: "2026.1", effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" },
];

const factor = (id: string) => emissionFactors.find((item) => item.id === id)!;
const record = (data: Omit<ActivityRecord, "factorValue" | "factorSource" | "emission" | "updatedAt">): ActivityRecord => {
  const ef = factor(data.factorId);
  return { ...data, factorValue: ef.value, factorSource: ef.source, emission: data.activity === null ? null : Number((data.activity * ef.value).toFixed(3)), updatedAt: "2026-08-04 09:32" };
};

export const initialActivityRecords: ActivityRecord[] = [
  record({ id:"r01",code:"AD-EL-001",sourceName:"总院外购电力",category:"外购电力",scope:"范围二",campus:"总院",building:"门诊楼",department:"后勤保障部",month:"2026-07",activity:1864200,unit:"kWh",factorId:"ef-electricity",status:"已采集",reviewStatus:"已通过",evidenceStatus:"审核通过",estimated:false }),
  record({ id:"r02",code:"AD-EL-002",sourceName:"东院区外购电力",category:"外购电力",scope:"范围二",campus:"东院区",building:"住院楼",department:"后勤保障部",month:"2026-07",activity:986500,unit:"kWh",factorId:"ef-electricity",status:"已采集",reviewStatus:"待复核",evidenceStatus:"待审核",estimated:false }),
  record({ id:"r03",code:"AD-EL-003",sourceName:"西院区外购电力",category:"外购电力",scope:"范围二",campus:"西院区",building:"医技楼",department:"设备动力科",month:"2026-07",activity:742800,unit:"kWh",factorId:"ef-electricity",status:"异常",reviewStatus:"待复核",evidenceStatus:"审核通过",estimated:false }),
  record({ id:"r04",code:"AD-GAS-001",sourceName:"锅炉房天然气",category:"天然气",scope:"范围一",campus:"总院",building:"锅炉房",department:"设备动力科",month:"2026-07",activity:286400,unit:"m³",factorId:"ef-gas",status:"已采集",reviewStatus:"已通过",evidenceStatus:"审核通过",estimated:false }),
  record({ id:"r05",code:"AD-HEAT-001",sourceName:"东院区外购蒸汽",category:"外购热力／蒸汽",scope:"范围二",campus:"东院区",building:"住院楼",department:"后勤保障部",month:"2026-07",activity:8420,unit:"GJ",factorId:"ef-heat",status:"已采集",reviewStatus:"待复核",evidenceStatus:"待审核",estimated:false }),
  record({ id:"r06",code:"AD-DIE-001",sourceName:"应急发电机柴油",category:"应急发电机燃油",scope:"范围一",campus:"总院",building:"动力中心",department:"设备动力科",month:"2026-07",activity:3850,unit:"L",factorId:"ef-diesel",status:"已采集",reviewStatus:"已通过",evidenceStatus:"审核通过",estimated:false }),
  record({ id:"r07",code:"AD-AMB-001",sourceName:"救护车燃油",category:"救护车燃油",scope:"范围一",campus:"总院",building:"急诊中心",department:"车队",month:"2026-07",activity:6420,unit:"L",factorId:"ef-diesel",status:"已采集",reviewStatus:"待复核",evidenceStatus:"待审核",estimated:false }),
  record({ id:"r08",code:"AD-REF-001",sourceName:"中央冷站制冷剂补充",category:"制冷剂逸散",scope:"范围一",campus:"总院",building:"动力中心",department:"设备动力科",month:"2026-07",activity:18.5,unit:"kg",factorId:"ef-refrigerant",status:"异常",reviewStatus:"已退回",evidenceStatus:"异常",estimated:false }),
  record({ id:"r09",code:"AD-ANE-001",sourceName:"手术中心麻醉气体",category:"麻醉气体",scope:"范围一",campus:"总院",building:"医技楼",department:"手术麻醉科",month:"2026-07",activity:126,unit:"kg",factorId:"ef-anesthetic",status:"已采集",reviewStatus:"待复核",evidenceStatus:"审核通过",estimated:false }),
  record({ id:"r10",code:"AD-WST-001",sourceName:"医疗废物转移处置",category:"医疗废物",scope:"范围三",campus:"总院",building:"医疗废物暂存站",department:"感染管理科",month:"2026-07",activity:68.4,unit:"t",factorId:"ef-waste",status:"已采集",reviewStatus:"已通过",evidenceStatus:"审核通过",estimated:false }),
  record({ id:"r11",code:"AD-WST-002",sourceName:"东院区医疗废物",category:"医疗废物",scope:"范围三",campus:"东院区",building:"医疗废物暂存站",department:"感染管理科",month:"2026-07",activity:null,unit:"t",factorId:"ef-waste",status:"缺失",reviewStatus:"草稿",evidenceStatus:"未关联",estimated:false }),
  record({ id:"r12",code:"AD-WAT-001",sourceName:"市政供水",category:"用水",scope:"范围三",campus:"总院",building:"全院",department:"后勤保障部",month:"2026-07",activity:48620,unit:"m³",factorId:"ef-water",status:"已采集",reviewStatus:"已通过",evidenceStatus:"审核通过",estimated:false }),
  record({ id:"r13",code:"AD-COM-001",sourceName:"员工通勤调查",category:"员工通勤",scope:"范围三",campus:"总院",building:"全院",department:"人力资源部",month:"2026-07",activity:1286000,unit:"km",factorId:"ef-commute",status:"估算值",reviewStatus:"待复核",evidenceStatus:"待审核",estimated:true }),
  record({ id:"r14",code:"AD-TRV-001",sourceName:"公务差旅里程",category:"公务差旅",scope:"范围三",campus:"总院",building:"行政楼",department:"院长办公室",month:"2026-07",activity:86200,unit:"km",factorId:"ef-commute",status:"已采集",reviewStatus:"待复核",evidenceStatus:"待审核",estimated:false }),
  record({ id:"r15",code:"AD-LAU-001",sourceName:"外包洗涤服务",category:"外包洗涤",scope:"范围三",campus:"总院",building:"住院楼",department:"采购中心",month:"2026-07",activity:186400,unit:"kg",factorId:"ef-laundry",status:"已采集",reviewStatus:"已通过",evidenceStatus:"审核通过",estimated:false }),
  record({ id:"r16",code:"AD-WAT-002",sourceName:"污水处理量",category:"污水处理",scope:"范围三",campus:"总院",building:"污水处理站",department:"后勤保障部",month:"2026-07",activity:43800,unit:"m³",factorId:"ef-water",status:"已采集",reviewStatus:"待复核",evidenceStatus:"审核通过",estimated:false }),
  record({ id:"r17",code:"AD-PUR-001",sourceName:"医疗耗材采购",category:"药品和耗材采购",scope:"范围三",campus:"总院",building:"全院",department:"采购中心",month:"2026-07",activity:328,unit:"万元",factorId:"ef-waste",status:"估算值",reviewStatus:"草稿",evidenceStatus:"未关联",estimated:true }),
  record({ id:"r18",code:"AD-GRE-001",sourceName:"绿电采购抵扣",category:"绿电与绿证",scope:"范围二",campus:"总院",building:"全院",department:"财务资产部",month:"2026-07",activity:286000,unit:"kWh",factorId:"ef-electricity",status:"已采集",reviewStatus:"已通过",evidenceStatus:"审核通过",estimated:false }),
];

export const sourceCategories = ["组织边界","外购电力","天然气","外购热力／蒸汽","外购冷量","柴油","汽油","救护车燃油","应急发电机燃油","制冷剂逸散","麻醉气体","医疗废物","一般废物","污水处理","用水","员工通勤","公务差旅","外包洗涤","绿电与绿证","MRV凭证"];

export const initialTransactions: AssetTransaction[] = [
  { id:"tx01",assetType:"绿证",direction:"买入",quantity:1200,unitPrice:46,amount:55200,date:"2026-03-18",counterparty:"华北绿色电力交易中心",contractNo:"GEC-2026-0318",attachment:"绿证采购合同.pdf",operator:"周敏",reviewStatus:"已通过" },
  { id:"tx02",assetType:"CCER",direction:"买入",quantity:850,unitPrice:82,amount:69700,date:"2026-05-26",counterparty:"北京碳资产服务有限公司",contractNo:"CCER-2026-0526",operator:"周敏",reviewStatus:"已通过" },
  { id:"tx03",assetType:"碳信用",direction:"卖出",quantity:180,unitPrice:96,amount:17280,date:"2026-06-12",counterparty:"医疗联合体成员单位",contractNo:"IC-2026-0612",operator:"陈杰",reviewStatus:"待审核" },
];

export const initialTasks: AnnualTask[] = [
  { id:"task01",title:"年度核查准备",dueDate:"2026-08-18",owner:"王主任",progress:72,status:"进行中",note:"范围三凭证仍需补齐",priority:"高" },
  { id:"task02",title:"月度数据上报",dueDate:"2026-08-08",owner:"李工",progress:88,status:"进行中",note:"待复核麻醉气体台账",priority:"高" },
  { id:"task03",title:"碳资产盘点",dueDate:"2026-09-15",owner:"周敏",progress:42,status:"进行中",note:"核对绿证余额",priority:"中" },
  { id:"task04",title:"绿证采购",dueDate:"2026-10-10",owner:"陈杰",progress:18,status:"待开始",note:"等待采购预算审批",priority:"中" },
  { id:"task05",title:"减排项目验收",dueDate:"2026-07-28",owner:"赵工",progress:63,status:"已逾期",note:"冷站群控项目 M&V 待完成",priority:"高" },
  { id:"task06",title:"年度报告生成",dueDate:"2026-12-20",owner:"核算组",progress:10,status:"待开始",note:"",priority:"低" },
];

export const initialEvidence: EvidenceRecord[] = [
  { id:"ev01",code:"MRV-2026-0001",name:"2026年7月总院电费账单",type:"电费账单",dataSource:"总院外购电力",resultRef:"2026-07 范围二",campus:"总院",period:"2026-07",format:"PDF",size:"2.4 MB",uploader:"李工",uploadedAt:"2026-08-01 09:28",reviewer:"陈审核",reviewStatus:"审核通过",validUntil:"2027-08-01",hash:"8fd31a…b52c9e",integrity:"完整",department:"后勤保障部" },
  { id:"ev02",code:"MRV-2026-0002",name:"锅炉房天然气月度账单",type:"天然气账单",dataSource:"锅炉房天然气",resultRef:"2026-07 范围一",campus:"总院",period:"2026-07",format:"PDF",size:"1.8 MB",uploader:"赵工",uploadedAt:"2026-08-01 10:16",reviewer:"陈审核",reviewStatus:"待审核",validUntil:"2027-08-01",hash:"3c82fa…91d210",integrity:"完整",department:"设备动力科" },
  { id:"ev03",code:"MRV-2026-0003",name:"医疗废物转移联单汇总",type:"医疗废物转移联单",dataSource:"医疗废物转移处置",resultRef:"2026-07 范围三",campus:"总院",period:"2026-07",format:"XLSX",size:"860 KB",uploader:"孙老师",uploadedAt:"2026-08-02 14:42",reviewer:"未分配",reviewStatus:"草稿",validUntil:"2027-08-02",hash:"7a113e…02d8aa",integrity:"缺失关联",department:"感染管理科" },
  { id:"ev04",code:"MRV-2026-0004",name:"中央冷站制冷剂补充记录",type:"制冷剂补充记录",dataSource:"中央冷站制冷剂补充",resultRef:"2026-07 范围一",campus:"总院",period:"2026-07",format:"JPG",size:"3.1 MB",uploader:"赵工",uploadedAt:"2026-08-03 16:08",reviewer:"陈审核",reviewStatus:"已退回",validUntil:"2027-08-03",hash:"e9186b…73af10",integrity:"哈希异常",department:"设备动力科" },
  { id:"ev05",code:"MRV-2026-0005",name:"绿电交易合同与结算单",type:"绿电合同",dataSource:"绿电采购抵扣",resultRef:"2026-07 范围二",campus:"总院",period:"2026-07",format:"DOCX",size:"1.2 MB",uploader:"周敏",uploadedAt:"2026-08-04 08:55",reviewer:"陈审核",reviewStatus:"待审核",validUntil:"2027-12-31",hash:"3f721b…0c8234",integrity:"完整",department:"财务资产部" },
];

export const initialAnomalies: MvrAnomaly[] = [
  { id:"an01",type:"数据缺失",object:"东院区医疗废物",description:"7月转移联单未回传，影响范围三完整性",severity:"高",owner:"感染管理科",status:"待处理",occurredAt:"2026-08-01 08:30",note:"" },
  { id:"an02",type:"同比异常",object:"西院区外购电力",description:"同比增长 28.6%，超过阈值 15%",severity:"中",owner:"后勤保障部",status:"整改中",occurredAt:"2026-08-02 10:12",note:"已安排现场复核" },
  { id:"an03",type:"凭证缺失",object:"员工通勤调查",description:"估算模型缺少最新抽样调查附件",severity:"中",owner:"人力资源部",status:"待处理",occurredAt:"2026-08-02 14:20",note:"" },
  { id:"an04",type:"数据与账单不一致",object:"中央冷站制冷剂补充",description:"台账 18.5kg 与采购记录 21kg 不一致",severity:"高",owner:"设备动力科",status:"整改中",occurredAt:"2026-08-03 16:25",note:"等待供应商回函" },
  { id:"an05",type:"因子过期",object:"外购热力排放因子",description:"当前因子将在 2026-12-31 到期",severity:"低",owner:"碳核算组",status:"已忽略",occurredAt:"2026-08-04 09:05",note:"年度报告前更新" },
];

export const monthlyEmission = [
  { month:"1月",budget:2460,actual:2320 },{ month:"2月",budget:2320,actual:2260 },{ month:"3月",budget:2180,actual:2095 },{ month:"4月",budget:2050,actual:1980 },
  { month:"5月",budget:1980,actual:1890 },{ month:"6月",budget:1910,actual:1845 },{ month:"7月",budget:1960,actual:1918 },{ month:"8月",budget:2020,actual:0 },
  { month:"9月",budget:2140,actual:0 },{ month:"10月",budget:2260,actual:0 },{ month:"11月",budget:2380,actual:0 },{ month:"12月",budget:2520,actual:0 },
];

export const hospitalBuildings = [
  { name:"门诊楼",electricity:428600,gas:0,emission:244.4,areaEmission:36.8,bedDay:0,alarm:"正常",left:18,top:24 },
  { name:"住院楼",electricity:682400,gas:38600,emission:472.5,areaEmission:42.1,bedDay:46.2,alarm:"关注",left:47,top:18 },
  { name:"医技楼",electricity:586800,gas:0,emission:334.7,areaEmission:58.6,bedDay:0,alarm:"预警",left:69,top:30 },
  { name:"行政楼",electricity:128600,gas:0,emission:73.3,areaEmission:28.4,bedDay:0,alarm:"正常",left:28,top:55 },
  { name:"锅炉房",electricity:88400,gas:286400,emission:669.5,areaEmission:82.4,bedDay:0,alarm:"关注",left:61,top:60 },
  { name:"食堂",electricity:142500,gas:68400,emission:229.2,areaEmission:48.8,bedDay:0,alarm:"正常",left:78,top:58 },
  { name:"地下车库",electricity:96500,gas:0,emission:55.0,areaEmission:18.2,bedDay:0,alarm:"正常",left:41,top:74 },
];

export const mrvTraceNodes = ["源头设备","数据采集网关","原始数据","活动数据","排放因子","核算公式","排放结果","支撑凭证","内部审核","第三方核查","报告归档"].map((name,index)=>({
  id:`trace-${index+1}`,name,source:index<3?"能源监测与业务系统":index<7?"碳核算引擎":"MRV合规中心",device:index===0?"EM-MT-031 / GM-PW-012":"—",time:`2026-08-04 09:${String(12+index).padStart(2,"0")}`,department:index<4?"后勤保障部":index<8?"碳核算组":"审计合规部",operator:index<4?"自动采集":index<8?"李核算":"陈审核",raw:index<4?"1,864,200 kWh":"关联 18 条记录",revised:index===3?"1,862,980 kWh":"未修订",reason:index===3?"剔除通信重传重复值":"—"
}));
