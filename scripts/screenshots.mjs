// 生成关键分辨率截图（交付物 docs/screenshots/）。
// 用法：pnpm preview 后 node scripts/screenshots.mjs [baseUrl]
// 依赖本机已缓存的 Chromium（playwright-core 不自带浏览器）。
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] || "http://localhost:4173";
const OUT = "docs/screenshots";
const EXECUTABLE =
  process.env.CHROMIUM_PATH ||
  join(
    homedir(),
    "Library/Caches/ms-playwright/chromium-1228/chrome-mac-x64",
    "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  );

const SHOTS = [
  { name: "login-1920x1080", w: 1920, h: 1080, hash: "#/login" },
  { name: "portal-1366x768", w: 1366, h: 768, hash: "#/app/portal" },
  { name: "leader-1920x1080", w: 1920, h: 1080, hash: "#/cockpit/leader" },
  { name: "leader-popup-1920x1080", w: 1920, h: 1080, hash: "#/cockpit/leader", clickPlate: "手术医技楼 详情" },
  { name: "leader-2560x1080", w: 2560, h: 1080, hash: "#/cockpit/leader" },
  { name: "operations-1920x1080", w: 1920, h: 1080, hash: "#/cockpit/operations" },
  { name: "operations-popup-1920x1080", w: 1920, h: 1080, hash: "#/cockpit/operations", clickPlate: "手术医技楼 详情" },
  { name: "operations-3440x1440", w: 3440, h: 1440, hash: "#/cockpit/operations" },
  { name: "operations-3840x1080", w: 3840, h: 1080, hash: "#/cockpit/operations" },
  { name: "monitoring-1440x900", w: 1440, h: 900, hash: "#/app/energy/monitoring" },
  { name: "diagnosis-1920x1080", w: 1920, h: 1080, hash: "#/app/energy/diagnosis" },
  { name: "medical-gas-1440x900", w: 1440, h: 900, hash: "#/app/energy/medical-gas" },
  { name: "key-areas-1440x900", w: 1440, h: 900, hash: "#/app/energy/key-areas" },
  { name: "calendar-1440x900", w: 1440, h: 900, hash: "#/app/energy/calendar" },
  { name: "accounting-1440x900", w: 1440, h: 900, hash: "#/app/carbon/accounting" },
  { name: "green-rating-1440x900", w: 1440, h: 900, hash: "#/app/carbon/green-rating" },
  { name: "carbon-assets-1440x900", w: 1440, h: 900, hash: "#/app/carbon/assets" },
  { name: "compliance-1440x900", w: 1440, h: 900, hash: "#/app/carbon/compliance" },
  { name: "ai-center-1920x1080", w: 1920, h: 1080, hash: "#/app/ai" },
  { name: "spatial-1920x1080", w: 1920, h: 1080, hash: "#/app/spatial" },
  { name: "workorders-1920x1080", w: 1920, h: 1080, hash: "#/app/operations/workorders" },
  { name: "inspection-1440x900", w: 1440, h: 900, hash: "#/app/operations/inspection" },
  { name: "projects-1440x900", w: 1440, h: 900, hash: "#/app/operations/projects" },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: EXECUTABLE });
const consoleErrors = [];

for (const shot of SHOTS) {
  const page = await browser.newPage({ viewport: { width: shot.w, height: shot.h }, deviceScaleFactor: 1 });
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(`${shot.name}: ${m.text()}`));
  page.on("pageerror", (e) => consoleErrors.push(`${shot.name}: ${e.message}`));
  await page.goto(`${BASE}/${shot.hash}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2200); // 等图表动画完成
  if (shot.clickPlate) {
    await page.getByRole("button", { name: shot.clickPlate }).click();
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: `${OUT}/${shot.name}.png` });
  console.log("saved", shot.name);
  await page.close();
}

await browser.close();
console.log(consoleErrors.length ? `\n控制台错误 ${consoleErrors.length} 条:\n${consoleErrors.join("\n")}` : "\n无控制台错误");
