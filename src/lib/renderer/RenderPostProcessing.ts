import type { ProgramInfo } from "twgl.js";
import type { FilterPipeline, PipelineTextureResult } from "./gpu/FilterPipeline";
import type { PipelinePass } from "./gpu/PipelinePass";
import { runMultiscaleDenoise } from "./MultiscaleDenoise";
import {
  buildGlowCompositePasses,
  buildGlowMaskPasses,
  buildHalationCompositePasses,
  buildHalationMaskPasses,
} from "./passes/opticsPasses";

interface PostProcessingPrograms {
  passthrough: ProgramInfo;
  downsample: ProgramInfo;
  bilateralScale: ProgramInfo;
  reconstruct: ProgramInfo;
  halationThreshold: ProgramInfo;
  blur: ProgramInfo;
  halationComposite: ProgramInfo;
  glowThreshold: ProgramInfo;
  glowComposite: ProgramInfo;
}

interface DenoiseUniformState {
  downsamplePassUniforms: {
    u_texelSize: Float32Array;
  };
  bilateralHalfPassUniforms: {
    u_texelSize: Float32Array;
    u_strength: number;
  };
  bilateralQuarterPassUniforms: {
    u_texelSize: Float32Array;
    u_strength: number;
  };
  reconstructPassUniforms: {
    u_halfScale: WebGLTexture | null;
    u_quarterScale: WebGLTexture | null;
    u_lumaStrength: number;
    u_chromaStrength: number;
  };
  detailPassUniforms: {
    u_noiseReduction: number;
    u_colorNoiseReduction: number;
  };
}

interface OpticsUniformState {
  thresholdPassUniforms: Record<string, unknown>;
  glowThresholdPassUniforms: Record<string, unknown>;
  blurHPassUniforms: Record<string, unknown>;
  blurVPassUniforms: Record<string, unknown>;
  glowBlurHPassUniforms: Record<string, unknown>;
  glowBlurVPassUniforms: Record<string, unknown>;
  compositePassUniforms: Record<string, unknown>;
  glowCompositePassUniforms: Record<string, unknown>;
}

export interface RenderPostProcessingOptions {
  filterPipeline: FilterPipeline;
  programs: PostProcessingPrograms;
  baseResult: PipelineTextureResult;
  targetWidth: number;
  targetHeight: number;
  intermediateFormat: "RGBA8" | "RGBA16F";
  shouldRunMultiscaleDenoise: boolean;
  denoiseState: DenoiseUniformState;
  useOptics: boolean;
  opticsState: OpticsUniformState;
  halationBlurPasses: number;
  glowBlurPasses: number;
  captureLinearOutput: boolean;
  captureLinearResult: (result: PipelineTextureResult) => void;
  drawLinearToCanvas: (
    texture: WebGLTexture,
    width: number,
    height: number,
    format: "RGBA8" | "RGBA16F"
  ) => void;
}

export interface RenderPostProcessingResult {
  drawMs: number;
  opticsActive: boolean;
}

