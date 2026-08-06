// 初始登录页（提示词 5.1）：账号/密码/登录按钮 + 三条固定文字的蓝色下划线演示入口。
// 不接真实认证、不保存输入、无验证码。
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BrandLockup } from "../components/BrandLockup";
import { PRODUCT_FULL_NAME, demoAsOfDate } from "../data/config";
import { useDemoStore } from "../stores/demo";

const NIGHT_IMAGE = `${import.meta.env.BASE_URL}dashboard/hospital-night-campus.webp`;

export function LoginPage() {
  const navigate = useNavigate();
  const { setRole, setAllPermissions } = useDemoStore();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [hint, setHint] = useState("");

  const enter = (target: "leader" | "operations" | "portal") => {
    // 演示入口默认角色（提示词 5.3）
    if (target === "leader") {
      setRole("leader");
      setAllPermissions(false);
      navigate("/cockpit/leader");
    } else if (target === "operations") {
      setRole("logistics");
      setAllPermissions(false);
      navigate("/cockpit/operations");
    } else {
      setRole("energyAdmin");
      setAllPermissions(true);
      navigate("/app/portal");
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!account.trim() || !password.trim()) {
      setHint("提示：账号或密码为空。演示环境不校验身份，仍将进入 PC 演示。");
    }
    enter("portal");
  };

  return (
    <div className="login-page">
      <div className="login-bg" style={{ backgroundImage: `url(${NIGHT_IMAGE})` }} />
      <div className="login-card fadeup">
        <BrandLockup
          className="login-brand"
          title="医院智慧能碳管理平台"
          variant="login"
        />
        <form onSubmit={submit}>
          <label htmlFor="login-account">账号</label>
          <input
            id="login-account"
            className="login-input"
            placeholder="请输入账号"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            autoComplete="off"
          />
          <label htmlFor="login-password">密码</label>
          <input
            id="login-password"
            className="login-input"
            type="password"
            placeholder="请输入密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
          />
          <button type="submit" className="login-submit">登 录</button>
          <p className="login-hint">{hint}</p>
        </form>
        <div className="login-links">
          <a onClick={() => enter("leader")}>领导舱演示</a>
          <a onClick={() => enter("operations")}>后勤舱演示</a>
          <a onClick={() => enter("portal")}>PC端演示</a>
        </div>
        <p className="login-foot">{PRODUCT_FULL_NAME} · Demo 模拟数据 · 基准日 {demoAsOfDate}</p>
      </div>
    </div>
  );
}
