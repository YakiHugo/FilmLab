/**
 * Master adjustment pass — exposure, LMS white balance, contrast, tonal range,
 * curves, OKLab HSL, 3-way color grading, dehaze. Mirrors
 * `shaders/MasterAdjustment.frag`.
 *
 * Uniform layout matches `wgsl/develop/master.wgsl::MasterParams`. Single
 * uniform buffer is created on construction; bind group rebuilds per execute.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import colorSpaceWgsl from "../../wgsl/lib/colorSpace.wgsl?raw";
import masterWgsl from "../../wgsl/develop/master.wgsl?raw";

const masterSource = `${fullscreenWgsl}\n${colorSpaceWgsl}\n${masterWgsl}`;

// 9 vec4 = 144 bytes.
const UNIFORM_BYTES = 9 * 16;

export interface MasterPassParams {
  exposure: number;
  contrast: number;
  whiteBalanceLmsScale: readonly [number, number, number];
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  curveHighlights: number;
  curveLights: number;
  curveDarks: number;
  curveShadows: number;
  hueShift: number;
  saturation: number;
  vibrance: number;
  luminance: number;
  colorGradeShadows: readonly [number, number, number];
  colorGradeMidtones: readonly [number, number, number];
  colorGradeHighlights: readonly [number, number, number];
  colorGradeBlend: number;
  colorGradeBalance: number;
  dehaze: number;
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class MasterPipelineCache {
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
    const module = this.shaders.compile(masterSource, "develop/master.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "develop.master.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `develop.master.pipeline:${format}`,
      layout: this.device.createPipelineLayout({
        label: "develop.master.pipelineLayout",
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

export interface MasterPassOptions {
  outputFormat: GPUTextureFormat;
  params: MasterPassParams;
  id?: string;
  enabled?: boolean;
}

function writeUniforms(device: GPUDevice, buffer: GPUBuffer, p: MasterPassParams): void {
  const ab = new ArrayBuffer(UNIFORM_BYTES);
  const f32 = new Float32Array(ab);
  // whiteBalanceLmsScale (vec4) @0
  f32[0] = p.whiteBalanceLmsScale[0]; f32[1] = p.whiteBalanceLmsScale[1]; f32[2] = p.whiteBalanceLmsScale[2]; f32[3] = 0;
  // tonalRange (vec4): highlights, shadows, whites, blacks @16
  f32[4] = p.highlights; f32[5] = p.shadows; f32[6] = p.whites; f32[7] = p.blacks;
  // curve (vec4): curveHi, Lights, Darks, Shadows @32
  f32[8] = p.curveHighlights; f32[9] = p.curveLights; f32[10] = p.curveDarks; f32[11] = p.curveShadows;
  // colorGradeShadows (vec4) @48
  f32[12] = p.colorGradeShadows[0]; f32[13] = p.colorGradeShadows[1]; f32[14] = p.colorGradeShadows[2]; f32[15] = 0;
  // colorGradeMidtones (vec4) @64
  f32[16] = p.colorGradeMidtones[0]; f32[17] = p.colorGradeMidtones[1]; f32[18] = p.colorGradeMidtones[2]; f32[19] = 0;
  // colorGradeHighlights (vec4) @80
  f32[20] = p.colorGradeHighlights[0]; f32[21] = p.colorGradeHighlights[1]; f32[22] = p.colorGradeHighlights[2]; f32[23] = 0;
  // scalars0 (vec4): exposure, contrast, hueShift, saturation @96
  f32[24] = p.exposure; f32[25] = p.contrast; f32[26] = p.hueShift; f32[27] = p.saturation;
  // scalars1 (vec4): vibrance, luminance, colorGradeBlend, colorGradeBalance @112
  f32[28] = p.vibrance; f32[29] = p.luminance; f32[30] = p.colorGradeBlend; f32[31] = p.colorGradeBalance;
  // scalars2 (vec4): dehaze, _, _, _ @128
  f32[32] = p.dehaze; f32[33] = 0; f32[34] = 0; f32[35] = 0;
  device.queue.writeBuffer(buffer, 0, ab);
}

export interface MasterPassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: MasterPassParams) => void;
  destroy: () => void;
}

export function createMasterPass(
  device: GPUDevice,
  cache: MasterPipelineCache,
  options: MasterPassOptions
): MasterPassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "develop.master.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "develop.master",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "develop.master.bindGroup",
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
