/**
 * Layer blend — composites a layer over a base with blend mode + opacity + optional mask.
 *
 * Pass `createPlaceholderWhiteMask(device)` for `maskTexture` when `useMask=false`.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import layerBlendWgsl from "../../wgsl/utility/layerBlend.wgsl?raw";

const layerBlendSource = `${fullscreenWgsl}\n${layerBlendWgsl}`;

// 2 vec4 = 32 bytes
const UNIFORM_BYTES = 32;

export interface LayerBlendParams {
  /** 0=normal, 1=multiply, 2=screen, 3=overlay, 4=softLight */
  blendMode: number;
  useMask: boolean;
  invertMask: boolean;
  opacity: number;
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

export class LayerBlendPipelineCache {
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
    const module = this.shaders.compile(layerBlendSource, "utility/layerBlend.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "utility.layerBlend.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `utility.layerBlend.pipeline:${format}`,
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex:   { module, entryPoint: "vs_main" },
      fragment: { module, entryPoint: "fs_main", targets: [{ format }] },
      primitive: { topology: "triangle-strip" },
    });
    const entry: CompiledPipeline = { pipeline, bindGroupLayout };
    this.byFormat.set(format, entry);
    return entry;
  }
}

/** 1×1 opaque white texture for the mask slot when `useMask=false`. */
export function createPlaceholderWhiteMask(device: GPUDevice): GPUTexture {
  const tex = device.createTexture({
    label: "utility.layerBlend.whiteMask",
    size: { width: 1, height: 1 },
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: tex },
    new Uint8Array([255, 255, 255, 255]),
    { bytesPerRow: 4 },
    { width: 1, height: 1 },
  );
  return tex;
}

export interface LayerBlendPassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: LayerBlendParams) => void;
  updateLayer: (tex: GPUTexture) => void;
  updateMask: (tex: GPUTexture) => void;
  destroy: () => void;
}

function writeUniforms(device: GPUDevice, buf: GPUBuffer, p: LayerBlendParams): void {
  const ab  = new ArrayBuffer(UNIFORM_BYTES);
  const f32 = new Float32Array(ab);
  const u32 = new Uint32Array(ab);
  u32[0] = Math.max(0, Math.min(4, Math.round(p.blendMode)));
  u32[1] = p.useMask    ? 1 : 0;
  u32[2] = p.invertMask ? 1 : 0;
  f32[4] = p.opacity;
  device.queue.writeBuffer(buf, 0, ab);
}

export function createLayerBlendPass(
  device: GPUDevice,
  cache: LayerBlendPipelineCache,
  options: {
    outputFormat: GPUTextureFormat;
    params: LayerBlendParams;
    /** Layer texture to blend over base. */
    layerTexture: GPUTexture;
    /** Mask texture (or placeholder from createPlaceholderWhiteMask). */
    maskTexture: GPUTexture;
    id?: string;
    enabled?: boolean;
  },
): LayerBlendPassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "utility.layerBlend.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  let layerView = options.layerTexture.createView({ label: "utility.layerBlend.layer" });
  let maskView  = options.maskTexture.createView({  label: "utility.layerBlend.mask"  });

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "utility.layerBlend",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "utility.layerBlend.bindGroup",
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: ctx.priorInputView },
          { binding: 1, resource: layerView },
          { binding: 2, resource: maskView },
          { binding: 3, resource: ctx.defaultSampler },
          { binding: 4, resource: { buffer: uniformBuffer } },
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
    updateLayer:  (tex) => { layerView = tex.createView({ label: "utility.layerBlend.layer" }); },
    updateMask:   (tex) => { maskView  = tex.createView({ label: "utility.layerBlend.mask"  }); },
    destroy: () => uniformBuffer.destroy(),
  };
}
