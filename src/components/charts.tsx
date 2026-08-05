import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

const colors = ["#2f86ff","#22c8df","#31d58b","#ffb547","#ff6b6b","#9a76ff"];
const chartText = "#9fb0c9";

export function Chart({ option, height = 300, onEvents, className = "" }: { option:object;height?:number;onEvents?:Record<string,(params:unknown)=>void>;className?:string }) {
  const resolved = { color:colors,backgroundColor:"transparent",animationDuration:550,textStyle:{fontFamily:"Microsoft YaHei, sans-serif",color:chartText},...option } as EChartsOption;
  return <ReactECharts option={resolved} style={{height,width:"100%"}} onEvents={onEvents} className={className} notMerge lazyUpdate/>;
}
