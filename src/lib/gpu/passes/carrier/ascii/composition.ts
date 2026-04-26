/**
 * ASCII composition render pass (Slice 1 — foreground glyph rendering only).
 *
 * Wraps `wgsl/carrier/ascii/composition.wgsl`. Reads the per-cell selection
 * buffer + glyph atlas texture and stamps each cell with its selected glyph.
 * Background layer / dot mode / color modes / grid overlay are deferred to
 * Slice 6 — see the WGSL header.
 */

import type { ShaderCache } from "../../../shaders";
import type {
  GPURenderPassDescriptor,
  GPURenderPassBindContext,
} from "../../types";

import compositionWgsl from "../../../wgsl/carrier/ascii/composition.wgsl?raw";

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class AsciiCompositionPipelineCache {
  readonly device: GPUDevice;
  private readonly shaders: ShaderCache;
  private readonly byFormat = new Map<GPUTextureFormat, CompiledPipeline>();

  constructor(device: GPUDevice, shaders: ShaderCache) {
    this.device = device;
    this.shaders = shaders;
  }

  pipelineFor(format: GPUTextureFormat): CompiledPipeline {
    const cached = this.byFormat.get(format);
    if (cached) return cached;
    const module = this.shaders.compile(compositionWgsl, "ascii/composition.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "ascii.composition.bindGroupLayout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float", viewDimension: "2d" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "read-only-storage" },
        },
      ],
    });
    const pipelineLayout = this.device.createPipelineLayout({
      label: "ascii.composition.pipelineLayout",
      bindGroupLayouts: [bindGroupLayout],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `ascii.composition.pipeline:${format}`,
      layout: pipelineLayout,
      vertex: { module, entryPoint: "vs_main" },
      fragment: { module, entryPoint: "fs_main", targets: [{ format }] },
      primitive: { topology: "triangle-strip" },
    });
    const entry: CompiledPipeline = { pipeline, bindGroupLayout };
    this.byFormat.set(format, entry);
    return entry;
  }
}

export const COMPOSITION_UNIFORMS_BYTE_SIZE = 48;

export function packCompositionUniforms(values: {
  canvasWidth: number;
  canvasHeight: number;
  gridColumns: number;
  gridRows: number;
  cellWidth: number;
  cellHeight: number;
  atlasColumns: number;
  atlasRows: number;
  foregroundOpacity: number;
}): ArrayBuffer {
  const buffer = new ArrayBuffer(COMPOSITION_UNIFORMS_BYTE_SIZE);
  const f = new Float32Array(buffer);
  f[0] = values.canvasWidth;
  f[1] = values.canvasHeight;
  f[2] = values.gridColumns;
  f[3] = values.gridRows;
  f[4] = values.cellWidth;
  f[5] = values.cellHeight;
  f[6] = values.atlasColumns;
  f[7] = values.atlasRows;
  f[8] = Math.min(1, Math.max(0, values.foregroundOpacity));
  return buffer;
}

export interface CreateAsciiCompositionPassOptions {
  outputFormat: GPUTextureFormat;
  atlasView: GPUTextureView;
  atlasSampler: GPUSampler;
  uniformsBuffer: GPUBuffer;
  selectionBuffer: GPUBuffer;
  id?: string;
  enabled?: boolean;
  resolution?: number;
}

export function createAsciiCompositionPass(
  cache: AsciiCompositionPipelineCache,
  options: CreateAsciiCompositionPassOptions
): GPURenderPassDescriptor {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  return {
    kind: "render",
    id: options.id ?? "ascii.composition",
    pipeline,
    bindGroups: (_ctx: GPURenderPassBindContext) => [
      cache.device.createBindGroup({
        label: "ascii.composition.bindGroup",
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: options.atlasView },
          { binding: 1, resource: options.atlasSampler },
          { binding: 2, resource: { buffer: options.uniformsBuffer } },
          { binding: 3, resource: { buffer: options.selectionBuffer } },
        ],
      }),
    ],
    outputFormat: options.outputFormat,
    enabled: options.enabled ?? true,
    resolution: options.resolution,
    vertexCount: 4,
  };
}
