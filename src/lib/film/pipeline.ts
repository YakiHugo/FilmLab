import type {
  ColorScienceModule,
  DefectsModule,
  FilmModuleConfig,
  FilmProfile,
  GrainModule,
  ScanModule,
  ToneModule,
} from "@/types";
import { normalizeFilmProfile } from "./profile";
import {
  clamp,
  createRng,
  hashNoise2d,
  hashString,
  lerp,
  smoothstep,
  toByte,
  toUnit,
} from "./utils";

export interface FilmPipelineContext {
  width: number;
  height: number;
  seedKey?: string;
  renderSeed?: number;
  exportSeed?: number;
}

const resolveSeed = (module: FilmModuleConfig, context: FilmPipelineContext) => {
  if (module.seedMode === "locked" && typeof module.seed === "number") {
    return module.seed | 0;
  }
  if (module.seedMode === "perExport") {
    return (context.exportSeed ?? context.renderSeed ?? 1337) | 0;
  }
  if (module.seedMode === "perRender") {
    return (context.renderSeed ?? Date.now()) | 0;
  }
  const key = context.seedKey ?? "filmlab-default-seed";
  return hashString(`${module.id}:${key}`);
};

const applyColorScienceModule = (data: Uint8ClampedArray, module: ColorScienceModule) => {
  const amount = module.amount / 100;
  const lutStrength = module.params.lutStrength * amount;
  const tempShift = (module.params.temperatureShift / 100) * 0.14 * amount;
  const tintShift = (module.params.tintShift / 100) * 0.12 * amount;
  const redMix = lerp(1, module.params.rgbMix[0], amount);
  const greenMix = lerp(1, module.params.rgbMix[1], amount);
  const blueMix = lerp(1, module.params.rgbMix[2], amount);

  for (let index = 0; index < data.length; index += 4) {
    let red = toUnit(data[index]);
    let green = toUnit(data[index + 1]);
    let blue = toUnit(data[index + 2]);

    red += tempShift + tintShift * 0.2;
    green += tintShift * 0.6;
    blue -= tempShift + tintShift * 0.2;

    red *= redMix;
    green *= greenMix;
    blue *= blueMix;

    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const crossStrength = lutStrength * 0.08;

    red += (green - blue) * crossStrength;
    green += (blue - red) * crossStrength * 0.65;
    blue += (red - green) * crossStrength;

    red = smoothstep(-lutStrength * 0.2, 1 + lutStrength * 0.16, red);
    green = smoothstep(-lutStrength * 0.2, 1 + lutStrength * 0.16, green);
    blue = smoothstep(-lutStrength * 0.2, 1 + lutStrength * 0.16, blue);

    const saturationLift = 1 + lutStrength * 0.12;
    red = lerp(luminance, red, saturationLift);
    green = lerp(luminance, green, saturationLift);
    blue = lerp(luminance, blue, saturationLift);

    data[index] = toByte(red * 255);
    data[index + 1] = toByte(green * 255);
    data[index + 2] = toByte(blue * 255);
  }
};

