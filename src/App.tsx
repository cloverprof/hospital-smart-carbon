import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ModulePage } from "./ModulePage";
import { modulePages } from "./data/module-pages";
import { AppLayout } from "./layouts/AppLayout";
import { DashboardHome } from "./pages/DashboardHome";

const CarbonAccountingPage = lazy(() => import("./pages/CarbonAccounting").then((module) => ({ default: module.CarbonAccountingPage })));
const CarbonAssetsPage = lazy(() => import("./pages/CarbonAssets").then((module) => ({ default: module.CarbonAssetsPage })));
const MRVTraceabilityPage = lazy(() => import("./pages/MRVTraceability").then((module) => ({ default: module.MRVTraceabilityPage })));

function CarbonRoute({ children, label }: { children: React.ReactNode; label: string }) {
  return <Suspense fallback={<div className="route-loading">正在加载{label}…</div>}>{children}</Suspense>;
}

export default function App() {
  return <Routes>
    <Route element={<AppLayout />}>
      <Route index element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<DashboardHome />} />
      {Object.entries(modulePages).map(([key, config]) => <Route key={key} path={`/${key}`} element={<ModulePage config={config} />} />)}
      <Route path="/carbon" element={<Navigate to="/carbon/accounting" replace />} />
      <Route path="/carbon/accounting" element={<CarbonRoute label="碳核算工作台"><CarbonAccountingPage /></CarbonRoute>} />
      <Route path="/carbon/assets" element={<CarbonRoute label="碳资产管理"><CarbonAssetsPage /></CarbonRoute>} />
      <Route path="/carbon/mrv" element={<CarbonRoute label="MRV 合规凭证看板"><MRVTraceabilityPage /></CarbonRoute>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Route>
  </Routes>;
}
