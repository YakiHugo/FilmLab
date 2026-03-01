import type { ProgramInfo } from "twgl.js";
import type { PipelineOutputFormat, PipelinePass } from "@/lib/renderer/gpu/PipelinePass";

interface OpticsPrograms {
  halationThreshold: ProgramInfo;
  blur: ProgramInfo;
  halationComposite: ProgramInfo;
  glowThreshold: ProgramInfo;
  glowComposite: ProgramInfo;
}

const createBlurPassPair = (
  prefix: string,
  index: number,
  blurProgram: ProgramInfo,
  blurHUniforms: Record<string, unknown>,
  blurVUniforms: Record<string, unknown>,
  outputFormat: PipelineOutputFormat
): PipelinePass[] => [
  {
    id: `${prefix}-blur-h-${index}`,
    programInfo: blurProgram,
    uniforms: blurHUniforms,
    outputFormat,
    resolution: 0.5,
    enabled: true,
  },
  {
    id: `${prefix}-blur-v-${index}`,
    programInfo: blurProgram,
    uniforms: blurVUniforms,
    outputFormat,
    resolution: 0.5,
    enabled: true,
  },
];

export const buildHalationMaskPasses = (params: {
  programs: OpticsPrograms;
  thresholdUniforms: Record<string, unknown>;
  blurHUniforms: Record<string, unknown>;
  blurVUniforms: Record<string, unknown>;
  blurPasses: number;
  outputFormat: PipelineOutputFormat;
}): PipelinePass[] => {
  const passes: PipelinePass[] = [
    {
      id: "halation-threshold",
      programInfo: params.programs.halationThreshold,
      uniforms: params.thresholdUniforms,
      outputFormat: params.outputFormat,
      resolution: 0.5,
      enabled: true,
    },
  ];
  for (let i = 0; i < params.blurPasses; i += 1) {
    passes.push(
      ...createBlurPassPair(
        "halation",
        i,
        params.programs.blur,
        params.blurHUniforms,
        params.blurVUniforms,
        params.outputFormat
      )
    );
  }
  return passes;
};

export const buildHalationCompositePasses = (params: {
  programs: OpticsPrograms;
  compositeUniforms: Record<string, unknown>;
  maskTexture: WebGLTexture;
  outputFormat: PipelineOutputFormat;
}): PipelinePass[] => [
  {
    id: "halation-composite",
    programInfo: params.programs.halationComposite,
    uniforms: params.compositeUniforms,
    extraTextures: {
      u_blurredMask: params.maskTexture,
    },
    outputFormat: params.outputFormat,
    enabled: true,
  },
];

export const buildGlowMaskPasses = (params: {
  programs: OpticsPrograms;
  thresholdUniforms: Record<string, unknown>;
  blurHUniforms: Record<string, unknown>;
  blurVUniforms: Record<string, unknown>;
  blurPasses: number;
  outputFormat: PipelineOutputFormat;
}): PipelinePass[] => {
  const passes: PipelinePass[] = [
    {
      id: "glow-threshold",
      programInfo: params.programs.glowThreshold,
      uniforms: params.thresholdUniforms,
      outputFormat: params.outputFormat,
      resolution: 0.5,
      enabled: true,
    },
  ];
  for (let i = 0; i < params.blurPasses; i += 1) {
    passes.push(
      ...createBlurPassPair(
        "glow",
        i,
        params.programs.blur,
        params.blurHUniforms,
        params.blurVUniforms,
        params.outputFormat
      )
    );
  }
  return passes;
};

export const buildGlowCompositePasses = (params: {
  programs: OpticsPrograms;
  compositeUniforms: Record<string, unknown>;
  maskTexture: WebGLTexture;
  outputFormat: PipelineOutputFormat;
}): PipelinePass[] => [
  {
    id: "glow-composite",
    programInfo: params.programs.glowComposite,
    uniforms: params.compositeUniforms,
    extraTextures: {
      u_glowMask: params.maskTexture,
    },
    outputFormat: params.outputFormat,
    enabled: true,
  },
];