const applyToneModule = (data: Uint8ClampedArray, module: ToneModule) => {
  const amount = module.amount / 100;
  const exposure = Math.pow(2, (module.params.exposure / 100) * 1.35 * amount);
  const contrast = 1 + (module.params.contrast / 100) * 0.9 * amount;
  const highlightAdjust = (module.params.highlights / 100) * 0.35 * amount;
  const shadowAdjust = (module.params.shadows / 100) * 0.35 * amount;
  const whiteAdjust = (module.params.whites / 100) * 0.28 * amount;
  const blackAdjust = (module.params.blacks / 100) * 0.28 * amount;
  const curveHighlights = (module.params.curveHighlights / 100) * 0.25 * amount;
  const curveLights = (module.params.curveLights / 100) * 0.2 * amount;
  const curveDarks = (module.params.curveDarks / 100) * 0.2 * amount;
  const curveShadows = (module.params.curveShadows / 100) * 0.25 * amount;

  for (let index = 0; index < data.length; index += 4) {
    let red = toUnit(data[index]);
    let green = toUnit(data[index + 1]);
    let blue = toUnit(data[index + 2]);

    red *= exposure;
    green *= exposure;
    blue *= exposure;

    let luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;

    const highlightMask = smoothstep(0.52, 1, luminance);
    const shadowMask = 1 - smoothstep(0, 0.48, luminance);
    const whiteMask = smoothstep(0.78, 1, luminance);
    const blackMask = 1 - smoothstep(0, 0.22, luminance);

    red += highlightMask * highlightAdjust;
    green += highlightMask * highlightAdjust;
    blue += highlightMask * highlightAdjust;

    red += shadowMask * shadowAdjust;
    green += shadowMask * shadowAdjust;
    blue += shadowMask * shadowAdjust;

    red += whiteMask * whiteAdjust;
    green += whiteMask * whiteAdjust;
    blue += whiteMask * whiteAdjust;

    red += blackMask * blackAdjust;
    green += blackMask * blackAdjust;
    blue += blackMask * blackAdjust;

    red = (red - 0.5) * contrast + 0.5;
    green = (green - 0.5) * contrast + 0.5;
    blue = (blue - 0.5) * contrast + 0.5;

    luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;

    const curveDelta =
      smoothstep(0.7, 1, luminance) * curveHighlights +
      smoothstep(0.45, 0.72, luminance) * (1 - smoothstep(0.72, 0.86, luminance)) * curveLights +
      smoothstep(0.18, 0.45, luminance) * (1 - smoothstep(0.45, 0.58, luminance)) * curveDarks +
      (1 - smoothstep(0.12, 0.35, luminance)) * curveShadows;

    red += curveDelta;
    green += curveDelta;
    blue += curveDelta;

    data[index] = toByte(clamp(red, 0, 1) * 255);
    data[index + 1] = toByte(clamp(green, 0, 1) * 255);
    data[index + 2] = toByte(clamp(blue, 0, 1) * 255);
  }
};

/**
 * Separable box blur using a sliding-window running sum.
 *
 * Complexity: O(width × height) regardless of radius (was O(w × h × r)).
 * Uses clamped-edge sampling to match the original behavior.
 */
/**
 * Two-pass box blur (horizontal then vertical) using a sliding window.
 * Accepts optional pre-allocated `temp` and `output` buffers to avoid
 * allocating new Float32Arrays on every call — important for 4K images
 * where each buffer is ~33 MB.
 */
const blurFloatMap = (
  source: Float32Array,
  width: number,
  height: number,
  radius: number,
  temp?: Float32Array,
  output?: Float32Array
) => {
  if (radius <= 0) {
    if (output) {
      output.set(source);
      return output;
    }
    return source.slice();
  }

  const len = source.length;
  const horizontal = temp && temp.length >= len ? temp : new Float32Array(len);

  // --- Horizontal pass (sliding window per row) ---
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    let sum = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      sum += source[rowOffset + clamp(offset, 0, width - 1)];
    }
    const diameter = radius * 2 + 1;
    horizontal[rowOffset] = sum / diameter;

    for (let x = 1; x < width; x += 1) {
      const addX = clamp(x + radius, 0, width - 1);
      const removeX = clamp(x - radius - 1, 0, width - 1);
      sum += source[rowOffset + addX] - source[rowOffset + removeX];
      horizontal[rowOffset + x] = sum / diameter;
    }
  }

  // --- Vertical pass (sliding window per column) ---
  const out = output && output.length >= len ? output : new Float32Array(len);
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      sum += horizontal[clamp(offset, 0, height - 1) * width + x];
    }
    const diameter = radius * 2 + 1;
    out[x] = sum / diameter;

    for (let y = 1; y < height; y += 1) {
      const addY = clamp(y + radius, 0, height - 1);
      const removeY = clamp(y - radius - 1, 0, height - 1);
      sum += horizontal[addY * width + x] - horizontal[removeY * width + x];
      out[y * width + x] = sum / diameter;
    }
  }

  return out;
};

