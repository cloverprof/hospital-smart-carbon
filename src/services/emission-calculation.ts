import type { ActivityRecord, CalculationResult, EmissionFactor } from "../types/domain";

const round = (value: number, digits = 3) => Number(value.toFixed(digits));

export class EmissionCalculationService {
  static calculateRecord(record: ActivityRecord, factor?: EmissionFactor): ActivityRecord {
    if (record.activity === null) return { ...record, emission: null, status: "缺失" };
    const factorValue = factor?.value ?? record.factorValue;
    return {
      ...record,
      factorValue,
      factorSource: factor?.source ?? record.factorSource,
      emission: round(record.activity * factorValue),
      updatedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    };
  }

  static calculateBatch(records: ActivityRecord[], batchId = `BATCH-${Date.now()}`): CalculationResult {
    const valid = records.filter((record) => record.activity !== null && record.emission !== null);
    const sum = (scope: ActivityRecord["scope"]) => round(valid.filter((record) => record.scope === scope).reduce((total, record) => total + (record.emission ?? 0), 0));
    const scope1 = sum("范围一");
    const scope2 = sum("范围二");
    const scope3 = sum("范围三");
    const missingIds = records.filter((record) => record.activity === null || record.status === "缺失").map((record) => record.id);
    const abnormal = records.filter((record) => record.status === "异常").length;
    const evidenceGap = records.filter((record) => record.evidenceStatus === "未关联" || record.evidenceStatus === "异常").length;
    const qualityScore = Math.max(0, round(100 - missingIds.length * 5 - abnormal * 2.5 - evidenceGap * 1.5, 1));
    return { batchId, calculatedAt: new Date().toISOString(), total: round(scope1 + scope2 + scope3), scope1, scope2, scope3, missingIds, qualityScore };
  }

  static factorImpact(records: ActivityRecord[], factorId: string, nextValue: number) {
    const affected = records.filter((record) => record.factorId === factorId && record.activity !== null);
    const current = affected.reduce((sum, record) => sum + (record.emission ?? 0), 0);
    const next = affected.reduce((sum, record) => sum + (record.activity ?? 0) * nextValue, 0);
    return { affected: affected.length, delta: round(next - current), next: round(next) };
  }
}
