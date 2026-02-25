import type { FilmProfile } from "@/types";
import type { FilmProfileV2 } from "@/types/film";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const cloneV2 = (profile: FilmProfileV2): FilmProfileV2 => {
  if (typeof structuredClone === "function") {
    return structuredClone(profile);
  }
  return JSON.parse(JSON.stringify(profile)) as FilmProfileV2;
};

const stockProfilesV2Source: FilmProfileV2[] = [
  {
    id: "stock-portra-400",
    version: 2,
    name: "Kodak Portra 400",
    description: "Warm skin-friendly negative stock with soft shoulder.",
    type: "negative",
    tags: ["stock", "portrait", "negative", "color"],
    toneResponse: { enabled: true, shoulder: 0.78, toe: 0.36, gamma: 0.98 },
    colorMatrix: {
      enabled: true,
      matrix: [1.03, 0.0, -0.01, -0.01, 1.01, 0.0, 0.0, 0.0, 0.98],
    },
    lut: {
      enabled: true,
      path: "luts/stocks/portra400.png",
      size: 8,
      intensity: 0.78,
    },
    colorCast: {
      enabled: true,
      shadows: [0.012, 0.0, -0.01],
      midtones: [0.009, 0.0, -0.008],
      highlights: [0.004, 0.0, -0.004],
    },
    halation: {
      enabled: true,
      intensity: 0.09,
      threshold: 0.9,
      color: [1.0, 0.32, 0.14],
      radius: 4.2,
    },
    bloom: {
      enabled: true,
      intensity: 0.06,
      threshold: 0.86,
      radius: 5.4,
    },
    grain: {
      enabled: true,
      amount: 0.16,
      size: 0.62,
      colorGrain: true,
      roughness: 0.44,
      shadowBias: 0.52,
    },
    vignette: {
      enabled: true,
      amount: 0.08,
      midpoint: 0.58,
      roundness: 0.48,
    },
  },
  {
    id: "stock-ektar-100",
    version: 2,
    name: "Kodak Ektar 100",
    description: "High-saturation daylight stock with punchy color separation.",
    type: "negative",
    tags: ["stock", "landscape", "negative", "color"],
    toneResponse: { enabled: true, shoulder: 0.84, toe: 0.28, gamma: 1.04 },
    colorMatrix: {
      enabled: true,
      matrix: [1.06, 0.0, -0.01, 0.0, 1.04, 0.0, -0.01, 0.0, 1.02],
    },
    lut: {
      enabled: true,
      path: "luts/stocks/ektar100.png",
      size: 8,
      intensity: 0.88,
    },
    colorCast: {
      enabled: true,
      shadows: [0.006, 0.002, -0.01],
      midtones: [0.004, 0.001, -0.006],
      highlights: [0.002, 0.0, -0.003],
    },
    halation: {
      enabled: true,
      intensity: 0.07,
      threshold: 0.91,
      color: [1.0, 0.34, 0.16],
      radius: 4.0,
    },
    bloom: {
      enabled: true,
      intensity: 0.05,
      threshold: 0.87,
      radius: 5.0,
    },
    grain: {
      enabled: true,
      amount: 0.1,
      size: 0.56,
      colorGrain: true,
      roughness: 0.35,
      shadowBias: 0.4,
    },
    vignette: {
      enabled: true,
      amount: 0.05,
      midpoint: 0.6,
      roundness: 0.55,
    },
  },
  {
    id: "stock-gold-200",
    version: 2,
    name: "Kodak Gold 200",
    description: "Consumer daylight stock with warm highlights and nostalgic color.",
    type: "negative",
    tags: ["stock", "negative", "color", "warm"],
    toneResponse: { enabled: true, shoulder: 0.76, toe: 0.33, gamma: 0.99 },
    colorMatrix: {
      enabled: true,
      matrix: [1.02, 0.0, -0.01, -0.005, 1.0, 0.0, 0.0, 0.0, 0.97],
    },
    lut: {
      enabled: true,
      path: "luts/stocks/gold200.png",
      size: 8,
      intensity: 0.72,
    },
    colorCast: {
      enabled: true,
      shadows: [0.015, 0.002, -0.012],
      midtones: [0.011, 0.001, -0.01],
      highlights: [0.005, 0.0, -0.005],
    },
    halation: {
      enabled: true,
      intensity: 0.08,
      threshold: 0.9,
      color: [1.0, 0.36, 0.18],
      radius: 4.1,
    },
    bloom: {
      enabled: true,
      intensity: 0.06,
      threshold: 0.86,
      radius: 5.2,
    },
    grain: {
      enabled: true,
      amount: 0.15,
      size: 0.61,
      colorGrain: true,
      roughness: 0.42,
      shadowBias: 0.5,
    },
    vignette: {
      enabled: true,
      amount: 0.09,
      midpoint: 0.56,
      roundness: 0.46,
    },
  },
  {
    id: "stock-cinestill-800t",
    version: 2,
    name: "CineStill 800T",
    description: "Tungsten-balanced stock with cyan shadows and strong halation.",
    type: "negative",
    tags: ["stock", "negative", "night", "tungsten"],
    toneResponse: { enabled: true, shoulder: 0.82, toe: 0.3, gamma: 1.02 },
    colorMatrix: {
      enabled: true,
      matrix: [0.99, 0.0, 0.01, 0.0, 1.01, 0.0, 0.01, 0.0, 1.03],
    },
    lut: {
      enabled: true,
      path: "luts/stocks/cinestill800t.png",
      size: 8,
      intensity: 0.84,
    },
    colorCast: {
      enabled: true,
      shadows: [-0.01, 0.0, 0.016],
      midtones: [-0.006, 0.0, 0.01],
      highlights: [0.002, 0.0, -0.002],
    },
    halation: {
      enabled: true,
      intensity: 0.13,
      threshold: 0.88,
      color: [1.0, 0.26, 0.12],
      radius: 5.2,
    },
    bloom: {
      enabled: true,
      intensity: 0.08,
      threshold: 0.83,
      radius: 6.2,
    },
    grain: {
      enabled: true,
      amount: 0.2,
      size: 0.68,
      colorGrain: true,
      roughness: 0.52,
      shadowBias: 0.58,
    },
    vignette: {
      enabled: true,
      amount: 0.1,
      midpoint: 0.54,
      roundness: 0.45,
    },
  },
  {
    id: "stock-provia-100f",
    version: 2,
    name: "Fujifilm Provia 100F",
    description: "Neutral slide stock with clean color and moderate contrast.",
    type: "slide",
    tags: ["stock", "slide", "color", "neutral"],
    toneResponse: { enabled: true, shoulder: 0.9, toe: 0.18, gamma: 1.06 },
    colorMatrix: {
      enabled: true,
      matrix: [1.01, 0.0, -0.005, 0.0, 1.02, 0.0, -0.005, 0.0, 1.01],
    },
    lut: {
      enabled: true,
      path: "luts/stocks/provia100f.png",
      size: 8,
      intensity: 0.8,
    },
    colorCast: {
      enabled: true,
      shadows: [-0.003, 0.0, 0.004],
      midtones: [0.0, 0.0, 0.0],
      highlights: [0.001, 0.0, -0.001],
    },
    halation: {
      enabled: true,
      intensity: 0.05,
      threshold: 0.92,
      color: [1.0, 0.3, 0.15],
      radius: 3.8,
    },
    bloom: {
      enabled: true,
      intensity: 0.04,
      threshold: 0.89,
      radius: 4.6,
    },
    grain: {
      enabled: true,
      amount: 0.09,
      size: 0.55,
      colorGrain: true,
      roughness: 0.33,
      shadowBias: 0.36,
    },
    vignette: {
      enabled: true,
      amount: 0.04,
      midpoint: 0.62,
      roundness: 0.58,
    },
  },
  {
    id: "stock-velvia-50",
    version: 2,
    name: "Fujifilm Velvia 50",
    description: "Vivid slide stock with high chroma and dramatic contrast.",
    type: "slide",
    tags: ["stock", "slide", "landscape", "vivid"],
    toneResponse: { enabled: true, shoulder: 0.92, toe: 0.14, gamma: 1.1 },
    colorMatrix: {
      enabled: true,
      matrix: [1.06, 0.0, -0.01, -0.005, 1.08, -0.005, -0.01, -0.005, 1.07],
    },
    lut: {
      enabled: true,
      path: "luts/stocks/velvia50.png",
      size: 8,
      intensity: 0.94,
    },
    colorCast: {
      enabled: true,
      shadows: [0.0, 0.0, 0.005],
      midtones: [0.002, 0.0, 0.002],
      highlights: [0.003, 0.0, -0.002],
    },
    halation: {
      enabled: true,
      intensity: 0.04,
      threshold: 0.93,
      color: [1.0, 0.3, 0.14],
      radius: 3.5,
    },
    bloom: {
      enabled: true,
      intensity: 0.03,
      threshold: 0.9,
      radius: 4.2,
    },
    grain: {
      enabled: true,
      amount: 0.08,
      size: 0.54,
      colorGrain: true,
      roughness: 0.31,
      shadowBias: 0.34,
    },
    vignette: {
      enabled: true,
      amount: 0.03,
      midpoint: 0.64,
      roundness: 0.6,
    },
  },
  {
    id: "stock-tri-x-400",
    version: 2,
    name: "Kodak Tri-X 400",
    description: "Classic gritty B&W stock with strong midtone punch.",
    type: "bw",
    tags: ["stock", "bw", "negative", "documentary"],
    toneResponse: { enabled: true, shoulder: 0.84, toe: 0.26, gamma: 1.06 },
    colorMatrix: {
      enabled: true,
      matrix: [0.46, 0.46, 0.08, 0.46, 0.46, 0.08, 0.46, 0.46, 0.08],
    },
    lut: {
      enabled: true,
      path: "luts/stocks/trix400.png",
      size: 8,
      intensity: 0.9,
    },
    halation: {
      enabled: true,
      intensity: 0.06,
      threshold: 0.9,
      color: [1.0, 0.3, 0.13],
      radius: 4.0,
    },
    bloom: {
      enabled: true,
      intensity: 0.04,
      threshold: 0.88,
      radius: 4.8,
    },
    grain: {
      enabled: true,
      amount: 0.24,
      size: 0.74,
      colorGrain: false,
      roughness: 0.61,
      shadowBias: 0.66,
    },
    vignette: {
      enabled: true,
      amount: 0.1,
      midpoint: 0.52,
      roundness: 0.4,
    },
  },
  {
    id: "stock-hp5-plus",
    version: 2,
    name: "Ilford HP5 Plus",
    description: "Balanced B&W stock with softer contrast and open shadows.",
    type: "bw",
    tags: ["stock", "bw", "negative", "classic"],
    toneResponse: { enabled: true, shoulder: 0.8, toe: 0.31, gamma: 1.0 },
    colorMatrix: {
      enabled: true,
      matrix: [0.43, 0.5, 0.07, 0.43, 0.5, 0.07, 0.43, 0.5, 0.07],
    },
    lut: {
      enabled: true,
      path: "luts/stocks/hp5plus.png",
      size: 8,
      intensity: 0.82,
    },
    halation: {
      enabled: true,
      intensity: 0.05,
      threshold: 0.91,
      color: [1.0, 0.3, 0.14],
      radius: 3.8,
    },
    bloom: {
      enabled: true,
      intensity: 0.04,
      threshold: 0.89,
      radius: 4.6,
    },
    grain: {
      enabled: true,
      amount: 0.21,
      size: 0.71,
      colorGrain: false,
      roughness: 0.55,
      shadowBias: 0.62,
    },
    vignette: {
      enabled: true,
      amount: 0.08,
      midpoint: 0.55,
      roundness: 0.44,
    },
  },
];

