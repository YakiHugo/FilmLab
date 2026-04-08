import { normalizeAdjustments } from "@/lib/adjustments";
import { resolveRenderProfile } from "@/lib/film";
import type { PipelineRenderer } from "@/lib/renderer/PipelineRenderer";
import type { GeometryUniforms } from "@/lib/renderer/types";
import {
  resolveCurveUniforms,
  resolveDetailUniforms,
  resolveFilmUniforms,
  resolveFilmUniformsV3,
  resolveFromAdjustments,
  resolveHalationBloomUniforms,
  resolveHalationBloomUniformsV3,
  resolveHslUniforms,
} from "@/lib/renderer/uniformResolvers";
import type {
  EditingAdjustments,
  FilmProfile,
} from "@/types";
import type { FilmProfileAny, FilmProfileV2 } from "@/types/film";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

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

const sanitizeForLut = (
  adjustments: EditingAdjustments,
  filmProfile: FilmProfileAny | null
): { adjustments: EditingAdjustments; filmProfile: FilmProfileAny | null } => {
  const cleanAdjustments: EditingAdjustments = {
    ...adjustments,
    texture: 0,
    clarity: 0,
    sharpening: 0,
    noiseReduction: 0,
    colorNoiseReduction: 0,
    grain: 0,
    vignette: 0,
    glowIntensity: 0,
    customLut: adjustments.customLut
      ? {
          ...adjustments.customLut,
        }
      : undefined,
    localAdjustments: [],
  };

  if (!filmProfile) {
    return {
      adjustments: cleanAdjustments,
      filmProfile,
    };
  }

  if ((filmProfile as FilmProfileAny).version === 3) {
    const profileV3 = filmProfile as FilmProfileAny & { version: 3 };
    return {
      adjustments: cleanAdjustments,
      filmProfile: {
        ...profileV3,
        grain: {
          ...profileV3.grain,
          enabled: false,
          amount: 0,
        },
        vignette: {
          ...profileV3.vignette,
          enabled: false,
          amount: 0,
        },
        halation: profileV3.halation
          ? {
              ...profileV3.halation,
              enabled: false,
              intensity: 0,
            }
          : profileV3.halation,
        bloom: profileV3.bloom
          ? {
              ...profileV3.bloom,
              enabled: false,
              intensity: 0,
            }
          : profileV3.bloom,
        glow: profileV3.glow
          ? {
              ...profileV3.glow,
              enabled: false,
              intensity: 0,
            }
          : profileV3.glow,
        filmBreath: profileV3.filmBreath
          ? {
              ...profileV3.filmBreath,
              enabled: false,
              amount: 0,
            }
          : profileV3.filmBreath,
        filmDamage: profileV3.filmDamage
          ? {
              ...profileV3.filmDamage,
              enabled: false,
              amount: 0,
            }
          : profileV3.filmDamage,
        gateWeave: profileV3.gateWeave
          ? {
              ...profileV3.gateWeave,
              enabled: false,
              amount: 0,
            }
          : profileV3.gateWeave,
        overscan: profileV3.overscan
          ? {
              ...profileV3.overscan,
              enabled: false,
              amount: 0,
            }
          : profileV3.overscan,
      },
    };
  }

  if ((filmProfile as FilmProfileAny).version === 2) {
    const profileV2 = filmProfile as FilmProfileV2;
    return {
      adjustments: cleanAdjustments,
      filmProfile: {
        ...profileV2,
        grain: {
          ...profileV2.grain,
          enabled: false,
          amount: 0,
        },
        vignette: {
          ...profileV2.vignette,
          enabled: false,
          amount: 0,
        },
        halation: profileV2.halation
          ? {
              ...profileV2.halation,
              enabled: false,
              intensity: 0,
            }
          : profileV2.halation,
        bloom: profileV2.bloom
          ? {
              ...profileV2.bloom,
              enabled: false,
              intensity: 0,
            }
          : profileV2.bloom,
        defects: profileV2.defects
          ? {
              ...profileV2.defects,
              enabled: false,
              leakProbability: 0,
              leakStrength: 0,
              dustAmount: 0,
              scratchAmount: 0,
            }
          : profileV2.defects,
      },
    };
  }

  if ((filmProfile as FilmProfile).version === 1) {
    const profileV1 = filmProfile as FilmProfile;
    const modules = profileV1.modules.map((module) => {
      if (module.id === "grain") {
        return {
          ...module,
          enabled: false,
          amount: 0,
          params: {
            ...module.params,
            amount: 0,
          },
        };
      }
      if (module.id === "scan") {
        return {
          ...module,
          params: {
            ...module.params,
            halationAmount: 0,
            bloomAmount: 0,
            vignetteAmount: 0,
          },
        };
      }
      if (module.id === "defects") {
        return {
          ...module,
          enabled: false,
          amount: 0,
          params: {
            ...module.params,
            leakProbability: 0,
            leakStrength: 0,
            dustAmount: 0,
            scratchAmount: 0,
          },
        };
      }
      return module;
    }) as FilmProfile["modules"];
    return {
      adjustments: cleanAdjustments,
      filmProfile: {
        ...profileV1,
        modules,
      },
    };
  }

  return {
    adjustments: cleanAdjustments,
    filmProfile,
  };
};

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
  adjustments: EditingAdjustments,
  filmProfile: FilmProfile | FilmProfileAny | null,
  size: 17 | 33 = 33
): Promise<string> {
  const normalized = normalizeAdjustments(adjustments);
  const sanitized = sanitizeForLut(normalized, filmProfile);
  const resolvedProfile = resolveRenderProfile(sanitized.adjustments, sanitized.filmProfile);

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
  const master = resolveFromAdjustments(sanitized.adjustments);
  const hsl = resolveHslUniforms(sanitized.adjustments);
  const curve = resolveCurveUniforms(sanitized.adjustments);
  const detail = resolveDetailUniforms(sanitized.adjustments);

  let filmUniforms = null;
  let halationUniforms = null;

  if (resolvedProfile.mode === "v3") {
    filmUniforms = resolveFilmUniformsV3(resolvedProfile.v3, {
      grainSeed: 0,
    });
    filmUniforms.u_lutEnabled = filmUniforms.u_lutEnabled && !!resolvedProfile.lut;
    if (!filmUniforms.u_lutEnabled) {
      filmUniforms.u_lutIntensity = 0;
    }
    filmUniforms.u_lutMixEnabled = filmUniforms.u_lutEnabled && !!resolvedProfile.lutBlend;
    filmUniforms.u_lutMixFactor = resolvedProfile.lutBlend?.mixFactor ?? 0;
    halationUniforms = resolveHalationBloomUniformsV3(resolvedProfile.v3);
  } else if (resolvedProfile.legacyV1) {
    filmUniforms = resolveFilmUniforms(resolvedProfile.legacyV1, {
      grainSeed: 0,
    });
    filmUniforms.u_lutMixEnabled = false;
    filmUniforms.u_lutMixFactor = 0;
    halationUniforms = resolveHalationBloomUniforms(resolvedProfile.legacyV1);
  }

  renderer.render(geometry, master, hsl, curve, detail, filmUniforms, {
    skipGeometry: true,
    skipDetail: true,
    skipHalationBloom: true,
  }, halationUniforms);

  const pixels = await renderer.extractPixelsAsync();
  return pixelsToCube(pixels, width, height, size);
}
