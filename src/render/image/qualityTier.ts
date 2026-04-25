import type { RenderIntent } from "@/lib/renderIntent";

export const RENDER_QUALITY_TIERS = ["interactive", "quality", "export"] as const;
export type RenderQualityTier = (typeof RENDER_QUALITY_TIERS)[number];

export interface RenderQualityTierConfig {
  renderIntent: RenderIntent;
  strictErrors: boolean;
}

export const resolveRenderQualityTierConfig = (
  tier: RenderQualityTier
): RenderQualityTierConfig => {
  switch (tier) {
    case "interactive":
      return {
        renderIntent: "preview-interactive",
        strictErrors: false,
      };
    case "quality":
      return {
        renderIntent: "preview-full",
        strictErrors: false,
      };
    case "export":
      return {
        renderIntent: "export-full",
        strictErrors: true,
      };
  }
};
