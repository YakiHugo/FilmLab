/**
 * Per-cell feature-extraction compute pass.
 *
 * Wraps `wgsl/carrier/ascii/analysis.wgsl`. Each invocation analyzes one
 * cell's pixel region in the source texture and writes 27 floats to the
 * caller-supplied features buffer (layout matches `descriptors.ts`).
 *
 * The pipeline (shader + bindgroup layout) is cached per `ShaderCache`; the
 * bind group is rebuilt each call because the bindings (source view, buffers)
 * are caller-owned and may change between runs.
 */

import type { ShaderCache } from "../../../shaders";
import type { GPUComputePassDescriptor } from "../../types";

import analysisWgsl from "../../../wgsl/carrier/ascii/analysis.wgsl?raw";

interface CompiledPipeline {
  pipeline: GPUComputePipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class AsciiAnalysisPipelineCache {
  readonly device: GPUDevice;
  private readonly shaders: ShaderCache;
  private cached: CompiledPipeline | null = null;

  constructor(device: GPUDevice, shaders: ShaderCache) {
    this.device = device;
    this.shaders = shaders;
  }

  pipeline(): CompiledPipeline {
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

export const ANALYSIS_UNIFORMS_BYTE_SIZE = 32;

/**
 * Pack `AnalysisUniforms` (imageSize, gridSize, cellSize, _pad). Returns the
 * underlying ArrayBuffer ready for `device.queue.writeBuffer`.
 */
export function packAnalysisUniforms(values: {
  imageWidth: number;
  imageHeight: number;
  gridColumns: number;
  gridRows: number;
  cellWidth: number;
  cellHeight: number;
}): ArrayBuffer {
  const buffer = new ArrayBuffer(ANALYSIS_UNIFORMS_BYTE_SIZE);
  const u = new Uint32Array(buffer);
  u[0] = values.imageWidth;
  u[1] = values.imageHeight;
  u[2] = values.gridColumns;
  u[3] = values.gridRows;
  u[4] = values.cellWidth;
  u[5] = values.cellHeight;
  return buffer;
}

const WORKGROUP_DIM = 8;

export interface CreateAsciiAnalysisPassOptions {
  sourceView: GPUTextureView;
  uniformsBuffer: GPUBuffer;
  featuresBuffer: GPUBuffer;
  gridColumns: number;
  gridRows: number;
  id?: string;
  enabled?: boolean;
}

export function createAsciiAnalysisPass(
  cache: AsciiAnalysisPipelineCache,
  options: CreateAsciiAnalysisPassOptions
): GPUComputePassDescriptor {
  const { pipeline, bindGroupLayout } = cache.pipeline();
  const bindGroup = cache.device.createBindGroup({
    label: "ascii.analysis.bindGroup",
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: options.sourceView },
      { binding: 1, resource: { buffer: options.uniformsBuffer } },
      { binding: 2, resource: { buffer: options.featuresBuffer } },
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
