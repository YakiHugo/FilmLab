/**
 * Per-cell feature-extraction compute pass.
 *
 * Wraps `wgsl/carrier/ascii/analysis.wgsl`. Each invocation analyzes one
 * cell's pixel region in the source texture and writes:
 *   - 27 floats to the features buffer (layout matches `descriptors.ts`).
 *   - One vec4 of averaged RGBA into the cellColor buffer (consumed by the
 *     composition pass for full-color/cell-bg/alpha-cutoff handling).
 *
 * Slot 0 of the features buffer holds raw cell luminance; toneNormalize
 * reads it (plus neighbours) and writes the post-normalization tone into a
 * separate `cellTone` buffer that selection/composition consume.
 */

import type { ShaderCache } from "../../../shaders";
import type { GPUComputePassDescriptor } from "../../types";

import analysisWgsl from "../../../wgsl/carrier/ascii/analysis.wgsl?raw";

interface CompiledPipeline {
  pipeline: GPUComputePipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

const WORKGROUP_DIM = 8;

export const ANALYSIS_UNIFORMS_BYTE_SIZE = 32;

/**
 * Pack `AnalysisUniforms` (imageSize, gridSize, padding). Returns the
 * underlying ArrayBuffer ready for `device.queue.writeBuffer`.
 */
export function packAnalysisUniforms(values: {
  imageWidth: number;
  imageHeight: number;
  gridColumns: number;
  gridRows: number;
}): ArrayBuffer {
  const buffer = new ArrayBuffer(ANALYSIS_UNIFORMS_BYTE_SIZE);
  const u = new Uint32Array(buffer);
  u[0] = values.imageWidth;
  u[1] = values.imageHeight;
  u[2] = values.gridColumns;
  u[3] = values.gridRows;
  return buffer;
}

export interface CreateAsciiAnalysisPassOptions {
  sourceView: GPUTextureView;
  uniformsBuffer: GPUBuffer;
  featuresBuffer: GPUBuffer;
  cellColorBuffer: GPUBuffer;
  gridColumns: number;
  gridRows: number;
  id?: string;
  enabled?: boolean;
}

export class AsciiAnalysisPipelineCache {
  private readonly device: GPUDevice;
  private readonly shaders: ShaderCache;
  private cached: CompiledPipeline | null = null;

  constructor(device: GPUDevice, shaders: ShaderCache) {
    this.device = device;
    this.shaders = shaders;
  }

  createPass(options: CreateAsciiAnalysisPassOptions): GPUComputePassDescriptor {
    const { pipeline, bindGroupLayout } = this.pipeline();
    const bindGroup = this.device.createBindGroup({
      label: "ascii.analysis.bindGroup",
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: options.sourceView },
        { binding: 1, resource: { buffer: options.uniformsBuffer } },
        { binding: 2, resource: { buffer: options.featuresBuffer } },
        { binding: 3, resource: { buffer: options.cellColorBuffer } },
      ],
    });
    return {
      kind: "compute",
      id: options.id ?? "ascii.analysis",
      pipeline,
      bindGroup,
      workgroupCount: [
        Math.max(1, Math.ceil(options.gridColumns / WORKGROUP_DIM)),
        Math.max(1, Math.ceil(options.gridRows / WORKGROUP_DIM)),
        1,
      ],
      enabled: options.enabled ?? true,
    };
  }

  private pipeline(): CompiledPipeline {
    if (this.cached) return this.cached;
    const module = this.shaders.compile(analysisWgsl, "ascii/analysis.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "ascii.analysis.bindGroupLayout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: "float", viewDimension: "2d" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
      ],
    });
    const pipelineLayout = this.device.createPipelineLayout({
      label: "ascii.analysis.pipelineLayout",
      bindGroupLayouts: [bindGroupLayout],
    });
    const pipeline = this.device.createComputePipeline({
      label: "ascii.analysis.pipeline",
      layout: pipelineLayout,
      compute: { module, entryPoint: "cs_main" },
    });
    this.cached = { pipeline, bindGroupLayout };
    return this.cached;
  }
}
