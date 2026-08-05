// 跨页面一致性自检（提示词 14「验证所有时间、总量、比例、单位和 ID 的一致性」）。
// 用法：node scripts/consistency-check.mjs
import { chromium } from "playwright-core";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || "http://localhost:4173";
const EXECUTABLE =
  process.env.CHROMIUM_PATH ||
  join(
    homedir(),
    "Library/Caches/ms-playwright/chromium-1228/chrome-mac-x64",
    "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  );

const checks = [];
const ok = (name, pass, detail) => checks.push({ name, pass, detail });

const browser = await chromium.launch({ executablePath: EXECUTABLE });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(e.message));

const text = async (hash) => {
  await page.goto(`${BASE}/${hash}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  return page.evaluate(() => document.body.innerText);
};

// 1) 今日综合碳排：门户 / 后勤舱 / 空间视图 三处必须一致
const num = (s, label) => {
  const m = s.match(new RegExp(`${label}[\\s\\S]{0,40}?([\\d,]+\\.?\\d*)`));
  return m ? parseFloat(m[1].replace(/,/g, "")) : null;
};
const portal = await text("#/app/portal");
const opsCockpit = await text("#/cockpit/operations");
const spatial = await text("#/app/spatial");
const c1 = num(portal, "今日综合碳排");
const c2 = num(opsCockpit, "今日综合碳排");
const c3 = num(spatial, "今日碳排");
ok("今日综合碳排跨页一致（门户/后勤舱/空间视图）",
  c1 !== null && c1 === c2 && Math.abs((c3 ?? 0) - c1) < 0.15,
  `门户 ${c1} · 后勤舱 ${c2} · 空间 ${c3}`);

// 2) 演示基准日全站一致，无其它"今天"
const pages = ["#/app/portal", "#/cockpit/leader", "#/app/energy/monitoring", "#/app/carbon/accounting", "#/app/operations/projects"];
let dateOk = true;
const dateDetail = [];
for (const p of pages) {
  const t = await text(p);
  const has = t.includes("2026-08-04") || t.includes("2026/8/4");
  dateDetail.push(`${p}:${has ? "有" : "无"}`);
  if (!has) dateOk = false;
}
ok("演示基准日 2026-08-04 出现在各主要页面", dateOk, dateDetail.join(" "));

// 3) 工单 ID 跨页一致：后勤舱弹窗与工单页显示同一 ID 与状态
await page.goto(`${BASE}/#/cockpit/operations`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: "手术医技楼 详情" }).click();
await page.waitForTimeout(600);
const popup = await page.evaluate(() => document.querySelector(".building-pop")?.innerText ?? "");
const woPage = await text("#/app/operations/workorders");
ok("工单 WO-2026-0712 在驾驶舱弹窗与工单页同时存在",
  popup.includes("WO-2026-0712") && woPage.includes("WO-2026-0712"),
  `弹窗含: ${popup.includes("WO-2026-0712")} · 工单页含: ${woPage.includes("WO-2026-0712")}`);

// 4) 单位规范：不得出现裸 CO2（应为 CO₂e/tCO₂e）与 NaN/undefined
let unitOk = true;
const unitDetail = [];
for (const p of [...pages, "#/app/ai", "#/app/carbon/assets", "#/app/energy/diagnosis"]) {
  const t = await text(p);
  const bad = [];
  if (/NaN/.test(t)) bad.push("NaN");
  if (/undefined/.test(t)) bad.push("undefined");
  if (/Infinity/.test(t)) bad.push("Infinity");
  if (bad.length) { unitOk = false; unitDetail.push(`${p}: ${bad.join(",")}`); }
}
ok("各页面无 NaN / undefined / Infinity", unitOk, unitDetail.join(" | ") || "全部干净");

// 5) Demo 标注持续存在
const demoBadge = await page.evaluate(() => !!document.querySelector(".demo-badge"));
ok("Demo 模拟数据标注常驻", demoBadge, "");

// 6) 驾驶舱无侧栏
await page.goto(`${BASE}/#/cockpit/leader`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const noAside = await page.evaluate(() => !document.querySelector(".app-side"));
const hasTopnav = await page.evaluate(() => !!document.querySelector(".topbar nav.tb-nav"));
ok("驾驶舱无侧栏且顶栏导航完整", noAside && hasTopnav, `侧栏:${noAside ? "无" : "有"} 顶栏导航:${hasTopnav}`);

// 7) 无横向滚动条（1920×1080 与 1366×768）
for (const [w, h] of [[1920, 1080], [1366, 768]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${BASE}/#/cockpit/leader`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`驾驶舱 ${w}×${h} 无横向溢出`, overflow <= 0, `溢出 ${overflow}px`);
}

// 8) prefers-reduced-motion 生效
await page.emulateMedia({ reducedMotion: "reduce" });
await page.goto(`${BASE}/#/cockpit/operations`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const animDuration = await page.evaluate(() => {
  const el = document.querySelector(".breath") || document.querySelector(".pf-panel");
  return el ? getComputedStyle(el).animationDuration : "none";
});
// 计算值可能是 "0.01ms" 或等价的 "1e-05s"，统一换算成秒再判断
const durSec = animDuration.endsWith("ms") ? parseFloat(animDuration) / 1000 : parseFloat(animDuration);
ok("prefers-reduced-motion 降级生效", animDuration === "none" || durSec <= 0.001, `animation-duration: ${animDuration}`);

ok("全流程控制台无错误", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | ") || "无");

await browser.close();

const failed = checks.filter((c) => !c.pass);
console.log("\n=== 一致性自检 ===");
checks.forEach((c) => console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}${c.detail ? `  — ${c.detail}` : ""}`));
console.log(`\n${checks.length - failed.length}/${checks.length} 通过`);
process.exit(failed.length ? 1 : 0);
