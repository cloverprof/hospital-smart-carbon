import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { PlatformShell } from "./layouts/PlatformShell";
import { LoginPage } from "./pages/Login";
import { PortalPage } from "./pages/Portal";

// 驾驶舱与重型模块按路由动态加载，避免打入登录页首包
const LeaderCockpit = lazy(() => import("./pages/cockpit/Leader").then((m) => ({ default: m.LeaderCockpit })));
const OperationsCockpit = lazy(() => import("./pages/cockpit/Operations").then((m) => ({ default: m.OperationsCockpit })));
const EnergyMonitoringPage = lazy(() => import("./pages/energy/Monitoring").then((m) => ({ default: m.EnergyMonitoringPage })));
const EnergyDiagnosisPage = lazy(() => import("./pages/energy/Diagnosis").then((m) => ({ default: m.EnergyDiagnosisPage })));
const MedicalGasPage = lazy(() => import("./pages/energy/MedicalGas").then((m) => ({ default: m.MedicalGasPage })));
const KeyAreasPage = lazy(() => import("./pages/energy/KeyAreas").then((m) => ({ default: m.KeyAreasPage })));
const EnergyCalendarPage = lazy(() => import("./pages/energy/EnergyCalendar").then((m) => ({ default: m.EnergyCalendarPage })));
const CarbonAccountingV2Page = lazy(() => import("./pages/carbon/Accounting").then((m) => ({ default: m.CarbonAccountingV2Page })));
const GreenRatingPage = lazy(() => import("./pages/carbon/GreenRating").then((m) => ({ default: m.GreenRatingPage })));
const CarbonAssetsV2Page = lazy(() => import("./pages/carbon/Assets").then((m) => ({ default: m.CarbonAssetsV2Page })));
const CompliancePage = lazy(() => import("./pages/carbon/Compliance").then((m) => ({ default: m.CompliancePage })));
const AiCenterPage = lazy(() => import("./pages/AiCenter").then((m) => ({ default: m.AiCenterPage })));
const SpatialPage = lazy(() => import("./pages/Spatial").then((m) => ({ default: m.SpatialPage })));
const WorkOrdersPage = lazy(() => import("./pages/operations/WorkOrders").then((m) => ({ default: m.WorkOrdersPage })));
const InspectionPage = lazy(() => import("./pages/operations/Inspection").then((m) => ({ default: m.InspectionPage })));
const ProjectLibraryPage = lazy(() => import("./pages/operations/ProjectLibrary").then((m) => ({ default: m.ProjectLibraryPage })));

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div className="route-loading" style={{ padding: 24, color: "var(--ink-3)", fontSize: 12 }}>正在加载模块…</div>}>{children}</Suspense>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/cockpit/leader" element={<Lazy><LeaderCockpit /></Lazy>} />
      <Route path="/cockpit/operations" element={<Lazy><OperationsCockpit /></Lazy>} />
      <Route path="/app" element={<PlatformShell />}>
        <Route index element={<Navigate to="/app/portal" replace />} />
        <Route path="portal" element={<PortalPage />} />
        <Route path="energy/monitoring" element={<Lazy><EnergyMonitoringPage /></Lazy>} />
        <Route path="energy/diagnosis" element={<Lazy><EnergyDiagnosisPage /></Lazy>} />
        <Route path="energy/medical-gas" element={<Lazy><MedicalGasPage /></Lazy>} />
        <Route path="energy/key-areas" element={<Lazy><KeyAreasPage /></Lazy>} />
        <Route path="energy/calendar" element={<Lazy><EnergyCalendarPage /></Lazy>} />
        <Route path="carbon" element={<Navigate to="/app/carbon/accounting" replace />} />
        <Route path="carbon/accounting" element={<Lazy><CarbonAccountingV2Page /></Lazy>} />
        <Route path="carbon/green-rating" element={<Lazy><GreenRatingPage /></Lazy>} />
        <Route path="carbon/assets" element={<Lazy><CarbonAssetsV2Page /></Lazy>} />
        <Route path="carbon/compliance" element={<Lazy><CompliancePage /></Lazy>} />
        <Route path="ai" element={<Lazy><AiCenterPage /></Lazy>} />
        <Route path="spatial" element={<Lazy><SpatialPage /></Lazy>} />
        <Route path="operations" element={<Navigate to="/app/operations/workorders" replace />} />
        <Route path="operations/workorders" element={<Lazy><WorkOrdersPage /></Lazy>} />
        <Route path="operations/inspection" element={<Lazy><InspectionPage /></Lazy>} />
        <Route path="operations/projects" element={<Lazy><ProjectLibraryPage /></Lazy>} />
      </Route>
      {/* 旧路由兼容跳转 */}
      <Route path="/dashboard" element={<Navigate to="/cockpit/leader" replace />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
