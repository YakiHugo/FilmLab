import * as twgl from "twgl.js";
import type { ProgramInfo } from "twgl.js";

import { reportGlError } from "./reportGlError";
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
import halftoneCarrierFragSrc from "./shaders/HalftoneCarrier.frag?raw";

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
  halftoneCarrier: ProgramInfo;
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
  halftoneCarrier: halftoneCarrierFragSrc,
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
  "halftoneCarrier",
];

const UNIFORM_DECLARATION_PATTERN =
  /\buniform\s+(?:highp\s+|mediump\s+|lowp\s+)?\w+\s+(\w+)\s*(?:\[[^\]]*\])?\s*;/g;

const stripGlslComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const collectDeclaredUniforms = (sources: readonly string[]): Set<string> => {
  const declared = new Set<string>();
  for (const source of sources) {
    const stripped = stripGlslComments(source);
    for (const match of stripped.matchAll(UNIFORM_DECLARATION_PATTERN)) {
      declared.add(match[1]!);
    }
  }
  return declared;
};

const normalizeSetterKey = (key: string): string => key.replace(/\[\d+\]$/, "");

const verifyUniformAlignment = (
  name: ProgramName,
  programInfo: ProgramInfo,
  sources: readonly string[]
): void => {
  const setters = (programInfo as { uniformSetters?: Record<string, unknown> })
    .uniformSetters;
  if (!setters) {
    return;
  }
  const declared = collectDeclaredUniforms(sources);
  const bound = new Set<string>();
  for (const key of Object.keys(setters)) {
    bound.add(normalizeSetterKey(key));
  }
  const declaredOrphans: string[] = [];
  for (const uniform of declared) {
    if (!bound.has(uniform)) {
      declaredOrphans.push(uniform);
    }
  }
  const boundOrphans: string[] = [];
  for (const uniform of bound) {
    if (!declared.has(uniform)) {
      boundOrphans.push(uniform);
    }
  }
  if (declaredOrphans.length === 0 && boundOrphans.length === 0) {
    return;
  }
  reportGlError({
    op: "uniform-binding",
    shaderName: name,
    rendererLabel: "program-registry",
    declaredOrphans,
    boundOrphans,
  });
};

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
        if (import.meta.env.DEV) {
          verifyUniformAlignment(name, cached, [fullscreenVertexSrc, fragmentSource]);
        }
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
