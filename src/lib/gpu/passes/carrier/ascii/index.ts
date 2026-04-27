/**
 * ASCII carrier surface adapter — chains the WGSL passes (descriptors →
 * analysis → toneNormalize → selection → optional bg blur → composition ×2
 * → layerBlend ×2) into a single `RenderSurfaceHandle → RenderSurfaceHandle`
 * call. Replaces `lib/renderer/gpuAsciiCarrier.applyAsciiCarrierOnGpuToSurface`.
 *
 * The adapter assumes:
 *   - `surface.sourceCanvas` is the BASE that gets composited onto.
 *   - `params.sourceCanvas` is the ANALYSIS source (cells + blurred-source bg
 *     are both derived from it). Often equal to `surface.sourceCanvas`.
 *   - All tone normalization params (brightness/contrast/density/coverage/
 *     edge/invert/dither) are passed through to toneNormalize — the legacy
 *     `buildAsciiCellGrids` CPU path is fully retired.
 */

import type { GPUComputePassDescriptor, GPURenderPassDescriptor } from "../../types";
import { requestGPUContext } from "../../../context";
import {
  TexturePool,
  uploadExternalImageToTexture,
  readbackTextureRGBA8,
  type PooledTexture,
} from "../../../resources";
import { ShaderCache } from "../../../shaders";
import { PipelineExecutor, type PipelineInputSource } from "../../../pipeline";
import { createPerDeviceCache } from "../../../perDeviceCache";
import {
  createRenderSurfaceHandle,
  createEmptyRenderBoundaryMetrics,
  type RenderSurfaceHandle,
} from "@/lib/renderSurfaceHandle";
import type { RenderMode } from "@/lib/renderer/RenderManager";
import type { EditorLayerBlendMode } from "@/types";

import {
  ASCII_DESCRIPTOR_STRIDE,
  prepareAsciiGlyphSet,
} from "./descriptors";
import {
  AsciiAnalysisPipelineCache,
  ANALYSIS_UNIFORMS_BYTE_SIZE,
  packAnalysisUniforms,
} from "./analysis";
import {
  AsciiToneNormalizePipelineCache,
  TONE_NORMALIZE_UNIFORMS_BYTE_SIZE,
  packToneNormalizeUniforms,
  type AsciiDitherMode,
} from "./toneNormalize";
import {
  AsciiSelectionPipelineCache,
  SELECTION_UNIFORMS_BYTE_SIZE,
  packSelectionUniforms,
} from "./selection";
import {
  AsciiCompositionPipelineCache,
  COMPOSITION_UNIFORMS_BYTE_SIZE,
  packCompositionUniforms,
  type AsciiColorMode,
  type AsciiRenderMode,
} from "./composition";
import {
  GaussianBlurPipelineCache,
  createGaussianBlurPass,
} from "../../utility/gaussianBlur";
import {
  LayerBlendPipelineCache,
  createLayerBlendPass,
  createPlaceholderWhiteMask,
} from "../../utility/layerBlend";

const OUTPUT_FORMAT: GPUTextureFormat = "rgba8unorm";

export interface AsciiCarrierSurfaceParams {
  /** Analysis source (cells + blurred-source bg derive from this). */
  sourceCanvas: HTMLCanvasElement;
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  columns: number;
  rows: number;
  charset: readonly string[];
  fontFamily?: string;
  // Foreground / colour controls.
  renderMode: AsciiRenderMode;
  colorMode: AsciiColorMode;
  invert: boolean;
  foregroundOpacity: number;
  foregroundBlendMode: EditorLayerBlendMode;
  // Background controls.
  backgroundMode: "none" | "solid" | "cell-solid" | "blurred-source";
  backgroundOpacity: number;
  backgroundBlurPx: number;
  /** RGB in 0..1; alpha is derived from `backgroundOpacity`. */
  backgroundColor: readonly [number, number, number];
  /** RGB in 0..1 (used only when `colorMode === "duotone"`). */
  duotoneShadow: readonly [number, number, number];
  // Grid overlay.
  gridOverlay: boolean;
  gridOverlayAlpha: number;
  // Tone normalization (replaces CPU `buildAsciiCellGrids`).
  brightness: number;
  contrast: number;
  density: number;
  coverage: number;
  edgeEmphasis: number;
  ditherMode: AsciiDitherMode;
}

const BLEND_MODE_INDEX: Record<EditorLayerBlendMode, number> = {
  normal: 0,
  multiply: 1,
  screen: 2,
  overlay: 3,
  softLight: 4,
};

