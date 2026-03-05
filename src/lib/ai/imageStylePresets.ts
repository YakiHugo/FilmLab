import type { ImageStyleId } from "@/types/imageGeneration";

export interface ImageStylePreset {
  id: string;
  title: string;
  style: ImageStyleId;
  stylePreset?: string;
  promptHint?: string;
  previewUrl: string;
}

export const IMAGE_STYLE_PRESETS: ImageStylePreset[] = [
  {
    id: "mono-portrait",
    title: "单色",
    style: "photorealistic",
    stylePreset: "mono-portrait",
    previewUrl:
      "https://images.unsplash.com/photo-1570481662006-a3a1374699e8?auto=format&fit=crop&w=900&q=60",
  },
  {
    id: "color-block",
    title: "色块",
    style: "digital-art",
    stylePreset: "color-block",
    previewUrl:
      "https://images.unsplash.com/photo-1616469829167-0bd76fce2f5b?auto=format&fit=crop&w=900&q=60",
  },
  {
    id: "runway",
    title: "跑道",
    style: "cinematic",
    stylePreset: "runway",
    previewUrl:
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=60",
  },
  {
    id: "risograph",
    title: "孔版印刷",
    style: "digital-art",
    stylePreset: "risograph",
    previewUrl:
      "https://images.unsplash.com/photo-1618005198919-d3d4b5a92eee?auto=format&fit=crop&w=900&q=60",
  },
  {
    id: "vivid-portrait",
    title: "绚彩",
    style: "cinematic",
    stylePreset: "vivid-portrait",
    previewUrl:
      "https://images.unsplash.com/photo-1514315384763-ba401779410f?auto=format&fit=crop&w=900&q=60",
  },
  {
    id: "gothic-clay",
    title: "哥特风黏土",
    style: "3d-render",
    stylePreset: "gothic-clay",
    previewUrl:
      "https://images.unsplash.com/photo-1615729947596-a598e5de0ab3?auto=format&fit=crop&w=900&q=60",
  },
  {
    id: "blast",
    title: "轰动",
    style: "cinematic",
    stylePreset: "blast",
    previewUrl:
      "https://images.unsplash.com/photo-1597074866923-dc0589150358?auto=format&fit=crop&w=900&q=60",
  },
  {
    id: "salon",
    title: "沙龙",
    style: "photorealistic",
    stylePreset: "salon",
    previewUrl:
      "https://images.unsplash.com/photo-1521119989659-a83eee488004?auto=format&fit=crop&w=900&q=60",
  },
  {
    id: "line-sketch",
    title: "线稿",
    style: "sketch",
    stylePreset: "line-sketch",
    previewUrl:
      "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=900&q=60",
  },
  {
    id: "neo-noir",
    title: "暗调电影",
    style: "cinematic",
    stylePreset: "neo-noir",
    previewUrl:
      "https://images.unsplash.com/photo-1478720568477-152d9b164e26?auto=format&fit=crop&w=900&q=60",
  },
  {
    id: "steampunk",
    title: "蒸汽朋克",
    style: "digital-art",
    stylePreset: "steampunk",
    previewUrl:
      "https://images.unsplash.com/photo-1492551557933-34265f7af79e?auto=format&fit=crop&w=900&q=60",
  },
  {
    id: "sunrise",
    title: "晨光",
    style: "photorealistic",
    stylePreset: "sunrise",
    previewUrl:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=60",
  },
];

export const getStylePresetById = (presetId: string) =>
  IMAGE_STYLE_PRESETS.find((preset) => preset.id === presetId);
