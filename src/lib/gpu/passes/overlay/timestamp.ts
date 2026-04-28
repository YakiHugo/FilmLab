// Per-call atlas upload (no caching) is intentional: timestamp text changes
// per frame, so an atlas keyed by charset would miss almost every call.

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
import type { TimestampOverlayGpuInput } from "@/lib/timestampOverlay";
import { TIMESTAMP_GPU_MAX_CHARS } from "@/lib/timestampOverlay";

import fullscreenWgsl from "../../wgsl/lib/fullscreen.wgsl?raw";
import timestampWgsl from "../../wgsl/overlay/timestamp.wgsl?raw";

const timestampSource = `${fullscreenWgsl}\n${timestampWgsl}`;

// 6 leading vec4 + 16 vec4 (glyph indices) = 22 vec4 = 352 bytes.
const UNIFORM_BYTES = (6 + 16) * 16;
const GLYPH_ARRAY_FLOATS = 16 * 4;

interface CompiledPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

class TimestampPipelineCache {
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
    const module = this.shaders.compile(timestampSource, "overlay/timestamp.wgsl");
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "overlay.timestamp.bindGroupLayout",
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    const pipeline = this.device.createRenderPipeline({
      label: `overlay.timestamp.pipeline:${format}`,
      layout: this.device.createPipelineLayout({
        label: "overlay.timestamp.pipelineLayout",
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

interface TimestampGlyphAtlas {
  canvas: HTMLCanvasElement;
  columns: number;
  rows: number;
  glyphCount: number;
}

// atlasScale=1 is intentional: the timestamp pass supplies an explicit
// `fontSizePx`, so glyphs are already rasterized at the final output cell
// size and no LINEAR-mipmap upscale is needed. (The ASCII pass takes the
// scaled-atlas path because it derives cell size from the image short edge.)
const buildTimestampGlyphAtlas = ({
  charset,
  fontFamily,
  fontSizePx,
  cellWidth,
  cellHeight,
}: {
  charset: readonly string[];
  fontFamily: string;
  fontSizePx: number;
  cellWidth: number;
  cellHeight: number;
}): TimestampGlyphAtlas | null => {
  if (typeof document === "undefined") return null;

  const cw = Math.max(1, Math.round(cellWidth));
  const ch = Math.max(1, Math.round(cellHeight));
  const glyphCount = Math.max(1, charset.length);
  const columns = Math.max(1, Math.ceil(Math.sqrt(glyphCount)));
  const rows = Math.max(1, Math.ceil(glyphCount / columns));

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, columns * cw);
  canvas.height = Math.max(1, rows * ch);
  const c2d = canvas.getContext("2d", { willReadFrequently: true });
  if (!c2d) {
    canvas.width = 0;
    canvas.height = 0;
    return null;
  }

  c2d.clearRect(0, 0, canvas.width, canvas.height);
  c2d.fillStyle = "#ffffff";
  c2d.textAlign = "center";
  c2d.textBaseline = "middle";
  c2d.font = `${Math.max(6, Math.round(fontSizePx))}px ${fontFamily}`;

  for (let i = 0; i < charset.length; i += 1) {
    const glyph = charset[i] ?? "";
    if (!glyph || glyph === " ") continue;
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x = col * cw + cw / 2;
    const y = row * ch + ch / 2;
    c2d.fillText(glyph, x, y);
  }

  return { canvas, columns, rows, glyphCount };
};

const writeUniforms = (
  device: GPUDevice,
  buffer: GPUBuffer,
  overlay: TimestampOverlayGpuInput,
  atlas: TimestampGlyphAtlas
): void => {
  const ab = new ArrayBuffer(UNIFORM_BYTES);
  const f32 = new Float32Array(ab);
  // canvasAndCounts (vec4): canvasW, canvasH, charCount(f), glyphCount(f) @0
  f32[0] = overlay.width;
  f32[1] = overlay.height;
  f32[2] = overlay.charCount;
  f32[3] = atlas.glyphCount;
  // rect (vec4): rectLeft, rectTop, rectWidth, rectHeight @16
  f32[4] = overlay.rectLeft;
  f32[5] = overlay.rectTop;
  f32[6] = overlay.rectWidth;
  f32[7] = overlay.rectHeight;
  // textStartAndCell (vec4): textStartX, textStartY, cellWidth, cellHeight @32
  f32[8] = overlay.textStartX;
  f32[9] = overlay.textStartY;
  f32[10] = overlay.cellWidth;
  f32[11] = overlay.cellHeight;
  // atlasGrid (vec4): atlasCols, atlasRows, _, _ @48
  f32[12] = atlas.columns;
  f32[13] = atlas.rows;
  f32[14] = 0;
  f32[15] = 0;
  // backgroundColor (vec4) — Uint8 → 0..1 @64
  f32[16] = (overlay.backgroundColorRgba[0] ?? 0) / 255;
  f32[17] = (overlay.backgroundColorRgba[1] ?? 0) / 255;
  f32[18] = (overlay.backgroundColorRgba[2] ?? 0) / 255;
  f32[19] = (overlay.backgroundColorRgba[3] ?? 0) / 255;
  // textColor (vec4) @80
  f32[20] = (overlay.textColorRgba[0] ?? 0) / 255;
  f32[21] = (overlay.textColorRgba[1] ?? 0) / 255;
  f32[22] = (overlay.textColorRgba[2] ?? 0) / 255;
  f32[23] = (overlay.textColorRgba[3] ?? 0) / 255;
  // glyphIndices: 16 vec4 packing the 64-entry index list @96
  for (let i = 0; i < GLYPH_ARRAY_FLOATS; i += 1) {
    f32[24 + i] = overlay.glyphIndices[i] ?? -1;
  }
  device.queue.writeBuffer(buffer, 0, ab);
};

interface TimestampPassOptions {
  outputFormat: GPUTextureFormat;
  glyphTexture: GPUTexture;
  uniformBuffer: GPUBuffer;
  id?: string;
  enabled?: boolean;
}

interface TimestampPassHandle {
  descriptor: GPURenderPassDescriptor;
}

function createTimestampPass(
  _device: GPUDevice,
  cache: TimestampPipelineCache,
  options: TimestampPassOptions
): TimestampPassHandle {
  const { pipeline, bindGroupLayout } = cache.pipelineFor(options.outputFormat);
  const glyphView = options.glyphTexture.createView({ label: "overlay.timestamp.glyph" });

  const descriptor: GPURenderPassDescriptor = {
    kind: "render",
    id: options.id ?? "overlay.timestamp",
    pipeline,
    bindGroups: (ctx: GPURenderPassBindContext) => [
      ctx.device.createBindGroup({
        label: "overlay.timestamp.bindGroup",
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: ctx.priorInputView },
          { binding: 1, resource: glyphView },
          { binding: 2, resource: ctx.defaultSampler },
          { binding: 3, resource: { buffer: options.uniformBuffer } },
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
    timestamp: new TimestampPipelineCache(device, shaders),
  };
});

const OUTPUT_FORMAT: GPUTextureFormat = "rgba8unorm";

export interface ApplyTimestampOverlayOnSurfaceOptions {
  surface: RenderSurfaceHandle;
  overlay: TimestampOverlayGpuInput;
  slotId?: string;
  mode?: RenderMode;
}

export const applyTimestampOverlayOnSurface = async ({
  surface,
  overlay,
  slotId = "timestamp-overlay",
  mode,
}: ApplyTimestampOverlayOnSurfaceOptions): Promise<RenderSurfaceHandle | null> => {
  if (
    surface.width <= 0 ||
    surface.height <= 0 ||
    surface.width !== overlay.width ||
    surface.height !== overlay.height ||
    overlay.charCount <= 0 ||
    overlay.charCount > TIMESTAMP_GPU_MAX_CHARS
  ) {
    return null;
  }

  const atlas = buildTimestampGlyphAtlas({
    charset: overlay.charset,
    fontFamily: overlay.fontFamily || "sans-serif",
    fontSizePx: overlay.fontSizePx,
    cellWidth: overlay.cellWidth,
    cellHeight: overlay.cellHeight,
  });
  if (!atlas) return null;

  const ctx = await requestGPUContext();
  const { device } = ctx;
  const { timestamp } = getCache(device);
  const pool = new TexturePool(device);
  let baseTexture: GPUTexture | null = null;
  let glyphTexture: GPUTexture | null = null;
  let uniformBuffer: GPUBuffer | null = null;

  try {
    const baseUpload = uploadExternalImageToTexture(device, surface.sourceCanvas, {
      format: OUTPUT_FORMAT,
      label: "overlay.timestamp:base",
    });
    baseTexture = baseUpload.texture;
    const glyphUpload = uploadExternalImageToTexture(device, atlas.canvas, {
      format: OUTPUT_FORMAT,
      label: "overlay.timestamp:glyph",
    });
    glyphTexture = glyphUpload.texture;

    uniformBuffer = device.createBuffer({
      label: "overlay.timestamp.uniforms",
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    writeUniforms(device, uniformBuffer, overlay, atlas);

    const sampler = device.createSampler({
      minFilter: "linear",
      magFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
    const executor = new PipelineExecutor({ device, texturePool: pool, defaultSampler: sampler });

    const handle = createTimestampPass(device, timestamp, {
      outputFormat: OUTPUT_FORMAT,
      glyphTexture: glyphUpload.texture,
      uniformBuffer,
    });

    const baseInput: PipelineInputSource = {
      texture: baseUpload.texture,
      view: baseUpload.texture.createView({ label: "overlay.timestamp:baseView" }),
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
    atlas.canvas.width = 0;
    atlas.canvas.height = 0;
    uniformBuffer?.destroy();
    glyphTexture?.destroy();
    baseTexture?.destroy();
    pool.dispose();
  }
};
