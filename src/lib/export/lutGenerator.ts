import { resolveRenderProfileFromState } from "@/lib/film";
import type { PipelineRenderer } from "@/lib/renderer/PipelineRenderer";
import {
  resolveCurveUniformsFromState,
  resolveDetailUniformsFromState,
  resolveFilmUniformsV3,
  resolveHalationBloomUniformsV3,
  resolveHslUniformsFromState,
  resolveMasterUniforms,
} from "@/lib/renderer/uniformResolvers";
import type { GeometryUniforms } from "@/lib/renderer/types";
import type { CanvasImageRenderStateV1 } from "@/render/image";
import type { FilmProfileV3 } from "@/types/film";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const cloneValue = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value) as T;
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const createIdentityLutCanvas = (size: number) => {
  const width = size * size;
  const height = size;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Failed to create LUT source canvas.");
  }

  const imageData = context.createImageData(width, height);
  const data = imageData.data;
  const maxIndex = Math.max(1, size - 1);

  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        const x = b * size + r;
        const y = g;
        const offset = (y * width + x) * 4;
        data[offset] = Math.round((r / maxIndex) * 255);
        data[offset + 1] = Math.round((g / maxIndex) * 255);
        data[offset + 2] = Math.round((b / maxIndex) * 255);
        data[offset + 3] = 255;
      }
    }
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
};

const createPassthroughGeometryUniforms = (width: number, height: number): GeometryUniforms => ({
  enabled: false,
  cropRect: [0, 0, 1, 1],
  sourceSize: [width, height],
  outputSize: [width, height],
  translatePx: [0, 0],
  rotate: 0,
  perspectiveEnabled: false,
  homography: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  scale: 1,
  flip: [1, 1],
  lensEnabled: false,
  lensK1: 0,
  lensK2: 0,
  lensVignetteBoost: 0,
  lensVignetteMidpoint: 0.25,
  caEnabled: false,
  caAmountPxRgb: [0, 0, 0],
});

const sanitizeRenderStateForLut = (state: CanvasImageRenderStateV1): CanvasImageRenderStateV1 => {
  const next = cloneValue(state);
  next.develop.detail.texture = 0;
  next.develop.detail.clarity = 0;
  next.develop.detail.sharpening = 0;
  next.develop.detail.noiseReduction = 0;
  next.develop.detail.colorNoiseReduction = 0;
  next.develop.fx.grain = 0;
  next.develop.fx.vignette = 0;
  next.develop.fx.glowIntensity = 0;
  next.develop.regions = [];
  next.masks.byId = {};
  next.effects = [];
  return next;
};

const sanitizeFilmProfileForLut = (profile: FilmProfileV3): FilmProfileV3 => ({
  ...profile,
  grain: {
    ...profile.grain,
    enabled: false,
    amount: 0,
  },
  vignette: {
    ...profile.vignette,
    enabled: false,
    amount: 0,
  },
  halation: profile.halation
    ? {
        ...profile.halation,
        enabled: false,
        intensity: 0,
      }
    : profile.halation,
  bloom: profile.bloom
    ? {
        ...profile.bloom,
        enabled: false,
        intensity: 0,
      }
    : profile.bloom,
  glow: profile.glow
    ? {
        ...profile.glow,
        enabled: false,
        intensity: 0,
      }
    : profile.glow,
  filmBreath: profile.filmBreath
    ? {
        ...profile.filmBreath,
        enabled: false,
        amount: 0,
      }
    : profile.filmBreath,
  filmDamage: profile.filmDamage
    ? {
        ...profile.filmDamage,
        enabled: false,
        amount: 0,
      }
    : profile.filmDamage,
  gateWeave: profile.gateWeave
    ? {
        ...profile.gateWeave,
        enabled: false,
        amount: 0,
      }
    : profile.gateWeave,
  overscan: profile.overscan
    ? {
        ...profile.overscan,
        enabled: false,
        amount: 0,
      }
    : profile.overscan,
});

