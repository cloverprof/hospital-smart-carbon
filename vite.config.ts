import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base 默认 "./"（相对路径）：配合 Hash 路由，可部署在根路径、任意子目录或内网静态服务器。
// 需要绝对路径时设置 VITE_BASE_PATH（如 "/carbon/"）。
export default defineConfig({
  base: process.env.VITE_BASE_PATH || "./",
  plugins: [react(), tailwindcss()],
  server: { host: "0.0.0.0", port: Number(process.env.DEPLOY_RUN_PORT) || 5000 },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/echarts") || id.includes("node_modules/zrender")) return "echarts";
          if (id.includes("node_modules/xlsx") || id.includes("node_modules/jszip")) return "export-libs";
          if (id.includes("node_modules/lucide-react")) return "icons";
          if (id.includes("node_modules/react") || id.includes("node_modules/scheduler")) return "react";
          // 领域数据与数据引擎：登录页不需要，随首个业务页面加载
          if (id.includes("/src/data/") || id.includes("/src/services/")) return "domain";
          return undefined;
        },
      },
    },
  },
});
