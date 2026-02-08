import {
  filmStockDefinitions,
  toLutAssetId,
  type BuiltInLutStyle,
} from "@/data/filmStockDefinitions";
import { getLutAsset, loadLutAssets, saveLutAsset } from "@/lib/db";
import type { LutAsset } from "@/types";
import { parseCubeLutFile } from "./cube";

const BUILT_IN_CREATED_AT = "2026-02-08T00:00:00.000Z";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const createIdentityLut = (size: number): Float32Array => {
  const values = new Float32Array(size * size * size * 3);
  let pointer = 0;
  const denominator = Math.max(1, size - 1);
  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        values[pointer] = r / denominator;
        values[pointer + 1] = g / denominator;
        values[pointer + 2] = b / denominator;
        pointer += 3;
      }
    }
  }
  return values;
};

const applyToneCurve = (value: number, style: BuiltInLutStyle) => {
  const faded = value * (1 - style.fade) + style.fade * 0.5;
  const lifted = faded + style.shadowLift * (1 - faded) * (1 - faded);
  const rolled = lifted - style.highlightRollOff * lifted * lifted * 0.5;
  const contrasted = (rolled - 0.5) * (1 + style.contrast) + 0.5;
  return clamp01(contrasted);
};

const applyStyle = (
  red: number,
  green: number,
  blue: number,
  style: BuiltInLutStyle
) => {
  let r = red * (1 + style.redBias * 0.16 + style.warmth * 0.08 + style.tint * 0.04);
  let g = green * (1 + style.greenBias * 0.14 - Math.abs(style.tint) * 0.03);
  let b = blue * (1 + style.blueBias * 0.16 - style.warmth * 0.08 + style.tint * 0.04);

  if (style.crossMix !== 0) {
    const mix = style.crossMix;
    const nextR = r + (g - r) * mix * 0.35;
    const nextG = g + (b - g) * mix * 0.3;
    const nextB = b + (r - b) * mix * 0.35;
    r = nextR;
    g = nextG;
    b = nextB;
  }

  const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
  r = luma + (r - luma) * style.saturation;
  g = luma + (g - luma) * style.saturation;
  b = luma + (b - luma) * style.saturation;

  r = applyToneCurve(r, style);
  g = applyToneCurve(g, style);
  b = applyToneCurve(b, style);

  if (style.saturation <= 0.01) {
    const mono = clamp01(r * 0.299 + g * 0.587 + b * 0.114);
    return [mono, mono, mono] as const;
  }

  return [clamp01(r), clamp01(g), clamp01(b)] as const;
};

const createStyledLut = (size: number, style: BuiltInLutStyle): Float32Array => {
  const values = new Float32Array(size * size * size * 3);
  let pointer = 0;
  const denominator = Math.max(1, size - 1);
  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        const normalizedR = r / denominator;
        const normalizedG = g / denominator;
        const normalizedB = b / denominator;
        const [nextR, nextG, nextB] = applyStyle(
          normalizedR,
          normalizedG,
          normalizedB,
          style
        );
        values[pointer] = nextR;
        values[pointer + 1] = nextG;
        values[pointer + 2] = nextB;
        pointer += 3;
      }
    }
  }
  return values;
};

const BUILT_IN_LUTS: LutAsset[] = [
  {
    id: "builtin-lut-identity-16",
    name: "Identity 16",
    format: "cube",
    size: 16,
    data: createIdentityLut(16),
    source: "builtIn",
    createdAt: BUILT_IN_CREATED_AT,
  },
  ...filmStockDefinitions.map((stock) => ({
    id: toLutAssetId(stock.id),
    name: `${stock.name} 16`,
    format: "cube" as const,
    size: 16,
    data: createStyledLut(16, stock.style),
    source: "builtIn" as const,
    createdAt: BUILT_IN_CREATED_AT,
  })),
];

const lutCache = new Map<string, LutAsset>();
let initialized = false;
let loading: Promise<void> | null = null;

const upsertCache = (asset: LutAsset) => {
  lutCache.set(asset.id, asset);
};

export const initializeLutRegistry = async () => {
  if (initialized) {
    return;
  }
  if (!loading) {
    loading = (async () => {
      BUILT_IN_LUTS.forEach((asset) => upsertCache(asset));
      const imported = await loadLutAssets();
      imported.forEach((asset) => upsertCache(asset));
      initialized = true;
      loading = null;
    })();
  }
  await loading;
};

export const listLutAssets = async () => {
  await initializeLutRegistry();
  return Array.from(lutCache.values()).map((asset) => ({
    ...asset,
    data: asset.data,
  }));
};

export const resolveLutAsset = async (assetId: string | undefined) => {
  if (!assetId) {
    return null;
  }
  await initializeLutRegistry();
  const cached = lutCache.get(assetId);
  if (cached) {
    return cached;
  }
  const loaded = await getLutAsset(assetId);
  if (loaded) {
    upsertCache(loaded);
    return loaded;
  }
  return null;
};

export const importCubeLut = async (file: File) => {
  const parsed = await parseCubeLutFile(file);
  await saveLutAsset(parsed);
  upsertCache(parsed);
  return parsed;
};
