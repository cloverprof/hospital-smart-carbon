// 功能门户（提示词 6.6.3）：紧凑工作型入口。按角色与六大板块展示模块；
// 搜索、最近访问、待办、告警与数据更新时间。
import { BellRing, ClipboardList, Leaf, Search, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { iconRegistry } from "../components/icons";
import { Kpi, Panel, Tag } from "../components/kit";
import { demoAsOfDate, HOSPITAL_NAME } from "../data/config";
import { moduleCategories, moduleById, roleMeta, visibleModules } from "../data/navigation";
import { useDemoStore } from "../stores/demo";
import { hospitalDailyCarbonT, realtimePowerKw } from "../services/timeseries";

function Icon({ name, size = 17 }: { name: string; size?: number }) {
  const C = iconRegistry[name];
  return C ? <C size={size} strokeWidth={1.8} /> : null;
}

export function PortalPage() {
  const { role, allPermissions, recentModuleIds, alarms, workOrders, touchModule } = useDemoStore();
  const [query, setQuery] = useState("");

  const visible = useMemo(() => visibleModules(role, allPermissions).filter((m) => m.id !== "portal"), [role, allPermissions]);
  const filtered = query.trim()
    ? visible.filter((m) => m.name.includes(query.trim()) || m.summary.includes(query.trim()))
    : visible;

  const pendingAlarms = alarms.filter((a) => a.status === "pending" || a.status === "processing").length;
  const openOrders = workOrders.filter((w) => w.status !== "closed").length;
  const todayCarbon = hospitalDailyCarbonT(demoAsOfDate);
  const nowKw = realtimePowerKw(14.5 * 3600);
  const recent = recentModuleIds.map((id) => moduleById[id]).filter((m) => m && visible.some((v) => v.id === m.id));

  return (
    <>
      <div className="portal-hero">
        <div>
          <h2>功能门户 · {HOSPITAL_NAME}</h2>
          <p>
            当前角色：{roleMeta[role].name} · {roleMeta[role].desc}
            {allPermissions && " ·（全部权限已开启）"} · 数据更新 {demoAsOfDate} 14:30
          </p>
        </div>
        <div className="portal-search">
          <Search size={14} />
          <input
            className="pf-input"
            placeholder="搜索模块名称或能力…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="搜索模块"
          />
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 12 }}>
        <Kpi label="今日综合碳排" value={todayCarbon.toFixed(1)} unit="tCO₂e" tone="cyan" icon={<Leaf size={13} />} />
        <Kpi label="当前总负荷（模拟）" value={(nowKw / 1000).toFixed(2)} unit="MW" icon={<Zap size={13} />} />
        <Kpi label="待处理告警" value={pendingAlarms} unit="条" tone={pendingAlarms > 5 ? "amber" : "green"} icon={<BellRing size={13} />} />
        <Kpi label="进行中工单" value={openOrders} unit="单" icon={<ClipboardList size={13} />} />
      </div>

      {recent.length > 0 && !query && (
        <Panel title="最近访问" className="fadeup" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {recent.map((m) => (
              <Link key={m.id} to={m.route} onClick={() => touchModule(m.id)} className="pf-btn ghost">
                <Icon name={m.icon} size={13} />{m.name}
              </Link>
            ))}
          </div>
        </Panel>
      )}

      {moduleCategories.map((cat) => {
        const mods = filtered.filter((m) => m.categoryId === cat.id);
        if (!mods.length) return null;
        return (
          <section key={cat.id} style={{ marginBottom: 16 }}>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name={cat.icon} size={13} />{cat.name}
              <Tag tone="muted">{mods.length} 个模块</Tag>
            </p>
            <div className="grid cols-3">
              {mods.map((m) => (
                <Link key={m.id} to={m.route} className="module-card" onClick={() => touchModule(m.id)}>
                  <span className="mc-icon"><Icon name={m.icon} /></span>
                  <span>
                    <b>{m.name}</b>
                    <p>{m.summary}</p>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      {filtered.length === 0 && (
        <Panel title="搜索结果">
          <p style={{ color: "var(--ink-3)", fontSize: 12 }}>
            没有匹配“{query}”的模块。当前角色（{roleMeta[role].name}）可见 {visible.length} 个模块；开启顶栏「全部权限」可查看全部。
          </p>
        </Panel>
      )}
    </>
  );
}
