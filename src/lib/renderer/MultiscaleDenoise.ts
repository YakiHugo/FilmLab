import type { ProgramInfo } from "twgl.js";
import type { FilterPipeline, PipelineTextureResult } from "./gpu/FilterPipeline";

interface DenoisePrograms {
  downsample: ProgramInfo;
  bilateralScale: ProgramInfo;
  reconstruct: ProgramInfo;
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

export const runMultiscaleDenoise = (params: {
  enabled: boolean;
  filterPipeline: FilterPipeline;
  programs: DenoisePrograms;
  states: DenoiseUniformState;
  input: PipelineTextureResult;
  baseWidth: number;
  baseHeight: number;
  outputFormat: "RGBA8" | "RGBA16F";
}): PipelineTextureResult => {
  if (!params.enabled) {
    return params.input;
  }

  const {
    filterPipeline,
    programs,
    states,
    input,
    baseWidth,
    baseHeight,
    outputFormat,
  } = params;

  states.downsamplePassUniforms.u_texelSize[0] = 1 / Math.max(1, input.width);
  states.downsamplePassUniforms.u_texelSize[1] = 1 / Math.max(1, input.height);
  states.bilateralHalfPassUniforms.u_strength = Math.min(
    1,
    states.detailPassUniforms.u_noiseReduction * 0.01
  );
  states.bilateralQuarterPassUniforms.u_strength = Math.min(
    1,
    states.detailPassUniforms.u_noiseReduction * 0.013
  );
  states.reconstructPassUniforms.u_lumaStrength = Math.min(
    1,
    states.detailPassUniforms.u_noiseReduction * 0.01
  );
  states.reconstructPassUniforms.u_chromaStrength = Math.min(
    1,
    states.detailPassUniforms.u_colorNoiseReduction * 0.01
  );

  const halfDownsample = filterPipeline.runToTexture({
    baseWidth,
    baseHeight,
    passes: [
      {
        id: "denoise-downsample-half",
        programInfo: programs.downsample,
        uniforms: states.downsamplePassUniforms,
        outputFormat,
        resolution: 0.5,
        enabled: true,
      },
    ],
    input: {
      texture: input.texture,
      width: input.width,
      height: input.height,
      format: input.format,
    },
  });

  try {
    states.bilateralHalfPassUniforms.u_texelSize[0] = 1 / Math.max(1, halfDownsample.width);
    states.bilateralHalfPassUniforms.u_texelSize[1] = 1 / Math.max(1, halfDownsample.height);
    const halfBilateral = filterPipeline.runToTexture({
      baseWidth: halfDownsample.width,
      baseHeight: halfDownsample.height,
      passes: [
        {
          id: "denoise-bilateral-half",
          programInfo: programs.bilateralScale,
          uniforms: states.bilateralHalfPassUniforms,
          outputFormat,
          enabled: true,
        },
      ],
      input: {
        texture: halfDownsample.texture,
        width: halfDownsample.width,
        height: halfDownsample.height,
        format: halfDownsample.format,
      },
    });

    try {
      states.downsamplePassUniforms.u_texelSize[0] = 1 / Math.max(1, halfBilateral.width);
      states.downsamplePassUniforms.u_texelSize[1] = 1 / Math.max(1, halfBilateral.height);
      const quarterDownsample = filterPipeline.runToTexture({
        baseWidth: halfBilateral.width,
        baseHeight: halfBilateral.height,
        passes: [
          {
            id: "denoise-downsample-quarter",
            programInfo: programs.downsample,
            uniforms: states.downsamplePassUniforms,
            outputFormat,
            resolution: 0.5,
            enabled: true,
          },
        ],
        input: {
          texture: halfBilateral.texture,
          width: halfBilateral.width,
          height: halfBilateral.height,
          format: halfBilateral.format,
        },
      });

      try {
        states.bilateralQuarterPassUniforms.u_texelSize[0] = 1 / Math.max(1, quarterDownsample.width);
        states.bilateralQuarterPassUniforms.u_texelSize[1] = 1 / Math.max(1, quarterDownsample.height);
        const quarterBilateral = filterPipeline.runToTexture({
          baseWidth: quarterDownsample.width,
          baseHeight: quarterDownsample.height,
          passes: [
            {
              id: "denoise-bilateral-quarter",
              programInfo: programs.bilateralScale,
              uniforms: states.bilateralQuarterPassUniforms,
              outputFormat,
              enabled: true,
            },
          ],
          input: {
            texture: quarterDownsample.texture,
            width: quarterDownsample.width,
            height: quarterDownsample.height,
            format: quarterDownsample.format,
          },
        });

        try {
          states.reconstructPassUniforms.u_halfScale = halfBilateral.texture;
          states.reconstructPassUniforms.u_quarterScale = quarterBilateral.texture;
          return filterPipeline.runToTexture({
            baseWidth,
            baseHeight,
            passes: [
              {
                id: "denoise-reconstruct",
                programInfo: programs.reconstruct,
                uniforms: states.reconstructPassUniforms,
                extraTextures: {
                  u_halfScale: halfBilateral.texture,
                  u_quarterScale: quarterBilateral.texture,
                },
                outputFormat,
                enabled: true,
              },
            ],
            input: {
              texture: input.texture,
              width: input.width,
              height: input.height,
              format: input.format,
            },
          });
        } finally {
          quarterBilateral.release();
        }
      } finally {
        quarterDownsample.release();
      }
    } finally {
      halfBilateral.release();
    }
  } finally {
    halfDownsample.release();
  }
};
