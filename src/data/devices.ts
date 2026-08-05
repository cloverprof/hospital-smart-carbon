import type { Device } from "../types/core";
import { demoAsOfDate } from "./config";

const hb = (min: number) => `${demoAsOfDate} ${String(Math.max(0, 14 - Math.ceil(min / 60))).padStart(2, "0")}:${String((60 - (min % 60)) % 60).padStart(2, "0")}`;

// 设备台账（关键设备样本；台账页可在此基础上聚合统计）
export const devices: Device[] = [
  // 手术医技楼
  { id: "DEV-SUR-AHU-01", name: "净化空调机组 AHU-01（百级手术部）", buildingId: "surgical", system: "purification", category: "净化空调", ratedPowerKw: 90, status: "online", commissionYear: 2020, designLifeYears: 15, runHours: 41800, efficiencyDecayPct: 4, meterId: "MT-SUR-E-02", lastHeartbeat: hb(1) },
  { id: "DEV-SUR-AHU-03", name: "净化空调机组 AHU-03（万级手术部）", buildingId: "surgical", system: "purification", category: "净化空调", ratedPowerKw: 75, status: "fault", commissionYear: 2020, designLifeYears: 15, runHours: 41650, efficiencyDecayPct: 6, meterId: "MT-SUR-E-02", lastHeartbeat: hb(2) },
  { id: "DEV-SUR-OR-03", name: "3# 正负压转换手术室机组", buildingId: "surgical", system: "purification", category: "净化空调", ratedPowerKw: 45, status: "online", commissionYear: 2020, designLifeYears: 15, runHours: 33800, efficiencyDecayPct: 3, meterId: "MT-SUR-E-02", lastHeartbeat: hb(1) },
  { id: "DEV-SUR-O2-MAN", name: "氧气备用汇流排", buildingId: "surgical", system: "medgas", category: "医用气体", ratedPowerKw: 2, status: "fault", commissionYear: 2018, designLifeYears: 12, runHours: 63000, efficiencyDecayPct: 8, meterId: "MT-SUR-MG-01", lastHeartbeat: hb(3) },
  { id: "DEV-SUR-ICU-AHU", name: "ICU 恒温恒湿机组", buildingId: "surgical", system: "hvac", category: "空调", ratedPowerKw: 60, status: "online", commissionYear: 2020, designLifeYears: 15, runHours: 42100, efficiencyDecayPct: 4, meterId: "MT-SUR-E-01", lastHeartbeat: hb(1) },
  // 影像中心（大型医疗设备）
  { id: "DEV-IMG-CT-01", name: "CT-01（128 层）", buildingId: "imaging", system: "medical", category: "大型医疗设备", ratedPowerKw: 110, status: "online", commissionYear: 2021, designLifeYears: 10, runHours: 16900, efficiencyDecayPct: 2, meterId: "MT-IMG-E-01", isLargeMedical: true, standbyPowerKw: 6, lastHeartbeat: hb(1) },
  { id: "DEV-IMG-CT-02", name: "CT-02（64 层）", buildingId: "imaging", system: "medical", category: "大型医疗设备", ratedPowerKw: 95, status: "online", commissionYear: 2017, designLifeYears: 10, runHours: 30100, efficiencyDecayPct: 6, meterId: "MT-IMG-E-01", isLargeMedical: true, standbyPowerKw: 8, lastHeartbeat: hb(2) },
  { id: "DEV-IMG-MRI-01", name: "MRI-01（3.0T）", buildingId: "imaging", system: "medical", category: "大型医疗设备", ratedPowerKw: 130, status: "online", commissionYear: 2022, designLifeYears: 12, runHours: 12800, efficiencyDecayPct: 1, meterId: "MT-IMG-E-02", isLargeMedical: true, standbyPowerKw: 13, lastHeartbeat: hb(1) },
  { id: "DEV-IMG-MRI-02", name: "MRI-02（1.5T）", buildingId: "imaging", system: "medical", category: "大型医疗设备", ratedPowerKw: 105, status: "online", commissionYear: 2016, designLifeYears: 12, runHours: 35400, efficiencyDecayPct: 7, meterId: "MT-IMG-E-02", isLargeMedical: true, standbyPowerKw: 21, lastHeartbeat: hb(1) },
  { id: "DEV-IMG-DSA-01", name: "DSA-01（介入）", buildingId: "imaging", system: "medical", category: "大型医疗设备", ratedPowerKw: 80, status: "maintenance", commissionYear: 2019, designLifeYears: 10, runHours: 21500, efficiencyDecayPct: 4, meterId: "MT-IMG-E-01", isLargeMedical: true, standbyPowerKw: 4, lastHeartbeat: hb(240) },
  { id: "DEV-IMG-LA-01", name: "直线加速器 LA-01", buildingId: "imaging", system: "medical", category: "大型医疗设备", ratedPowerKw: 150, status: "online", commissionYear: 2021, designLifeYears: 15, runHours: 14100, efficiencyDecayPct: 2, meterId: "MT-IMG-E-01", isLargeMedical: true, standbyPowerKw: 9, lastHeartbeat: hb(1) },
  // 动力中心
  { id: "DEV-PWR-CH-01", name: "1# 离心冷水机组（1200RT）", buildingId: "power", system: "chiller", category: "冷站", ratedPowerKw: 780, status: "online", commissionYear: 2016, designLifeYears: 20, runHours: 47600, efficiencyDecayPct: 8, meterId: "MT-PWR-E-01", lastHeartbeat: hb(1) },
  { id: "DEV-PWR-CH-02", name: "2# 离心冷水机组（1200RT）", buildingId: "power", system: "chiller", category: "冷站", ratedPowerKw: 780, status: "online", commissionYear: 2016, designLifeYears: 20, runHours: 45200, efficiencyDecayPct: 7, meterId: "MT-PWR-E-01", lastHeartbeat: hb(1) },
  { id: "DEV-PWR-PUMP-03", name: "3# 冷冻水泵（75kW）", buildingId: "power", system: "chiller", category: "水泵", ratedPowerKw: 75, status: "fault", commissionYear: 2016, designLifeYears: 15, runHours: 51800, efficiencyDecayPct: 9, meterId: "MT-PWR-E-01", lastHeartbeat: hb(2) },
  { id: "DEV-PWR-BLR-01", name: "1# 燃气蒸汽锅炉（10t/h）", buildingId: "power", system: "boiler", category: "锅炉", ratedPowerKw: 55, status: "online", commissionYear: 2016, designLifeYears: 20, runHours: 39800, efficiencyDecayPct: 5, meterId: "MT-PWR-G-01", lastHeartbeat: hb(1) },
  { id: "DEV-PWR-BLR-02", name: "2# 燃气蒸汽锅炉（10t/h）", buildingId: "power", system: "boiler", category: "锅炉", ratedPowerKw: 55, status: "fault", commissionYear: 2016, designLifeYears: 20, runHours: 41200, efficiencyDecayPct: 9, meterId: "MT-PWR-G-01", lastHeartbeat: hb(1) },
  { id: "DEV-PWR-AIR-01", name: "1# 医用空压机", buildingId: "power", system: "medgas", category: "医用气体", ratedPowerKw: 37, status: "online", commissionYear: 2018, designLifeYears: 12, runHours: 34100, efficiencyDecayPct: 5, meterId: "MT-PWR-E-02", lastHeartbeat: hb(1) },
  { id: "DEV-PWR-VAC-01", name: "1# 负压真空泵", buildingId: "power", system: "medgas", category: "医用气体", ratedPowerKw: 22, status: "online", commissionYear: 2018, designLifeYears: 12, runHours: 33800, efficiencyDecayPct: 5, meterId: "MT-PWR-E-02", lastHeartbeat: hb(1) },
  { id: "DEV-PWR-SEW-01", name: "污水处理站曝气系统", buildingId: "power", system: "sewage", category: "污水处理", ratedPowerKw: 45, status: "online", commissionYear: 2017, designLifeYears: 15, runHours: 43900, efficiencyDecayPct: 6, meterId: "MT-PWR-E-02", lastHeartbeat: hb(1) },
  // 消毒供应室
  { id: "DEV-CSD-STER-01", name: "1# 脉动真空灭菌器", buildingId: "cssd", system: "boiler", category: "灭菌", ratedPowerKw: 30, status: "online", commissionYear: 2016, designLifeYears: 15, runHours: 36800, efficiencyDecayPct: 6, meterId: "MT-CSD-H-01", lastHeartbeat: hb(1) },
  { id: "DEV-CSD-TRAP-07", name: "7# 蒸汽疏水阀（DN25）", buildingId: "cssd", system: "boiler", category: "阀门", ratedPowerKw: 0, status: "fault", commissionYear: 2016, designLifeYears: 8, runHours: 60000, efficiencyDecayPct: 15, meterId: "MT-CSD-H-01", lastHeartbeat: hb(60) },
  // 住院部
  { id: "DEV-IPA-ELE-01", name: "住院 A 电梯群（6 台）", buildingId: "inpatientA", system: "elevator", category: "电梯", ratedPowerKw: 66, status: "online", commissionYear: 2016, designLifeYears: 20, runHours: 46800, efficiencyDecayPct: 4, meterId: "MT-IPA-E-01", lastHeartbeat: hb(1) },
  { id: "DEV-IPB-VALVE-5F", name: "住院 B 5F 给水支路阀组", buildingId: "inpatientB", system: "water", category: "阀门", ratedPowerKw: 0, status: "fault", commissionYear: 2019, designLifeYears: 10, runHours: 0, efficiencyDecayPct: 0, meterId: "MT-IPB-W-05", lastHeartbeat: hb(30) },
  { id: "DEV-IPB-AHU-01", name: "住院 B 新风机组", buildingId: "inpatientB", system: "hvac", category: "空调", ratedPowerKw: 42, status: "online", commissionYear: 2019, designLifeYears: 15, runHours: 30500, efficiencyDecayPct: 3, meterId: "MT-IPB-E-01", lastHeartbeat: hb(1) },
  // 门诊
  { id: "DEV-OUT-AHU-01", name: "门诊大厅组合式空调", buildingId: "outpatient", system: "hvac", category: "空调", ratedPowerKw: 88, status: "online", commissionYear: 2018, designLifeYears: 15, runHours: 35600, efficiencyDecayPct: 4, meterId: "MT-OUT-E-01", lastHeartbeat: hb(1) },
  { id: "DEV-OUT-LGT-01", name: "门诊照明回路（智能）", buildingId: "outpatient", system: "lighting", category: "照明", ratedPowerKw: 120, status: "online", commissionYear: 2018, designLifeYears: 12, runHours: 35600, efficiencyDecayPct: 2, meterId: "MT-OUT-E-01", lastHeartbeat: hb(1) },
  // 计量网关
  { id: "DEV-ADM-MTR-GW", name: "行政楼采集网关", buildingId: "admin", system: "power", category: "计量", ratedPowerKw: 0.1, status: "online", commissionYear: 2019, designLifeYears: 8, runHours: 55000, efficiencyDecayPct: 0, meterId: "MT-ADM-E-01", lastHeartbeat: hb(1) },
  { id: "DEV-ADM-DOC", name: "合规档案（虚拟对象）", buildingId: "admin", system: "power", category: "档案", ratedPowerKw: 0, status: "online", commissionYear: 2020, designLifeYears: 99, runHours: 0, efficiencyDecayPct: 0, meterId: "MT-ADM-E-01" },
  { id: "DEV-EMG-UPS-01", name: "急诊 UPS 电源", buildingId: "emergency", system: "power", category: "配电", ratedPowerKw: 60, status: "online", commissionYear: 2020, designLifeYears: 10, runHours: 33000, efficiencyDecayPct: 5, meterId: "MT-EMG-E-01", lastHeartbeat: hb(1) },
];

export const deviceById = Object.fromEntries(devices.map((d) => [d.id, d]));

export const deviceStats = () => ({
  total: devices.length,
  online: devices.filter((d) => d.status === "online").length,
  offline: devices.filter((d) => d.status === "offline").length,
  fault: devices.filter((d) => d.status === "fault").length,
  maintenance: devices.filter((d) => d.status === "maintenance").length,
});
