import * as PIXI from "pixi.js";
import { Filter, CLEAR_MODES as CLEAR_MODES_ENUM } from "pixi.js";
import type { FilterSystem, RenderTexture, CLEAR_MODES, Renderer } from "pixi.js";
import { LUTCache } from "../LUTCache";
import type { FilmUniforms } from "../types";
import { applyManualFilter, clearTextureUnitBinding } from "./ManualFilterApply";

import vertexSrc from "../shaders/default.vert?raw";
import passthroughFragSrc from "../shaders/Passthrough.frag?raw";
import modernFragmentSrc from "../shaders/generated/FilmSimulation.frag?raw";

/**
 * PixiJS Filter that applies Film Simulation effects:
 * - Layer 1: Tone Response (S-curve with shoulder/toe/gamma)
 * - Layer 2: Color Matrix (3x3 cross-channel color mixing)
 * - Layer 3: 3D LUT via HaldCLUT (trilinear-interpolated sampler3D)
 * - Layer 4: Color Cast (per-zone tinting)
 * - Layer 5: Film Grain (blue-noise texture based, color/mono, shadow-biased)
 * - Layer 6: Vignette (elliptical, bidirectional)
 *
 * ## 3D Texture Handling
 *
 * PixiJS v7's uniform system does not support `sampler3D`. We work around
 * this by:
 * 1. Omitting `u_lut` from the Filter uniform object (prevents PixiJS from
 *    trying to sync it and crashing on unknown type)
 * 2. Overriding `apply()` and using a shared manual apply helper
 *    (`ManualFilterApply`) to inject 3D texture binding
 * 3. Using a fixed texture unit (4) for the 3D LUT to avoid conflicts with
 *    PixiJS's auto-assigned units (0 for uSampler, 1 for globalUniforms)
 */
export class FilmSimulationFilter extends Filter {
  private lutTexture: WebGLTexture | null = null;
  private lutCache: LUTCache;
  private currentLutKey: string | null = null;
  private failedLutKey: string | null = null;
  private failedLutRetryAfter = 0;
  private lastLutErrorKey: string | null = null;
  private blueNoiseTexture: PIXI.Texture;
  private passthroughFilter: Filter;
  private loadGeneration = 0;
  /** Cached GL context for cleanup in destroy(). Set on first loadLUT call. */
  private gl: WebGL2RenderingContext | null = null;

  /** Cached WebGL uniform location for u_lut (resolved once per GL program) */
  private lutUniformLocation: WebGLUniformLocation | null = null;
  /** GL program whose u_lut location we cached (invalidate on recompile) */
  private lutLocationProgram: WebGLProgram | null = null;

  /** Fixed texture unit for the 3D LUT (avoids PixiJS internal units) */
  private static readonly LUT_TEXTURE_UNIT = 4;
  private static readonly BLUE_NOISE_URL = "/noise/blue-noise-64.png";

  constructor() {
    // NOTE: u_lut is intentionally NOT included here because PixiJS v7
    // cannot handle sampler3D uniforms. We bind it manually in apply().
    super(vertexSrc, modernFragmentSrc, {
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
      // Layer 5: Grain
      u_grainEnabled: false,
      u_grainAmount: 0.0,
      u_grainSize: 0.5,
      u_grainRoughness: 0.5,
      u_grainShadowBias: 0.45,
      u_grainSeed: 0.0,
      u_grainIsColor: true,
      u_textureSize: new Float32Array([1800, 1800]),
      u_blueNoise: PIXI.Texture.WHITE,
      // Layer 6: Vignette
      u_vignetteEnabled: false,
      u_vignetteAmount: 0.0,
      u_vignetteMidpoint: 0.5,
      u_vignetteRoundness: 0.5,
      u_aspectRatio: 1.0,
    });

    this.lutCache = new LUTCache(12);

    const blueNoiseBaseTexture = PIXI.BaseTexture.from(FilmSimulationFilter.BLUE_NOISE_URL, {
      scaleMode: PIXI.SCALE_MODES.NEAREST,
      wrapMode: PIXI.WRAP_MODES.REPEAT,
    });
    blueNoiseBaseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
    blueNoiseBaseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT;
    this.blueNoiseTexture = new PIXI.Texture(blueNoiseBaseTexture);
    this.uniforms.u_blueNoise = this.blueNoiseTexture;
    this.passthroughFilter = new Filter(vertexSrc, passthroughFragSrc);
  }

