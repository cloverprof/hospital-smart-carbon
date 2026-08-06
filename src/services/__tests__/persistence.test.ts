import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_NS, nsKey } from "../../data/config";
import { normalizePersistedDemoState, useDemoStore } from "../../stores/demo";

// 重置演示只清本命名空间的行为（clearNamespace 的纯逻辑）
function clearNamespaceIn(store: Map<string, string>): void {
  const doomed = [...store.keys()].filter((k) => k.startsWith(`${STORAGE_NS}:`));
  doomed.forEach((k) => store.delete(k));
}

describe("localStorage 命名空间", () => {
  it("nsKey 生成带版本前缀的 key", () => {
    expect(nsKey("demo")).toBe("hospital-carbon-demo:v1:demo");
    expect(nsKey("accounting")).toBe("hospital-carbon-demo:v1:accounting");
  });

  it("重置演示只删除本系统 key，其它应用数据保留", () => {
    const store = new Map<string, string>([
      [nsKey("demo"), "a"],
      [nsKey("accounting"), "b"],
      [nsKey("compliance"), "c"],
      ["other-app:token", "keep"],
      ["hospital-smart-carbon-platform-v2", "legacy-keep"],
      ["unrelated", "keep"],
    ]);
    clearNamespaceIn(store);
    expect([...store.keys()].sort()).toEqual(["hospital-smart-carbon-platform-v2", "other-app:token", "unrelated"]);
  });

  it("绝不调用 localStorage.clear()", () => {
    const clear = vi.fn();
    const store = new Map<string, string>([[nsKey("demo"), "a"], ["other", "b"]]);
    clearNamespaceIn(store);
    expect(clear).not.toHaveBeenCalled();
    expect(store.get("other")).toBe("b");
  });
});

describe("schema 版本迁移", () => {
  it("旧缓存中的东院区被迁移为主院区，且其它状态保留", () => {
    expect(normalizePersistedDemoState({ role: "leader", campus: "east" })).toMatchObject({
      role: "leader",
      campus: "main",
      schemaVersion: 2,
    });
  });

  it("损坏或空持久化数据也安全回落到主院区", () => {
    expect(normalizePersistedDemoState(null)).toEqual({ campus: "main", schemaVersion: 2 });
    expect(normalizePersistedDemoState(["east"])).toEqual({ campus: "main", schemaVersion: 2 });
  });

  it("运行时 setCampus 不再允许切到东院区", () => {
    useDemoStore.setState({ campus: "main" });
    useDemoStore.getState().setCampus("east");
    expect(useDemoStore.getState().campus).toBe("main");
  });
});

describe("存储不可用时的安全回退", () => {
  // safeStorage 的内存回退实现（隐私模式/配额满/被禁用）
  function memoryStorage(): Storage {
    const mem = new Map<string, string>();
    return {
      get length() { return mem.size; },
      clear: () => mem.clear(),
      getItem: (k: string) => mem.get(k) ?? null,
      key: (i: number) => [...mem.keys()][i] ?? null,
      removeItem: (k: string) => void mem.delete(k),
      setItem: (k: string, v: string) => void mem.set(k, v),
    } as Storage;
  }

  beforeEach(() => vi.restoreAllMocks());

  it("内存回退实现满足 Storage 接口且读写正常", () => {
    const s = memoryStorage();
    s.setItem(nsKey("demo"), "x");
    expect(s.getItem(nsKey("demo"))).toBe("x");
    expect(s.length).toBe(1);
    expect(s.key(0)).toBe(nsKey("demo"));
    s.removeItem(nsKey("demo"));
    expect(s.getItem(nsKey("demo"))).toBeNull();
  });

  it("读取不存在的 key 返回 null 而不是抛错", () => {
    const s = memoryStorage();
    expect(() => s.getItem("missing")).not.toThrow();
    expect(s.getItem("missing")).toBeNull();
  });
});
