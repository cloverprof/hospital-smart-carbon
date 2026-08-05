// 确定性伪随机：同一 seed 同一序列，禁止在渲染路径使用 Math.random()。

/** FNV-1a 字符串散列 → 32 位种子 */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32：返回 [0,1) 均匀分布的确定性序列 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 便捷：由 key 得到单个确定性 [0,1) 值 */
export function unitNoise(key: string): number {
  return mulberry32(hashSeed(key))();
}

/** 便捷：由 key 得到 [-1,1] 平滑噪声 */
export function signedNoise(key: string): number {
  return unitNoise(key) * 2 - 1;
}
