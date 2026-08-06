// 共用顶栏：品牌 / 舱位切换 / 六大分类导航 / 角色切换器 / 全部权限开关 /
// 数据日期 / 全屏 / 返回登录 / 重置演示。
// 3D 环绕开关：3D 方案未通过资产可行性门槛（.max 无合法转换路径），按提示词 10.2 不显示
// 可开启开关，仅在含场景页面显示禁用态说明（tooltip）。
import { Box, Expand, LogOut, MoreHorizontal, RotateCcw, Shrink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { BrandLockup } from "../components/BrandLockup";
import { demoAsOfDate } from "../data/config";
import { moduleCategories, modules, roleMeta, visibleModules } from "../data/navigation";
import { useDemoStore } from "../stores/demo";
import type { RoleId } from "../types/core";

const categoryEntry: Record<string, string> = {
  energy: "/app/energy/monitoring",
  carbon: "/app/carbon/accounting",
  ai: "/app/ai",
  spatial: "/app/spatial",
  ops: "/app/operations/workorders",
  cockpit: "/app/portal",
};

export function TopBar({ cockpitName, withScene = false }: { cockpitName?: string; withScene?: boolean }) {
  const navigate = useNavigate();
  const { role, setRole, allPermissions, setAllPermissions, resetDemo } = useDemoStore();
  const [now, setNow] = useState(() => new Date());
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
        setConfirmReset(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const visible = visibleModules(role, allPermissions);
  const visibleCats = moduleCategories.filter((c) => visible.some((m) => m.categoryId === c.id));

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      setIsFull(false);
    } else {
      void document.documentElement.requestFullscreen();
      setIsFull(true);
    }
  };

  return (
    <header className="topbar">
      <nav className="tb-nav" aria-label="功能分类导航">
        <NavLink to="/cockpit/leader">领导舱</NavLink>
        <NavLink to="/cockpit/operations">后勤舱</NavLink>
        <i style={{ width: 1, height: 16, background: "var(--panel-border)", margin: "0 4px" }} />
        {visibleCats.map((c) => (
          <NavLink key={c.id} to={categoryEntry[c.id]}>{c.name}</NavLink>
        ))}
      </nav>

      <BrandLockup
        className="tb-center-brand"
        title={cockpitName ?? "医院智慧能碳管理平台"}
      />

      <div className="tb-actions">
        <div className="tb-group">
          <span className="tb-label">角色</span>
          <select
            className="pf-select"
            aria-label="演示角色切换"
            value={role}
            onChange={(e) => {
              const nextRole = e.target.value as RoleId;
              setRole(nextRole);
              setAllPermissions(false);
              navigate(roleMeta[nextRole].defaultRoute);
            }}
          >
            {(Object.keys(roleMeta) as RoleId[]).map((r) => (
              <option key={r} value={r}>{roleMeta[r].name}</option>
            ))}
          </select>

          <button
            className={`tb-switch ${allPermissions ? "on" : ""}`}
            style={{ background: "none", border: "none", padding: 0, fontFamily: "inherit" }}
            onClick={() => setAllPermissions(!allPermissions)}
            title="开启后显示并允许操作全部演示模块；关闭后按当前角色权限矩阵展示（仅前端 Demo 权限，不能替代服务端鉴权）"
          >
            <i />全部权限
          </button>

          {withScene && (
            <span
              className="tb-switch disabled"
              title="3D 环绕暂不可用：夜景.zip 为 3ds Max 源文件，当前环境无合法转换路径，待提供可导出的 GLB（见 IMPLEMENTATION_GAPS.md）。当前为静态夜景模式，全部交互可用。"
            >
              <Box size={12} />3D 环绕
            </span>
          )}
        </div>

        <div className="tb-clock" title={`演示数据基准日 ${demoAsOfDate}`}>
          {now.toLocaleTimeString("zh-CN", { hour12: false })}
          <em>数据 {demoAsOfDate} 14:30 更新 · 实时(模拟)</em>
        </div>

        <div className="tb-group">
          <button className="tb-iconbtn" onClick={toggleFullscreen} title="全屏" aria-label="全屏切换">
            {isFull ? <Shrink size={15} /> : <Expand size={15} />}
          </button>
          <div className="tb-more" ref={moreRef}>
            <button className="tb-iconbtn" onClick={() => setMoreOpen((o) => !o)} aria-label="更多菜单">
              <MoreHorizontal size={16} />
            </button>
            {moreOpen && (
              <div className="tb-menu fadeup">
                {modules.filter((m) => m.categoryId === "cockpit").map((m) => (
                  <NavLink key={m.id} to={m.route} onClick={() => setMoreOpen(false)}>{m.name}</NavLink>
                ))}
                <button
                  onClick={() => {
                    if (!confirmReset) {
                      setConfirmReset(true);
                      return;
                    }
                    resetDemo();
                    setConfirmReset(false);
                    setMoreOpen(false);
                  }}
                  style={confirmReset ? { color: "var(--red)" } : undefined}
                >
                  <RotateCcw size={13} />
                  {confirmReset ? "再次点击确认重置（仅清本系统数据）" : "重置演示"}
                </button>
                <button onClick={() => { setMoreOpen(false); navigate("/login"); }}>
                  <LogOut size={13} />返回登录
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
