import { Filter, DRAW_MODES } from "pixi.js";
import type { FilterSystem, RenderTexture, CLEAR_MODES, Renderer } from "pixi.js";
import { LUTCache } from "../LUTCache";
import type { FilmUniforms } from "../types";

import vertexSrc from "../shaders/default.vert?raw";
import fragmentSrc from "../shaders/generated/FilmSimulation.frag?raw";

/**
 * PixiJS Filter that applies Film Simulation effects:
 * - Layer 1: Tone Response (S-curve with shoulder/toe/gamma)
 * - Layer 2: Color Matrix (3x3 cross-channel color mixing)
 * - Layer 3: 3D LUT via HaldCLUT (trilinear-interpolated sampler3D)
 * - Layer 4: Color Cast (per-zone tinting)
 * - Layer 6: Film Grain (hash-based, color/mono, shadow-biased)
 * - Layer 6: Vignette (elliptical, bidirectional)
 *
 * ## 3D Texture Handling
 *
 * PixiJS v7's uniform system does not support `sampler3D`. We work around
 * this by:
 * 1. Omitting `u_lut` from the Filter uniform object (prevents PixiJS from
 *    trying to sync it and crashing on unknown type)
 * 2. Overriding `apply()` to replicate `FilterSystem.applyFilter()` logic,
 *    inserting manual 3D texture binding between shader bind and draw call
 * 3. Using a fixed texture unit (2) for the 3D LUT to avoid conflicts with
 *    PixiJS's auto-assigned units (0 for uSampler, 1 for globalUniforms)
 */
export class FilmSimulationFilter extends Filter {
  private lutTexture: WebGLTexture | null = null;
  private lutCache: LUTCache;
  private currentLutPath: string | null = null;

  /** Fixed texture unit for the 3D LUT (avoids PixiJS internal units) */
  private static readonly LUT_TEXTURE_UNIT = 2;

  constructor() {
    // NOTE: u_lut is intentionally NOT included here because PixiJS v7
    // cannot handle sampler3D uniforms. We bind it manually in apply().
    super(vertexSrc, fragmentSrc, {
      // Layer 1: Tone Response
      u_toneEnabled: false,
      u_shoulder: 0.8,
      u_toe: 0.3,
      u_gamma: 1.0,
      // Layer 2: Color Matrix
      u_colorMatrixEnabled: false,
      u_colorMatrix: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
      // Layer 3: LUT
      u_lutEnabled: false,
      u_lutIntensity: 0.0,
      // Layer 4: Color Cast
      u_colorCastEnabled: false,
      u_colorCastShadows: new Float32Array([0, 0, 0]),
      u_colorCastMidtones: new Float32Array([0, 0, 0]),
      u_colorCastHighlights: new Float32Array([0, 0, 0]),
      // Layer 6: Grain
      u_grainEnabled: false,
      u_grainAmount: 0.0,
      u_grainSize: 0.5,
      u_grainRoughness: 0.5,
      u_grainShadowBias: 0.45,
      u_grainSeed: 0.0,
      u_grainIsColor: true,
      // Layer 6: Vignette
      u_vignetteEnabled: false,
      u_vignetteAmount: 0.0,
      u_vignetteMidpoint: 0.5,
      u_vignetteRoundness: 0.5,
    });

    this.lutCache = new LUTCache(5);
  }

  /**
   * Load a HaldCLUT image and cache the resulting 3D texture.
   * Skips loading if the same LUT path is already active.
   */
  async loadLUT(
    renderer: Renderer,
    url: string,
    level: 8 | 16 = 8
  ): Promise<void> {
    if (this.currentLutPath === url && this.lutTexture) {
      return; // Already loaded
    }

    const gl = renderer.gl as WebGL2RenderingContext;
    if (!gl.texImage3D) {
      console.warn("WebGL2 3D textures not supported, skipping LUT load");
      return;
    }

    this.lutTexture = await this.lutCache.get(gl, url, level);
    this.currentLutPath = url;
  }

