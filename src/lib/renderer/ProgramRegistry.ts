import * as twgl from "twgl.js";
import type { ProgramInfo } from "twgl.js";

import fullscreenVertexSrc from "./shaders/Fullscreen.vert?raw";
import passthroughFragSrc from "./shaders/Passthrough.frag?raw";
import inputDecodeFragSrc from "./shaders/InputDecode.frag?raw";
import geometryFragSrc from "./shaders/Geometry.frag?raw";
import masterFragSrc from "./shaders/generated/MasterAdjustment.frag?raw";
import hslFragSrc from "./shaders/HSL.frag?raw";
import curveFragSrc from "./shaders/Curve.frag?raw";
import detailFragSrc from "./shaders/Detail.frag?raw";
import filmPrepUberFragSrc from "./shaders/FilmPrepUber.frag?raw";
import filmColorLutUberFragSrc from "./shaders/FilmColorLutUber.frag?raw";
import filmPrintUberFragSrc from "./shaders/FilmPrintUber.frag?raw";
import filmGrainFragSrc from "./shaders/FilmGrain.frag?raw";
import proceduralGrainFragSrc from "./shaders/ProceduralGrain.frag?raw";
import filmEffectsUberFragSrc from "./shaders/FilmEffectsUber.frag?raw";
import glowThresholdFragSrc from "./shaders/GlowThreshold.frag?raw";
import glowCompositeFragSrc from "./shaders/GlowComposite.frag?raw";
import halationThresholdFragSrc from "./shaders/HalationThreshold.frag?raw";
import gaussianBlurFragSrc from "./shaders/GaussianBlur.frag?raw";
import halationCompositeFragSrc from "./shaders/HalationComposite.frag?raw";
import downsampleFragSrc from "./shaders/Downsample.frag?raw";
import bilateralScaleFragSrc from "./shaders/BilateralScale.frag?raw";
import reconstructFragSrc from "./shaders/Reconstruct.frag?raw";
import outputEncodeFragSrc from "./shaders/OutputEncode.frag?raw";
import layerBlendFragSrc from "./shaders/LayerBlend.frag?raw";
import linearGradientMaskFragSrc from "./shaders/LinearGradientMask.frag?raw";
import radialGradientMaskFragSrc from "./shaders/RadialGradientMask.frag?raw";
import filter2dAdjustFragSrc from "./shaders/Filter2dAdjust.frag?raw";
import dilateFragSrc from "./shaders/Dilate.frag?raw";
import localMaskRangeGateFragSrc from "./shaders/LocalMaskRangeGate.frag?raw";
import brushMaskStampFragSrc from "./shaders/BrushMaskStamp.frag?raw";
import maskInvertFragSrc from "./shaders/MaskInvert.frag?raw";
import asciiCarrierFragRaw from "./shaders/AsciiCarrier.frag?raw";
import asciiTextmodeFragRaw from "./shaders/AsciiTextmode.frag?raw";
import asciiCommonGlsl from "./shaders/templates/asciiCommon.glsl?raw";
import timestampOverlayFragSrc from "./shaders/TimestampOverlay.frag?raw";

const ASCII_COMMON_MARKER = "// #ASCII_COMMON#";
const injectAsciiCommon = (source: string) => source.replace(ASCII_COMMON_MARKER, asciiCommonGlsl);
const asciiCarrierFragSrc = injectAsciiCommon(asciiCarrierFragRaw);
const asciiTextmodeFragSrc = injectAsciiCommon(asciiTextmodeFragRaw);

