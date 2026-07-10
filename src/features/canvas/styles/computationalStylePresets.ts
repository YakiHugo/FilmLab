import { clamp } from "@/lib/math";
import type { CanvasImageRenderStateV1 } from "@/render/image";
import {
  applyAsciiAdjustmentsToRenderState,
  applyChannelDriftAdjustmentsToRenderState,
  applyHalftoneAdjustmentsToRenderState,
  getCanvasImageEditValues,
} from "../image/imageRenderStateEditing";

export const COMPUTATIONAL_STYLE_PRESETS = [
  {
    id: "mono-terminal",
    code: "01 / TERM",
    name: "Mono Terminal",
    label: "单色终端",
    description: "硬边字符、纯黑底与高密度明暗翻译。",
    preview: "terminal",
  },
  {
    id: "color-glyph",
    code: "02 / GLYPH",
    name: "Color Glyph",
    label: "彩色字场",
    description: "保留原图色谱，让细密字符成为第二层表面。",
    preview: "glyph",
  },
  {
    id: "print-screen",
    code: "03 / PRINT",
    name: "Print Screen",
    label: "四色网点",
    description: "CMYK 网屏、粗粒点阵与印刷错觉。",
    preview: "print",
  },
  {
    id: "signal-loss",
    code: "04 / SIGNAL",
    name: "Signal Loss",
    label: "信号失真",
    description: "RGB 通道漂移，把轮廓推向电子故障。",
    preview: "signal",
  },
  {
    id: "data-mosaic",
    code: "05 / DATA",
    name: "Data Mosaic",
    label: "数据马赛克",
    description: "点模式 ASCII 与轻微信号偏移组成混合载体。",
    preview: "mosaic",
  },
] as const;

export type ComputationalStylePresetId = (typeof COMPUTATIONAL_STYLE_PRESETS)[number]["id"];

export const DEFAULT_COMPUTATIONAL_STYLE_INTENSITY = 0.64;

const disableComputationalCarriers = (
  state: CanvasImageRenderStateV1
): CanvasImageRenderStateV1 => ({
  ...state,
  carrierTransforms: state.carrierTransforms.map((transform) =>
    transform.type === "ascii" || transform.type === "halftone"
      ? { ...transform, enabled: false }
      : transform
  ),
  signalDamage: state.signalDamage.map((node) =>
    node.type === "channel-drift" ? { ...node, enabled: false } : node
  ),
});

export const clearComputationalStyle = (state: CanvasImageRenderStateV1) =>
  disableComputationalCarriers(state);

