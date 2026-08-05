# Engineering guardrails

## Repository boundary

- This repository is independent from `Aiden-2332/shuzhinengtan`.
- Never write, commit, or push changes to the university repository while working here.

## Data layer

- `src/services/timeseries.ts` is the single source of all metrics. Pages must not invent their own numbers.
- Never call `Math.random()` in a render path. Use `src/data/rng.ts` (`unitNoise` / `mulberry32(hashSeed(key))`) so the same inputs always produce the same output.
- Invariants enforced by tests: hospital total = sum of buildings; monthly = sum of daily; 24 hourly points = that day's usage.
- Emission factors live only in `src/data/factors.ts` (`activeFactors`). Never hardcode a factor value in a page; derived fields (annual reduction, payback) must be computed from the same factor, not typed by hand.
- The demo reference date is `demoAsOfDate` in `src/data/config.ts`. Never hardcode "today" anywhere else.
- Keep hospital terminology, metrics, mock data, and workflows in `src/data`.

## State

- Global runtime state: `src/stores/demo.ts` (role, permissions, scene mode, campus, alarms, work orders, projects, page filters).
- Alarm / work-order / project transitions must go through the store methods, which validate against `src/services/machines.ts`.
- Module-specific stores are allowed, but their persist `name` must use `nsKey("<module>")` from `src/data/config.ts` so "reset demo" can clear them.
- Never call `localStorage.clear()`. Only remove keys under the `hospital-carbon-demo:v1:` namespace.

## UI

- Reuse `src/components/kit.tsx` (Panel, Kpi, Delta, Tag, EmptyState, Modal, PageHead) and `src/components/EChart.tsx`. Do not hardcode repeated cards in pages.
- Import lucide icons by name (`import { Zap } from "lucide-react"`). Never `import * as Icons` — it defeats tree-shaking and adds ~780 KB to the bundle. To render an icon from a string name, register it in `src/components/icons.ts`.
- Permission-gated write actions use `canWrite(moduleId, role, allPermissions)` from `src/data/navigation.ts`. Do not scatter role string comparisons across pages.
- PC and large-screen only: minimum target width 1280px. No mobile layouts, hamburger menus, or touch gestures.
- Every button, tab, filter, modal, upload, and export must have real demo behaviour. Nothing that looks clickable may do nothing.

## Compliance and safety

- Standards and factor values must be verified online before being presented as compliance conclusions. Unverified items are shown as editable demo parameters labelled "待标准确认（演示）". See `docs/compliance-sources.md`.
- Medical safety, infection control, oxygen supply, and steam continuity always outrank energy saving. AI output is labelled "模拟诊断" and never triggers automatic control.
- All data is simulated. The UI carries a persistent "DEMO 模拟数据" marker.

## Verification before every delivery

```bash
pnpm lint && pnpm test && pnpm build
node scripts/consistency-check.mjs http://localhost:4173   # after pnpm preview
node scripts/screenshots.mjs http://localhost:4173
```
