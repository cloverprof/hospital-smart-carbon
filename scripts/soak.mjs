// 30 分钟大屏长时运行测试（提示词 14）：记录帧率、内存、DOM 规模、错误与 WebGL 事件。
// 用法：pnpm preview 后 node scripts/soak.mjs [baseUrl] [分钟数]
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || "http://localhost:4173";
const MINUTES = Number(process.argv[3] || 30);
const EXECUTABLE =
  process.env.CHROMIUM_PATH ||
  join(
    homedir(),
    "Library/Caches/ms-playwright/chromium-1228/chrome-mac-x64",
    "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  );

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ["--js-flags=--expose-gc"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(`${BASE}/#/cockpit/operations`, { waitUntil: "networkidle" });

await page.evaluate(() => {
  window.__soak = { fps: [], contextLost: 0 };
  document.querySelectorAll("canvas").forEach((c) =>
    c.addEventListener("webglcontextlost", () => window.__soak.contextLost++),
  );
  let frames = 0;
  let winStart = performance.now();
  const loop = () => {
    frames++;
    const now = performance.now();
    if (now - winStart >= 1000) {
      window.__soak.fps.push(Math.round((frames * 1000) / (now - winStart)));
      frames = 0;
      winStart = now;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});

const samples = [];
const totalSamples = MINUTES; // 每分钟一次
for (let i = 0; i <= totalSamples; i++) {
  const s = await page.evaluate(() => ({
    heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    nodes: document.querySelectorAll("*").length,
    listeners: document.querySelectorAll("button").length,
    contextLost: window.__soak.contextLost,
  }));
  samples.push({ minute: i, ...s });
  console.log(`[${i}min] heap ${s.heapMB}MB nodes ${s.nodes} contextLost ${s.contextLost}`);
  // 每 5 分钟切换一次 Tab，模拟真实值守操作
  if (i > 0 && i % 5 === 0) {
    const tabs = await page.locator(".cockpit-tabs button").all();
    if (tabs.length) await tabs[i % tabs.length].click().catch(() => {});
  }
  if (i < totalSamples) await page.waitForTimeout(60000);
}

const fps = await page.evaluate(() => window.__soak.fps);
const sorted = [...fps].sort((a, b) => a - b);
const p1 = sorted[Math.floor(sorted.length * 0.01)] ?? sorted[0];
const report = {
  durationMinutes: MINUTES,
  fpsAvg: Math.round(fps.reduce((a, b) => a + b, 0) / fps.length),
  fpsMin: Math.min(...fps),
  fps1PercentLow: p1,
  fpsSampleCount: fps.length,
  heapStartMB: samples[0].heapMB,
  heapEndMB: samples[samples.length - 1].heapMB,
  heapMaxMB: Math.max(...samples.map((s) => s.heapMB ?? 0)),
  nodesStart: samples[0].nodes,
  nodesEnd: samples[samples.length - 1].nodes,
  contextLost: samples[samples.length - 1].contextLost,
  errors,
  samples,
};

writeFileSync("docs/soak-result.json", JSON.stringify(report, null, 2));
console.log("\n=== 结果 ===");
console.log(JSON.stringify({ ...report, samples: `${samples.length} 条已写入 docs/soak-result.json` }, null, 2));
await browser.close();