const pixelsToCube = (pixels: Uint8Array, width: number, height: number, size: number): string => {
  const lines: string[] = [];
  lines.push("# FilmLab generated LUT");
  lines.push(`TITLE "FilmLab LUT ${size}"`);
  lines.push(`LUT_3D_SIZE ${size}`);
  lines.push("DOMAIN_MIN 0.0 0.0 0.0");
  lines.push("DOMAIN_MAX 1.0 1.0 1.0");

  for (let b = 0; b < size; b += 1) {
    for (let g = 0; g < size; g += 1) {
      for (let r = 0; r < size; r += 1) {
        const x = b * size + r;
        const y = g;
        const flippedY = height - 1 - y;
        const offset = (flippedY * width + x) * 4;
        const rr = clamp01((pixels[offset] ?? 0) / 255);
        const gg = clamp01((pixels[offset + 1] ?? 0) / 255);
        const bb = clamp01((pixels[offset + 2] ?? 0) / 255);
        lines.push(`${rr.toFixed(6)} ${gg.toFixed(6)} ${bb.toFixed(6)}`);
      }
    }
  }

  return `${lines.join("\n")}\n`;
};

export async function generateCubeLUT(
  renderer: PipelineRenderer,
  state: CanvasImageRenderStateV1,
  size: 17 | 33 = 33
): Promise<string> {
  const sanitizedState = sanitizeRenderStateForLut(state);
  const resolvedProfile = resolveRenderProfileFromState({
    film: sanitizedState.film,
    develop: sanitizedState.develop,
  });
  const sanitizedFilmProfile = sanitizeFilmProfileForLut(resolvedProfile.v3);

  const source = createIdentityLutCanvas(size);
  const width = source.width;
  const height = source.height;

  renderer.updateSource(source, width, height, width, height);

  if (resolvedProfile.lut) {
    await renderer.ensureLUT({
      url: resolvedProfile.lut.path,
      level: resolvedProfile.lut.size,
    });
  }
  if (resolvedProfile.lutBlend && typeof renderer.ensureLUTBlend === "function") {
    await renderer.ensureLUTBlend({
      url: resolvedProfile.lutBlend.path,
      level: resolvedProfile.lutBlend.size,
    });
  }
  if (resolvedProfile.customLut) {
    await renderer.ensureCustomLUT({
      url: resolvedProfile.customLut.path,
      level: resolvedProfile.customLut.size,
    });
  }
  if (resolvedProfile.printLut) {
    await renderer.ensurePrintLUT({
      url: resolvedProfile.printLut.path,
      level: resolvedProfile.printLut.size,
    });
  }

  const geometry = createPassthroughGeometryUniforms(width, height);
  const master = resolveMasterUniforms(
    sanitizedState.develop.tone,
    sanitizedState.develop.color,
    sanitizedState.develop.detail
  );
  const hsl = resolveHslUniformsFromState(sanitizedState.develop.color);
  const curve = resolveCurveUniformsFromState(sanitizedState.develop.color);
  const detail = resolveDetailUniformsFromState(sanitizedState.develop.detail);

  const filmUniforms = resolveFilmUniformsV3(sanitizedFilmProfile, {
    grainSeed: 0,
  });
  filmUniforms.u_lutEnabled = filmUniforms.u_lutEnabled && !!resolvedProfile.lut;
  if (!filmUniforms.u_lutEnabled) {
    filmUniforms.u_lutIntensity = 0;
  }
  filmUniforms.u_lutMixEnabled = filmUniforms.u_lutEnabled && !!resolvedProfile.lutBlend;
  filmUniforms.u_lutMixFactor = resolvedProfile.lutBlend?.mixFactor ?? 0;
  const halationUniforms = resolveHalationBloomUniformsV3(sanitizedFilmProfile);

  renderer.render(
    geometry,
    master,
    hsl,
    curve,
    detail,
    filmUniforms,
    {
      skipGeometry: true,
      skipDetail: true,
      skipHalationBloom: true,
    },
    halationUniforms
  );

  const pixels = await renderer.extractPixelsAsync();
  return pixelsToCube(pixels, width, height, size);
}
