import * as PIXI from "pixi.js";
import { GeometryFilter } from "./filters/GeometryFilter";
import { MasterAdjustmentFilter } from "./filters/MasterAdjustmentFilter";
import { HSLFilter } from "./filters/HSLFilter";
import { CurveFilter } from "./filters/CurveFilter";
import { DetailFilter } from "./filters/DetailFilter";
import { FilmSimulationFilter } from "./filters/FilmSimulationFilter";
import { HalationBloomFilter } from "./filters/HalationBloomFilter";
import type {
  GeometryUniforms,
  MasterUniforms,
  HSLUniforms,
  CurveUniforms,
  DetailUniforms,
  FilmUniforms,
  HalationBloomUniforms,
} from "./types";

export interface PixiRenderOptions {
  skipGeometry?: boolean;
  skipHsl?: boolean;
  skipCurve?: boolean;
  skipDetail?: boolean;
  skipFilm?: boolean;
  skipHalationBloom?: boolean;
}

export interface PixiRendererOptions {
  preserveDrawingBuffer?: boolean;
  label?: "preview" | "export";
}

export interface PixiRenderMetrics {
  totalMs: number;
  updateUniformsMs: number;
  filterChainMs: number;
  drawMs: number;
  passCpuMs: {
    geometry: number;
    master: number;
    hsl: number;
    curve: number;
    detail: number;
    film: number;
    optics: number;
  };
  activePasses: string[];
}

/**
 * PixiJS-based rendering engine for the image editor.
 *
 * Replaces the hand-crafted WebGL2 renderer (`webgl2.ts`) with a PixiJS
 * Application that manages:
 * - A Sprite with the source image texture
 * - A GeometryFilter (Pass 1: crop/rotate/scale/flip/translate)
 * - A MasterAdjustmentFilter (Pass 2: color science adjustments)
 * - A HSLFilter (Pass 3: 8-channel selective hue/sat/luma)
 * - A CurveFilter (Pass 4: point-curve LUT)
 * - A DetailFilter (Pass 5: clarity/texture/sharpen/noise reduction)
 * - A FilmSimulationFilter (Pass 6: film emulation with 3D LUT + color cast)
 * - A HalationBloomFilter (Pass 7: multi-pass halation/bloom optical effects)
 *
 * PixiJS FilterSystem automatically manages FBO creation/recycling,
 * texture binding, and viewport setup for the multi-pass pipeline.
 */
export class PixiRenderer {
  private app: PIXI.Application;
  private sprite: PIXI.Sprite;
  private geometryFilter: GeometryFilter;
  private masterFilter: MasterAdjustmentFilter;
  private hslFilter: HSLFilter;
  private curveFilter: CurveFilter;
  private detailFilter: DetailFilter;
  private filmFilter: FilmSimulationFilter;
  private halationBloomFilter: HalationBloomFilter;
  private readonly rendererLabel: "preview" | "export";
  private readonly maxTextureSizeValue: number;
  private destroyed = false;
  private contextLost = false;
  private onContextLost: (() => void) | null = null;
  private onContextRestored: (() => void) | null = null;

  // Cached filter chain state to avoid reassigning sprite.filters every frame
  private lastFilterKey = "";

  // Cached source dimensions to avoid destroying/recreating texture every frame
  private lastSourceWidth = 0;
  private lastSourceHeight = 0;
  private lastTargetWidth = 0;
  private lastTargetHeight = 0;

