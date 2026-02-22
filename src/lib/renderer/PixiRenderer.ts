import * as PIXI from "pixi.js";
import { MasterAdjustmentFilter } from "./filters/MasterAdjustmentFilter";
import { FilmSimulationFilter } from "./filters/FilmSimulationFilter";
import { HalationBloomFilter } from "./filters/HalationBloomFilter";
import type { MasterUniforms, FilmUniforms, HalationBloomUniforms } from "./types";

export interface PixiRenderOptions {
  skipFilm?: boolean;
  skipHalationBloom?: boolean;
}

/**
 * PixiJS-based rendering engine for the image editor.
 *
 * Replaces the hand-crafted WebGL2 renderer (`webgl2.ts`) with a PixiJS
 * Application that manages:
 * - A Sprite with the source image texture
 * - A MasterAdjustmentFilter (Pass 1: color science adjustments)
 * - A FilmSimulationFilter (Pass 2: film emulation with 3D LUT + color cast)
 * - A HalationBloomFilter (Pass 3: multi-pass halation/bloom optical effects)
 *
 * PixiJS FilterSystem automatically manages FBO creation/recycling,
 * texture binding, and viewport setup for the multi-pass pipeline.
 */
export class PixiRenderer {
  private app: PIXI.Application;
  private sprite: PIXI.Sprite;
  private masterFilter: MasterAdjustmentFilter;
  private filmFilter: FilmSimulationFilter;
  private halationBloomFilter: HalationBloomFilter;
  private destroyed = false;
  private contextLost = false;
  private onContextLost: (() => void) | null = null;

  // Cached filter chain state to avoid reassigning sprite.filters every frame
  private lastFilterKey = "";


  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.app = new PIXI.Application({
      view: canvas,
      width,
      height,
      backgroundColor: 0x000000,
      antialias: false,
      preserveDrawingBuffer: true, // Required for toBlob / readPixels export
      powerPreference: "high-performance",
    });

    this.sprite = new PIXI.Sprite();
    this.app.stage.addChild(this.sprite);

    this.masterFilter = new MasterAdjustmentFilter();
    this.filmFilter = new FilmSimulationFilter();
    this.halationBloomFilter = new HalationBloomFilter();

    // Handle WebGL context loss — mark as unusable so the caller can recreate
    const view = this.app.view as HTMLCanvasElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      this.contextLost = true;
      console.warn("WebGL context lost in PixiRenderer");
    };
    view.addEventListener("webglcontextlost", handleContextLost);
    this.onContextLost = () => view.removeEventListener("webglcontextlost", handleContextLost);
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
   * Get the underlying WebGL2 context, or null if not available.
   */
  private getGL(): WebGL2RenderingContext | null {
    const gl = (this.app.renderer as PIXI.Renderer).gl;
    return gl instanceof WebGL2RenderingContext ? gl : null;
  }

  /**
   * Update the source image texture from an ImageBitmap, Image, or Canvas.
   * Destroys the previous texture to avoid GPU memory leaks.
   */
  updateSource(
    source: TexImageSource,
    width: number,
    height: number
  ): void {
    if (this.destroyed) return;

    // Destroy previous texture
    if (this.sprite.texture && this.sprite.texture !== PIXI.Texture.EMPTY) {
      this.sprite.texture.destroy(true);
    }

    const baseTexture = PIXI.BaseTexture.from(source as any, {
      scaleMode: PIXI.SCALE_MODES.LINEAR,
    });
    this.sprite.texture = new PIXI.Texture(baseTexture);
    this.sprite.width = width;
    this.sprite.height = height;
    this.app.renderer.resize(width, height);
  }

  /**
   * Load a HaldCLUT image as a 3D texture for the Film filter.
   * Results are cached; loading the same URL again is a no-op.
   */
  async loadLUT(url: string, level: 8 | 16 = 8): Promise<void> {
    if (this.destroyed) return;
    await this.filmFilter.loadLUT(
      this.app.renderer as PIXI.Renderer,
      url,
      level
    );
  }

  /**
   * Render with the given uniforms.
   *
   * @param masterUniforms - Parameters for the Master adjustment pass
   * @param filmUniforms - Parameters for the Film simulation pass (null to skip)
   * @param options - Render options
   * @param halationBloomUniforms - Parameters for the Halation/Bloom pass (null to skip)
   */
  render(
    masterUniforms: MasterUniforms,
    filmUniforms: FilmUniforms | null,
    options?: PixiRenderOptions,
    halationBloomUniforms?: HalationBloomUniforms | null
  ): void {
    if (this.destroyed) return;

    this.masterFilter.updateUniforms(masterUniforms);

    // Determine which filters are active this frame
    const useFilm = !!(filmUniforms && !options?.skipFilm);
    const useHalation = !!(halationBloomUniforms && !options?.skipHalationBloom);

    if (useFilm) {
      this.filmFilter.updateUniforms(filmUniforms);
    }
    if (useHalation) {
      this.halationBloomFilter.updateUniforms(halationBloomUniforms);
    }

    // Only reassign sprite.filters when the active combination changes,
    // avoiding PixiJS filter chain rebinding on every frame.
    const filterKey = `${useFilm ? "F" : ""}${useHalation ? "H" : ""}`;
    if (filterKey !== this.lastFilterKey) {
      const filters: PIXI.Filter[] = [this.masterFilter];
      if (useFilm) filters.push(this.filmFilter);
      if (useHalation) filters.push(this.halationBloomFilter);
      this.sprite.filters = filters;
      this.lastFilterKey = filterKey;
    }

    this.app.render();
  }

  /**
   * Extract rendered pixels as a Uint8Array (for export).
   * Returns RGBA pixel data of the current render output.
   */
  extractPixels(): Uint8Array | Uint8ClampedArray {
    if (this.destroyed) {
      return new Uint8Array(0);
    }
    return this.app.renderer.extract.pixels(this.sprite);
  }

  /**
   * Extract rendered output as a canvas (for compositing).
   */
  extractCanvas(): HTMLCanvasElement {
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

    // Remove context loss listener
    if (this.onContextLost) {
      this.onContextLost();
      this.onContextLost = null;
    }

    // Clean up LUT cache
    const gl = this.getGL();
    if (gl) {
      this.filmFilter.disposeLUTCache(gl);
    }

    // Destroy sprite and its texture
    if (this.sprite.texture && this.sprite.texture !== PIXI.Texture.EMPTY) {
      this.sprite.texture.destroy(true);
    }
    this.sprite.destroy();

    // Destroy filters
    this.masterFilter.destroy();
    this.filmFilter.destroy();
    this.halationBloomFilter.destroy();

    // Destroy PixiJS app (but not the canvas element, which is owned by React)
    this.app.destroy(false, { children: true });
  }
}
