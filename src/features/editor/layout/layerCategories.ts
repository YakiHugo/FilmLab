import type { EditorLayerBlendMode } from "@/types";

export interface LayerAsset {
  id: string;
  name: string;
  thumbnailUrl: string;
  fullUrl: string;
  blendMode: EditorLayerBlendMode;
  opacity: number;
}

export interface LayerCategory {
  id: string;
  name: string;
  nameEn: string;
  assets: LayerAsset[];
  showViewAll: boolean;
}

// Placeholder assets - replace with real asset URLs
const createPlaceholderAsset = (
  id: string,
  name: string,
  blendMode: EditorLayerBlendMode = "screen",
  opacity: number = 100
): LayerAsset => ({
  id,
  name,
  thumbnailUrl: `/test-assets/images/unsplash_${id}.jpg`,
  fullUrl: `/test-assets/images/unsplash_${id}.jpg`,
  blendMode,
  opacity,
});

export const LAYER_CATEGORIES: LayerCategory[] = [
  {
    id: "user",
    name: "我的影像",
    nameEn: "My Images",
    assets: [], // Populated dynamically from user's assets
    showViewAll: false,
  },
  {
    id: "stardust",
    name: "星塵散景",
    nameEn: "Stardust Bokeh",
    assets: [
      createPlaceholderAsset("4c7lecfas1M", "Stardust 1", "screen", 60),
      createPlaceholderAsset("6z0Viul75Tg", "Stardust 2", "screen", 60),
      createPlaceholderAsset("e3-Gw5ig2A8", "Stardust 3", "screen", 60),
    ],
    showViewAll: true,
  },
  {
    id: "lightleak",
    name: "漏光",
    nameEn: "Light Leaks",
    assets: [
      createPlaceholderAsset("esZffT2hurY", "Leak 1", "screen", 50),
      createPlaceholderAsset("F-B7kWlkxDQ", "Leak 2", "screen", 50),
      createPlaceholderAsset("PhciG8fpRKw", "Leak 3", "screen", 50),
    ],
    showViewAll: true,
  },
  {
    id: "firework",
    name: "煙火",
    nameEn: "Fireworks",
    assets: [
      createPlaceholderAsset("PVhiLxBe22M", "Firework 1", "screen", 70),
      createPlaceholderAsset("rPCAP-4bO-M", "Firework 2", "screen", 70),
    ],
    showViewAll: true,
  },
  {
    id: "flare",
    name: "眩光",
    nameEn: "Flare",
    assets: [
      createPlaceholderAsset("uoHwIZx_HLo", "Flare 1", "screen", 40),
      createPlaceholderAsset("uQtRtfFF4Qk", "Flare 2", "screen", 40),
    ],
    showViewAll: true,
  },
];