export const runPostProcessing = (
  options: RenderPostProcessingOptions
): RenderPostProcessingResult => {
  const {
    filterPipeline,
    programs,
    baseResult,
    targetWidth,
    targetHeight,
    intermediateFormat,
    shouldRunMultiscaleDenoise,
    denoiseState,
    useOptics,
    opticsState,
    halationBlurPasses,
    glowBlurPasses,
    captureLinearOutput,
    captureLinearResult,
    drawLinearToCanvas,
  } = options;
  let drawMs = 0;
  const renderOutputToCanvas = (
    texture: WebGLTexture,
    width: number,
    height: number,
    format: "RGBA8" | "RGBA16F"
  ) => {
    const drawStartedAt = performance.now();
    drawLinearToCanvas(texture, width, height, format);
    drawMs += performance.now() - drawStartedAt;
  };
  const captureIfNeeded = (result: PipelineTextureResult) => {
    if (!captureLinearOutput) {
      return;
    }
    const captured = filterPipeline.runToTexture({
      baseWidth: targetWidth,
      baseHeight: targetHeight,
      passes: [
        {
          id: "capture-linear-output",
          programInfo: programs.passthrough,
          uniforms: {},
          outputFormat: intermediateFormat,
          enabled: true,
        },
      ],
      input: {
        texture: result.texture,
        width: result.width,
        height: result.height,
        format: result.format,
      },
    });
    captureLinearResult(captured);
  };

  let opticsActive: boolean;
  let finalResult = baseResult;

  try {
    finalResult = runMultiscaleDenoise({
      enabled: shouldRunMultiscaleDenoise,
      filterPipeline,
      programs,
      states: denoiseState,
      input: finalResult,
      baseWidth: targetWidth,
      baseHeight: targetHeight,
      outputFormat: intermediateFormat,
    });

    const halationEnabled =
      useOptics &&
      (Boolean(opticsState.compositePassUniforms.u_halationEnabled) ||
        Boolean(opticsState.compositePassUniforms.u_bloomEnabled));
    const glowEnabled = useOptics && Boolean(opticsState.glowCompositePassUniforms.u_glowEnabled);
    opticsActive = halationEnabled || glowEnabled;

    if (!halationEnabled && !glowEnabled) {
      captureIfNeeded(finalResult);
      renderOutputToCanvas(
        finalResult.texture,
        finalResult.width,
        finalResult.height,
        finalResult.format
      );
      return { drawMs, opticsActive };
    }

    let halationResult: PipelineTextureResult | null = null;
    let glowResult: PipelineTextureResult | null = null;

    try {
      if (halationEnabled) {
        const maskPasses: PipelinePass[] = buildHalationMaskPasses({
          programs,
          thresholdUniforms: opticsState.thresholdPassUniforms,
          blurHUniforms: opticsState.blurHPassUniforms,
          blurVUniforms: opticsState.blurVPassUniforms,
          blurPasses: halationBlurPasses,
          outputFormat: intermediateFormat,
        });

        const maskResult = filterPipeline.runToTexture({
          baseWidth: targetWidth,
          baseHeight: targetHeight,
          passes: maskPasses,
          input: {
            texture: finalResult.texture,
            width: finalResult.width,
            height: finalResult.height,
            format: finalResult.format,
          },
        });

        try {
          halationResult = filterPipeline.runToTexture({
            baseWidth: targetWidth,
            baseHeight: targetHeight,
            passes: buildHalationCompositePasses({
              programs,
              compositeUniforms: opticsState.compositePassUniforms,
              maskTexture: maskResult.texture,
              outputFormat: intermediateFormat,
            }),
            input: {
              texture: finalResult.texture,
              width: finalResult.width,
              height: finalResult.height,
              format: finalResult.format,
            },
          });
        } finally {
          maskResult.release();
        }
      }

      if (glowEnabled) {
        const glowInput = halationResult ?? finalResult;
        const glowMaskPasses: PipelinePass[] = buildGlowMaskPasses({
          programs,
          thresholdUniforms: opticsState.glowThresholdPassUniforms,
          blurHUniforms: opticsState.glowBlurHPassUniforms,
          blurVUniforms: opticsState.glowBlurVPassUniforms,
          blurPasses: glowBlurPasses,
          outputFormat: intermediateFormat,
        });

        const glowMaskResult = filterPipeline.runToTexture({
          baseWidth: targetWidth,
          baseHeight: targetHeight,
          passes: glowMaskPasses,
          input: {
            texture: glowInput.texture,
            width: glowInput.width,
            height: glowInput.height,
            format: glowInput.format,
          },
        });

        try {
          glowResult = filterPipeline.runToTexture({
            baseWidth: targetWidth,
            baseHeight: targetHeight,
            passes: buildGlowCompositePasses({
              programs,
              compositeUniforms: opticsState.glowCompositePassUniforms,
              maskTexture: glowMaskResult.texture,
              outputFormat: intermediateFormat,
            }),
            input: {
              texture: glowInput.texture,
              width: glowInput.width,
              height: glowInput.height,
              format: glowInput.format,
            },
          });
        } finally {
          glowMaskResult.release();
        }
      }

      const outputResult = glowResult ?? halationResult ?? finalResult;
      captureIfNeeded(outputResult);
      renderOutputToCanvas(
        outputResult.texture,
        outputResult.width,
        outputResult.height,
        outputResult.format
      );
    } finally {
      if (glowResult) {
        glowResult.release();
      }
      if (halationResult) {
        halationResult.release();
      }
    }
  } finally {
    if (finalResult !== baseResult) {
      finalResult.release();
    }
    baseResult.release();
  }

  return { drawMs, opticsActive };
};
