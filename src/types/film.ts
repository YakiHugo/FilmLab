import type { FilmProfile } from "./index";

export interface FilmProfileV2 {
  id: string;
  version: 2;
  name: string;
  description?: string;
  type: "negative" | "slide" | "instant" | "bw";
  tags?: string[];

  toneResponse: {
    enabled: boolean;
    shoulder: number;
    toe: number;
    gamma: number;
  };

  colorMatrix?: {
    enabled: boolean;
    matrix: [number, number, number, number, number, number, number, number, number];
  };

  lut: {
    enabled: boolean;
    path: string;
    size: 8 | 16;
    intensity: number;
  };

  colorCast?: {
    enabled: boolean;
    shadows: [number, number, number];
    midtones: [number, number, number];
    highlights: [number, number, number];
  };

  halation?: {
    enabled: boolean;
    intensity: number;
    threshold: number;
    color: [number, number, number];
    radius: number;
  };

  bloom?: {
    enabled: boolean;
    intensity: number;
    threshold: number;
    radius: number;
  };

  grain: {
    enabled: boolean;
    amount: number;
    size: number;
    colorGrain: boolean;
    roughness: number;
    shadowBias: number;
  };

  vignette: {
    enabled: boolean;
    amount: number;
    midpoint: number;
    roundness: number;
  };

  defects?: {
    enabled: boolean;
    leakProbability: number;
    leakStrength: number;
    dustAmount: number;
    scratchAmount: number;
  };
}

export interface FilmPushPullLutVariant {
  path: string;
  size?: 8 | 16;
  intensity?: number;
}

export interface FilmPushPullSettings {
  enabled: boolean;
  ev: number;
  minEv?: number;
  maxEv?: number;
  lutByStop?: Record<string, string | FilmPushPullLutVariant>;
}

export interface FilmGateWeaveSettings {
  enabled: boolean;
  amount: number;
  seed?: number;
}

export interface FilmProfileV3 {
  id: string;
  version: 3;
  name: string;
  description?: string;
  type: "negative" | "slide" | "instant" | "bw";
  tags?: string[];

  expand?: {
    enabled: boolean;
    blackPoint: number;
    whitePoint: number;
  };

  filmCompression?: {
    enabled: boolean;
    highlightRolloff: number;
    shoulderWidth: number;
  };

  filmDeveloper?: {
    enabled: boolean;
    contrast: number;
    gamma: number;
    colorSeparation: [number, number, number];
  };

  toneResponse: {
    enabled: boolean;
    shoulder: number;
    toe: number;
    gamma: number;
  };

  colorMatrix?: {
    enabled: boolean;
    matrix: [number, number, number, number, number, number, number, number, number];
  };

  lut3d: {
    enabled: boolean;
    path: string;
    size: 8 | 16;
    intensity: number;
  };

  pushPull?: FilmPushPullSettings;

  print?: {
    enabled: boolean;
    stock: "kodak-2383" | "endura" | "cineon-log" | "custom";
    density: number;
    contrast: number;
    warmth: number;
    targetWhiteKelvin?: number;
    lutPath?: string;
    lutSize?: 8 | 16;
  };

  cmyColorHead?: {
    enabled: boolean;
    cyan: number;
    magenta: number;
    yellow: number;
  };

  colorCast?: {
    enabled: boolean;
    shadows: [number, number, number];
    midtones: [number, number, number];
    highlights: [number, number, number];
  };

  printToning?: {
    enabled: boolean;
    shadows: [number, number, number];
    midtones: [number, number, number];
    highlights: [number, number, number];
    strength: number;
  };

  halation?: {
    enabled: boolean;
    intensity: number;
    threshold: number;
    radius: number;
    hue: number;
    saturation: number;
    blueCompensation: number;
  };

  bloom?: {
    enabled: boolean;
    intensity: number;
    threshold: number;
    radius: number;
  };

  grain: {
    enabled: boolean;
    model: "blue-noise" | "procedural";
    amount: number;
    size: number;
    colorGrain: boolean;
    roughness: number;
    shadowBias: number;
    crystalDensity: number;
    crystalSizeMean: number;
    crystalSizeVariance: number;
    colorSeparation: [number, number, number];
    scannerMTF: number;
    filmFormat: "8mm" | "16mm" | "35mm" | "65mm";
  };

  vignette: {
    enabled: boolean;
    amount: number;
    midpoint: number;
    roundness: number;
  };

  glow?: {
    enabled: boolean;
    intensity: number;
    midtoneFocus: number;
    bias: number;
    radius?: number;
  };

  filmBreath?: {
    enabled: boolean;
    amount: number;
  };

  gateWeave?: FilmGateWeaveSettings;

  filmDamage?: {
    enabled: boolean;
    amount: number;
  };

  overscan?: {
    enabled: boolean;
    amount: number;
    roundness: number;
  };

  customLut?: {
    enabled: boolean;
    path: string;
    size: 8 | 16;
    intensity: number;
  };

  defects?: {
    enabled: boolean;
    leakProbability: number;
    leakStrength: number;
    dustAmount: number;
    scratchAmount: number;
  };
}

export type FilmProfileAny = FilmProfile | FilmProfileV2 | FilmProfileV3;

export interface ResolvedPushPull {
  enabled: boolean;
  ev: number;
  source: "none" | "profile" | "state";
  selectedStop: number | null;
}

export interface ResolvedRenderProfile {
  mode: "v3";
  source: FilmProfileAny;
  v2: FilmProfileV2;
  v3: FilmProfileV3;
  lut:
    | {
        path: string;
        size: 8 | 16;
        intensity: number;
      }
    | null;
  lutBlend:
    | {
        path: string;
        size: 8 | 16;
        mixFactor: number;
      }
    | null;
  customLut:
    | {
        path: string;
        size: 8 | 16;
        intensity: number;
      }
    | null;
  printLut:
    | {
        path: string;
        size: 8 | 16;
      }
    | null;
  pushPull: ResolvedPushPull;
}