const toLegacyStockProfile = (profile: FilmProfileV2): FilmProfile => {
  const warmthSource = profile.colorCast?.midtones ?? [0, 0, 0];
  const warmth = clamp(((warmthSource[0] - warmthSource[2]) / 0.12) * 100, -100, 100);
  return {
    id: profile.id,
    version: 1,
    name: profile.name,
    description: profile.description,
    tags: profile.tags,
    modules: [
      {
        id: "colorScience",
        enabled: true,
        amount: 100,
        seedMode: "perAsset",
        params: {
          lutStrength: clamp(profile.lut.intensity, 0, 1),
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
        params: {
          halationThreshold: profile.halation?.threshold ?? 0.9,
          halationAmount: profile.halation?.intensity ?? 0,
          bloomThreshold: profile.bloom?.threshold ?? 0.86,
          bloomAmount: profile.bloom?.intensity ?? 0,
          vignetteAmount: profile.vignette.amount,
          scanWarmth: warmth,
        },
      },
      {
        id: "grain",
        enabled: profile.grain.enabled,
        amount: 100,
        seedMode: "perAsset",
        params: {
          amount: profile.grain.amount,
          size: clamp(profile.grain.size, 0, 1),
          roughness: profile.grain.roughness,
          color: profile.grain.colorGrain ? 0.1 : 0,
          shadowBoost: profile.grain.shadowBias,
        },
      },
      {
        id: "defects",
        enabled: false,
        amount: 0,
        seedMode: "perAsset",
        params: {
          leakProbability: 0,
          leakStrength: 0,
          dustAmount: 0,
          scratchAmount: 0,
        },
      },
    ],
  };
};

const stockV2Map = new Map(stockProfilesV2Source.map((profile) => [profile.id, profile]));

export const stockFilmProfilesV1: FilmProfile[] = stockProfilesV2Source.map((profile) =>
  toLegacyStockProfile(profile)
);

export const stockFilmProfilesV2: FilmProfileV2[] = stockProfilesV2Source.map((profile) =>
  cloneV2(profile)
);

export const getStockFilmProfileV2ById = (id: string | undefined): FilmProfileV2 | null => {
  if (!id) {
    return null;
  }
  const profile = stockV2Map.get(id);
  return profile ? cloneV2(profile) : null;
};
