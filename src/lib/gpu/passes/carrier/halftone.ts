/**
 * Halftone carrier pass — port of `shaders/HalftoneCarrier.frag`.
 *
 * Runs as a single fullscreen pass. Used directly by `halftoneEffect.ts`
 * via `applyHalftoneOnSurface`; not currently composed into the kernel
 * orchestrator (carrier transforms apply on top of the develop/film output).
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
import { createPerDeviceCache } from "../../perDeviceCache";
import {
  createRenderSurfaceHandle,
  createEmptyRenderBoundaryMetrics,
  type RenderSurfaceHandle,
} from "@/lib/renderSurfaceHandle";
import type { RenderMode } from "@/lib/renderMode";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import halftoneWgsl from "../../wgsl/carrier/halftone.wgsl?raw";

const halftoneSource = `${fullscreenWgsl}\n${halftoneWgsl}`;

// 4 vec4 = 64 bytes.
const UNIFORM_BYTES = 4 * 16;

type HalftoneShape = "circle" | "diamond" | "line" | "square";
type HalftoneColorMode = "mono" | "cmyk" | "rgb";

export interface HalftonePassParams {
  canvasWidth: number;
  canvasHeight: number;
  frequency: number;
  angle: number;
  shape: HalftoneShape;
  colorMode: HalftoneColorMode;
  dotScale: number;
  contrast: number;
  invert: boolean;
  /** [r, g, b] in 0..1 linear or sRGB; the GLSL path treated it as sRGB pass-through. */
  backgroundColor: readonly [number, number, number];
  backgroundOpacity: number;
}

const SHAPE_INDEX: Record<HalftoneShape, number> = {
  circle: 0,
  diamond: 1,
  line: 2,
  square: 3,
};

const COLOR_MODE_INDEX: Record<HalftoneColorMode, number> = {
  mono: 0,
  cmyk: 1,
  rgb: 2,
};

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

class HalftonePipelineCache {
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
    const module = this.shaders.compile(halftoneSource, "carrier/halftone.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "carrier.halftone.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `carrier.halftone.pipeline:${format}`,
      layout: this.device.createPipelineLayout({
        label: "carrier.halftone.pipelineLayout",
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

function writeUniforms(device: GPUDevice, buffer: GPUBuffer, p: HalftonePassParams): void {
  const ab = new ArrayBuffer(UNIFORM_BYTES);
  const f32 = new Float32Array(ab);
  const u32 = new Uint32Array(ab);
  // canvasSizeFreqAngle (vec4): canvasW, canvasH, freq, angle @0
  f32[0] = p.canvasWidth;
  f32[1] = p.canvasHeight;
  f32[2] = p.frequency;
  f32[3] = p.angle;
  // shapeColorScaleContrast (vec4): shape, colorMode, dotScale, contrast @16
  f32[4] = SHAPE_INDEX[p.shape];
  f32[5] = COLOR_MODE_INDEX[p.colorMode];
  f32[6] = p.dotScale;
  f32[7] = p.contrast;
  // backgroundColor (vec4): bgR, bgG, bgB, bgOpacity @32
  f32[8] = p.backgroundColor[0];
  f32[9] = p.backgroundColor[1];
  f32[10] = p.backgroundColor[2];
  f32[11] = p.backgroundOpacity;
  // flags (vec4<u32>): invert, _, _, _ @48
  u32[12] = p.invert ? 1 : 0;
  u32[13] = 0;
  u32[14] = 0;
  u32[15] = 0;
  device.queue.writeBuffer(buffer, 0, ab);
}

interface HalftonePassOptions {
  outputFormat: GPUTextureFormat;
  params: HalftonePassParams;
  id?: string;
  enabled?: boolean;
}

interface HalftonePassHandle {
  descriptor: GPURenderPassDescriptor;
  updateParams: (next: HalftonePassParams) => void;
  destroy: () => void;
}

function createHalftonePass(
  device: GPUDevice,
  cache: HalftonePipelineCache,
  options: HalftonePassOptions
): HalftonePassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const uniformBuffer = device.createBuffer({
    label: "carrier.halftone.uniforms",
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  writeUniforms(device, uniformBuffer, options.params);

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "carrier.halftone",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "carrier.halftone.bindGroup",
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

const getCache = createPerDeviceCache((device) => {
  const shaders = new ShaderCache(device);
  return {
    shaders,
    halftone: new HalftonePipelineCache(device, shaders),
  };
});

const OUTPUT_FORMAT: GPUTextureFormat = "rgba8unorm";

export interface ApplyHalftoneOnSurfaceOptions {
  surface: RenderSurfaceHandle;
  input: HalftonePassParams;
  slotId?: string;
  mode?: RenderMode;
}

export const applyHalftoneOnSurface = async ({
  surface,
  input,
  slotId = "halftone-carrier",
  mode,
}: ApplyHalftoneOnSurfaceOptions): Promise<RenderSurfaceHandle | null> => {
  if (surface.width <= 0 || surface.height <= 0) return null;

  const ctx = await requestGPUContext();
  const { device } = ctx;
  const { halftone } = getCache(device);
  const pool = new TexturePool(device);
  let uploadTexture: GPUTexture | null = null;
  let handle: HalftonePassHandle | null = null;

  try {
    const upload = uploadExternalImageToTexture(device, surface.sourceCanvas, {
      format: OUTPUT_FORMAT,
      label: "halftone:source",
    });
    uploadTexture = upload.texture;
    const srcInput: PipelineInputSource = {
      texture: upload.texture,
      view: upload.texture.createView({ label: "halftone:srcView" }),
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
    const executor = new PipelineExecutor({ device, texturePool: pool, defaultSampler: sampler });

    handle = createHalftonePass(device, halftone, {
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

    const pixels = await readbackTextureRGBA8(device, result.output.texture, upload.width, upload.height);
    result.output.release();

    const canvas = document.createElement("canvas");
    canvas.width = upload.width;
    canvas.height = upload.height;
    const c2d = canvas.getContext("2d");
    if (!c2d) return null;
    c2d.putImageData(new ImageData(new Uint8ClampedArray(pixels), upload.width, upload.height), 0, 0);

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