const getCache = createPerDeviceCache((device) => {
  const shaders = new ShaderCache(device);
  return {
    shaders,
    analysis: new AsciiAnalysisPipelineCache(device, shaders),
    toneNormalize: new AsciiToneNormalizePipelineCache(device, shaders),
    selection: new AsciiSelectionPipelineCache(device, shaders),
    composition: new AsciiCompositionPipelineCache(device, shaders),
    blur: new GaussianBlurPipelineCache(device, shaders),
    layerBlend: new LayerBlendPipelineCache(device, shaders),
  };
});

interface CompositionShared {
  selectionBuf: GPUBuffer;
  cellColorBuf: GPUBuffer;
  cellToneBuf: GPUBuffer;
  bgSourceView: GPUTextureView;
  atlasView: GPUTextureView;
  atlasSampler: GPUSampler;
}

function buildCompositionPass(
  cache: ReturnType<typeof getCache>["composition"],
  shared: CompositionShared,
  uniformsBuffer: GPUBuffer,
  layerId: string,
): GPURenderPassDescriptor {
  return cache.createPass({
    outputFormat: OUTPUT_FORMAT,
    atlasView: shared.atlasView,
    atlasSampler: shared.atlasSampler,
    uniformsBuffer,
    selectionBuffer: shared.selectionBuf,
    cellColorBuffer: shared.cellColorBuf,
    cellToneBuffer: shared.cellToneBuf,
    bgSourceView: shared.bgSourceView,
    id: layerId,
  });
}

export interface ApplyAsciiCarrierOnSurfaceOptions {
  surface: RenderSurfaceHandle;
  params: AsciiCarrierSurfaceParams;
  slotId?: string;
  mode?: RenderMode;
}

