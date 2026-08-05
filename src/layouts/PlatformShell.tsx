// PC 功能页壳层：顶栏 + 桌面侧栏（按角色权限过滤）+ 内容区。
import { LayoutGrid } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { iconRegistry } from "../components/icons";
import { DemoBadge, Panel, ToastHost } from "../components/kit";
import { moduleCategories, modules, roleMeta, visibleModules } from "../data/navigation";
import { useDemoStore } from "../stores/demo";
import { TopBar } from "./TopBar";

function Icon({ name, size = 15 }: { name: string; size?: number }) {
  const C = iconRegistry[name];
  return C ? <C size={size} strokeWidth={1.8} /> : null;
}

/** 深链接访问当前角色不可见的模块时，展示无权限提示而不是内容（前端 Demo 权限） */
function ModuleGuard() {
  const location = useLocation();
  const { role, allPermissions, setAllPermissions } = useDemoStore();
  const target = modules.find((m) => m.route === location.pathname);
  if (!target || allPermissions || target.roles.includes(role)) return <Outlet />;
  return (
    <Panel title="当前角色无此模块权限">
      <p style={{ fontSize: 12, color: "var(--ink-2)", margin: "0 0 10px" }}>
        模块「{target.name}」不在 <b>{roleMeta[role].name}</b> 的演示权限范围内。
        可切换角色，或开启顶栏「全部权限」查看全部演示模块。
      </p>
      <button className="pf-btn primary" onClick={() => setAllPermissions(true)}>开启全部权限并查看</button>
      <p style={{ fontSize: 10, color: "var(--ink-3)", margin: "10px 0 0" }}>
        说明：这是前端 Demo 权限，仅用于演示不同工作视角，不能替代服务端鉴权。
      </p>
    </Panel>
  );
}

export function PlatformShell() {
  const { role, allPermissions } = useDemoStore();
  const visible = visibleModules(role, allPermissions).filter((m) => m.categoryId !== "cockpit" || m.id === "portal");

  return (
    <div className="app-shell">
      <TopBar />
      <div className="app-body">
        <aside className="app-side" aria-label="模块导航">
          <div className="side-cat">
            <NavLink to="/app/portal" end>
              <LayoutGrid size={15} strokeWidth={1.8} />功能门户
            </NavLink>
          </div>
          {moduleCategories
            .filter((c) => c.id !== "cockpit")
            .map((cat) => {
              const mods = visible.filter((m) => m.categoryId === cat.id);
              if (!mods.length) return null;
              return (
                <div key={cat.id} className="side-cat">
                  <p><Icon name={cat.icon} size={12} />{cat.name}</p>
                  {mods.map((m) => (
                    <NavLink key={m.id} to={m.route}>
                      <Icon name={m.icon} />{m.name}
                    </NavLink>
                  ))}
                </div>
              );
            })}
        </aside>
        <main className="app-main">
          <ModuleGuard />
        </main>
      </div>
      <ToastHost />
      <DemoBadge />
    </div>
  );
}
