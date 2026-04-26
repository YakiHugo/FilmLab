/**
 * Per-cell glyph-selection compute pass.
 *
 * Wraps `wgsl/carrier/ascii/selection.wgsl`. Reads per-cell features and
 * glyph descriptors, writes one `u32` glyph index per cell.
 *
 * `structureWeight` blends density-only (0) and structure-only (1) matching;
 * see the WGSL header for the distance formula.
 */

import type { ShaderCache } from "../../../shaders";
import type { GPUComputePassDescriptor } from "../../types";

import selectionWgsl from "../../../wgsl/carrier/ascii/selection.wgsl?raw";

interface CompiledPipeline {
  pipeline: GPUComputePipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

const WORKGROUP_SIZE = 64;

export const SELECTION_UNIFORMS_BYTE_SIZE = 16;

export function packSelectionUniforms(values: {
  cellCount: number;
  glyphCount: number;
  structureWeight: number;
}): ArrayBuffer {
  const buffer = new ArrayBuffer(SELECTION_UNIFORMS_BYTE_SIZE);
  const u = new Uint32Array(buffer);
  const f = new Float32Array(buffer);
  u[0] = values.cellCount;
  u[1] = values.glyphCount;
  f[2] = Math.min(1, Math.max(0, values.structureWeight));
  f[3] = 0;
  return buffer;
}

export interface CreateAsciiSelectionPassOptions {
  featuresBuffer: GPUBuffer;
  glyphsBuffer: GPUBuffer;
  selectionBuffer: GPUBuffer;
  uniformsBuffer: GPUBuffer;
  cellCount: number;
  id?: string;
  enabled?: boolean;
}

export class AsciiSelectionPipelineCache {
  private readonly device: GPUDevice;
  private readonly shaders: ShaderCache;
  private cached: CompiledPipeline | null = null;

  constructor(device: GPUDevice, shaders: ShaderCache) {
    this.device = device;
    this.shaders = shaders;
  }

  createPass(options: CreateAsciiSelectionPassOptions): GPUComputePassDescriptor {
    const { pipeline, bindGroupLayout } = this.pipeline();
    const bindGroup = this.device.createBindGroup({
      label: "ascii.selection.bindGroup",
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: options.featuresBuffer } },
        { binding: 1, resource: { buffer: options.glyphsBuffer } },
        { binding: 2, resource: { buffer: options.selectionBuffer } },
        { binding: 3, resource: { buffer: options.uniformsBuffer } },
      ],
    });
    return {
      kind: "compute",
      id: options.id ?? "ascii.selection",
      pipeline,
      bindGroup,
      workgroupCount: [Math.max(1, Math.ceil(options.cellCount / WORKGROUP_SIZE)), 1, 1],
      enabled: options.enabled ?? true,
    };
  }

  private pipeline(): CompiledPipeline {
    if (this.cached) return this.cached;
    const module = this.shaders.compile(selectionWgsl, "ascii/selection.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "ascii.selection.bindGroupLayout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
      ],
    });
    const pipelineLayout = this.device.createPipelineLayout({
      label: "ascii.selection.pipelineLayout",
      bindGroupLayouts: [bindGroupLayout],
    });
    const pipeline = this.device.createComputePipeline({
      label: "ascii.selection.pipeline",
      layout: pipelineLayout,
      compute: { module, entryPoint: "cs_main" },
    });
    this.cached = { pipeline, bindGroupLayout };
    return this.cached;
  }
}