export const applyComputationalStylePreset = (
  state: CanvasImageRenderStateV1,
  presetId: ComputationalStylePresetId,
  rawIntensity: number
) => {
  const intensity = clamp(rawIntensity, 0, 1);
  const base = disableComputationalCarriers(state);

  switch (presetId) {
    case "mono-terminal":
      return applyAsciiAdjustmentsToRenderState(base, {
        enabled: true,
        charsetPreset: "minimal",
        invert: true,
        brightness: 0,
        contrast: 1.1 + intensity * 1.1,
        density: 0.74 + intensity * 0.26,
        coverage: 0.68 + intensity * 0.3,
        edgeEmphasis: 0.12 + intensity * 0.58,
        renderMode: "glyph",
        cellSize: Math.round(18 - intensity * 11),
        characterSpacing: 0.92,
        foregroundOpacity: 1,
        foregroundBlendMode: "source-over",
        gridOverlay: intensity > 0.82,
        backgroundMode: "solid",
        backgroundColor: "#030503",
        backgroundBlur: 0,
        backgroundOpacity: 1,
        colorMode: "grayscale",
        dither: intensity > 0.7 ? "floyd-steinberg" : "none",
      });

    case "color-glyph":
      return applyAsciiAdjustmentsToRenderState(base, {
        enabled: true,
        charsetPreset: "detailed",
        invert: true,
        brightness: 0,
        contrast: 1 + intensity * 0.8,
        density: 0.72 + intensity * 0.28,
        coverage: 0.62 + intensity * 0.35,
        edgeEmphasis: intensity * 0.35,
        renderMode: "glyph",
        cellSize: Math.round(16 - intensity * 9),
        characterSpacing: 0.96,
        foregroundOpacity: 0.82 + intensity * 0.18,
        foregroundBlendMode: "screen",
        gridOverlay: false,
        backgroundMode: "blurred-source",
        backgroundColor: "#050505",
        backgroundBlur: Math.round(14 - intensity * 8),
        backgroundOpacity: 0.42 + intensity * 0.35,
        colorMode: "full-color",
        dither: "none",
      });

    case "print-screen":
      return applyHalftoneAdjustmentsToRenderState(base, {
        enabled: true,
        frequency: Math.round(58 - intensity * 39),
        angle: 22.5,
        shape: intensity > 0.76 ? "diamond" : "circle",
        colorMode: "cmyk",
        dotScale: 0.76 + intensity * 0.72,
        contrast: 0.95 + intensity * 1.45,
        invert: false,
        backgroundColor: "#f2efe4",
        backgroundOpacity: 1,
      });

    case "signal-loss": {
      const offset = Math.round(3 + intensity * 17);
      return applyChannelDriftAdjustmentsToRenderState(base, {
        enabled: true,
        redOffsetX: offset,
        redOffsetY: Math.round(-offset * 0.18),
        greenOffsetX: Math.round(-offset * 0.46),
        greenOffsetY: Math.round(offset * 0.28),
        blueOffsetX: Math.round(offset * 0.2),
        blueOffsetY: Math.round(-offset * 0.72),
        intensity: 0.24 + intensity * 0.76,
      });
    }

    case "data-mosaic": {
      const asciiState = applyAsciiAdjustmentsToRenderState(base, {
        enabled: true,
        charsetPreset: "blocks",
        invert: false,
        brightness: 0,
        contrast: 1.15 + intensity * 0.85,
        density: 0.78 + intensity * 0.22,
        coverage: 0.76 + intensity * 0.22,
        edgeEmphasis: 0.18 + intensity * 0.45,
        renderMode: "dot",
        cellSize: Math.round(17 - intensity * 9),
        characterSpacing: 0.9,
        foregroundOpacity: 0.82 + intensity * 0.18,
        foregroundBlendMode: "screen",
        gridOverlay: intensity > 0.72,
        backgroundMode: "cell-solid",
        backgroundColor: "#07110c",
        backgroundBlur: 0,
        backgroundOpacity: 0.72,
        colorMode: "duotone",
        dither: intensity > 0.58 ? "floyd-steinberg" : "none",
      });
      const offset = Math.round(1 + intensity * 6);
      return applyChannelDriftAdjustmentsToRenderState(asciiState, {
        enabled: true,
        redOffsetX: offset,
        redOffsetY: 0,
        greenOffsetX: -offset,
        greenOffsetY: Math.round(offset * 0.4),
        blueOffsetX: 0,
        blueOffsetY: -offset,
        intensity: 0.18 + intensity * 0.34,
      });
    }
  }
};

export const resolveComputationalStylePresetId = (
  state: CanvasImageRenderStateV1
): ComputationalStylePresetId | null => {
  const values = getCanvasImageEditValues(state);
  if (values.ascii.enabled) {
    if (values.ascii.renderMode === "dot") {
      return "data-mosaic";
    }
    return values.ascii.colorMode === "grayscale" ? "mono-terminal" : "color-glyph";
  }
  if (values.halftone.enabled) {
    return "print-screen";
  }
  return values.channelDrift.enabled ? "signal-loss" : null;
};

export const resolveComputationalStyleIntensity = (
  state: CanvasImageRenderStateV1,
  presetId: ComputationalStylePresetId
) => {
  const values = getCanvasImageEditValues(state);
  switch (presetId) {
    case "mono-terminal":
      return clamp((18 - values.ascii.cellSize) / 11, 0, 1);
    case "color-glyph":
      return clamp((16 - values.ascii.cellSize) / 9, 0, 1);
    case "print-screen":
      return clamp((58 - values.halftone.frequency) / 39, 0, 1);
    case "signal-loss":
      return clamp((values.channelDrift.intensity - 0.24) / 0.76, 0, 1);
    case "data-mosaic":
      return clamp((17 - values.ascii.cellSize) / 9, 0, 1);
  }
};