const applyScanModule = (
  data: Uint8ClampedArray,
  module: ScanModule,
  context: FilmPipelineContext
) => {
  const amount = module.amount / 100;
  const { width, height } = context;
  const pixelCount = width * height;

  // Reuse two buffers for both halation and bloom passes instead of
  // allocating four separate Float32Arrays (~132 MB at 4K).
  const mapBuffer = new Float32Array(pixelCount);
  const blurTemp = new Float32Array(pixelCount);

  // --- Pass 1: Compute & blur halation map ---
  const halationThreshold = module.params.halationThreshold;
  const halationDivisor = Math.max(0.001, 1 - halationThreshold);
  for (let index = 0; index < pixelCount; index += 1) {
    const rgbaIndex = index * 4;
    const luminance =
      toUnit(data[rgbaIndex]) * 0.2126 +
      toUnit(data[rgbaIndex + 1]) * 0.7152 +
      toUnit(data[rgbaIndex + 2]) * 0.0722;
    mapBuffer[index] = clamp((luminance - halationThreshold) / halationDivisor, 0, 1);
  }
  const halationRadius = Math.round(clamp(module.params.halationAmount * 8, 1, 8));
  // Blur halation in-place: mapBuffer → blurredHalation (stored in blurTemp)
  const blurredHalation = blurFloatMap(mapBuffer, width, height, halationRadius, undefined, blurTemp);

  // --- Pass 2: Compute & blur bloom map (reuse mapBuffer) ---
  const bloomThreshold = module.params.bloomThreshold;
  const bloomDivisor = Math.max(0.001, 1 - bloomThreshold);
  for (let index = 0; index < pixelCount; index += 1) {
    const rgbaIndex = index * 4;
    const luminance =
      toUnit(data[rgbaIndex]) * 0.2126 +
      toUnit(data[rgbaIndex + 1]) * 0.7152 +
      toUnit(data[rgbaIndex + 2]) * 0.0722;
    mapBuffer[index] = clamp((luminance - bloomThreshold) / bloomDivisor, 0, 1);
  }
  const bloomRadius = Math.round(clamp(module.params.bloomAmount * 10, 1, 10));
  // Blur bloom: mapBuffer → blurredBloom (allocates inside blurFloatMap since blurTemp holds halation)
  const blurredBloom = blurFloatMap(mapBuffer, width, height, bloomRadius);

  const vignetteStrength = module.params.vignetteAmount * amount;
  const warmthStrength = (module.params.scanWarmth / 100) * 0.12 * amount;
  const centerX = width / 2;
  const centerY = height / 2;
  const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY);

  for (let index = 0; index < pixelCount; index += 1) {
    const rgbaIndex = index * 4;
    let red = toUnit(data[rgbaIndex]);
    let green = toUnit(data[rgbaIndex + 1]);
    let blue = toUnit(data[rgbaIndex + 2]);

    const bloom = blurredBloom[index] * module.params.bloomAmount * amount;
    const halation = blurredHalation[index] * module.params.halationAmount * amount;

    red += bloom * 0.22 + halation * 0.28;
    green += bloom * 0.14 + halation * 0.08;
    blue += bloom * 0.1;

    red += warmthStrength;
    blue -= warmthStrength;

    const x = index % width;
    const y = Math.floor(index / width);
    const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
    const edge = smoothstep(0.25, 1, distance / maxDistance);

    if (vignetteStrength >= 0) {
      const gain = 1 - edge * edge * Math.abs(vignetteStrength);
      red *= gain;
      green *= gain;
      blue *= gain;
    } else {
      const lift = edge * edge * Math.abs(vignetteStrength) * 0.35;
      red += lift;
      green += lift;
      blue += lift;
    }

    data[rgbaIndex] = toByte(clamp(red, 0, 1) * 255);
    data[rgbaIndex + 1] = toByte(clamp(green, 0, 1) * 255);
    data[rgbaIndex + 2] = toByte(clamp(blue, 0, 1) * 255);
  }
};

