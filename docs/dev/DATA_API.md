# 模块页面开发约定（内部开发文档）

本文档写给并行实现模块页面的开发者。先读完本文，再读 `docs/dev/MASTER_SPEC.md` 中你负责的小节。

## 任务目标

把分配给你的页面文件从"演示占位"实现为完整可演示模块。

## 范围（含不做什么）

- 只修改分配给你的页面文件；可以新建 `src/stores/<你的模块>.ts` 或 `src/data/modules/<你的模块>.ts`。
- 禁止修改以下共享文件：`src/App.tsx`、`src/main.tsx`、`src/platform.css`、`src/components/*`、`src/layouts/*`、`src/stores/demo.ts`、`src/data/`（根级文件）、`src/services/`、`src/types/`、`package.json`、`vite.config.ts`。
- 不新增 npm 依赖。
- 不做手机端布局。目标宽度 ≥1280px，重点 1366×768 与 1920×1080。
- 不使用外部 URL 资源（图片/字体/CDN/API）。

## 数据层 API（必须用，禁止自造随机数据）

所有时序与指标从 `src/services/timeseries.ts` 取，确定性（同参同值）、层级一致（总量=分项和）：

```ts
import { dailyUsage, dailySeries, monthlySeries, hourlySeries, dailyCarbonKg,
  hospitalDailyCarbonT, dailyCarbonSeries, monthlyCarbonSeries, forecastDailyCarbon,
  realtimePowerKw, sumUsage, yoyPct, toTce, tempOfDate, outpatientVisits,
  surgeryCount, bedOccupancy } from "../../services/timeseries";
```

- `EnergyKind`: `"electricity" | "water" | "gas" | "heat" | "medgas"`，单位分别 kWh / m³ / m³ / GJ / m³。
- 日期一律 `"YYYY-MM-DD"` 字符串；演示基准日 `demoAsOfDate = "2026-08-04"`（从 `src/data/config.ts` 导入，禁止硬编码"今天"）。
- 静态领域数据：`src/data/buildings.ts`（10 楼宇+锚点）、`devices.ts`、`alarms.ts`、`workorders.ts`、`projects.ts`、`anomalies.ts`（10 条异常链，全链路关联 ID）、`factors.ts`（排放因子，verified=false 项 UI 必须标"待标准确认（演示）"）、`config.ts`（单价、折标煤系数 `energyKindMeta`）。
- 需要确定性伪随机时用 `src/data/rng.ts` 的 `unitNoise(key)`/`mulberry32(hashSeed(key))`，禁止 `Math.random()`。

## 运行时状态

全局 store `src/stores/demo.ts`（zustand persist，命名空间 hospital-carbon-demo:v1）：

```ts
const { role, allPermissions, alarms, workOrders, projects,
  transitionAlarm, transitionWorkOrder, addProject, setProjectStage,
  pageFilters, setPageFilter, pushToast } = useDemoStore();
```

- 告警/工单/项目的修改必须走 store 的 transition 方法（内部走状态机校验）。
- 页面筛选条件要持久化：`pageFilters["你的页面id"]` + `setPageFilter`。
- 写操作按钮用 `canWrite(moduleId, role, allPermissions)`（`src/data/navigation.ts`）决定禁用；moduleId 见同文件 modules 表。
- 你若需要模块内复杂状态（如核算批次、凭证列表），新建自己的 zustand persist store，`name` 必须用 `nsKey("你的模块")`（从 `src/data/config.ts` 导入 `nsKey`）。

## UI 组件（必须复用，禁止手写重复卡片）

`src/components/kit.tsx`：`Panel`（标题面板）、`Kpi`、`Delta`（同比箭头）、`Tag`（ok/warn/danger/info/muted）、`EmptyState`、`Modal`、`PageHead`。
`src/components/EChart.tsx`：`EChart`（统一暗色主题/tooltip/自动 resize/清理），`CHART_COLORS`。

CSS 类（`src/platform.css` 已有，直接用）：`grid cols-2/3/4/5/6`、`pf-table`、`pf-btn`（primary/ghost/danger）、`pf-input`、`pf-select`、`num`（等宽数字）。

页面骨架示例：

```tsx
<PageHead title="模块名" sub="副标题" actions={<button className="pf-btn">…</button>} />
<div className="grid cols-4">{/* Kpi */}</div>
<div className="grid cols-2" style={{ marginTop: 10 }}>
  <Panel title="…"><EChart height={240} option={…} /></Panel>
</div>
```

## 强制规则

1. 所有按钮/Tab/筛选/搜索/弹窗/导出必须有真实演示行为，禁止"看起来能点但无反应"。
2. 导出用动态 `import("../../utils/downloads")`（已有 `downloadBlob`/`downloadCsv`/`downloadWorkbook`，xlsx 走 `downloadWorkbook`；PDF 用带"Demo 模拟"字样的 HTML/文本 Blob 占位并注明），内容必须与当前筛选一致。
3. 图表必须有单位、图例（多序列时）、tooltip；空数据用 `EmptyState`，不画误导曲线。
4. AI/诊断类内容必须标"模拟诊断"，含证据、置信度、人工确认动作；医疗安全相关必须标注"不影响医疗安全/保障优先"。
5. 数字来自数据层计算，禁止手写互相矛盾的百分比。
6. 中文界面、克制风格：只用已有设计令牌颜色，红色只用于高风险。
7. 图标只用 `lucide-react` 具名导入（`import { X } from "lucide-react"`），禁止 `import * as`。
8. 组件命名/导出名必须与脚手架文件一致（App.tsx 已按该名字 lazy 引入）。

## 验证方法（完成前必须执行）

```bash
cd /Users/paul/work/hospital-smart-carbon
npx tsc --noEmit -p tsconfig.app.json   # 必须 0 错误
npx eslint src/pages/<你的文件>          # 必须 0 错误（警告要尽量清）
```

## 输出格式

完成后返回：修改/新建的文件清单、实现的功能点列表、未尽事项（如有）。
