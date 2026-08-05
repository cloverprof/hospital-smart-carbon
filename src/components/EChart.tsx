// 统一 ECharts 包装：暗色主题、统一色板/单位/tooltip、实例清理、失焦暂停动画。
import * as echarts from "echarts";
import { useEffect, useRef } from "react";

// eslint-disable-next-line react-refresh/only-export-components -- 色板常量与图表组件同文件便于统一维护
export const CHART_COLORS = ["#29d3e8", "#35d399", "#f5a524", "#8b8df0", "#f4525f", "#4da3ff", "#e8b6ff", "#7ce7c4"];

const BASE: echarts.EChartsCoreOption = {
  color: CHART_COLORS,
  textStyle: { color: "#9db4d6", fontSize: 11 },
  grid: { left: 42, right: 16, top: 30, bottom: 24, containLabel: false },
  tooltip: {
    trigger: "axis",
    backgroundColor: "rgba(9,19,38,0.95)",
    borderColor: "rgba(83,164,235,0.45)",
    textStyle: { color: "#e6f1ff", fontSize: 11 },
    confine: true,
  },
  legend: { textStyle: { color: "#9db4d6", fontSize: 10 }, itemWidth: 12, itemHeight: 8, top: 0 },
  xAxis: {
    axisLine: { lineStyle: { color: "rgba(95,119,153,0.4)" } },
    axisLabel: { color: "#5f7799", fontSize: 10 },
    splitLine: { show: false },
  },
  yAxis: {
    axisLine: { show: false },
    axisLabel: { color: "#5f7799", fontSize: 10 },
    splitLine: { lineStyle: { color: "rgba(56,116,178,0.14)" } },
  },
};

function deepMergeAxis(base: object, opt?: object | object[]) {
  if (Array.isArray(opt)) return opt.map((o) => ({ ...base, ...o }));
  return { ...base, ...(opt ?? {}) };
}

export function EChart({ option, height = 220, onClick, className }: {
  option: echarts.EChartsCoreOption;
  height?: number | string;
  onClick?: (params: echarts.ECElementEvent) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chartRef.current = chart;
    const resize = () => chart.resize();
    const observer = new ResizeObserver(resize);
    observer.observe(ref.current);
    const onVis = () => {
      // 失焦暂停动画，恢复时不补算
      if (document.hidden) chart.getZr()?.animation.stop();
      else chart.getZr()?.animation.start();
    };
    document.addEventListener("visibilitychange", onVis);
    chart.on("click", (p) => onClickRef.current?.(p as echarts.ECElementEvent));
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    const merged: echarts.EChartsCoreOption = {
      ...BASE,
      ...option,
      tooltip: { ...(BASE.tooltip as object), ...((option.tooltip as object) ?? {}) },
      legend: option.legend === false ? undefined : { ...(BASE.legend as object), ...((option.legend as object) ?? {}) },
      grid: { ...(BASE.grid as object), ...((option.grid as object) ?? {}) },
      xAxis: option.xAxis ? deepMergeAxis(BASE.xAxis as object, option.xAxis as object) : undefined,
      yAxis: option.yAxis ? deepMergeAxis(BASE.yAxis as object, option.yAxis as object) : undefined,
    };
    chartRef.current.setOption(merged, { notMerge: true });
  }, [option]);

  return <div ref={ref} className={className} style={{ height, width: "100%" }} />;
}
