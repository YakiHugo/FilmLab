/**
 * HSL adjustment pass — 8-channel hue/saturation/luminance in OKLab space,
 * 3-primary calibration, B&W mixer.
 *
 * Uniform layout matches `wgsl/develop/hsl.wgsl::HslParams`.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import colorSpaceWgsl from "../../wgsl/lib/colorSpace.wgsl?raw";
import hslWgsl from "../../wgsl/develop/hsl.wgsl?raw";

const hslSource = `${fullscreenWgsl}\n${colorSpaceWgsl}\n${hslWgsl}`;

// 10 vec4 = 160 bytes.
const UNIFORM_BYTES = 10 * 16;

export interface HslPassParams {
  hue: readonly [number, number, number, number, number, number, number, number];
  saturation: readonly [number, number, number, number, number, number, number, number];
  luminance: readonly [number, number, number, number, number, number, number, number];
  bwEnabled: boolean;
  bwMix: readonly [number, number, number];
  calibrationEnabled: boolean;
  calibrationHue: readonly [number, number, number];
  calibrationSaturation: readonly [number, number, number];
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class HslPipelineCache {
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
    const module = this.shaders.compile(hslSource, "develop/hsl.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "develop.hsl.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `develop.hsl.pipeline:${format}`,
      layout: this.device.createPipelineLayout({
        label: "develop.hsl.pipelineLayout",
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

export interface HslPassOptions {
  outputFormat: GPUTextureFormat;
  params: HslPassParams;
  id?: string;
  enabled?: boolean;
}

function writeUniforms(device: GPUDevice, buffer: GPUBuffer, p: HslPassParams): void {
  const ab = new ArrayBuffer(UNIFORM_BYTES);
  const f32 = new Float32Array(ab);
  const u32 = new Uint32Array(ab);
  // hue[0..3] @0, hue[4..7] @16
  f32[0] = p.hue[0]; f32[1] = p.hue[1]; f32[2] = p.hue[2]; f32[3] = p.hue[3];
  f32[4] = p.hue[4]; f32[5] = p.hue[5]; f32[6] = p.hue[6]; f32[7] = p.hue[7];
  // sat[0..3] @32, sat[4..7] @48
  f32[8]  = p.saturation[0]; f32[9]  = p.saturation[1]; f32[10] = p.saturation[2]; f32[11] = p.saturation[3];
  f32[12] = p.saturation[4]; f32[13] = p.saturation[5]; f32[14] = p.saturation[6]; f32[15] = p.saturation[7];
  // lum[0..3] @64, lum[4..7] @80
  f32[16] = p.luminance[0]; f32[17] = p.luminance[1]; f32[18] = p.luminance[2]; f32[19] = p.luminance[3];
  f32[20] = p.luminance[4]; f32[21] = p.luminance[5]; f32[22] = p.luminance[6]; f32[23] = p.luminance[7];
  // bwMix_pad @96
  f32[24] = p.bwMix[0]; f32[25] = p.bwMix[1]; f32[26] = p.bwMix[2]; f32[27] = 0;
  // calHue_pad @112
  f32[28] = p.calibrationHue[0]; f32[29] = p.calibrationHue[1]; f32[30] = p.calibrationHue[2]; f32[31] = 0;
  // calSat_pad @128
  f32[32] = p.calibrationSaturation[0]; f32[33] = p.calibrationSaturation[1]; f32[34] = p.calibrationSaturation[2]; f32[35] = 0;
  // flags @144: enabled, bwEnabled, calibrationEnabled
  u32[36] = 1; u32[37] = p.bwEnabled ? 1 : 0; u32[38] = p.calibrationEnabled ? 1 : 0; u32[39] = 0;
  device.queue.writeBuffer(buffer, 0, ab);
}

export interface HslPassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: HslPassParams) => void;
  destroy: () => void;
}

export function createHslPass(
  device: GPUDevice,
  cache: HslPipelineCache,
  options: HslPassOptions,
): HslPassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "develop.hsl.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "develop.hsl",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "develop.hsl.bindGroup",
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
