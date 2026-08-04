import * as Icons from "lucide-react";
import { useState, type ComponentType } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { ToastHost } from "../components/ui";
import { navItems } from "../data/hospital";
import { modulePages } from "../data/module-pages";
import { usePlatformStore } from "../stores/platform";
import type { DemoState, GlobalFilters, Role } from "../types/domain";

type IconName = keyof typeof Icons;
type RouteInfo = { title: string; subtitle: string; navId: string };

const routeByNavId: Record<string, string> = {
  leader: "/dashboard",
  operations: "/operations",
  energy: "/energy",
  department: "/department",
  systems: "/systems",
  equipment: "/equipment",
  carbon: "/carbon/accounting",
  alarms: "/alarms",
  ai: "/ai",
  projects: "/projects",
  quality: "/quality",
};

const carbonNav = [
  { path: "/carbon/accounting", label: "碳核算工作台", icon: Icons.Calculator },
  { path: "/carbon/assets", label: "碳资产管理", icon: Icons.WalletCards },
  { path: "/carbon/mrv", label: "MRV 合规凭证", icon: Icons.FileSearch2 },
];

const carbonRouteInfo: Record<string, RouteInfo> = {
  "/carbon/accounting": { title: "碳核算工作台", subtitle: "医院活动数据归集、核算、复核与合规报告", navId: "carbon" },
  "/carbon/assets": { title: "碳资产管理", subtitle: "碳预算、绿电绿证、碳信用与减排项目统筹", navId: "carbon" },
  "/carbon/mrv": { title: "MRV 合规凭证看板", subtitle: "监测、报告、核查与证据归档全链路溯源", navId: "carbon" },
};

function AppIcon({ name, size = 18 }: { name: string; size?: number }) {
  const Icon = Icons[name as IconName] as ComponentType<{ size?: number; strokeWidth?: number }>;
  return Icon ? <Icon size={size} strokeWidth={1.8} /> : null;
}

function getRouteInfo(pathname: string): RouteInfo {
  if (carbonRouteInfo[pathname]) return carbonRouteInfo[pathname];
  const entry = Object.entries(routeByNavId).find(([, path]) => path === pathname);
  const navId = entry?.[0] ?? "leader";
  const item = navItems.find((nav) => nav.id === navId) ?? navItems[0];
  const config = modulePages[navId];
  return { title: config?.title ?? item.label, subtitle: config?.subtitle ?? "全院能源、碳排放与医疗运营协同总览", navId };
}

export function AppLayout() {
  const location = useLocation();
  const current = getRouteInfo(location.pathname);
  const isCarbon = location.pathname.startsWith("/carbon/");
  const { filters, setFilter, role, setRole, theme, toggleTheme, demoState, setDemoState } = usePlatformStore();
  const [userOpen, setUserOpen] = useState(false);

  return <div className="platform-shell original-app-shell" data-theme={theme}>
    <aside className="original-aside" aria-label="平台主导航">
      <NavLink to="/dashboard" className="brand-mark" title="返回领导驾驶舱"><Icons.Cross size={23} /></NavLink>
      <nav>{navItems.map((item) => <NavLink
        key={item.id}
        to={routeByNavId[item.id]}
        className={current.navId === item.id ? "active" : ""}
        title={item.id === "carbon" ? "碳管理" : item.label}
      ><AppIcon name={item.icon} /><span>{item.id === "carbon" ? "碳管理" : item.label}</span></NavLink>)}</nav>
      <button className="aside-help" title="帮助中心" aria-label="帮助中心"><Icons.CircleHelp size={19} /></button>
    </aside>

    <div className="original-main-shell">
      <header className="original-topbar">
        <div className="brand"><span>医碳智擎</span><i>HOSPITAL ENERGY &amp; CARBON OS</i></div>
        <div className="page-title"><b>{current.title}</b><span>{current.navId === "leader" ? "院级运营总览" : current.subtitle}</span></div>
        <div className="top-actions">
          <label className="top-select"><Icons.MapPin size={15} /><select aria-label="医院选择" value={filters.hospital} onChange={(event) => setFilter("hospital", event.target.value as GlobalFilters["hospital"])}><option>总院</option><option>东院区</option><option>西院区</option></select></label>
          <label className="top-select"><Icons.CalendarDays size={15} /><select aria-label="年度选择" value={filters.year} onChange={(event) => setFilter("year", Number(event.target.value) as GlobalFilters["year"])}><option value={2024}>2024 年</option><option value={2025}>2025 年</option><option value={2026}>2026 年</option></select></label>
          <label className="top-select compact-control"><Icons.Layers3 size={15} /><select aria-label="核算范围" value={filters.scope} onChange={(event) => setFilter("scope", event.target.value as GlobalFilters["scope"])}><option>全院</option><option>院区</option><option>楼宇</option><option>科室</option></select></label>
          <label className={`top-select mode-control ${filters.mode === "正式核算" ? "formal" : ""}`}><i /><select aria-label="核算模式" value={filters.mode} onChange={(event) => setFilter("mode", event.target.value as GlobalFilters["mode"])}><option>实时估算</option><option>正式核算</option></select></label>
          {isCarbon && <label className="top-select data-state-control" title="页面状态验收"><select aria-label="页面状态验收" value={demoState} onChange={(event) => setDemoState(event.target.value as DemoState)}><option value="normal">正常</option><option value="loading">加载</option><option value="empty">空数据</option><option value="error">网络错误</option><option value="noPermission">无权限</option><option value="unauthorized">未登录</option></select></label>}
          <button aria-label="切换主题" onClick={toggleTheme}>{theme === "dark" ? <Icons.Sun size={16} /> : <Icons.Moon size={16} />}</button>
          <button aria-label="消息通知"><Icons.Bell size={17} /><em>3</em></button>
          <div className="platform-user-menu">
            <button className="platform-avatar" aria-label="用户与角色菜单" onClick={() => setUserOpen((open) => !open)}>{role.slice(0, 1)}</button>
            {userOpen && <div className="platform-user-popover"><p>当前登录角色</p>{(["管理员", "核算员", "审核员", "核查员"] as Role[]).map((item) => <button key={item} className={role === item ? "active" : ""} onClick={() => { setRole(item); setUserOpen(false); }}>{item}{role === item && <i />}</button>)}</div>}
          </div>
        </div>
      </header>

      <main className="original-page-main">
        <div className="content-head"><div><p>HOSPITAL ENERGY &amp; CARBON COMMAND</p><h1>{current.title}</h1></div><div className="content-status"><span><i className="ok" />系统运行正常</span><small>{filters.year} · {filters.hospital} · {filters.scope} · 数据更新 14:32:18</small></div></div>
        {isCarbon && <nav className="carbon-context-nav" aria-label="碳管理功能导航">{carbonNav.map((item) => { const Icon = item.icon; return <NavLink key={item.path} to={item.path} className={({ isActive }) => isActive ? "active" : ""}><Icon size={15} /><span>{item.label}</span></NavLink>; })}<span className="carbon-context-meta"><Icons.ShieldCheck size={14} />{filters.mode} · {role}</span></nav>}
        <Outlet />
      </main>
    </div>
    <ToastHost />
  </div>;
}
