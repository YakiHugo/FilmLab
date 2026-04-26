/**
 * Masked blend — mixes layer over base weighted by mask alpha.
 *
 * `priorInputView` is used as the base; layer and mask are explicitly provided.
 */

import type { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";

import fullscreenWgsl  from "../../wgsl/lib/fullscreen.wgsl?raw";
import maskedBlendWgsl from "../../wgsl/mask/maskedBlend.wgsl?raw";

const maskedBlendSource = `${fullscreenWgsl}\n${maskedBlendWgsl}`;

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

/** @public — consumed by media-native-render-pipeline */
export class MaskedBlendPipelineCache {
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
    const module = this.shaders.compile(maskedBlendSource, "mask/maskedBlend.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "mask.maskedBlend.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `mask.maskedBlend.pipeline:${format}`,
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

export interface MaskedBlendPassHandle {
  descriptor: GPURenderPassDescriptor;
  updateLayer: (tex: GPUTexture) => void;
  updateMask: (tex: GPUTexture) => void;
}

/** @public — consumed by media-native-render-pipeline */
export function createMaskedBlendPass(
  _device: GPUDevice,
  cache: MaskedBlendPipelineCache,
  options: {
    outputFormat: GPUTextureFormat;
    layerTexture: GPUTexture;
    maskTexture: GPUTexture;
    id?: string;
    enabled?: boolean;
  },
): MaskedBlendPassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);

  let layerView = options.layerTexture.createView({ label: "mask.maskedBlend.layer" });
  let maskView  = options.maskTexture.createView({  label: "mask.maskedBlend.mask"  });

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "mask.maskedBlend",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "mask.maskedBlend.bindGroup",
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: ctx.priorInputView },
          { binding: 1, resource: layerView },
          { binding: 2, resource: maskView },
          { binding: 3, resource: ctx.defaultSampler },
        ],
      }),
    ],
    outputFormat: options.outputFormat,
    enabled: options.enabled ?? true,
    vertexCount: 4,
  };

  return {
    descriptor,
    updateLayer: (tex) => { layerView = tex.createView({ label: "mask.maskedBlend.layer" }); },
    updateMask:  (tex) => { maskView  = tex.createView({ label: "mask.maskedBlend.mask"  }); },
  };
}
