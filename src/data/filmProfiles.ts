import {
  buildColorScienceConfig,
  buildDefectParams,
  buildGrainParams,
  buildScanParams,
  buildToneParams,
  filmStockDefinitions,
  toFilmProfileId,
} from "@/data/filmStockDefinitions";
import type { FilmProfile } from "@/types";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const neutralFilmProfile: FilmProfile = {
  id: "film-neutral-v1",
  version: 1,
  name: "Neutral Film",
  description: "Balanced baseline profile for editing.",
  tags: ["neutral"],
  modules: [
    {
      id: "colorScience",
      enabled: true,
      amount: 100,
      seedMode: "perAsset",
      params: {
        lutStrength: 0.3,
        lutAssetId: undefined,
        rgbMix: [1, 1, 1],
        temperatureShift: 0,
        tintShift: 0,
      },
    },
    {
      id: "tone",
      enabled: true,
      amount: 100,
      params: {
        exposure: 0,
        contrast: 0,
        highlights: 0,
        shadows: 0,
        whites: 0,
        blacks: 0,
        curveHighlights: 0,
        curveLights: 0,
        curveDarks: 0,
        curveShadows: 0,
      },
    },
    {
      id: "scan",
      enabled: true,
      amount: 100,
      seedMode: "perAsset",
      params: {
        halationThreshold: 0.9,
        halationAmount: 0.12,
        bloomThreshold: 0.84,
        bloomAmount: 0.1,
        vignetteAmount: 0,
        scanWarmth: 0,
      },
    },
    {
      id: "grain",
      enabled: true,
      amount: 30,
      seedMode: "perAsset",
      params: {
        amount: 0.12,
        size: 0.42,
        roughness: 0.45,
        color: 0.1,
        shadowBoost: 0.44,
      },
    },
    {
      id: "defects",
      enabled: false,
      amount: 20,
      seedMode: "perRender",
      params: {
        leakProbability: 0.08,
        leakStrength: 0.15,
        dustAmount: 0.08,
        scratchAmount: 0.05,
      },
    },
  ],
};

const stockProfiles: FilmProfile[] = filmStockDefinitions.map((stock) => {
  const colorScience = buildColorScienceConfig(stock);
  const style = stock.style;
  const toneAmount = clamp(84 + Math.abs(style.contrast) * 24 + (stock.tag === "bw" ? 8 : 0), 0, 100);
  const scanAmount = clamp(70 + style.halation * 26 + style.fade * 18, 0, 100);
  const grainAmount = clamp(18 + style.grain * 60 + (stock.tag === "bw" ? 8 : 0), 0, 100);
  const defectsAmount = clamp(10 + style.defects * 50, 0, 100);

  return {
    id: toFilmProfileId(stock.id),
    version: 1,
    name: stock.name,
    description: stock.description,
    tags: [stock.tag],
    modules: [
      {
        id: "colorScience",
        enabled: true,
        amount: colorScience.amount,
        seedMode: "perAsset",
        params: colorScience.params,
      },
      {
        id: "tone",
        enabled: true,
        amount: toneAmount,
        params: buildToneParams(stock),
      },
      {
        id: "scan",
        enabled: true,
        amount: scanAmount,
        seedMode: "perAsset",
        params: buildScanParams(stock),
      },
      {
        id: "grain",
        enabled: style.grain > 0.06,
        amount: grainAmount,
        seedMode: "perAsset",
        params: buildGrainParams(stock),
      },
      {
        id: "defects",
        enabled: style.defects > 0.1,
        amount: defectsAmount,
        seedMode: "perRender",
        params: buildDefectParams(stock),
      },
    ],
  };
});

export const filmProfiles: FilmProfile[] = [neutralFilmProfile, ...stockProfiles];

export const presetFilmProfileMap: Record<string, string> = Object.fromEntries(
  filmStockDefinitions.map((stock) => [`preset-${stock.id}`, toFilmProfileId(stock.id)])
);