  /**
   * Load a HaldCLUT image and cache the resulting 3D texture.
   * Skips loading if the same LUT path is already active.
   */
  async loadLUT(renderer: Renderer, url: string, level: 8 | 16 = 8): Promise<void> {
    const lutKey = `${url}|${level}`;
    if (this.currentLutKey === lutKey && this.lutTexture) {
      return; // Already loaded
    }
    if (this.failedLutKey === lutKey && Date.now() < this.failedLutRetryAfter) {
      return;
    }

    const gl = renderer.gl as WebGL2RenderingContext;
    if (!gl.texImage3D) {
      console.warn("WebGL2 3D textures not supported, skipping LUT load");
      return;
    }
    this.gl = gl;

    // Guard against concurrent loads: use a monotonic counter to detect superseded calls
    const thisGeneration = ++this.loadGeneration;
    try {
      const texture = await this.lutCache.get(gl, url, level);

      // A newer loadLUT call may have superseded us — only apply if still current
      if (this.loadGeneration !== thisGeneration) {
        return;
      }

      this.lutTexture = texture;
      this.currentLutKey = lutKey;
      this.failedLutKey = null;
      this.failedLutRetryAfter = 0;
      this.lastLutErrorKey = null;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      const errorKey = `${lutKey}:${errorMessage}`;
      if (this.lastLutErrorKey !== errorKey) {
        console.warn("LUT load failed:", e);
        this.lastLutErrorKey = errorKey;
      }
      // Reset to safe state — disable LUT for this filter
      if (this.loadGeneration === thisGeneration) {
        this.lutTexture = null;
        this.currentLutKey = null;
        this.failedLutKey = lutKey;
        this.failedLutRetryAfter = Date.now() + 30_000;
        this.uniforms.u_lutEnabled = false;
      }
    }
  }

  /**
   * Override PixiJS Filter.apply() to handle sampler3D binding.
   *
   * We ALWAYS use the manual rendering path (never delegate to
   * filterManager.applyFilter) because the shader declares
   * `uniform sampler3D u_lut` which PixiJS v7 doesn't understand.
   * If we let PixiJS handle the draw, `u_lut` defaults to texture unit 0
   * (same as `uSampler` / sampler2D), causing a WebGL type conflict error:
   *   "Two textures of different types use the same sampler location"
   *
   * By always manually binding the shader and setting `u_lut` to a
   * dedicated texture unit, we avoid this conflict in all cases.
   */
  apply(
    filterManager: FilterSystem,
    input: RenderTexture,
    output: RenderTexture,
    clearMode?: CLEAR_MODES
  ): void {
    const sharesAttachment =
      input === output ||
      input.baseTexture === output.baseTexture;
    if (sharesAttachment) {
      const tempOutput = filterManager.getFilterTexture(input);
      try {
        this.drawWithManualBindings(
          filterManager,
          input,
          tempOutput,
          CLEAR_MODES_ENUM.CLEAR
        );
        filterManager.applyFilter(this.passthroughFilter, tempOutput, output, clearMode);
      } finally {
        filterManager.returnFilterTexture(tempOutput);
      }
      return;
    }

    this.drawWithManualBindings(filterManager, input, output, clearMode);
  }

  private drawWithManualBindings(
    filterManager: FilterSystem,
    input: RenderTexture,
    output: RenderTexture,
    clearMode?: CLEAR_MODES
  ): void {
    const lutUnit = FilmSimulationFilter.LUT_TEXTURE_UNIT;

    applyManualFilter(this, filterManager, input, output, clearMode, {
      beforeDraw: ({ gl, nativeProgram }) => {
        // Resolve the u_lut uniform location once per linked GL program.
        if (nativeProgram && this.lutLocationProgram !== nativeProgram) {
          this.lutUniformLocation = gl.getUniformLocation(nativeProgram, "u_lut");
          this.lutLocationProgram = nativeProgram;
        } else if (!nativeProgram) {
          this.lutUniformLocation = null;
          this.lutLocationProgram = null;
        }

        // Always bind sampler3D to our reserved unit, even when LUT is disabled,
        // so sampler2D/sampler3D never alias the same texture unit.
        gl.activeTexture(gl.TEXTURE0 + lutUnit);
        if (this.lutTexture && this.uniforms.u_lutEnabled) {
          gl.bindTexture(gl.TEXTURE_3D, this.lutTexture);
        } else {
          gl.bindTexture(gl.TEXTURE_3D, null);
        }
        if (
          nativeProgram &&
          this.lutLocationProgram === nativeProgram &&
          this.lutUniformLocation
        ) {
          gl.uniform1i(this.lutUniformLocation, lutUnit);
        }
      },
      afterDraw: ({ renderer, gl }) => {
        clearTextureUnitBinding(renderer, gl, lutUnit);
      },
    });
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

    this.uniforms.u_lutEnabled = u.u_lutEnabled && !!this.lutTexture;
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
   * Update image-dependent uniforms (aspect ratio for vignette, texture size for grain).
   * Call this whenever the source image dimensions change.
   */
  updateImageDimensions(width: number, height: number): void {
    this.uniforms.u_aspectRatio = width / Math.max(height, 1);
    this.uniforms.u_textureSize[0] = width;
    this.uniforms.u_textureSize[1] = height;
  }

  /**
   * Release GPU resources including the LUT cache.
   */
  destroy(): void {
    if (this.gl) {
      this.lutCache.dispose(this.gl);
    }
    this.passthroughFilter.destroy();
    this.blueNoiseTexture.destroy(false);
    this.lutTexture = null;
    this.currentLutKey = null;
    this.gl = null;
    super.destroy();
  }

  /**
   * Dispose the LUT cache (call when the renderer is being destroyed).
   */
  disposeLUTCache(gl: WebGL2RenderingContext): void {
    this.lutCache.dispose(gl);
    this.lutTexture = null;
    this.currentLutKey = null;
  }
}
