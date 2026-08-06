// 驾驶舱壳层：无侧栏，顶栏 + 全屏场景舞台。子内容为 HUD 层。
import type { ReactNode } from "react";
import { DemoBadge, ToastHost } from "../components/kit";
import { SceneStage, type SceneVariant } from "../components/SceneStage";
import { TopBar } from "./TopBar";

export function CockpitShell({ name, variant, children }: { name: string; variant: SceneVariant; children?: ReactNode }) {
  return (
    <div className="cockpit">
      <TopBar cockpitName={name} withScene />
      <div className="cockpit-stage">
        <SceneStage variant={variant} backdrop="cockpit" />
        {children}
      </div>
      <ToastHost />
      <DemoBadge />
    </div>
  );
}
