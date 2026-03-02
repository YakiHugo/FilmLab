import { describe, expect, it, vi } from "vitest";
import type { ProgramInfo } from "twgl.js";
import type { FilterPipeline, PipelineTextureResult } from "./gpu/FilterPipeline";
import { runPostProcessing } from "./RenderPostProcessing";

const DUMMY_PROGRAM = {} as ProgramInfo;

const createPrograms = () => ({
  passthrough: DUMMY_PROGRAM,
  downsample: DUMMY_PROGRAM,
  bilateralScale: DUMMY_PROGRAM,
  reconstruct: DUMMY_PROGRAM,
  halationThreshold: DUMMY_PROGRAM,
  blur: DUMMY_PROGRAM,
  halationComposite: DUMMY_PROGRAM,
  glowThreshold: DUMMY_PROGRAM,
  glowComposite: DUMMY_PROGRAM,
});

const createTextureResult = (format: "RGBA8" | "RGBA16F" = "RGBA16F"): PipelineTextureResult => ({
  texture: {} as WebGLTexture,
  width: 1920,
  height: 1080,
  format,
  lease: {} as PipelineTextureResult["lease"],
  release: vi.fn(),
});

describe("runPostProcessing", () => {
  it("captures linear output even when optics are disabled", () => {
    const baseResult = createTextureResult();
    const capturedResult = createTextureResult();
    const runToTexture = vi.fn<FilterPipeline["runToTexture"]>(() => capturedResult);
    const captureLinearResult = vi.fn();
    const drawLinearToCanvas = vi.fn();

    runPostProcessing({
      filterPipeline: { runToTexture } as unknown as FilterPipeline,
      programs: createPrograms(),
      baseResult,
      targetWidth: 1920,
      targetHeight: 1080,
      intermediateFormat: "RGBA16F",
      shouldRunMultiscaleDenoise: false,
      denoiseState: {
        downsamplePassUniforms: { u_texelSize: new Float32Array([1, 1]) },
        bilateralHalfPassUniforms: { u_texelSize: new Float32Array([1, 1]), u_strength: 0 },
        bilateralQuarterPassUniforms: { u_texelSize: new Float32Array([1, 1]), u_strength: 0 },
        reconstructPassUniforms: {
          u_halfScale: null,
          u_quarterScale: null,
          u_lumaStrength: 0,
          u_chromaStrength: 0,
        },
        detailPassUniforms: { u_noiseReduction: 0, u_colorNoiseReduction: 0 },
      },
      useOptics: false,
      opticsState: {
        thresholdPassUniforms: {},
        glowThresholdPassUniforms: {},
        blurHPassUniforms: {},
        blurVPassUniforms: {},
        glowBlurHPassUniforms: {},
        glowBlurVPassUniforms: {},
        compositePassUniforms: { u_halationEnabled: false, u_bloomEnabled: false },
        glowCompositePassUniforms: { u_glowEnabled: false },
      },
      halationBlurPasses: 2,
      glowBlurPasses: 2,
      captureLinearOutput: true,
      captureLinearResult,
      drawLinearToCanvas,
    });

    expect(runToTexture).toHaveBeenCalledTimes(1);
    expect(captureLinearResult).toHaveBeenCalledWith(capturedResult);
    expect(drawLinearToCanvas).toHaveBeenCalledWith(
      baseResult.texture,
      baseResult.width,
      baseResult.height,
      baseResult.format
    );
    expect(baseResult.release).toHaveBeenCalledTimes(1);
  });
});
