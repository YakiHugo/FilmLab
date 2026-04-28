import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";
import { requestGPUContext } from "../../context";
import {
  TexturePool,
  uploadExternalImageToTexture,
  readbackTextureRGBA8,
} from "../../resources";
import { ShaderCache } from "../../shaders";
import { PipelineExecutor, type PipelineInputSource } from "../../pipeline";
import { createPerDeviceCache } from "../../perDeviceCache";
import {
  createRenderSurfaceHandle,
  createEmptyRenderBoundaryMetrics,
  type RenderSurfaceHandle,
} from "@/lib/renderSurfaceHandle";
import type { RenderMode } from "@/lib/renderMode";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import normalLayerBlendWgsl from "../../wgsl/overlay/normalLayerBlend.wgsl?raw";

const normalLayerBlendSource = `${fullscreenWgsl}\n${normalLayerBlendWgsl}`;

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

class NormalLayerBlendPipelineCache {
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
    const module = this.shaders.compile(
      normalLayerBlendSource,
      "overlay/normalLayerBlend.wgsl"
    );
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "overlay.normalLayerBlend.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `overlay.normalLayerBlend.pipeline:${format}`,
      layout: this.device.createPipelineLayout({
        label: "overlay.normalLayerBlend.pipelineLayout",
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

interface NormalLayerBlendPassOptions {
  outputFormat: GPUTextureFormat;
  layerTexture: GPUTexture;
  id?: string;
  enabled?: boolean;
}

interface NormalLayerBlendPassHandle {
  descriptor: GPURenderPassDescriptor;
}

function createNormalLayerBlendPass(
  _device: GPUDevice,
  cache: NormalLayerBlendPipelineCache,
  options: NormalLayerBlendPassOptions
): NormalLayerBlendPassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const layerView = options.layerTexture.createView({
    label: "overlay.normalLayerBlend.layer",
  });

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "overlay.normalLayerBlend",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "overlay.normalLayerBlend.bindGroup",
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: ctx.priorInputView },
          { binding: 1, resource: layerView },
          { binding: 2, resource: ctx.defaultSampler },
        ],
      }),
    ],
    outputFormat: options.outputFormat,
    enabled: options.enabled ?? true,
    vertexCount: 4,
  };

  return { descriptor };
}

const getCache = createPerDeviceCache((device) => {
  const shaders = new ShaderCache(device);
  return {
    shaders,
    normalLayerBlend: new NormalLayerBlendPipelineCache(device, shaders),
  };
});

const OUTPUT_FORMAT: GPUTextureFormat = "rgba8unorm";

export interface ApplyNormalLayerBlendOnSurfaceOptions {
  surface: RenderSurfaceHandle;
  layerCanvas: HTMLCanvasElement;
  slotId?: string;
  mode?: RenderMode;
}

export const applyNormalLayerBlendOnSurface = async ({
  surface,
  layerCanvas,
  slotId = "overlay-normal-blend",
  mode,
}: ApplyNormalLayerBlendOnSurfaceOptions): Promise<RenderSurfaceHandle | null> => {
  if (
    surface.width <= 0 ||
    surface.height <= 0 ||
    layerCanvas.width <= 0 ||
    layerCanvas.height <= 0 ||
    surface.width !== layerCanvas.width ||
    surface.height !== layerCanvas.height
  ) {
    return null;
  }

  const ctx = await requestGPUContext();
  const { device } = ctx;
  const { normalLayerBlend } = getCache(device);
  const pool = new TexturePool(device);
  let baseTexture: GPUTexture | null = null;
  let layerTexture: GPUTexture | null = null;

  try {
    const baseUpload = uploadExternalImageToTexture(device, surface.sourceCanvas, {
      format: OUTPUT_FORMAT,
      label: "overlay.normalLayerBlend:base",
    });
    baseTexture = baseUpload.texture;
    const layerUpload = uploadExternalImageToTexture(device, layerCanvas, {
      format: OUTPUT_FORMAT,
      label: "overlay.normalLayerBlend:layer",
    });
    layerTexture = layerUpload.texture;

    const sampler = device.createSampler({
      minFilter: "linear",
      magFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
    const executor = new PipelineExecutor({
      device,
      texturePool: pool,
      defaultSampler: sampler,
    });

    const handle = createNormalLayerBlendPass(device, normalLayerBlend, {
      outputFormat: OUTPUT_FORMAT,
      layerTexture: layerUpload.texture,
    });

    const baseInput: PipelineInputSource = {
      texture: baseUpload.texture,
      view: baseUpload.texture.createView({ label: "overlay.normalLayerBlend:baseView" }),
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

    const canvas = document.createElement("canvas");
    canvas.width = baseUpload.width;
    canvas.height = baseUpload.height;
    const c2d = canvas.getContext("2d");
    if (!c2d) return null;
    c2d.putImageData(
      new ImageData(new Uint8ClampedArray(pixels), baseUpload.width, baseUpload.height),
      0,
      0
    );

    const metrics = createEmptyRenderBoundaryMetrics();
    metrics.cpuPixelReads += 1;

    return createRenderSurfaceHandle({
      kind: "owned-canvas",
      mode: mode ?? surface.mode,
      slotId,
      sourceCanvas: canvas,
      metrics,
    });
  } finally {
    baseTexture?.destroy();
    layerTexture?.destroy();
    pool.dispose();
  }
};