  constructor(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    options?: PixiRendererOptions
  ) {
    const preserveDrawingBuffer = options?.preserveDrawingBuffer ?? false;
    this.rendererLabel = options?.label ?? "preview";
    this.app = new PIXI.Application({
      view: canvas,
      width,
      height,
      backgroundColor: 0x000000,
      antialias: false,
      preserveDrawingBuffer,
      powerPreference: "high-performance",
    });

    this.sprite = new PIXI.Sprite();
    this.app.stage.addChild(this.sprite);

    this.geometryFilter = new GeometryFilter();
    this.masterFilter = new MasterAdjustmentFilter();
    this.hslFilter = new HSLFilter();
    this.curveFilter = new CurveFilter();
    this.detailFilter = new DetailFilter();
    this.filmFilter = new FilmSimulationFilter();
    this.halationBloomFilter = new HalationBloomFilter();
    const gl = (this.app.renderer as PIXI.Renderer).gl;
    this.maxTextureSizeValue =
      gl instanceof WebGL2RenderingContext ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 4096;

    // Handle WebGL context loss — mark as unusable so the caller can recreate
    const view = this.app.view as HTMLCanvasElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      this.contextLost = true;
      console.warn(`WebGL context lost in PixiRenderer (${this.rendererLabel})`);
    };
    const handleContextRestored = () => {
      this.contextLost = false;
      // Reset cached state so filters/textures are re-applied on next render
      this.lastFilterKey = "";
      this.lastSourceWidth = 0;
      this.lastSourceHeight = 0;
      this.lastTargetWidth = 0;
      this.lastTargetHeight = 0;
      console.info(`WebGL context restored in PixiRenderer (${this.rendererLabel})`);
    };
    view.addEventListener("webglcontextlost", handleContextLost);
    view.addEventListener("webglcontextrestored", handleContextRestored);
    this.onContextLost = () => view.removeEventListener("webglcontextlost", handleContextLost);
    this.onContextRestored = () => view.removeEventListener("webglcontextrestored", handleContextRestored);
  }

  /**
   * Check if the renderer initialized with WebGL2 (required for 3D textures).
   */
  get isWebGL2(): boolean {
    const gl = (this.app.renderer as PIXI.Renderer).gl;
    return gl instanceof WebGL2RenderingContext;
  }

  /**
   * Returns true if the WebGL context was lost and this renderer is unusable.
   * The caller should dispose and recreate.
   */
  get isContextLost(): boolean {
    return this.contextLost;
  }

  /**
   * Maximum supported texture size for the underlying GL context.
   */
  get maxTextureSize(): number {
    return this.maxTextureSizeValue;
  }

  /**
   * Get the underlying WebGL2 context, or null if not available.
   */
  private getGL(): WebGL2RenderingContext | null {
    const gl = (this.app.renderer as PIXI.Renderer).gl;
    return gl instanceof WebGL2RenderingContext ? gl : null;
  }

  /**
   * Update source texture and output target size.
   * Reuses GPU resources when source dimensions do not change.
   */
  updateSource(
    source: TexImageSource,
    sourceWidth: number,
    sourceHeight: number,
    targetWidth: number,
    targetHeight: number
  ): void {
    if (this.destroyed) return;

    const sourceSizeChanged =
      sourceWidth !== this.lastSourceWidth || sourceHeight !== this.lastSourceHeight;
    const targetSizeChanged =
      targetWidth !== this.lastTargetWidth || targetHeight !== this.lastTargetHeight;

    if (sourceSizeChanged) {
      // Dimensions changed — destroy old texture and create a new one
      if (this.sprite.texture && this.sprite.texture !== PIXI.Texture.EMPTY) {
        this.sprite.texture.destroy(true);
      }

      const baseTexture = PIXI.BaseTexture.from(source as any, {
        scaleMode: PIXI.SCALE_MODES.LINEAR,
      });
      this.sprite.texture = new PIXI.Texture(baseTexture);
      this.lastSourceWidth = sourceWidth;
      this.lastSourceHeight = sourceHeight;
    } else {
      // Same dimensions — update the existing texture resource in-place
      const baseTexture = this.sprite.texture.baseTexture;
      const resource = baseTexture.resource as any;
      if (resource && typeof resource.update === "function") {
        resource.source = source;
        resource.update();
      } else {
        // Fallback: replace texture if resource doesn't support in-place update
        this.sprite.texture.destroy(true);
        const newBase = PIXI.BaseTexture.from(source as any, {
          scaleMode: PIXI.SCALE_MODES.LINEAR,
        });
        this.sprite.texture = new PIXI.Texture(newBase);
      }
    }

    if (sourceSizeChanged || targetSizeChanged) {
      this.sprite.width = targetWidth;
      this.sprite.height = targetHeight;
      this.app.renderer.resize(targetWidth, targetHeight);
      this.lastTargetWidth = targetWidth;
      this.lastTargetHeight = targetHeight;
      this.filmFilter.updateImageDimensions(targetWidth, targetHeight);
      this.detailFilter.updateImageDimensions(targetWidth, targetHeight);
    }
  }

  /**
   * Load a HaldCLUT image as a 3D texture for the Film filter.
   * Results are cached; loading the same URL again is a no-op.
   */
  async loadLUT(url: string, level: 8 | 16 = 8): Promise<void> {
    if (this.destroyed) return;
    await this.filmFilter.loadLUT(this.app.renderer as PIXI.Renderer, url, level);
  }

  /**
   * Ensure the renderer has the LUT required by this frame.
   * Passing null keeps the current LUT cache untouched and performs no load.
   */
  async ensureLUT(lut: { url: string; level: 8 | 16 } | null): Promise<void> {
    if (this.destroyed || !lut) return;
    await this.loadLUT(lut.url, lut.level);
  }

  /**
   * Render with the given uniforms.
   *
   * @param geometryUniforms - Parameters for the Geometry pass
   * @param masterUniforms - Parameters for the Master adjustment pass
   * @param hslUniforms - Parameters for the selective HSL pass
   * @param curveUniforms - Parameters for the point curve pass
   * @param detailUniforms - Parameters for the detail pass
   * @param filmUniforms - Parameters for the film simulation pass (null to skip)
   * @param options - Render options
   * @param halationBloomUniforms - Parameters for the Halation/Bloom pass (null to skip)
   */
  render(
    geometryUniforms: GeometryUniforms,
    masterUniforms: MasterUniforms,
    hslUniforms: HSLUniforms,
    curveUniforms: CurveUniforms,
    detailUniforms: DetailUniforms,
    filmUniforms: FilmUniforms | null,
    options?: PixiRenderOptions,
    halationBloomUniforms?: HalationBloomUniforms | null
  ): PixiRenderMetrics {
    const noOpMetrics: PixiRenderMetrics = {
      totalMs: 0,
      updateUniformsMs: 0,
      filterChainMs: 0,
      drawMs: 0,
      passCpuMs: {
        geometry: 0,
        master: 0,
        hsl: 0,
        curve: 0,
        detail: 0,
        film: 0,
        optics: 0,
      },
      activePasses: [],
    };
    if (this.destroyed) {
      return noOpMetrics;
    }

    const startedAt = performance.now();
    const passCpuMs = {
      geometry: 0,
      master: 0,
      hsl: 0,
      curve: 0,
      detail: 0,
      film: 0,
      optics: 0,
    };

    let timer = performance.now();
    this.geometryFilter.updateUniforms(geometryUniforms);
    passCpuMs.geometry = performance.now() - timer;

    timer = performance.now();
    this.masterFilter.updateUniforms(masterUniforms);
    passCpuMs.master = performance.now() - timer;

    timer = performance.now();
    this.hslFilter.updateUniforms(hslUniforms);
    passCpuMs.hsl = performance.now() - timer;

    timer = performance.now();
    this.curveFilter.updateUniforms(curveUniforms);
    passCpuMs.curve = performance.now() - timer;

    timer = performance.now();
    this.detailFilter.updateUniforms(detailUniforms);
    passCpuMs.detail = performance.now() - timer;

    // Determine which filters are active this frame
    const useGeometry = !options?.skipGeometry;
    const useHsl = hslUniforms.enabled && !options?.skipHsl;
    const useCurve = curveUniforms.enabled && !options?.skipCurve;
    const useDetail = detailUniforms.enabled && !options?.skipDetail;
    const useFilm = !!(filmUniforms && !options?.skipFilm);
    const useHalation = !!(halationBloomUniforms && !options?.skipHalationBloom);

    // Keep Master output in linear space whenever there are downstream passes.
    const hasPostMasterPass = useHsl || useCurve || useDetail || useFilm || useHalation;
    this.masterFilter.uniforms.u_outputSRGB = !hasPostMasterPass;

    if (useFilm) {
      timer = performance.now();
      this.filmFilter.updateUniforms(filmUniforms);
      passCpuMs.film = performance.now() - timer;
    }
    if (useHalation) {
      timer = performance.now();
      this.halationBloomFilter.updateUniforms(halationBloomUniforms);
      passCpuMs.optics = performance.now() - timer;
    }

    const updateUniformsMs = performance.now() - startedAt;

    // Only reassign sprite.filters when the active combination changes,
    // avoiding PixiJS filter chain rebinding on every frame.
    const filterStartedAt = performance.now();
    const filterKey = `${useGeometry ? "G" : ""}${useHsl ? "S" : ""}${useCurve ? "C" : ""}${useDetail ? "D" : ""}${useFilm ? "F" : ""}${useHalation ? "H" : ""}`;
    if (filterKey !== this.lastFilterKey) {
      const filters: PIXI.Filter[] = [];
      if (useGeometry) filters.push(this.geometryFilter);
      filters.push(this.masterFilter);
      if (useHsl) filters.push(this.hslFilter);
      if (useCurve) filters.push(this.curveFilter);
      if (useDetail) filters.push(this.detailFilter);
      if (useFilm) filters.push(this.filmFilter);
      if (useHalation) filters.push(this.halationBloomFilter);
      this.sprite.filters = filters;
      this.lastFilterKey = filterKey;
    }
    const filterChainMs = performance.now() - filterStartedAt;

    const drawStartedAt = performance.now();
    this.app.render();
    const drawMs = performance.now() - drawStartedAt;

    const activePasses: string[] = ["master"];
    if (useGeometry) activePasses.unshift("geometry");
    if (useHsl) activePasses.push("hsl");
    if (useCurve) activePasses.push("curve");
    if (useDetail) activePasses.push("detail");
    if (useFilm) activePasses.push("film");
    if (useHalation) activePasses.push("optics");

    return {
      totalMs: performance.now() - startedAt,
      updateUniformsMs,
      filterChainMs,
      drawMs,
      passCpuMs,
      activePasses,
    };
  }

  /**
   * Extract rendered pixels as a Uint8Array (for export).
   * Returns RGBA pixel data of the current render output.
   */
  extractPixels(): Uint8Array | Uint8ClampedArray {
    if (this.destroyed || this.contextLost) {
      return new Uint8Array(0);
    }
    return this.app.renderer.extract.pixels(this.sprite);
  }

  /**
   * Extract rendered output as a canvas (for compositing).
   */
  extractCanvas(): HTMLCanvasElement {
    if (this.destroyed || this.contextLost) {
      return document.createElement("canvas");
    }
    return this.app.renderer.extract.canvas(this.sprite) as HTMLCanvasElement;
  }

  /**
   * Get the target canvas element.
   */
  get canvas(): HTMLCanvasElement {
    return this.app.view as HTMLCanvasElement;
  }

  /**
   * Release all GPU resources and destroy the PixiJS application.
   * After calling dispose(), this renderer instance cannot be reused.
   */
  dispose(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // Remove context loss/restored listeners
    if (this.onContextLost) {
      this.onContextLost();
      this.onContextLost = null;
    }
    if (this.onContextRestored) {
      this.onContextRestored();
      this.onContextRestored = null;
    }

    // Clean up LUT cache
    const gl = this.getGL();
    if (gl) {
      this.filmFilter.disposeLUTCache(gl);
    }

    // Destroy sprite texture (guard against EMPTY to avoid double-destroy)
    const tex = this.sprite.texture;
    if (tex && tex !== PIXI.Texture.EMPTY && tex.baseTexture && !tex.baseTexture.destroyed) {
      tex.destroy(true);
    }
    // Destroy sprite without re-destroying children textures
    this.sprite.destroy({ children: false, texture: false, baseTexture: false });

    // Destroy filters
    this.geometryFilter.destroy();
    this.masterFilter.destroy();
    this.hslFilter.destroy();
    this.curveFilter.destroy();
    this.detailFilter.destroy();
    this.filmFilter.destroy();
    this.halationBloomFilter.destroy();

    // Destroy PixiJS app (not the canvas element, which is owned by React;
    // children: false because we already destroyed the sprite above)
    this.app.destroy(false, { children: false });
  }
}
