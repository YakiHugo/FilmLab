import type {
  ColorScienceModule,
  DefectsModule,
  FilmProfile,
  GrainModule,
  LutAsset,
  ScanModule,
  ToneModule,
} from "@/types";
import { featureFlags } from "@/lib/features";
import { sampleCubeLut } from "@/lib/lut/sample";
import { normalizeFilmProfile } from "./profile";
import { resolveModuleSeed } from "./seed";
import { clamp, createRng, hashNoise2d, lerp, smoothstep, toByte, toUnit } from "./utils";

export interface FilmPipelineContext {
  width: number;
  height: number;
  seedKey?: string;
  seedSalt?: number;
  renderSeed?: number;
  exportSeed?: number;
  lutAsset?: Pick<LutAsset, "size" | "data"> | null;
}

const applyLegacyColorScience = (
  red: number,
  green: number,
  blue: number,
  lutStrength: number
) => {
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const crossStrength = lutStrength * 0.08;

  let nextRed = red + (green - blue) * crossStrength;
  let nextGreen = green + (blue - red) * crossStrength * 0.65;
  let nextBlue = blue + (red - green) * crossStrength;

  nextRed = smoothstep(-lutStrength * 0.2, 1 + lutStrength * 0.16, nextRed);
  nextGreen = smoothstep(-lutStrength * 0.2, 1 + lutStrength * 0.16, nextGreen);
  nextBlue = smoothstep(-lutStrength * 0.2, 1 + lutStrength * 0.16, nextBlue);

  const saturationLift = 1 + lutStrength * 0.12;
  return {
    red: lerp(luminance, nextRed, saturationLift),
    green: lerp(luminance, nextGreen, saturationLift),
    blue: lerp(luminance, nextBlue, saturationLift),
  };
};

const applyColorScienceModule = (
  data: Uint8ClampedArray,
  module: ColorScienceModule,
  lutAsset?: Pick<LutAsset, "size" | "data"> | null
) => {
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

    if (featureFlags.enableCubeLut && lutAsset && module.params.lutAssetId && lutStrength > 0) {
      const sampled = sampleCubeLut(lutAsset, red, green, blue);
      red = lerp(red, sampled[0], lutStrength);
      green = lerp(green, sampled[1], lutStrength);
      blue = lerp(blue, sampled[2], lutStrength);
    } else {
      const legacy = applyLegacyColorScience(red, green, blue, lutStrength);
      red = legacy.red;
      green = legacy.green;
      blue = legacy.blue;
    }

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

const blurFloatMap = (
  source: Float32Array,
  width: number,
  height: number,
  radius: number
) => {
  if (radius <= 0) {
    return source.slice();
  }

  const horizontal = new Float32Array(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleX = clamp(x + offset, 0, width - 1);
        sum += source[y * width + sampleX];
        count += 1;
      }
      horizontal[y * width + x] = sum / count;
    }
  }

  const output = new Float32Array(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleY = clamp(y + offset, 0, height - 1);
        sum += horizontal[sampleY * width + x];
        count += 1;
      }
      output[y * width + x] = sum / count;
    }
  }

  return output;
};

const applyScanModule = (
  data: Uint8ClampedArray,
  module: ScanModule,
  context: FilmPipelineContext
) => {
  const amount = module.amount / 100;
  const { width, height } = context;
  const pixelCount = width * height;

  const halationMap = new Float32Array(pixelCount);
  const bloomMap = new Float32Array(pixelCount);

  for (let index = 0; index < pixelCount; index += 1) {
    const rgbaIndex = index * 4;
    const red = toUnit(data[rgbaIndex]);
    const green = toUnit(data[rgbaIndex + 1]);
    const blue = toUnit(data[rgbaIndex + 2]);
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;

    const halationThreshold = module.params.halationThreshold;
    const bloomThreshold = module.params.bloomThreshold;
    halationMap[index] = clamp(
      (luminance - halationThreshold) / Math.max(0.001, 1 - halationThreshold),
      0,
      1
    );
    bloomMap[index] = clamp(
      (luminance - bloomThreshold) / Math.max(0.001, 1 - bloomThreshold),
      0,
      1
    );
  }

  const halationRadius = Math.round(clamp(module.params.halationAmount * 8, 1, 8));
  const bloomRadius = Math.round(clamp(module.params.bloomAmount * 10, 1, 10));
  const blurredHalation = blurFloatMap(halationMap, width, height, halationRadius);
  const blurredBloom = blurFloatMap(bloomMap, width, height, bloomRadius);

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

      let axisDistance = 0;
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
    const seed = resolveModuleSeed(module, pipelineContext);
    switch (module.id) {
      case "colorScience":
        applyColorScienceModule(imageData.data, module, pipelineContext.lutAsset);
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
