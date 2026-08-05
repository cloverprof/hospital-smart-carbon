import type { Building, BuildingId, Campus, CampusId } from "../types/core";

export const campuses: Campus[] = [
  { id: "main", name: "主院区", buildings: ["outpatient", "inpatientA", "inpatientB", "surgical", "lab", "imaging", "cssd", "admin", "power", "emergency"] },
  { id: "east", name: "东院区", buildings: [] },
];

// baseDaily 单位：electricity kWh/日、water m³/日、gas m³/日、heat GJ/日、medgas m³/日
// anchor：夜景图（1672×941）上的百分比坐标；映射假设见 docs/DECISIONS.md
export const buildings: Building[] = [
  {
    id: "outpatient", campusId: "main", name: "门诊综合楼", shortName: "门诊",
    functionLabel: "门急诊、日间诊疗与药房", areaM2: 68500, floors: 12, beds: 0, yearBuilt: 2018,
    baseDaily: { electricity: 30500, water: 520, gas: 380, heat: 46, medgas: 240 },
    anchor: { x: 43, y: 60 },
    systems: ["hvac", "lighting", "elevator", "water", "power"],
  },
  {
    id: "inpatientA", campusId: "main", name: "住院部 A 楼", shortName: "住院A",
    functionLabel: "内科住院与护理单元", areaM2: 52400, floors: 22, beds: 620, yearBuilt: 2016,
    baseDaily: { electricity: 23800, water: 760, gas: 420, heat: 58, medgas: 720 },
    anchor: { x: 39, y: 20 },
    systems: ["hvac", "lighting", "elevator", "water", "medgas", "power"],
  },
  {
    id: "inpatientB", campusId: "main", name: "住院部 B 楼", shortName: "住院B",
    functionLabel: "外科住院与康复病区", areaM2: 48100, floors: 18, beds: 540, yearBuilt: 2019,
    baseDaily: { electricity: 21400, water: 690, gas: 360, heat: 52, medgas: 640 },
    anchor: { x: 52, y: 22 },
    systems: ["hvac", "lighting", "elevator", "water", "medgas", "power"],
  },
  {
    id: "surgical", campusId: "main", name: "手术医技楼", shortName: "手术医技",
    functionLabel: "手术部、ICU 与介入中心", areaM2: 38600, floors: 9, beds: 86, yearBuilt: 2020,
    baseDaily: { electricity: 26800, water: 430, gas: 210, heat: 40, medgas: 980 },
    anchor: { x: 56, y: 42 },
    systems: ["purification", "hvac", "medgas", "power", "lighting"],
  },
  {
    id: "lab", campusId: "main", name: "检验中心", shortName: "检验",
    functionLabel: "临床检验与病理实验室", areaM2: 15800, floors: 6, beds: 0, yearBuilt: 2017,
    baseDaily: { electricity: 9800, water: 260, gas: 60, heat: 12, medgas: 130 },
    anchor: { x: 30, y: 41 },
    systems: ["hvac", "lighting", "water", "power"],
  },
  {
    id: "imaging", campusId: "main", name: "影像中心", shortName: "影像",
    functionLabel: "CT、MRI、DSA 与核医学", areaM2: 13200, floors: 4, beds: 0, yearBuilt: 2019,
    baseDaily: { electricity: 14600, water: 90, gas: 30, heat: 10, medgas: 60 },
    anchor: { x: 64, y: 55 },
    systems: ["medical", "hvac", "power", "lighting"],
  },
  {
    id: "cssd", campusId: "main", name: "消毒供应室", shortName: "消供",
    functionLabel: "消毒供应与灭菌中心", areaM2: 6400, floors: 3, beds: 0, yearBuilt: 2016,
    baseDaily: { electricity: 5200, water: 310, gas: 240, heat: 30, medgas: 40 },
    anchor: { x: 72, y: 46 },
    systems: ["boiler", "water", "hvac", "power"],
  },
  {
    id: "admin", campusId: "main", name: "行政科研楼", shortName: "行政科研",
    functionLabel: "行政办公与临床科研", areaM2: 18900, floors: 10, beds: 0, yearBuilt: 2015,
    baseDaily: { electricity: 6900, water: 120, gas: 40, heat: 16, medgas: 0 },
    anchor: { x: 68, y: 27 },
    systems: ["hvac", "lighting", "elevator", "power"],
  },
  {
    id: "power", campusId: "main", name: "后勤动力中心", shortName: "动力中心",
    functionLabel: "冷站、锅炉房、配电与污水处理", areaM2: 9800, floors: 2, beds: 0, yearBuilt: 2016,
    baseDaily: { electricity: 18200, water: 380, gas: 2600, heat: 0, medgas: 0 },
    anchor: { x: 25, y: 52 },
    systems: ["chiller", "boiler", "power", "sewage", "water"],
  },
  {
    id: "emergency", campusId: "main", name: "急诊中心", shortName: "急诊",
    functionLabel: "急诊急救与直升机停机坪", areaM2: 12600, floors: 5, beds: 60, yearBuilt: 2020,
    baseDaily: { electricity: 8600, water: 210, gas: 90, heat: 14, medgas: 380 },
    anchor: { x: 74, y: 62 },
    systems: ["hvac", "medgas", "power", "lighting"],
  },
];

export const buildingById = Object.fromEntries(buildings.map((b) => [b.id, b])) as Record<BuildingId, Building>;
export const mainBuildings = buildings.filter((b) => b.campusId === "main");
export const buildingName = (id: BuildingId) => buildingById[id]?.name ?? id;
export const campusName = (id: CampusId) => campuses.find((c) => c.id === id)?.name ?? id;