export interface RendererPrograms {
  passthrough: ProgramInfo;
  inputDecode: ProgramInfo;
  geometry: ProgramInfo;
  master: ProgramInfo;
  hsl: ProgramInfo;
  curve: ProgramInfo;
  detail: ProgramInfo;
  filmPrepUber: ProgramInfo;
  filmColorLutUber: ProgramInfo;
  filmPrintUber: ProgramInfo;
  filmGrain: ProgramInfo;
  proceduralGrain: ProgramInfo;
  filmEffectsUber: ProgramInfo;
  glowThreshold: ProgramInfo;
  glowComposite: ProgramInfo;
  halationThreshold: ProgramInfo;
  blur: ProgramInfo;
  halationComposite: ProgramInfo;
  downsample: ProgramInfo;
  bilateralScale: ProgramInfo;
  reconstruct: ProgramInfo;
  outputEncode: ProgramInfo;
  maskedBlend: ProgramInfo;
  linearGradientMask: ProgramInfo;
  radialGradientMask: ProgramInfo;
  filter2dAdjust: ProgramInfo;
  dilate: ProgramInfo;
  localMaskRangeGate: ProgramInfo;
  brushMaskStamp: ProgramInfo;
  maskInvert: ProgramInfo;
  asciiCarrier: ProgramInfo;
  asciiTextmode: ProgramInfo;
  timestampOverlay: ProgramInfo;
}

type ProgramName = keyof RendererPrograms;

const PROGRAM_FRAGMENTS: Record<ProgramName, string> = {
  passthrough: passthroughFragSrc,
  inputDecode: inputDecodeFragSrc,
  geometry: geometryFragSrc,
  master: masterFragSrc,
  hsl: hslFragSrc,
  curve: curveFragSrc,
  detail: detailFragSrc,
  filmPrepUber: filmPrepUberFragSrc,
  filmColorLutUber: filmColorLutUberFragSrc,
  filmPrintUber: filmPrintUberFragSrc,
  filmGrain: filmGrainFragSrc,
  proceduralGrain: proceduralGrainFragSrc,
  filmEffectsUber: filmEffectsUberFragSrc,
  glowThreshold: glowThresholdFragSrc,
  glowComposite: glowCompositeFragSrc,
  halationThreshold: halationThresholdFragSrc,
  blur: gaussianBlurFragSrc,
  halationComposite: halationCompositeFragSrc,
  downsample: downsampleFragSrc,
  bilateralScale: bilateralScaleFragSrc,
  reconstruct: reconstructFragSrc,
  outputEncode: outputEncodeFragSrc,
  maskedBlend: layerBlendFragSrc,
  linearGradientMask: linearGradientMaskFragSrc,
  radialGradientMask: radialGradientMaskFragSrc,
  filter2dAdjust: filter2dAdjustFragSrc,
  dilate: dilateFragSrc,
  localMaskRangeGate: localMaskRangeGateFragSrc,
  brushMaskStamp: brushMaskStampFragSrc,
  maskInvert: maskInvertFragSrc,
  asciiCarrier: asciiCarrierFragSrc,
  asciiTextmode: asciiTextmodeFragSrc,
  timestampOverlay: timestampOverlayFragSrc,
};

const CORE_PRECOMPILE_PROGRAMS: readonly ProgramName[] = [
  "passthrough",
  "inputDecode",
  "geometry",
  "master",
  "outputEncode",
];

export const DEFERRED_WARMUP_PROGRAMS: readonly ProgramName[] = [
  "hsl",
  "curve",
  "detail",
  "halationThreshold",
  "blur",
  "halationComposite",
  "filmPrepUber",
  "filmColorLutUber",
  "filmPrintUber",
  "filmEffectsUber",
  "asciiCarrier",
  "asciiTextmode",
  "timestampOverlay",
];

const defineLazyProgram = (
  programs: RendererPrograms,
  gl: WebGL2RenderingContext,
  name: ProgramName,
  fragmentSource: string
) => {
  let cached: ProgramInfo | null = null;
  Object.defineProperty(programs, name, {
    enumerable: true,
    configurable: false,
    get() {
      if (!cached) {
        cached = twgl.createProgramInfo(gl, [fullscreenVertexSrc, fragmentSource]);
      }
      return cached;
    },
  });
};

export const createPrograms = (gl: WebGL2RenderingContext): RendererPrograms => {
  const programs = {} as RendererPrograms;
  for (const name of Object.keys(PROGRAM_FRAGMENTS) as ProgramName[]) {
    defineLazyProgram(programs, gl, name, PROGRAM_FRAGMENTS[name]);
  }
  for (const name of CORE_PRECOMPILE_PROGRAMS) {
    void programs[name];
  }
  return programs;
};
