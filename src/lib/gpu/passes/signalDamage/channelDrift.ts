/**
 * Channel drift signal-damage pass — port of `shaders/ChannelDrift.frag`.
 *
 * Single fullscreen pass; samples each color channel from a separately
 * offset UV. Used directly by `signalDamageExecution.ts` via
 * `applyChannelDriftOnSurface`; not currently composed into the kernel.
 */

import type { GPURenderPassBindContext, GPURenderPassDescriptor } from "../types";
import { requestGPUContext } from "../../context";
import {
  TexturePool,
  uploadExternalImageToTexture,
  readbackTextureRGBA8,
} from "../../resources";
import { ShaderCache } from "../../shaders";
import { PipelineExecutor, type PipelineInputSource } from "../../pipeline";
import {
  createRenderSurfaceHandle,
  createEmptyRenderBoundaryMetrics,
  type RenderSurfaceHandle,
} from "@/lib/renderSurfaceHandle";
import type { RenderMode } from "@/lib/renderer/RenderManager";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import channelDriftWgsl from "../../wgsl/signalDamage/channelDrift.wgsl?raw";

const channelDriftSource = `${fullscreenWgsl}\n${channelDriftWgsl}`;

// 3 vec4 = 48 bytes.
const UNIFORM_BYTES = 3 * 16;

export interface ChannelDriftPassParams {
  canvasWidth: number;
  canvasHeight: number;
  redOffsetX: number;
  redOffsetY: number;
  greenOffsetX: number;
  greenOffsetY: number;
  blueOffsetX: number;
  blueOffsetY: number;
  intensity: number;
}

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

class ChannelDriftPipelineCache {
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
      channelDriftSource,
      "signalDamage/channelDrift.wgsl"
    );
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "signalDamage.channelDrift.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `signalDamage.channelDrift.pipeline:${format}`,
      layout: this.device.createPipelineLayout({
        label: "signalDamage.channelDrift.pipelineLayout",
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

function writeUniforms(
  device: GPUDevice,
  buffer: GPUBuffer,
  p: ChannelDriftPassParams
): void {
  const ab = new ArrayBuffer(UNIFORM_BYTES);
  const f32 = new Float32Array(ab);
  // canvasIntensity (vec4): canvasW, canvasH, intensity, _ @0
  f32[0] = p.canvasWidth;
  f32[1] = p.canvasHeight;
  f32[2] = p.intensity;
  f32[3] = 0;
  // redGreenOffset (vec4): redX, redY, greenX, greenY @16
  f32[4] = p.redOffsetX;
  f32[5] = p.redOffsetY;
  f32[6] = p.greenOffsetX;
  f32[7] = p.greenOffsetY;
  // blueOffset (vec4): blueX, blueY, _, _ @32
  f32[8] = p.blueOffsetX;
  f32[9] = p.blueOffsetY;
  f32[10] = 0;
  f32[11] = 0;
  device.queue.writeBuffer(buffer, 0, ab);
}

interface ChannelDriftPassOptions {
  outputFormat: GPUTextureFormat;
  params: ChannelDriftPassParams;
  id?: string;
  enabled?: boolean;
}

interface ChannelDriftPassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: ChannelDriftPassParams) => void;
  destroy: () => void;
}

function createChannelDriftPass(
  device: GPUDevice,
  cache: ChannelDriftPipelineCache,
  options: ChannelDriftPassOptions
): ChannelDriftPassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "signalDamage.channelDrift.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "signalDamage.channelDrift",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "signalDamage.channelDrift.bindGroup",
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

// ─── standalone surface op ────────────────────────────────────────────────────

const _cacheByDevice = new WeakMap<
  GPUDevice,
  { shaders: ShaderCache; channelDrift: ChannelDriftPipelineCache }
>();

const getCache = (device: GPUDevice) => {
  let entry = _cacheByDevice.get(device);
  if (!entry) {
    const shaders = new ShaderCache(device);
    const channelDrift = new ChannelDriftPipelineCache(device, shaders);
    entry = { shaders, channelDrift };
    _cacheByDevice.set(device, entry);
  }
  return entry;
};

const OUTPUT_FORMAT: GPUTextureFormat = "rgba8unorm";

export interface ApplyChannelDriftOnSurfaceOptions {
  surface: RenderSurfaceHandle;
  input: ChannelDriftPassParams;
  slotId?: string;
  mode?: RenderMode;
}

export const applyChannelDriftOnSurface = async ({
  surface,
  input,
  slotId = "channel-drift",
  mode,
}: ApplyChannelDriftOnSurfaceOptions): Promise<RenderSurfaceHandle | null> => {
  if (surface.width <= 0 || surface.height <= 0) return null;

  const ctx = await requestGPUContext();
  const { device } = ctx;
  const { channelDrift } = getCache(device);
  const pool = new TexturePool(device);
  let uploadTexture: GPUTexture | null = null;
  let handle: ChannelDriftPassHandle | null = null;

  try {
    const upload = uploadExternalImageToTexture(device, surface.sourceCanvas, {
      format: OUTPUT_FORMAT,
      label: "channelDrift:source",
    });
    uploadTexture = upload.texture;
    const srcInput: PipelineInputSource = {
      texture: upload.texture,
      view: upload.texture.createView({ label: "channelDrift:srcView" }),
      width: upload.width,
      height: upload.height,
      format: OUTPUT_FORMAT,
      lease: null,
    };

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

    handle = createChannelDriftPass(device, channelDrift, {
      outputFormat: OUTPUT_FORMAT,
      params: input,
    });

    const result = executor.execute({
      passes: [handle.descriptor],
      input: srcInput,
      baseWidth: upload.width,
      baseHeight: upload.height,
    });

    if (result.kind !== "texture") return null;

    const pixels = await readbackTextureRGBA8(
      device,
      result.output.texture,
      upload.width,
      upload.height
    );
    result.output.release();

    const canvas = document.createElement("canvas");
    canvas.width = upload.width;
    canvas.height = upload.height;
    const c2d = canvas.getContext("2d");
    if (!c2d) return null;
    c2d.putImageData(
      new ImageData(new Uint8ClampedArray(pixels), upload.width, upload.height),
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
    handle?.destroy();
    uploadTexture?.destroy();
    pool.dispose();
  }
};
