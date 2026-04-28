/**
 * Masked blend — mixes layer over base weighted by mask alpha.
 *
 * `priorInputView` is used as the base; layer and mask are explicitly provided.
 */

import { ShaderCache } from "../../shaders";
import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";
import { requestGPUContext } from "../../context";
import {
  TexturePool,
  uploadExternalImageToTexture,
  readbackTextureRGBA8,
} from "../../resources";
import { PipelineExecutor, type PipelineInputSource } from "../../pipeline";
import { createPerDeviceCache } from "../../perDeviceCache";
import {
  createRenderSurfaceHandle,
  createEmptyRenderBoundaryMetrics,
  type RenderSurfaceHandle,
} from "@/lib/renderSurfaceHandle";
import type { RenderMode } from "@/lib/renderMode";

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

// ─── standalone surface op ────────────────────────────────────────────────────

const getCache = createPerDeviceCache((device) => {
  const shaders = new ShaderCache(device);
  return {
    shaders,
    maskedBlend: new MaskedBlendPipelineCache(device, shaders),
  };
});

const OUTPUT_FORMAT: GPUTextureFormat = "rgba8unorm";

const blendCanvasesToPixels = async ({
  baseCanvas,
  layerCanvas,
  maskCanvas,
}: {
  baseCanvas: HTMLCanvasElement;
  layerCanvas: HTMLCanvasElement;
  maskCanvas: HTMLCanvasElement;
}): Promise<{ pixels: Uint8Array; width: number; height: number } | null> => {
  if (
    baseCanvas.width <= 0 ||
    baseCanvas.height <= 0 ||
    baseCanvas.width !== layerCanvas.width ||
    baseCanvas.height !== layerCanvas.height ||
    baseCanvas.width !== maskCanvas.width ||
    baseCanvas.height !== maskCanvas.height
  ) {
    return null;
  }

  const ctx = await requestGPUContext();
  const { device } = ctx;
  const { maskedBlend } = getCache(device);
  const pool = new TexturePool(device);
  let baseTexture: GPUTexture | null = null;
  let layerTexture: GPUTexture | null = null;
  let maskTexture: GPUTexture | null = null;

  try {
    const baseUpload = uploadExternalImageToTexture(device, baseCanvas, {
      format: OUTPUT_FORMAT,
      label: "maskedBlend:base",
    });
    baseTexture = baseUpload.texture;
    const layerUpload = uploadExternalImageToTexture(device, layerCanvas, {
      format: OUTPUT_FORMAT,
      label: "maskedBlend:layer",
    });
    layerTexture = layerUpload.texture;
    const maskUpload = uploadExternalImageToTexture(device, maskCanvas, {
      format: OUTPUT_FORMAT,
      label: "maskedBlend:mask",
    });
    maskTexture = maskUpload.texture;

    const sampler = device.createSampler({
      minFilter: "linear",
      magFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
    const executor = new PipelineExecutor({ device, texturePool: pool, defaultSampler: sampler });

    const handle = createMaskedBlendPass(device, maskedBlend, {
      outputFormat: OUTPUT_FORMAT,
      layerTexture: layerUpload.texture,
      maskTexture: maskUpload.texture,
      id: "mask.maskedBlend",
    });

    const baseInput: PipelineInputSource = {
      texture: baseUpload.texture,
      view: baseUpload.texture.createView({ label: "maskedBlend:baseView" }),
      width: baseUpload.width,
      height: baseUpload.height,
      format: OUTPUT_FORMAT,
      lease: null,
    };

    const result = executor.execute({
      passes: [handle.descriptor],
      input: baseInput,
      baseWidth: baseUpload.width,
      baseHeight: baseUpload.height,
    });
    if (result.kind !== "texture") return null;

    const pixels = await readbackTextureRGBA8(
      device,
      result.output.texture,
      baseUpload.width,
      baseUpload.height
    );
    result.output.release();

    return { pixels, width: baseUpload.width, height: baseUpload.height };
  } finally {
    baseTexture?.destroy();
    layerTexture?.destroy();
    maskTexture?.destroy();
    pool.dispose();
  }
};

const writePixelsToCanvas = (
  pixels: Uint8Array,
  width: number,
  height: number,
  targetCanvas: HTMLCanvasElement
): boolean => {
  if (targetCanvas.width !== width) targetCanvas.width = width;
  if (targetCanvas.height !== height) targetCanvas.height = height;
  const ctx = targetCanvas.getContext("2d");
  if (!ctx) return false;
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(pixels), width, height),
    0,
    0
  );
  return true;
};

export interface ApplyMaskedBlendOnSurfaceOptions {
  baseCanvas: HTMLCanvasElement;
  layerCanvas: HTMLCanvasElement;
  maskCanvas: HTMLCanvasElement;
  slotId?: string;
  mode?: RenderMode;
}

export const applyMaskedBlendOnSurface = async ({
  baseCanvas,
  layerCanvas,
  maskCanvas,
  slotId = "masked-canvas-blend",
  mode = "preview",
}: ApplyMaskedBlendOnSurfaceOptions): Promise<RenderSurfaceHandle | null> => {
  const blended = await blendCanvasesToPixels({ baseCanvas, layerCanvas, maskCanvas });
  if (!blended) return null;

  const canvas = document.createElement("canvas");
  if (!writePixelsToCanvas(blended.pixels, blended.width, blended.height, canvas)) {
    return null;
  }

  const metrics = createEmptyRenderBoundaryMetrics();
  metrics.cpuPixelReads += 1;

  return createRenderSurfaceHandle({
    kind: "owned-canvas",
    mode,
    slotId,
    sourceCanvas: canvas,
    metrics,
  });
};

export interface ApplyMaskedBlendOnGpuOptions {
  baseCanvas: HTMLCanvasElement;
  layerCanvas: HTMLCanvasElement;
  maskCanvas: HTMLCanvasElement;
  targetCanvas: HTMLCanvasElement;
}

export const applyMaskedBlendOnGpu = async ({
  baseCanvas,
  layerCanvas,
  maskCanvas,
  targetCanvas,
}: ApplyMaskedBlendOnGpuOptions): Promise<boolean> => {
  const blended = await blendCanvasesToPixels({ baseCanvas, layerCanvas, maskCanvas });
  if (!blended) return false;
  return writePixelsToCanvas(blended.pixels, blended.width, blended.height, targetCanvas);
};
