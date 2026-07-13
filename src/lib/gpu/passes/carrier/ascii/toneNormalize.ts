/**
 * Per-cell tone-normalization compute pass.
 *
 * Wraps `wgsl/carrier/ascii/toneNormalize.wgsl`. Reads raw cell luminance
 * from `featuresBuffer[i*27 + 0]` (written by analysis.wgsl) plus the cell's
 * average alpha from `cellColorBuffer[i].a`, applies the
 * brightness/contrast/density/coverage/invert/edge/dither chain that
 * `asciiEffect.ts::buildAsciiCellGrids` used to do on the CPU, and writes the
 * normalized tone to `cellToneBuffer[i]`.
 *
 * Floyd-Steinberg → Bayer 8×8 substitution (FS is sequential — see WGSL
 * header for the rationale).
 */

import type { ShaderCache } from "../../../shaders";
import type { GPUComputePassDescriptor } from "../../types";

import toneNormalizeWgsl from "../../../wgsl/carrier/ascii/toneNormalize.wgsl?raw";

interface CompiledPipeline {
  pipeline: GPUComputePipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

const WORKGROUP_DIM = 8;

// The WGSL struct ends at byte 52 and its uniform binding is padded to a
// 16-byte boundary. A 48-byte buffer invalidates the entire compute chain.
export const TONE_NORMALIZE_UNIFORMS_BYTE_SIZE = 64;

export type AsciiDitherMode = "none" | "bayer";

export interface PackToneNormalizeUniformsOptions {
  gridColumns: number;
  gridRows: number;
  /** charset.length - 1 (≥ 1). Composition's `idx = round(tone * glyphSteps)` mapping. */
  glyphSteps: number;
  ditherMode: AsciiDitherMode;
  /** -100..100 (matches `params.brightness`). */
  brightness: number;
  /** 0.25..3. */
  contrast: number;
  /** 0.1..1 — applied as `pow(x, 1 / density)`. */
  density: number;
  /** 0.05..1. */
  coverage: number;
  /** 0..1. */
  edgeEmphasis: number;
  invert: boolean;
}

export function packToneNormalizeUniforms(values: PackToneNormalizeUniformsOptions): ArrayBuffer {
  const buffer = new ArrayBuffer(TONE_NORMALIZE_UNIFORMS_BYTE_SIZE);
  const u = new Uint32Array(buffer);
  const f = new Float32Array(buffer);
  u[0] = Math.max(1, values.gridColumns);
  u[1] = Math.max(1, values.gridRows);
  u[2] = Math.max(1, Math.round(values.glyphSteps));
  u[3] = values.ditherMode === "bayer" ? 1 : 0;
  f[4] = values.brightness;
  f[5] = values.contrast;
  f[6] = values.density;
  f[7] = values.coverage;
  f[8] = values.edgeEmphasis;
  u[9] = values.invert ? 1 : 0;
  u[10] = 0;
  u[11] = 0;
  return buffer;
}

export interface CreateAsciiToneNormalizePassOptions {
  featuresBuffer: GPUBuffer;
  cellColorBuffer: GPUBuffer;
  cellToneBuffer: GPUBuffer;
  uniformsBuffer: GPUBuffer;
  gridColumns: number;
  gridRows: number;
  id?: string;
  enabled?: boolean;
}

export class AsciiToneNormalizePipelineCache {
  private readonly device: GPUDevice;
  private readonly shaders: ShaderCache;
  private cached: CompiledPipeline | null = null;

  constructor(device: GPUDevice, shaders: ShaderCache) {
    this.device = device;
    this.shaders = shaders;
  }

  createPass(options: CreateAsciiToneNormalizePassOptions): GPUComputePassDescriptor {
    const { pipeline, bindGroupLayout } = this.pipeline();
    const bindGroup = this.device.createBindGroup({
      label: "ascii.toneNormalize.bindGroup",
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: options.featuresBuffer } },
        { binding: 1, resource: { buffer: options.cellColorBuffer } },
        { binding: 2, resource: { buffer: options.cellToneBuffer } },
        { binding: 3, resource: { buffer: options.uniformsBuffer } },
      ],
    });
    return {
      kind: "compute",
      id: options.id ?? "ascii.toneNormalize",
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
    const module = this.shaders.compile(toneNormalizeWgsl, "ascii/toneNormalize.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "ascii.toneNormalize.bindGroupLayout",
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
      label: "ascii.toneNormalize.pipelineLayout",
      bindGroupLayouts: [bindGroupLayout],
    });
    const pipeline = this.device.createComputePipeline({
      label: "ascii.toneNormalize.pipeline",
      layout: pipelineLayout,
      compute: { module, entryPoint: "cs_main" },
    });
    this.cached = { pipeline, bindGroupLayout };
    return this.cached;
  }
}
