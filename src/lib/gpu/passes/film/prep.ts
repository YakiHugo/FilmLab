/**
 * Film prep pass — expand, highlight compression, developer, tone response.
 * Mirrors `shaders/FilmPrepUber.frag`.
 *
 * Uniform layout matches `wgsl/film/prep.wgsl::PrepParams`.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import colorSpaceWgsl from "../../wgsl/lib/colorSpace.wgsl?raw";
import prepWgsl from "../../wgsl/film/prep.wgsl?raw";

const prepSource = `${fullscreenWgsl}\n${colorSpaceWgsl}\n${prepWgsl}`;

// 6 vec4 = 96 bytes
const UNIFORM_BYTES = 96;

export interface PrepPassParams {
  expandEnabled: boolean;
  expandBlackPoint: number;
  expandWhitePoint: number;
  compressionEnabled: boolean;
  highlightRolloff: number;
  shoulderWidth: number;
  developerEnabled: boolean;
  developerContrast: number;
  developerGamma: number;
  colorSeparation: readonly [number, number, number];
  toneEnabled: boolean;
  toneShoulder: number;
  toneToe: number;
  toneGamma: number;
  pushPullEv: number;
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class PrepPipelineCache {
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
    const module = this.shaders.compile(prepSource, "film/prep.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "film.prep.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `film.prep.pipeline:${format}`,
      layout: this.device.createPipelineLayout({
        label: "film.prep.pipelineLayout",
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

export interface PrepPassOptions {
  outputFormat: GPUTextureFormat;
  params: PrepPassParams;
  id?: string;
  enabled?: boolean;
}

function writeUniforms(device: GPUDevice, buf: GPUBuffer, p: PrepPassParams): void {
  const ab = new ArrayBuffer(UNIFORM_BYTES);
  const f32 = new Float32Array(ab);
  const u32 = new Uint32Array(ab);
  // flags @ 0
  u32[0] = p.expandEnabled ? 1 : 0;
  u32[1] = p.compressionEnabled ? 1 : 0;
  u32[2] = p.developerEnabled ? 1 : 0;
  u32[3] = p.toneEnabled ? 1 : 0;
  // expand @ 16
  f32[4] = p.expandBlackPoint; f32[5] = p.expandWhitePoint;
  // compr @ 32
  f32[8] = p.highlightRolloff; f32[9] = p.shoulderWidth;
  // developer @ 48
  f32[12] = p.developerContrast; f32[13] = p.developerGamma; f32[14] = p.pushPullEv;
  // color_sep @ 64
  f32[16] = p.colorSeparation[0]; f32[17] = p.colorSeparation[1]; f32[18] = p.colorSeparation[2];
  // tone @ 80
  f32[20] = p.toneShoulder; f32[21] = p.toneToe; f32[22] = p.toneGamma;
  device.queue.writeBuffer(buf, 0, ab);
}

export interface PrepPassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: PrepPassParams) => void;
  destroy: () => void;
}

export function createPrepPass(
  device: GPUDevice,
  cache: PrepPipelineCache,
  options: PrepPassOptions,
): PrepPassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "film.prep.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "film.prep",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "film.prep.bindGroup",
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
