import type {
  DefectsParams,
  GrainParams,
  PresetAdjustments,
  PresetTag,
  ScanParams,
  ToneParams,
} from "@/types";

export interface BuiltInLutStyle {
  contrast: number;
  saturation: number;
  warmth: number;
  tint: number;
  shadowLift: number;
  highlightRollOff: number;
  fade: number;
  crossMix: number;
  redBias: number;
  greenBias: number;
  blueBias: number;
  grain: number;
  halation: number;
  defects: number;
}

export interface FilmStockDefinition {
  id: string;
  name: string;
  description: string;
  tag: PresetTag;
  intensity: number;
  style: BuiltInLutStyle;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const toInt = (value: number, min = -100, max = 100) =>
  Math.round(clamp(value, min, max));

const toUnit = (value: number) => clamp(value, 0, 1);

const isBwStock = (stock: FilmStockDefinition) => stock.tag === "bw";

export const toPresetId = (id: string) => `film-${id}`;
export const toFilmProfileId = (id: string) => `film-${id}-v1`;
export const toLutAssetId = (id: string) => `builtin-lut-${id}-16`;

export const buildPresetAdjustments = (
  stock: FilmStockDefinition
): PresetAdjustments => {
  const { style } = stock;
  const bw = isBwStock(stock);

  const adjustments: PresetAdjustments = {
    exposure: toInt((style.shadowLift - style.highlightRollOff) * 14),
    contrast: toInt(style.contrast * 58 + (bw ? 8 : 0)),
    highlights: toInt(-style.highlightRollOff * 72 - style.halation * 8),
    shadows: toInt(style.shadowLift * 70 + (bw ? 4 : 0)),
    whites: toInt(style.contrast * 26 - style.highlightRollOff * 22 + (bw ? 4 : 0)),
    blacks: toInt(-style.contrast * 24 + style.shadowLift * 18 - (bw ? 4 : 0)),
    temperature: toInt(style.warmth * 24),
    tint: toInt(style.tint * 20),
    clarity: toInt(style.contrast * 20 - style.fade * 28 + (bw ? 6 : 0)),
    dehaze: toInt(style.contrast * 18 - style.fade * 18),
    vignette: toInt(4 + style.contrast * 10 + style.fade * 18, -100, 100),
    grain: toInt(12 + style.grain * 52 + (bw ? 6 : 0), 0, 100),
  };

  if (bw) {
    adjustments.vibrance = -65;
    adjustments.saturation = -92;
  } else {
    adjustments.vibrance = toInt(
      (style.saturation - 1) * 32 + style.contrast * 10 + style.crossMix * 18
    );
    adjustments.saturation = toInt((style.saturation - 1) * 40 + style.crossMix * 8);
  }

  return adjustments;
};

export const buildColorScienceConfig = (stock: FilmStockDefinition) => {
  const { style } = stock;
  const bw = isBwStock(stock);

  return {
    amount: clamp(84 + Math.abs(style.contrast) * 18 + style.halation * 10, 0, 100),
    params: {
      lutStrength: clamp(
        0.38 +
          Math.abs(style.contrast) * 0.3 +
          Math.abs(style.crossMix) * 0.22 +
          style.halation * 0.08,
        0.25,
        0.9
      ),
      lutAssetId: toLutAssetId(stock.id),
      rgbMix: [
        clamp(1 + style.warmth * 0.08 + style.redBias * 0.14 + style.tint * 0.03, 0.7, 1.35),
        clamp(
          1 + style.greenBias * 0.12 - Math.abs(style.tint) * 0.03 + (bw ? -0.01 : 0),
          0.7,
          1.35
        ),
        clamp(1 - style.warmth * 0.08 + style.blueBias * 0.14 + style.tint * 0.03, 0.7, 1.35),
      ] as [number, number, number],
      temperatureShift: toInt(style.warmth * 28),
      tintShift: toInt(style.tint * 24),
    },
  };
};

export const buildToneParams = (stock: FilmStockDefinition): ToneParams => {
  const { style } = stock;
  const bw = isBwStock(stock);
  const contrastBoost = bw ? 8 : 0;
  const shadowBoost = bw ? 4 : 0;

  return {
    exposure: toInt((style.shadowLift - style.highlightRollOff) * 12),
    contrast: toInt(style.contrast * 62 + contrastBoost),
    highlights: toInt(-style.highlightRollOff * 68 - style.halation * 10),
    shadows: toInt(style.shadowLift * 66 + shadowBoost),
    whites: toInt(style.contrast * 22 + (style.saturation - 1) * 10 - style.highlightRollOff * 20),
    blacks: toInt(-style.contrast * 24 + style.shadowLift * 18 - shadowBoost),
    curveHighlights: toInt(style.contrast * 36 - style.highlightRollOff * 28 + (bw ? 2 : 0)),
    curveLights: toInt(style.contrast * 34 - style.fade * 18),
    curveDarks: toInt(-style.contrast * 30 + style.shadowLift * 20),
    curveShadows: toInt(-style.contrast * 34 + style.shadowLift * 28 + style.fade * 12),
  };
};

export const buildScanParams = (stock: FilmStockDefinition): ScanParams => {
  const { style } = stock;
  return {
    halationThreshold: clamp(
      0.92 - style.halation * 0.2 + style.highlightRollOff * 0.08,
      0.5,
      1
    ),
    halationAmount: clamp(0.05 + style.halation * 0.34 + style.warmth * 0.03, 0, 1),
    bloomThreshold: clamp(0.88 - style.halation * 0.12, 0.4, 1),
    bloomAmount: clamp(0.05 + style.halation * 0.22 + style.fade * 0.35, 0, 1),
    vignetteAmount: clamp(0.04 + style.contrast * 0.14 + style.fade * 0.2, -1, 1),
    scanWarmth: toInt(style.warmth * 32),
  };
};

export const buildGrainParams = (stock: FilmStockDefinition): GrainParams => {
  const { style } = stock;
  const bw = isBwStock(stock);
  return {
    amount: toUnit(0.06 + style.grain * 0.42 + (bw ? 0.04 : 0)),
    size: toUnit(0.26 + style.grain * 0.42 + (bw ? 0.04 : 0)),
    roughness: toUnit(0.28 + style.grain * 0.44 + (bw ? 0.05 : 0)),
    color: toUnit(bw ? 0 : 0.03 + style.grain * 0.2),
    shadowBoost: toUnit(0.33 + style.grain * 0.36 + style.shadowLift * 0.1),
  };
};

export const buildDefectParams = (stock: FilmStockDefinition): DefectsParams => {
  const { style } = stock;
  return {
    leakProbability: toUnit(0.03 + style.defects * 0.34 + style.halation * 0.1),
    leakStrength: toUnit(0.04 + style.defects * 0.28 + Math.max(0, style.warmth) * 0.08),
    dustAmount: toUnit(0.04 + style.defects * 0.2 + style.grain * 0.08),
    scratchAmount: toUnit(0.02 + style.defects * 0.16 + style.grain * 0.08),
  };
};

export const filmStockDefinitions: FilmStockDefinition[] = [
  {
    id: "kodak-portra-400",
    name: "Kodak Portra 400",
    description: "Warm skin tones and soft highlight roll-off.",
    tag: "portrait",
    intensity: 64,
    style: {
      contrast: -0.08,
      saturation: 0.92,
      warmth: 0.55,
      tint: 0.12,
      shadowLift: 0.18,
      highlightRollOff: 0.24,
      fade: 0.08,
      crossMix: 0.02,
      redBias: 0.06,
      greenBias: 0.01,
      blueBias: -0.04,
      grain: 0.32,
      halation: 0.34,
      defects: 0.12,
    },
  },
  {
    id: "fujifilm-pro400h",
    name: "Fujifilm PRO400H",
    description: "Pastel look with cool-green portrait rendering.",
    tag: "portrait",
    intensity: 62,
    style: {
      contrast: -0.1,
      saturation: 0.88,
      warmth: 0.05,
      tint: -0.32,
      shadowLift: 0.2,
      highlightRollOff: 0.22,
      fade: 0.1,
      crossMix: 0,
      redBias: 0,
      greenBias: 0.05,
      blueBias: 0.02,
      grain: 0.28,
      halation: 0.26,
      defects: 0.1,
    },
  },
  {
    id: "kodak-ektar-100",
    name: "Kodak Ektar 100",
    description: "Vivid color and crisp daylight contrast.",
    tag: "landscape",
    intensity: 72,
    style: {
      contrast: 0.2,
      saturation: 1.3,
      warmth: 0.2,
      tint: 0.05,
      shadowLift: 0,
      highlightRollOff: 0.1,
      fade: 0,
      crossMix: 0.03,
      redBias: 0.08,
      greenBias: 0.03,
      blueBias: -0.03,
      grain: 0.12,
      halation: 0.18,
      defects: 0.06,
    },
  },
  {
    id: "kodak-ultramax-400",
    name: "Kodak Ultramax 400",
    description: "Punchy consumer color-negative with warm cast.",
    tag: "portrait",
    intensity: 66,
    style: {
      contrast: 0.08,
      saturation: 1.12,
      warmth: 0.45,
      tint: 0.06,
      shadowLift: 0.05,
      highlightRollOff: 0.15,
      fade: 0.03,
      crossMix: 0.02,
      redBias: 0.06,
      greenBias: 0,
      blueBias: -0.05,
      grain: 0.5,
      halation: 0.35,
      defects: 0.2,
    },
  },
  {
    id: "fujifilm-superia-xtra-400",
    name: "Fujifilm Superia X-Tra 400",
    description: "Cooler greens and contrast for street scenes.",
    tag: "landscape",
    intensity: 67,
    style: {
      contrast: 0.1,
      saturation: 1.08,
      warmth: -0.05,
      tint: -0.25,
      shadowLift: 0.08,
      highlightRollOff: 0.14,
      fade: 0.04,
      crossMix: 0.04,
      redBias: -0.02,
      greenBias: 0.08,
      blueBias: 0.03,
      grain: 0.44,
      halation: 0.3,
      defects: 0.14,
    },
  },
  {
    id: "cinestill-800t",
    name: "Cinestill 800T",
    description: "Tungsten-balanced with strong halation for night neon.",
    tag: "night",
    intensity: 74,
    style: {
      contrast: 0.17,
      saturation: 1.1,
      warmth: -0.55,
      tint: -0.35,
      shadowLift: 0.03,
      highlightRollOff: 0.2,
      fade: 0.02,
      crossMix: 0.1,
      redBias: -0.03,
      greenBias: 0.02,
      blueBias: 0.14,
      grain: 0.66,
      halation: 0.82,
      defects: 0.5,
    },
  },
  {
    id: "fujifilm-velvia-50-rvp",
    name: "Fujifilm Velvia 50 (RVP)",
    description: "Ultra-saturated slide stock for dramatic landscapes.",
    tag: "landscape",
    intensity: 78,
    style: {
      contrast: 0.28,
      saturation: 1.45,
      warmth: 0.22,
      tint: 0.08,
      shadowLift: -0.03,
      highlightRollOff: 0.06,
      fade: 0,
      crossMix: 0.01,
      redBias: 0.06,
      greenBias: 0.08,
      blueBias: 0.02,
      grain: 0.06,
      halation: 0.1,
      defects: 0.04,
    },
  },
  {
    id: "fujifilm-provia-100f-rdp-iii",
    name: "Fujifilm PROVIA 100F (RDP III)",
    description: "Balanced slide color with clean contrast.",
    tag: "landscape",
    intensity: 70,
    style: {
      contrast: 0.14,
      saturation: 1.18,
      warmth: 0.05,
      tint: 0.03,
      shadowLift: 0,
      highlightRollOff: 0.08,
      fade: 0.01,
      crossMix: 0.01,
      redBias: 0.02,
      greenBias: 0.04,
      blueBias: 0.02,
      grain: 0.08,
      halation: 0.12,
      defects: 0.05,
    },
  },
  {
    id: "kodak-e100",
    name: "Kodak E100",
    description: "Fine-grain E6 slide with punchy but clean color.",
    tag: "landscape",
    intensity: 71,
    style: {
      contrast: 0.16,
      saturation: 1.22,
      warmth: 0.12,
      tint: 0.02,
      shadowLift: -0.01,
      highlightRollOff: 0.07,
      fade: 0,
      crossMix: 0.01,
      redBias: 0.04,
      greenBias: 0.03,
      blueBias: 0,
      grain: 0.08,
      halation: 0.1,
      defects: 0.04,
    },
  },
  {
    id: "agfa-rsx-ii-50",
    name: "Agfa RSX II 50",
    description: "Bold slide look with cool-magenta bias.",
    tag: "landscape",
    intensity: 73,
    style: {
      contrast: 0.22,
      saturation: 1.25,
      warmth: -0.08,
      tint: 0.2,
      shadowLift: 0,
      highlightRollOff: 0.08,
      fade: 0.02,
      crossMix: 0.05,
      redBias: 0.03,
      greenBias: -0.02,
      blueBias: 0.08,
      grain: 0.1,
      halation: 0.14,
      defects: 0.06,
    },
  },
  {
    id: "kodak-tri-x-400",
    name: "Kodak TRI-X 400",
    description: "Classic gritty black-and-white documentary look.",
    tag: "bw",
    intensity: 72,
    style: {
      contrast: 0.24,
      saturation: 0,
      warmth: 0,
      tint: 0,
      shadowLift: 0.03,
      highlightRollOff: 0.09,
      fade: 0.02,
      crossMix: 0,
      redBias: 0,
      greenBias: 0,
      blueBias: 0,
      grain: 0.68,
      halation: 0.08,
      defects: 0.32,
    },
  },
  {
    id: "fujifilm-neopan-100-acros-ii",
    name: "Fujifilm Neopan 100 Acros II",
    description: "Fine-grain monochrome with smooth tonal transitions.",
    tag: "bw",
    intensity: 64,
    style: {
      contrast: 0.12,
      saturation: 0,
      warmth: 0,
      tint: 0,
      shadowLift: 0.06,
      highlightRollOff: 0.12,
      fade: 0.02,
      crossMix: 0,
      redBias: 0,
      greenBias: 0,
      blueBias: 0,
      grain: 0.26,
      halation: 0.06,
      defects: 0.18,
    },
  },
  {
    id: "ilford-hp5-plus-400",
    name: "Ilford HP5 PLUS 400",
    description: "Wide-latitude black-and-white with classic texture.",
    tag: "bw",
    intensity: 70,
    style: {
      contrast: 0.18,
      saturation: 0,
      warmth: 0,
      tint: 0,
      shadowLift: 0.08,
      highlightRollOff: 0.11,
      fade: 0.03,
      crossMix: 0,
      redBias: 0,
      greenBias: 0,
      blueBias: 0,
      grain: 0.58,
      halation: 0.08,
      defects: 0.28,
    },
  },
  {
    id: "kodak-t-max-100",
    name: "Kodak T-MAX 100",
    description: "Sharp monochrome with cleaner grain structure.",
    tag: "bw",
    intensity: 68,
    style: {
      contrast: 0.2,
      saturation: 0,
      warmth: 0,
      tint: 0,
      shadowLift: 0.02,
      highlightRollOff: 0.08,
      fade: 0.01,
      crossMix: 0,
      redBias: 0,
      greenBias: 0,
      blueBias: 0,
      grain: 0.24,
      halation: 0.05,
      defects: 0.16,
    },
  },
  {
    id: "ilford-xp2-super",
    name: "Ilford XP2 SUPER",
    description: "Chromogenic B&W look with softer highlight transitions.",
    tag: "bw",
    intensity: 60,
    style: {
      contrast: 0.09,
      saturation: 0,
      warmth: 0,
      tint: 0,
      shadowLift: 0.14,
      highlightRollOff: 0.14,
      fade: 0.05,
      crossMix: 0,
      redBias: 0,
      greenBias: 0,
      blueBias: 0,
      grain: 0.24,
      halation: 0.1,
      defects: 0.16,
    },
  },
  {
    id: "kodak-vision3-250d",
    name: "Kodak Vision3 250D",
    description: "Daylight cinema negative with broad dynamic range.",
    tag: "landscape",
    intensity: 68,
    style: {
      contrast: 0.04,
      saturation: 0.96,
      warmth: 0.18,
      tint: 0.04,
      shadowLift: 0.14,
      highlightRollOff: 0.2,
      fade: 0.05,
      crossMix: 0.01,
      redBias: 0.03,
      greenBias: 0.01,
      blueBias: -0.02,
      grain: 0.32,
      halation: 0.4,
      defects: 0.14,
    },
  },
  {
    id: "kodak-vision3-500t",
    name: "Kodak Vision3 500T",
    description: "Tungsten cinema negative for low-light scenes.",
    tag: "night",
    intensity: 72,
    style: {
      contrast: 0.08,
      saturation: 1.02,
      warmth: -0.42,
      tint: -0.18,
      shadowLift: 0.16,
      highlightRollOff: 0.24,
      fade: 0.05,
      crossMix: 0.04,
      redBias: -0.02,
      greenBias: 0.02,
      blueBias: 0.08,
      grain: 0.5,
      halation: 0.62,
      defects: 0.28,
    },
  },
  {
    id: "lomo-800",
    name: "Lomo 800",
    description: "Lo-fi, saturated, and expressive high-speed color.",
    tag: "night",
    intensity: 76,
    style: {
      contrast: 0.25,
      saturation: 1.32,
      warmth: 0.28,
      tint: 0.06,
      shadowLift: 0.05,
      highlightRollOff: 0.1,
      fade: 0.03,
      crossMix: 0.08,
      redBias: 0.09,
      greenBias: -0.01,
      blueBias: 0.04,
      grain: 0.72,
      halation: 0.56,
      defects: 0.54,
    },
  },
  {
    id: "ilford-sfx-200",
    name: "Ilford SFX 200",
    description: "Infrared-friendly monochrome with dramatic separation.",
    tag: "bw",
    intensity: 74,
    style: {
      contrast: 0.21,
      saturation: 0,
      warmth: 0.16,
      tint: 0,
      shadowLift: 0.04,
      highlightRollOff: 0.1,
      fade: 0.01,
      crossMix: 0.03,
      redBias: 0.12,
      greenBias: -0.04,
      blueBias: -0.06,
      grain: 0.46,
      halation: 0.12,
      defects: 0.24,
    },
  },
  {
    id: "adox-color-implosion-100",
    name: "Adox Color Implosion 100",
    description: "Experimental cross-processed color with surreal channel shifts.",
    tag: "landscape",
    intensity: 80,
    style: {
      contrast: 0.3,
      saturation: 1.12,
      warmth: 0.18,
      tint: 0.22,
      shadowLift: 0.02,
      highlightRollOff: 0.05,
      fade: 0.01,
      crossMix: 0.16,
      redBias: 0.12,
      greenBias: -0.08,
      blueBias: 0.09,
      grain: 0.38,
      halation: 0.34,
      defects: 0.3,
    },
  },
];
