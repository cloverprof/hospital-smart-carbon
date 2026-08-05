import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
// Hash 路由：静态部署无需服务器 rewrite，深链接刷新不白屏（见 docs/DECISIONS.md）
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./platform.css";
import App from "./App";

document.body.classList.add("platform-v2");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </StrictMode>,
);