export const applyAsciiCarrierOnSurface = async ({
  surface,
  params,
  slotId = "ascii-carrier",
  mode,
}: ApplyAsciiCarrierOnSurfaceOptions): Promise<RenderSurfaceHandle | null> => {
  if (
    surface.width <= 0 ||
    surface.height <= 0 ||
    surface.width !== params.width ||
    surface.height !== params.height
  ) {
    return null;
  }

  const ctx = await requestGPUContext();
  const { device } = ctx;
  const cache = getCache(device);
  const pool = new TexturePool(device);

  const ownedTextures: GPUTexture[] = [];
  const ownedBuffers: GPUBuffer[] = [];

  try {
    // 1. Glyph atlas (fontSizePx defaults to cellHeight * 0.9 — matches the
    //    legacy PipelineRenderer.getGlyphAtlas baseline).
    const glyphSet = prepareAsciiGlyphSet(params.charset, {
      fontFamily: params.fontFamily ?? "monospace",
    });
    const atlasUpload = uploadExternalImageToTexture(device, glyphSet.atlas.canvas, {
      format: OUTPUT_FORMAT,
      label: "ascii.atlas",
    });
    ownedTextures.push(atlasUpload.texture);
    const atlasView = atlasUpload.texture.createView({ label: "ascii.atlasView" });

    // 2. Source uploads. Base = surface (composited target). Source =
    //    analysis input (might be the same canvas).
    const baseUpload = uploadExternalImageToTexture(device, surface.sourceCanvas, {
      format: OUTPUT_FORMAT,
      label: "ascii.base",
    });
    ownedTextures.push(baseUpload.texture);
    const sameCanvas = params.sourceCanvas === surface.sourceCanvas;
    const srcUpload = sameCanvas
      ? baseUpload
      : uploadExternalImageToTexture(device, params.sourceCanvas, {
          format: OUTPUT_FORMAT,
          label: "ascii.src",
        });
    if (!sameCanvas) ownedTextures.push(srcUpload.texture);
    const srcView = srcUpload.texture.createView({ label: "ascii.srcView" });

    // 3. Storage buffers.
    const cellCount = params.columns * params.rows;
    const featuresBuf = device.createBuffer({
      label: "ascii.features",
      size: Math.max(16, cellCount * ASCII_DESCRIPTOR_STRIDE * 4),
      usage: GPUBufferUsage.STORAGE,
    });
    ownedBuffers.push(featuresBuf);
    const cellColorBuf = device.createBuffer({
      label: "ascii.cellColor",
      size: Math.max(16, cellCount * 16),
      usage: GPUBufferUsage.STORAGE,
    });
    ownedBuffers.push(cellColorBuf);
    const cellToneBuf = device.createBuffer({
      label: "ascii.cellTone",
      size: Math.max(16, cellCount * 4),
      usage: GPUBufferUsage.STORAGE,
    });
    ownedBuffers.push(cellToneBuf);
    const selectionBuf = device.createBuffer({
      label: "ascii.selection",
      size: Math.max(16, cellCount * 4),
      usage: GPUBufferUsage.STORAGE,
    });
    ownedBuffers.push(selectionBuf);
    const glyphsBuf = device.createBuffer({
      label: "ascii.glyphs",
      size: glyphSet.descriptors.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    ownedBuffers.push(glyphsBuf);
    device.queue.writeBuffer(glyphsBuf, 0, glyphSet.descriptors);

    // 4. Uniform buffers.
    const analysisU = device.createBuffer({
      label: "ascii.analysisU",
      size: ANALYSIS_UNIFORMS_BYTE_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    ownedBuffers.push(analysisU);
    device.queue.writeBuffer(
      analysisU,
      0,
      packAnalysisUniforms({
        imageWidth: params.width,
        imageHeight: params.height,
        gridColumns: params.columns,
        gridRows: params.rows,
        cellWidth: params.cellWidth,
        cellHeight: params.cellHeight,
      }),
    );

    const toneU = device.createBuffer({
      label: "ascii.toneU",
      size: TONE_NORMALIZE_UNIFORMS_BYTE_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    ownedBuffers.push(toneU);
    device.queue.writeBuffer(
      toneU,
      0,
      packToneNormalizeUniforms({
        gridColumns: params.columns,
        gridRows: params.rows,
        glyphSteps: Math.max(1, glyphSet.glyphCount - 1),
        ditherMode: params.ditherMode,
        brightness: params.brightness,
        contrast: params.contrast,
        density: params.density,
        coverage: params.coverage,
        edgeEmphasis: params.edgeEmphasis,
        invert: params.invert,
      }),
    );

    const selectionU = device.createBuffer({
      label: "ascii.selectionU",
      size: SELECTION_UNIFORMS_BYTE_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    ownedBuffers.push(selectionU);
    // structureWeight=0 reproduces the legacy density-driven mapping when
    // the charset is density-sorted — see selection.wgsl header.
    device.queue.writeBuffer(
      selectionU,
      0,
      packSelectionUniforms({
        cellCount,
        glyphCount: glyphSet.glyphCount,
        structureWeight: 0,
      }),
    );

    // 5. Sampler + executor.
    const sampler = device.createSampler({
      label: "ascii.sampler",
      minFilter: "linear",
      magFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
    const executor = new PipelineExecutor({ device, texturePool: pool, defaultSampler: sampler });

    // 6. Compute chain — analysis + toneNormalize + selection. All-compute,
    //    so the executor returns "skipped" with no texture output. Buffers
    //    hold the results.
    const analysisPass: GPUComputePassDescriptor = cache.analysis.createPass({
      sourceView: srcView,
      uniformsBuffer: analysisU,
      featuresBuffer: featuresBuf,
      cellColorBuffer: cellColorBuf,
      gridColumns: params.columns,
      gridRows: params.rows,
    });
    const tonePass: GPUComputePassDescriptor = cache.toneNormalize.createPass({
      featuresBuffer: featuresBuf,
      cellColorBuffer: cellColorBuf,
      cellToneBuffer: cellToneBuf,
      uniformsBuffer: toneU,
      gridColumns: params.columns,
      gridRows: params.rows,
    });
    const selectionPass: GPUComputePassDescriptor = cache.selection.createPass({
      featuresBuffer: featuresBuf,
      glyphsBuffer: glyphsBuf,
      selectionBuffer: selectionBuf,
      uniformsBuffer: selectionU,
      cellToneBuffer: cellToneBuf,
      cellCount,
    });
    const dummyInput: PipelineInputSource = {
      texture: srcUpload.texture,
      view: srcView,
      width: srcUpload.width,
      height: srcUpload.height,
      format: OUTPUT_FORMAT,
      lease: null,
    };
    executor.execute({
      passes: [analysisPass, tonePass, selectionPass],
      input: dummyInput,
      baseWidth: params.width,
      baseHeight: params.height,
    });

    // 7. Optional blurred-source bg pass.
    let bgSourceLease: PooledTexture | null = null;
    let bgSourceView: GPUTextureView;
    if (params.backgroundMode === "blurred-source" && params.backgroundBlurPx > 0.001) {
      const blurH = createGaussianBlurPass(device, cache.blur, {
        outputFormat: OUTPUT_FORMAT,
        params: { direction: [1 / params.width, 0], radius: Math.max(1, params.backgroundBlurPx) },
        id: "ascii.bgBlurH",
      });
      const blurV = createGaussianBlurPass(device, cache.blur, {
        outputFormat: OUTPUT_FORMAT,
        params: { direction: [0, 1 / params.height], radius: Math.max(1, params.backgroundBlurPx) },
        id: "ascii.bgBlurV",
      });
      const blurResult = executor.execute({
        passes: [blurH.descriptor, blurV.descriptor],
        input: dummyInput,
        baseWidth: params.width,
        baseHeight: params.height,
      });
      blurH.destroy();
      blurV.destroy();
      if (blurResult.kind !== "texture") return null;
      bgSourceLease = blurResult.output;
      bgSourceView = blurResult.output.view;
    } else {
      // 1×1 transparent placeholder — composition only samples it when
      // `useBackgroundCanvas` is true.
      const placeholder = device.createTexture({
        label: "ascii.bgPlaceholder",
        size: { width: 1, height: 1 },
        format: OUTPUT_FORMAT,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      ownedTextures.push(placeholder);
      device.queue.writeTexture(
        { texture: placeholder },
        new Uint8Array([0, 0, 0, 0]),
        { bytesPerRow: 4 },
        { width: 1, height: 1 },
      );
      bgSourceView = placeholder.createView({ label: "ascii.bgPlaceholderView" });
    }

    // 8. Background + foreground feature flags. Mirrors legacy
    //    `renderAsciiCarrierLayer` short-circuits.
    const useBackgroundCanvas = params.backgroundMode === "blurred-source";
    const useBackgroundFill = params.backgroundMode === "solid";
    const useCellBackground = params.backgroundMode === "cell-solid";
    const hasBackground = useBackgroundCanvas || useBackgroundFill || useCellBackground;
    const hasForeground = params.foregroundOpacity > 0.001 || params.gridOverlay;

    const bgFillRgba: [number, number, number, number] = useBackgroundFill
      ? [params.backgroundColor[0], params.backgroundColor[1], params.backgroundColor[2], params.backgroundOpacity]
      : [0, 0, 0, 0];
    const cellBgRgba: [number, number, number, number] = useCellBackground
      ? [params.backgroundColor[0], params.backgroundColor[1], params.backgroundColor[2], params.backgroundOpacity]
      : [0, 0, 0, 0];
    const duotoneRgba: [number, number, number, number] = [
      params.duotoneShadow[0],
      params.duotoneShadow[1],
      params.duotoneShadow[2],
      1,
    ];

    const compositionShared = {
      selectionBuf,
      cellColorBuf,
      cellToneBuf,
      bgSourceView,
      atlasView,
      atlasSampler: sampler,
    };

    const baseInput: PipelineInputSource = {
      texture: baseUpload.texture,
      view: baseUpload.texture.createView({ label: "ascii.baseView" }),
      width: baseUpload.width,
      height: baseUpload.height,
      format: OUTPUT_FORMAT,
      lease: null,
    };

    const placeholderMask = createPlaceholderWhiteMask(device);
    ownedTextures.push(placeholderMask);

    let composited: PipelineInputSource = baseInput;
    let compositedLease: PooledTexture | null = null;
    const consumeAndReplace = (next: PooledTexture): void => {
      compositedLease?.release();
      compositedLease = next;
      composited = {
        texture: next.texture,
        view: next.view,
        width: next.width,
        height: next.height,
        format: next.format,
        lease: null,
      };
    };

    // 9. Background layer composite.
    if (hasBackground) {
      const bgUniformBuf = device.createBuffer({
        label: "ascii.compositionU.bg",
        size: COMPOSITION_UNIFORMS_BYTE_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      ownedBuffers.push(bgUniformBuf);
      device.queue.writeBuffer(
        bgUniformBuf,
        0,
        packCompositionUniforms({
          canvasWidth: params.width,
          canvasHeight: params.height,
          gridColumns: params.columns,
          gridRows: params.rows,
          cellWidth: params.cellWidth,
          cellHeight: params.cellHeight,
          atlasColumns: glyphSet.atlas.columns,
          atlasRows: glyphSet.atlas.rows,
          glyphCount: glyphSet.glyphCount,
          layerMode: "background",
          renderMode: params.renderMode,
          colorMode: params.colorMode,
          invert: params.invert,
          foregroundOpacity: params.foregroundOpacity,
          backgroundOpacity: params.backgroundOpacity,
          gridOverlayAlpha: params.gridOverlayAlpha,
          backgroundFill: bgFillRgba,
          cellBackground: cellBgRgba,
          duotoneShadow: duotoneRgba,
          useBackgroundCanvas,
          useBackgroundFill,
          useCellBackground,
          gridOverlay: false,
        }),
      );
      const bgPass = buildCompositionPass(
        cache.composition,
        compositionShared,
        bgUniformBuf,
        "ascii.composition.bg",
      );
      const bgResult = executor.execute({
        passes: [bgPass],
        input: dummyInput,
        baseWidth: params.width,
        baseHeight: params.height,
      });
      if (bgResult.kind !== "texture") return null;
      const bgLease = bgResult.output;

      // Blend bg over current composited (= base).
      const bgBlendPass = createLayerBlendPass(device, cache.layerBlend, {
        outputFormat: OUTPUT_FORMAT,
        params: { blendMode: BLEND_MODE_INDEX.normal, useMask: false, invertMask: false, opacity: 1 },
        layerTexture: bgLease.texture,
        maskTexture: placeholderMask,
        id: "ascii.layerBlend.bg",
      });
      const bgBlended = executor.execute({
        passes: [bgBlendPass.descriptor],
        input: composited,
        baseWidth: params.width,
        baseHeight: params.height,
      });
      bgBlendPass.destroy();
      bgLease.release();
      if (bgBlended.kind !== "texture") return null;
      consumeAndReplace(bgBlended.output);
    }

    // 10. Foreground layer composite.
    if (hasForeground) {
      const fgUniformBuf = device.createBuffer({
        label: "ascii.compositionU.fg",
        size: COMPOSITION_UNIFORMS_BYTE_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      ownedBuffers.push(fgUniformBuf);
      device.queue.writeBuffer(
        fgUniformBuf,
        0,
        packCompositionUniforms({
          canvasWidth: params.width,
          canvasHeight: params.height,
          gridColumns: params.columns,
          gridRows: params.rows,
          cellWidth: params.cellWidth,
          cellHeight: params.cellHeight,
          atlasColumns: glyphSet.atlas.columns,
          atlasRows: glyphSet.atlas.rows,
          glyphCount: glyphSet.glyphCount,
          layerMode: "foreground",
          renderMode: params.renderMode,
          colorMode: params.colorMode,
          invert: params.invert,
          foregroundOpacity: params.foregroundOpacity,
          backgroundOpacity: params.backgroundOpacity,
          gridOverlayAlpha: params.gridOverlayAlpha,
          backgroundFill: bgFillRgba,
          cellBackground: cellBgRgba,
          duotoneShadow: duotoneRgba,
          useBackgroundCanvas: false,
          useBackgroundFill: false,
          useCellBackground: false,
          gridOverlay: params.gridOverlay,
        }),
      );
      const fgPass = buildCompositionPass(
        cache.composition,
        compositionShared,
        fgUniformBuf,
        "ascii.composition.fg",
      );
      const fgResult = executor.execute({
        passes: [fgPass],
        input: dummyInput,
        baseWidth: params.width,
        baseHeight: params.height,
      });
      if (fgResult.kind !== "texture") return null;
      const fgLease = fgResult.output;

      const fgBlendPass = createLayerBlendPass(device, cache.layerBlend, {
        outputFormat: OUTPUT_FORMAT,
        params: {
          blendMode: BLEND_MODE_INDEX[params.foregroundBlendMode] ?? 0,
          useMask: false,
          invertMask: false,
          opacity: 1,
        },
        layerTexture: fgLease.texture,
        maskTexture: placeholderMask,
        id: "ascii.layerBlend.fg",
      });
      const fgBlended = executor.execute({
        passes: [fgBlendPass.descriptor],
        input: composited,
        baseWidth: params.width,
        baseHeight: params.height,
      });
      fgBlendPass.destroy();
      fgLease.release();
      if (fgBlended.kind !== "texture") return null;
      consumeAndReplace(fgBlended.output);
    }

    // 11. Readback. If neither bg nor fg ran, the original `surface` already
    //    holds the answer — return null so the caller falls through.
    if (!compositedLease) {
      return null;
    }

    const pixels = await readbackTextureRGBA8(
      device,
      compositedLease.texture,
      params.width,
      params.height,
    );
    const finalLease = compositedLease;
    compositedLease = null;
    finalLease.release();

    const canvas = document.createElement("canvas");
    canvas.width = params.width;
    canvas.height = params.height;
    const c2d = canvas.getContext("2d");
    if (!c2d) return null;
    c2d.putImageData(
      new ImageData(new Uint8ClampedArray(pixels), params.width, params.height),
      0,
      0,
    );

    bgSourceLease?.release();

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
    for (const t of ownedTextures) t.destroy();
    for (const b of ownedBuffers) b.destroy();
    pool.dispose();
  }
};