  /**
   * Override PixiJS Filter.apply() to handle sampler3D binding.
   *
   * We replicate the logic of FilterSystem.applyFilter() but insert
   * manual 3D texture binding between shader bind and the draw call.
   * This is necessary because PixiJS v7 does not support sampler3D
   * in its uniform sync system.
   */
  apply(
    filterManager: FilterSystem,
    input: RenderTexture,
    output: RenderTexture,
    clearMode?: CLEAR_MODES
  ): void {
    if (!this.lutTexture || !this.uniforms.u_lutEnabled) {
      // No LUT active -- delegate to standard PixiJS apply
      filterManager.applyFilter(this, input, output, clearMode);
      return;
    }

    // --- Replicate FilterSystem.applyFilter() with 3D texture injection ---

    const renderer = filterManager.renderer;
    const gl = renderer.gl as WebGL2RenderingContext;

    // 1. Set filter state (blend mode, etc.)
    renderer.state.set(this.state);

    // 2. Bind and clear output
    filterManager.bindAndClear(output, clearMode);

    // 3. Set input texture and global uniforms
    this.uniforms.uSampler = input;
    this.uniforms.filterGlobals = (filterManager as any).globalUniforms;

    // 4. Bind shader (this syncs all non-sampler3D uniforms)
    renderer.shader.bind(this);

    // 5. Bind 3D LUT texture to our reserved unit
    const lutUnit = FilmSimulationFilter.LUT_TEXTURE_UNIT;
    gl.activeTexture(gl.TEXTURE0 + lutUnit);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTexture);

    // 6. Manually set the sampler3D uniform location
    const contextUid = (renderer as any).CONTEXT_UID;
    const glProgram = this.program.glPrograms[contextUid];
    if (glProgram?.uniformData?.u_lut) {
      gl.uniform1i(glProgram.uniformData.u_lut.location, lutUnit);
    }

    // 7. Draw the filter quad
    const quad = (filterManager as any).quad;
    renderer.geometry.bind(quad);
    renderer.geometry.draw(DRAW_MODES.TRIANGLE_STRIP);
  }

  /**
   * Update all Film uniforms from a FilmUniforms data object.
   */
  updateUniforms(u: FilmUniforms): void {
    this.uniforms.u_toneEnabled = u.u_toneEnabled;
    this.uniforms.u_shoulder = u.u_shoulder;
    this.uniforms.u_toe = u.u_toe;
    this.uniforms.u_gamma = u.u_gamma;

    this.uniforms.u_colorMatrixEnabled = u.u_colorMatrixEnabled;
    const cm = this.uniforms.u_colorMatrix;
    for (let i = 0; i < 9; i++) cm[i] = u.u_colorMatrix[i];

    this.uniforms.u_lutEnabled = u.u_lutEnabled;
    this.uniforms.u_lutIntensity = u.u_lutIntensity;

    this.uniforms.u_colorCastEnabled = u.u_colorCastEnabled;
    this.uniforms.u_colorCastShadows[0] = u.u_colorCastShadows[0];
    this.uniforms.u_colorCastShadows[1] = u.u_colorCastShadows[1];
    this.uniforms.u_colorCastShadows[2] = u.u_colorCastShadows[2];
    this.uniforms.u_colorCastMidtones[0] = u.u_colorCastMidtones[0];
    this.uniforms.u_colorCastMidtones[1] = u.u_colorCastMidtones[1];
    this.uniforms.u_colorCastMidtones[2] = u.u_colorCastMidtones[2];
    this.uniforms.u_colorCastHighlights[0] = u.u_colorCastHighlights[0];
    this.uniforms.u_colorCastHighlights[1] = u.u_colorCastHighlights[1];
    this.uniforms.u_colorCastHighlights[2] = u.u_colorCastHighlights[2];

    this.uniforms.u_grainEnabled = u.u_grainEnabled;
    this.uniforms.u_grainAmount = u.u_grainAmount;
    this.uniforms.u_grainSize = u.u_grainSize;
    this.uniforms.u_grainRoughness = u.u_grainRoughness;
    this.uniforms.u_grainShadowBias = u.u_grainShadowBias;
    this.uniforms.u_grainSeed = u.u_grainSeed;
    this.uniforms.u_grainIsColor = u.u_grainIsColor;

    this.uniforms.u_vignetteEnabled = u.u_vignetteEnabled;
    this.uniforms.u_vignetteAmount = u.u_vignetteAmount;
    this.uniforms.u_vignetteMidpoint = u.u_vignetteMidpoint;
    this.uniforms.u_vignetteRoundness = u.u_vignetteRoundness;
  }

  /**
   * Release GPU resources.
   */
  destroy(): void {
    // LUT textures are managed by the cache; we just clear our reference.
    this.lutTexture = null;
    this.currentLutPath = null;
    super.destroy();
  }

  /**
   * Dispose the LUT cache (call when the renderer is being destroyed).
   */
  disposeLUTCache(gl: WebGL2RenderingContext): void {
    this.lutCache.dispose(gl);
    this.lutTexture = null;
    this.currentLutPath = null;
  }
}