const applyGrainModule = (
  data: Uint8ClampedArray,
  module: GrainModule,
  context: FilmPipelineContext,
  seed: number
) => {
  const amount = module.amount / 100;
  const grainAmount = module.params.amount * amount;
  if (grainAmount <= 0) {
    return;
  }

  const grainScale = lerp(2.8, 0.45, module.params.size);
  const roughness = module.params.roughness;
  const chroma = module.params.color;
  const shadowBoost = module.params.shadowBoost;

  for (let y = 0; y < context.height; y += 1) {
    for (let x = 0; x < context.width; x += 1) {
      const index = (y * context.width + x) * 4;
      let red = toUnit(data[index]);
      let green = toUnit(data[index + 1]);
      let blue = toUnit(data[index + 2]);

      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      const coarseNoise = hashNoise2d(Math.floor(x * grainScale), Math.floor(y * grainScale), seed);
      const fineNoise = hashNoise2d(x * 3, y * 3, seed ^ 0x9e3779b9);
      const mixedNoise = lerp(coarseNoise, fineNoise, roughness) - 0.5;
      const shadowWeight = 1 + (1 - luminance) * shadowBoost;
      const noiseStrength = mixedNoise * grainAmount * 0.55 * shadowWeight;

      const colorNoiseR = (hashNoise2d(x, y, seed ^ 0x1234) - 0.5) * chroma;
      const colorNoiseG = (hashNoise2d(x + 17, y + 31, seed ^ 0x5678) - 0.5) * chroma;
      const colorNoiseB = (hashNoise2d(x + 47, y + 13, seed ^ 0xabcd) - 0.5) * chroma;

      red += noiseStrength * (1 + colorNoiseR);
      green += noiseStrength * (1 + colorNoiseG);
      blue += noiseStrength * (1 + colorNoiseB);

      data[index] = toByte(clamp(red, 0, 1) * 255);
      data[index + 1] = toByte(clamp(green, 0, 1) * 255);
      data[index + 2] = toByte(clamp(blue, 0, 1) * 255);
    }
  }
};

const paintLightLeak = (
  data: Uint8ClampedArray,
  context: FilmPipelineContext,
  strength: number,
  seed: number
) => {
  const edgeSelector = Math.floor(hashNoise2d(3, 7, seed) * 4);
  const pivot = hashNoise2d(7, 11, seed);

  for (let y = 0; y < context.height; y += 1) {
    for (let x = 0; x < context.width; x += 1) {
      const index = (y * context.width + x) * 4;
      const nx = x / Math.max(1, context.width - 1);
      const ny = y / Math.max(1, context.height - 1);

      let axisDistance: number;
      switch (edgeSelector) {
        case 0:
          axisDistance = Math.abs(nx - pivot);
          axisDistance += ny;
          break;
        case 1:
          axisDistance = Math.abs(nx - pivot);
          axisDistance += 1 - ny;
          break;
        case 2:
          axisDistance = Math.abs(ny - pivot);
          axisDistance += nx;
          break;
        default:
          axisDistance = Math.abs(ny - pivot);
          axisDistance += 1 - nx;
          break;
      }

      const leak = clamp(1 - axisDistance * 1.2, 0, 1);
      if (leak <= 0) {
        continue;
      }

      const redLift = leak * strength * 0.34;
      const greenLift = leak * strength * 0.16;
      const blueLift = leak * strength * 0.05;

      data[index] = toByte(data[index] + redLift * 255);
      data[index + 1] = toByte(data[index + 1] + greenLift * 255);
      data[index + 2] = toByte(data[index + 2] + blueLift * 255);
    }
  }
};

