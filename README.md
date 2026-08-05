# 医碳智擎｜医院智慧能碳管理平台

面向院领导、后勤负责人、科室负责人、能源管理员四类角色的医院智慧能碳管理演示系统。
PC 与大屏专用（≥1280px），全部为 Demo 模拟数据，不连接真实监管、医疗、设备控制或 AI 服务。

## 快速开始

```bash
pnpm install
pnpm dev        # 开发（端口取 DEPLOY_RUN_PORT，默认 5000）
pnpm test       # 单元测试（计算器/状态机/数据一致性）
pnpm lint       # ESLint
pnpm build      # 类型检查 + 生产构建 → dist/
pnpm preview    # 本地预览 dist
```

Node ≥ 20；包管理器 pnpm（`npm i -g pnpm`）。

## 入口与路由（Hash 路由）

首屏为登录页（不接真实认证），表单下方三个演示入口：

| 入口 | 路由 | 默认角色 | 全部权限 |
|---|---|---|---|
| 领导舱演示 | `#/cockpit/leader` | 院领导 | 关 |
| 后勤舱演示 | `#/cockpit/operations` | 后勤负责人 | 关 |
| PC端演示 | `#/app/portal` | 能源管理员 | 开 |

PC 功能页（带侧栏）：`#/app/energy/monitoring|diagnosis|medical-gas|key-areas|calendar`、
`#/app/carbon/accounting|green-rating|assets|compliance`、`#/app/ai`、`#/app/spatial`、
`#/app/operations/workorders|inspection|projects`、`#/app/portal`。

## 部署（静态托管，无需服务端）

构建产物 `dist/` 为纯静态文件，Hash 路由不需要 SPA rewrite，刷新深链接不会 404。

- **根路径**：直接把 `dist/` 内容放到站点根目录。
- **子目录**：默认 `base: "./"`（相对路径）即可放任意子目录，如 `https://host/carbon/`。
  需要绝对路径时：`VITE_BASE_PATH=/carbon/ pnpm build`。
- **离线内网**：`python3 -m http.server 8080 -d dist` 或任意静态服务器；系统零外部依赖（无 CDN/在线字体/外部 API），断网可完整演示。
- 不承诺 `file://` 双击直开（浏览器对 module script 的限制），请用任意静态服务器。

## 角色与权限（前端 Demo）

顶栏含角色切换器（4 角色）与独立"全部权限"开关；权限矩阵集中在 `src/data/navigation.ts`。
仅为演示不同工作视角，不能替代服务端鉴权。

## 数据与持久化

- 确定性模拟数据引擎：`src/services/timeseries.ts`（基准日 2026-08-04，见 `docs/DATA_DICTIONARY.md`）。
- 筛选、工单、项目、核算批次等写入 `localStorage`（命名空间 `hospital-carbon-demo:v1:*`）；顶栏"更多 → 重置演示"恢复初始状态（只清本系统命名空间）。

## 文档

- 演示脚本：`docs/DEMO_SCRIPT.md`
- 数据字典：`docs/DATA_DICTIONARY.md`
- 合规来源核验：`docs/compliance-sources.md`
- 关键决策：`docs/DECISIONS.md`
- 性能报告：`docs/performance-report.md`
- 实现差距：`IMPLEMENTATION_GAPS.md`
- 测试结果摘要：`docs/TEST_SUMMARY.md`
- 截图索引：`docs/screenshots/README.md`

## 技术栈

React 19 · TypeScript · Vite 6 · React Router 7（Hash）· Zustand（persist）· ECharts 6 · Tailwind CSS 4 · lucide-react · vitest。
