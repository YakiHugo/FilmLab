import type { RenderMode } from "@/lib/renderer/RenderManager";
import type { RenderQualityProfile } from "@/lib/imageProcessing";

export type RenderIntent =
  | "preview-interactive"
  | "preview-full"
  | "export-full"
  | "thumbnail";

export interface ResolvedRenderIntent {
  mode: RenderMode;
  qualityProfile: RenderQualityProfile;
  skipHalationBloom: boolean;
}

export const resolveRenderIntent = (intent: RenderIntent): ResolvedRenderIntent => {
  switch (intent) {
    case "preview-interactive":
      return {
        mode: "preview",
        qualityProfile: "interactive",
        skipHalationBloom: true,
      };
    case "preview-full":
      return {
        mode: "preview",
        qualityProfile: "full",
        skipHalationBloom: false,
      };
    case "thumbnail":
      return {
        mode: "preview",
        qualityProfile: "full",
        skipHalationBloom: false,
      };
    case "export-full":
    default:
      return {
        mode: "export",
        qualityProfile: "full",
        skipHalationBloom: false,
      };
  }
};
