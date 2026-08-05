import { describe, expect, it } from "vitest";
import { alarmTransitions, assertTransition, canTransition, nextProjectStage, workOrderTransitions } from "../machines";

describe("告警状态机", () => {
  it("允许 待处理→处理中→已解决", () => {
    expect(canTransition(alarmTransitions, "pending", "processing")).toBe(true);
    expect(canTransition(alarmTransitions, "processing", "resolved")).toBe(true);
  });
  it("禁止 已解决→任何状态、待处理→已解决 跳级", () => {
    expect(canTransition(alarmTransitions, "resolved", "pending")).toBe(false);
    expect(canTransition(alarmTransitions, "pending", "resolved")).toBe(false);
    expect(() => assertTransition(alarmTransitions, "pending", "resolved")).toThrow();
  });
});

describe("工单状态机", () => {
  it("完整闭环 接收→判断→指派→处理→复测→复核→关闭", () => {
    const path = ["received", "judging", "assigned", "processing", "retest", "review", "closed"] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(workOrderTransitions, path[i], path[i + 1])).toBe(true);
    }
  });
  it("复测不合格可退回处理；关闭为终态", () => {
    expect(canTransition(workOrderTransitions, "retest", "processing")).toBe(true);
    expect(canTransition(workOrderTransitions, "closed", "received")).toBe(false);
  });
});

describe("项目阶段", () => {
  it("按 立项→设计→施工→验收→运行 顺序推进，运行为终态", () => {
    expect(nextProjectStage("initiation")).toBe("design");
    expect(nextProjectStage("acceptance")).toBe("operation");
    expect(nextProjectStage("operation")).toBeNull();
  });
});
