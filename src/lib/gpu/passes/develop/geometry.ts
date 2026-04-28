/**
 * Geometry pass — crop / translate / rotate / scale / flip / perspective /
 * lens distortion + chromatic aberration. Outputs linear sRGB. Mirrors
 *
 * Uniform struct layout matches `wgsl/develop/geometry.wgsl::GeometryParams`.
 * Homography is uploaded as three vec4 columns (xyz used) so the JS-side
 * encode is a flat write — no per-element padding loop in the hot path.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import colorSpaceWgsl from "../../wgsl/lib/colorSpace.wgsl?raw";
import geometryWgsl from "../../wgsl/develop/geometry.wgsl?raw";

const geometrySource = `${fullscreenWgsl}\n${colorSpaceWgsl}\n${geometryWgsl}`;

// 10 vec4 = 160 bytes (struct order matches GeometryParams in geometry.wgsl).
const UNIFORM_BYTES = 10 * 16;

export interface GeometryPassParams {
  enabled: boolean;
  cropRect: readonly [number, number, number, number];
  sourceSize: readonly [number, number];
  outputSize: readonly [number, number];
  translatePx: readonly [number, number];
  rotate: number;
  scale: number;
  flip: readonly [number, number];
  perspectiveEnabled: boolean;
  /** 9 entries, row-major. */
  homography: readonly number[];
  lensEnabled: boolean;
  lensK1: number;
  lensK2: number;
  lensVignetteBoost: number;
  lensVignetteMidpoint: number;
  caEnabled: boolean;
  caAmountPxRgb: readonly [number, number, number];
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class GeometryPipelineCache {
  private readonly device: GPUDevice;
  private readonly shaders: ShaderCache;
  private readonly byFormat = new Map<GPUTextureFormat, CompiledPipeline>();

  constructor(device: GPUDevice, shaders: ShaderCache) {
    this.device = device;
    this.shaders = shaders;
  }

  pipelineFor(format: GPUTextureFormat): CompiledPipeline {
    const cached = this.byFormat.get(format);
    if (cached) return cached;
    const module = this.shaders.compile(geometrySource, "develop/geometry.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "develop.geometry.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `develop.geometry.pipeline:${format}`,
      layout: this.device.createPipelineLayout({
        label: "develop.geometry.pipelineLayout",
        bindGroupLayouts: [bindGroupLayout],
      }),
      vertex: { module, entryPoint: "vs_main" },
      fragment: { module, entryPoint: "fs_main", targets: [{ format }] },
      primitive: { topology: "triangle-strip" },
    });
    const entry: CompiledPipeline = { pipeline, bindGroupLayout };
    this.byFormat.set(format, entry);
    return entry;
  }
}

export interface GeometryPassOptions {
  outputFormat: GPUTextureFormat;
  params: GeometryPassParams;
  id?: string;
  enabled?: boolean;
}

function writeUniforms(device: GPUDevice, buffer: GPUBuffer, p: GeometryPassParams): void {
  const ab = new ArrayBuffer(UNIFORM_BYTES);
  const f32 = new Float32Array(ab);
  const u32 = new Uint32Array(ab);

  // cropRect (vec4) @0
  f32[0] = p.cropRect[0]; f32[1] = p.cropRect[1]; f32[2] = p.cropRect[2]; f32[3] = p.cropRect[3];
  // sourceSize.xy + outputSize.xy (vec4) @16
  f32[4] = p.sourceSize[0]; f32[5] = p.sourceSize[1];
  f32[6] = p.outputSize[0]; f32[7] = p.outputSize[1];
  // translatePx.xy + flip.xy (vec4) @32
  f32[8] = p.translatePx[0]; f32[9] = p.translatePx[1];
  f32[10] = p.flip[0]; f32[11] = p.flip[1];
  // scalars0 (vec4): rotate, scale, lensK1, lensK2 @48
  f32[12] = p.rotate; f32[13] = p.scale; f32[14] = p.lensK1; f32[15] = p.lensK2;
  // scalars1 (vec4): lensVignetteBoost, lensVignetteMidpoint, _, _ @64
  f32[16] = p.lensVignetteBoost; f32[17] = p.lensVignetteMidpoint; f32[18] = 0; f32[19] = 0;
  // caAmountPxRgb (vec4) @80
  f32[20] = p.caAmountPxRgb[0]; f32[21] = p.caAmountPxRgb[1]; f32[22] = p.caAmountPxRgb[2]; f32[23] = 0;
  // flags (vec4<u32>) @96
  u32[24] = p.enabled ? 1 : 0;
  u32[25] = p.perspectiveEnabled ? 1 : 0;
  u32[26] = p.lensEnabled ? 1 : 0;
  u32[27] = p.caEnabled ? 1 : 0;
  // Homography: h[0..2] = col0, h[3..5] = col1, h[6..8] = col2.
  const h = p.homography;
  const safe = (i: number) => h[i] ?? (i % 4 === 0 ? 1 : 0);
  // homCol0 @112
  f32[28] = safe(0); f32[29] = safe(1); f32[30] = safe(2); f32[31] = 0;
  // homCol1 @128
  f32[32] = safe(3); f32[33] = safe(4); f32[34] = safe(5); f32[35] = 0;
  // homCol2 @144
  f32[36] = safe(6); f32[37] = safe(7); f32[38] = safe(8); f32[39] = 0;
  device.queue.writeBuffer(buffer, 0, ab);
}

export interface GeometryPassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: GeometryPassParams) => void;
  destroy: () => void;
}

export function createGeometryPass(
  device: GPUDevice,
  cache: GeometryPipelineCache,
  options: GeometryPassOptions
): GeometryPassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  // Buffer needs to be a multiple of 16 (WebGPU min) which 144 already is.
  const uniformBuffer = device.createBuffer({
    label: "develop.geometry.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "develop.geometry",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "develop.geometry.bindGroup",
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: ctx.priorInputView },
          { binding: 1, resource: ctx.defaultSampler },
          { binding: 2, resource: { buffer: uniformBuffer } },
        ],
      }),
    ],
    outputFormat: options.outputFormat,
    enabled: options.enabled ?? true,
    vertexCount: 4,
  };

  return {
    descriptor,
    updateParams: (next) => writeUniforms(device, uniformBuffer, next),
    destroy: () => uniformBuffer.destroy(),
  };
}