const paintDust = (
  data: Uint8ClampedArray,
  context: FilmPipelineContext,
  amount: number,
  seed: number
) => {
  if (amount <= 0) {
    return;
  }

  const rng = createRng(seed);
  const spots = Math.round((context.width * context.height * amount) / 22000);

  for (let spotIndex = 0; spotIndex < spots; spotIndex += 1) {
    const centerX = Math.floor(rng() * context.width);
    const centerY = Math.floor(rng() * context.height);
    const radius = Math.max(1, Math.round(1 + rng() * 2.8));
    const alpha = 0.12 + rng() * 0.18;

    for (let y = -radius; y <= radius; y += 1) {
      for (let x = -radius; x <= radius; x += 1) {
        const px = centerX + x;
        const py = centerY + y;
        if (px < 0 || py < 0 || px >= context.width || py >= context.height) {
          continue;
        }
        const distance = Math.sqrt(x * x + y * y) / radius;
        if (distance > 1) {
          continue;
        }
        const opacity = (1 - distance) * alpha;
        const index = (py * context.width + px) * 4;
        const lift = rng() > 0.55 ? -opacity * 255 : opacity * 255;
        data[index] = toByte(data[index] + lift);
        data[index + 1] = toByte(data[index + 1] + lift);
        data[index + 2] = toByte(data[index + 2] + lift);
      }
    }
  }
};

const paintScratches = (
  data: Uint8ClampedArray,
  context: FilmPipelineContext,
  amount: number,
  seed: number
) => {
  if (amount <= 0) {
    return;
  }

  const rng = createRng(seed ^ 0x6a09e667);
  const lines = Math.round((context.width * amount) / 380);

  for (let lineIndex = 0; lineIndex < lines; lineIndex += 1) {
    const startX = Math.floor(rng() * context.width);
    const width = Math.max(1, Math.round(1 + rng() * 1.8));
    const offset = (rng() - 0.5) * 0.2;
    const opacity = 0.08 + rng() * 0.14;

    for (let y = 0; y < context.height; y += 1) {
      const drift = Math.round(offset * y);
      for (let x = 0; x < width; x += 1) {
        const px = startX + drift + x;
        if (px < 0 || px >= context.width) {
          continue;
        }
        const index = (y * context.width + px) * 4;
        const lift = (rng() > 0.5 ? 1 : -1) * opacity * 255;
        data[index] = toByte(data[index] + lift);
        data[index + 1] = toByte(data[index + 1] + lift);
        data[index + 2] = toByte(data[index + 2] + lift);
      }
    }
  }
};

const applyDefectsModule = (
  data: Uint8ClampedArray,
  module: DefectsModule,
  context: FilmPipelineContext,
  seed: number
) => {
  const amount = module.amount / 100;
  const leakProbability = module.params.leakProbability * amount;
  const leakStrength = module.params.leakStrength * amount;
  const dustAmount = module.params.dustAmount * amount;
  const scratchAmount = module.params.scratchAmount * amount;

  if (hashNoise2d(13, 17, seed) < leakProbability) {
    paintLightLeak(data, context, leakStrength, seed);
  }
  paintDust(data, context, dustAmount, seed);
  paintScratches(data, context, scratchAmount, seed);
};

export const applyFilmPipeline = (
  imageData: ImageData,
  profile: FilmProfile,
  context: Omit<FilmPipelineContext, "width" | "height"> = {}
) => {
  const normalizedProfile = normalizeFilmProfile(profile);
  const pipelineContext: FilmPipelineContext = {
    width: imageData.width,
    height: imageData.height,
    ...context,
  };

  normalizedProfile.modules.forEach((module) => {
    if (!module.enabled || module.amount <= 0) {
      return;
    }
    const seed = resolveSeed(module, pipelineContext);
    switch (module.id) {
      case "colorScience":
        applyColorScienceModule(imageData.data, module);
        break;
      case "tone":
        applyToneModule(imageData.data, module);
        break;
      case "scan":
        applyScanModule(imageData.data, module, pipelineContext);
        break;
      case "grain":
        applyGrainModule(imageData.data, module, pipelineContext, seed);
        break;
      case "defects":
        applyDefectsModule(imageData.data, module, pipelineContext, seed);
        break;
      default:
        break;
    }
  });
};
