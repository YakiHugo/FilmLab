/**
 * ASCII composition render pass — full feature parity with the legacy
 * AsciiCarrier.frag (background + foreground layers, glyph/dot modes,
 * grayscale/full-color/duotone, grid overlay, alpha cutoff).
 *
 * Wraps `wgsl/carrier/ascii/composition.wgsl`. Bindings:
 *   0 atlasTex          (foreground glyph atlas)
 *   1 atlasSampler      (also used to sample bgSourceTex)
 *   2 uniforms
 *   3 selection         (per-cell glyph index from selection.wgsl)
 *   4 cellColor         (per-cell averaged RGBA from analysis.wgsl)
 *   5 cellTone          (per-cell normalized tone from toneNormalize.wgsl)
 *   6 bgSourceTex       (blurred-source bg layer, or 1×1 placeholder)
 *
 * The orchestrator (asciiCarrier surface adapter) calls `createPass` twice
 * per frame — once with `layerMode=0` and once with `layerMode=1` — feeding
 * each output through `utility/layerBlend` to produce the final composite.
 */

import type { ShaderCache } from "../../../shaders";
import type { GPURenderPassDescriptor } from "../../types";

import compositionWgsl from "../../../wgsl/carrier/ascii/composition.wgsl?raw";

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

// 8 vec4 = 128 bytes.
export const COMPOSITION_UNIFORMS_BYTE_SIZE = 128;

export type AsciiLayerMode = "background" | "foreground";
export type AsciiRenderMode = "glyph" | "dot";
export type AsciiColorMode = "grayscale" | "full-color" | "duotone";

const LAYER_MODE_INDEX: Record<AsciiLayerMode, number> = {
  background: 0,
  foreground: 1,
};
const RENDER_MODE_INDEX: Record<AsciiRenderMode, number> = {
  glyph: 0,
  dot: 1,
};
const COLOR_MODE_INDEX: Record<AsciiColorMode, number> = {
  grayscale: 0,
  "full-color": 1,
  duotone: 2,
};

export interface PackCompositionUniformsOptions {
  canvasWidth: number;
  canvasHeight: number;
  gridColumns: number;
  gridRows: number;
  cellWidth: number;
  cellHeight: number;
  atlasColumns: number;
  atlasRows: number;
  glyphCount: number;
  layerMode: AsciiLayerMode;
  renderMode: AsciiRenderMode;
  colorMode: AsciiColorMode;
  invert: boolean;
  foregroundOpacity: number;
  backgroundOpacity: number;
  gridOverlayAlpha: number;
  /** [r, g, b, a] in 0..1 — already includes the chosen background opacity. */
  backgroundFill: readonly [number, number, number, number];
  cellBackground: readonly [number, number, number, number];
  duotoneShadow: readonly [number, number, number, number];
  useBackgroundCanvas: boolean;
  useBackgroundFill: boolean;
  useCellBackground: boolean;
  gridOverlay: boolean;
}

export function packCompositionUniforms(values: PackCompositionUniformsOptions): ArrayBuffer {
  const buffer = new ArrayBuffer(COMPOSITION_UNIFORMS_BYTE_SIZE);
  const f = new Float32Array(buffer);
  const u = new Uint32Array(buffer);
  // canvasGrid (vec4)
  f[0] = values.canvasWidth;
  f[1] = values.canvasHeight;
  f[2] = values.gridColumns;
  f[3] = values.gridRows;
  // cellAtlas (vec4)
  f[4] = values.cellWidth;
  f[5] = values.cellHeight;
  f[6] = values.atlasColumns;
  f[7] = values.atlasRows;
  // backgroundFill (vec4)
  f[8] = values.backgroundFill[0];
  f[9] = values.backgroundFill[1];
  f[10] = values.backgroundFill[2];
  f[11] = values.backgroundFill[3];
  // cellBackground (vec4)
  f[12] = values.cellBackground[0];
  f[13] = values.cellBackground[1];
  f[14] = values.cellBackground[2];
  f[15] = values.cellBackground[3];
  // duotoneShadow (vec4)
  f[16] = values.duotoneShadow[0];
  f[17] = values.duotoneShadow[1];
  f[18] = values.duotoneShadow[2];
  f[19] = values.duotoneShadow[3];
  // scalars (vec4): glyphCount, fgOpacity, bgOpacity, gridOverlayAlpha
  f[20] = values.glyphCount;
  f[21] = Math.min(1, Math.max(0, values.foregroundOpacity));
  f[22] = Math.min(1, Math.max(0, values.backgroundOpacity));
  f[23] = Math.min(1, Math.max(0, values.gridOverlayAlpha));
  // modes (vec4<u32>): layerMode, renderMode, colorMode, invert
  u[24] = LAYER_MODE_INDEX[values.layerMode];
  u[25] = RENDER_MODE_INDEX[values.renderMode];
  u[26] = COLOR_MODE_INDEX[values.colorMode];
  u[27] = values.invert ? 1 : 0;
  // bgFlags (vec4<u32>): useBackgroundCanvas, useBackgroundFill, useCellBackground, gridOverlay
  u[28] = values.useBackgroundCanvas ? 1 : 0;
  u[29] = values.useBackgroundFill ? 1 : 0;
  u[30] = values.useCellBackground ? 1 : 0;
  u[31] = values.gridOverlay ? 1 : 0;
  return buffer;
}

export interface CreateAsciiCompositionPassOptions {
  outputFormat: GPUTextureFormat;
  atlasView: GPUTextureView;
  atlasSampler: GPUSampler;
  uniformsBuffer: GPUBuffer;
  selectionBuffer: GPUBuffer;
  cellColorBuffer: GPUBuffer;
  cellToneBuffer: GPUBuffer;
  bgSourceView: GPUTextureView;
  id?: string;
  enabled?: boolean;
  resolution?: number;
}

export class AsciiCompositionPipelineCache {
  private readonly device: GPUDevice;
  private readonly shaders: ShaderCache;
  private readonly byFormat = new Map<GPUTextureFormat, CompiledPipeline>();

  constructor(device: GPUDevice, shaders: ShaderCache) {
    this.device = device;
    this.shaders = shaders;
  }

  createPass(options: CreateAsciiCompositionPassOptions): GPURenderPassDescriptor {
    const { pipeline, bindGroupLayout } = this.pipelineFor(options.outputFormat);
    // Bake the bind group at factory time — bound resources do not change
    // per frame for a given dispatch (background and foreground layers each
    // get their own pass instance + uniform buffer).
    const bindGroup = this.device.createBindGroup({
      label: "ascii.composition.bindGroup",
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: options.atlasView },
        { binding: 1, resource: options.atlasSampler },
        { binding: 2, resource: { buffer: options.uniformsBuffer } },
        { binding: 3, resource: { buffer: options.selectionBuffer } },
        { binding: 4, resource: { buffer: options.cellColorBuffer } },
        { binding: 5, resource: { buffer: options.cellToneBuffer } },
        { binding: 6, resource: options.bgSourceView },
      ],
    });
    const groups = [bindGroup] as const;
    return {
      kind: "render",
      id: options.id ?? "ascii.composition",
      pipeline,
      bindGroups: () => groups,
      outputFormat: options.outputFormat,
      enabled: options.enabled ?? true,
      resolution: options.resolution,
      vertexCount: 4,
    };
  }

  private pipelineFor(format: GPUTextureFormat): CompiledPipeline {
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
        {
          binding: 4,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 5,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: "read-only-storage" },
        },
        {
          binding: 6,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float", viewDimension: "2d" },
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
