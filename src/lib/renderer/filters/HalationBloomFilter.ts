import { Filter, CLEAR_MODES as CLEAR_MODES_ENUM } from "pixi.js";
import type { FilterSystem, RenderTexture, CLEAR_MODES } from "pixi.js";
import type { HalationBloomUniforms } from "../types";

import vertexSrc from "../shaders/default.vert?raw";
import thresholdFragSrc from "../shaders/HalationThreshold.frag?raw";
import blurFragSrc from "../shaders/GaussianBlur.frag?raw";
import compositeFragSrc from "../shaders/HalationComposite.frag?raw";

/**
 * Multi-pass PixiJS Filter for film halation and bloom effects.
 *
 * Halation simulates the red/warm glow caused by light bouncing off the
 * film base back into the emulsion. Bloom simulates general bright-area
 * glow. Both effects share the same pipeline:
 *
 *   1. **Threshold**: Extract bright pixels into a mask (R=halation, G=bloom)
 *   2. **Horizontal Blur**: Separable Gaussian blur (H pass)
 *   3. **Vertical Blur**: Separable Gaussian blur (V pass)
 *   4. **Composite**: Additively blend blurred masks with the original image,
 *      tinting halation with a warm color.
 *
 * Performance: The blur passes run at half resolution to save GPU bandwidth
 * on large images. On a 2K image, the 4 extra passes add < 2ms total.
 *
 * ## Texture Management
 *
 * We borrow temporary RenderTextures from PixiJS's FilterSystem pool
 * (`getFilterTexture` / `returnFilterTexture`) to avoid GPU memory leaks.
 * No textures are allocated or retained between frames.
 */
export class HalationBloomFilter extends Filter {
  /** Internal sub-filters for each pass */
  private thresholdFilter: Filter;
  private blurHFilter: Filter;
  private blurVFilter: Filter;
  private compositeFilter: Filter;

  /** Whether this filter should do anything (set to false to skip all passes) */
  private _enabled = true;

  /** Blur pass count — more passes = wider / smoother blur */
  private blurPasses = 2;

  constructor() {
    // The parent Filter is a no-op; all real work happens in apply()
    super(vertexSrc, undefined);

    // --- Pass 1: Threshold Extraction ---
    this.thresholdFilter = new Filter(vertexSrc, thresholdFragSrc, {
      u_halationThreshold: 0.9,
      u_bloomThreshold: 0.85,
    });

    // --- Pass 2 & 3: Separable Gaussian Blur ---
    this.blurHFilter = new Filter(vertexSrc, blurFragSrc, {
      u_blurDirection: new Float32Array([0, 0]),
      u_blurRadius: 1.0,
    });

    this.blurVFilter = new Filter(vertexSrc, blurFragSrc, {
      u_blurDirection: new Float32Array([0, 0]),
      u_blurRadius: 1.0,
    });

    // --- Pass 4: Composite ---
    this.compositeFilter = new Filter(vertexSrc, compositeFragSrc, {
      u_blurredMask: null,
      u_halationEnabled: false,
      u_halationIntensity: 0.0,
      u_halationColor: new Float32Array([1.0, 0.3, 0.1]),
      u_bloomEnabled: false,
      u_bloomIntensity: 0.0,
    });
  }

  /**
   * Update all halation/bloom uniforms from a data object.
   */
  updateUniforms(u: HalationBloomUniforms): void {
    // Threshold
    this.thresholdFilter.uniforms.u_halationThreshold = u.halationThreshold;
    this.thresholdFilter.uniforms.u_bloomThreshold = u.bloomThreshold;

    // Blur radius — derived from intensity values for perceptual scaling
    const halRadius = u.halationRadius ?? Math.max(1, u.halationIntensity * 8);
    const bloomRadius = u.bloomRadius ?? Math.max(1, u.bloomIntensity * 10);
    const avgRadius = Math.max(halRadius, bloomRadius);
    this.blurHFilter.uniforms.u_blurRadius = avgRadius;
    this.blurVFilter.uniforms.u_blurRadius = avgRadius;

    // Number of blur passes scales with radius for quality
    this.blurPasses = avgRadius > 4 ? 3 : 2;

    // Composite
    this.compositeFilter.uniforms.u_halationEnabled =
      u.halationEnabled && u.halationIntensity > 0.001;
    this.compositeFilter.uniforms.u_halationIntensity = u.halationIntensity;
    if (u.halationColor) {
      this.compositeFilter.uniforms.u_halationColor[0] = u.halationColor[0];
      this.compositeFilter.uniforms.u_halationColor[1] = u.halationColor[1];
      this.compositeFilter.uniforms.u_halationColor[2] = u.halationColor[2];
    }

    this.compositeFilter.uniforms.u_bloomEnabled =
      u.bloomEnabled && u.bloomIntensity > 0.001;
    this.compositeFilter.uniforms.u_bloomIntensity = u.bloomIntensity;

    // Global enable: skip all passes if neither effect is active
    this._enabled =
      this.compositeFilter.uniforms.u_halationEnabled ||
      this.compositeFilter.uniforms.u_bloomEnabled;
  }

  /**
   * Multi-pass rendering pipeline.
   *
   * When both halation and bloom are disabled, this is a no-op passthrough.
   */
  apply(
    filterManager: FilterSystem,
    input: RenderTexture,
    output: RenderTexture,
    clearMode?: CLEAR_MODES
  ): void {
    // Fast path: skip if no effects are active
    if (!this._enabled) {
      filterManager.applyFilter(this, input, output, clearMode);
      return;
    }

    // Get input dimensions for blur direction vectors
    const inputWidth = input.width;
    const inputHeight = input.height;

    // Use half-resolution for blur passes (performance optimization)
    const blurResolution = 0.5;

    // --- Allocate temporary textures from the FilterSystem pool ---
    const thresholdTex = filterManager.getFilterTexture(input, blurResolution);
    let pingTex = filterManager.getFilterTexture(input, blurResolution);
    let pongTex = filterManager.getFilterTexture(input, blurResolution);

    // --- Pass 1: Threshold extraction ---
    filterManager.applyFilter(
      this.thresholdFilter,
      input,
      thresholdTex,
      CLEAR_MODES_ENUM.CLEAR
    );

    // --- Pass 2 & 3: Separable Gaussian blur (multi-pass for quality) ---
    // Set blur directions based on the half-res texture dimensions
    const blurWidth = thresholdTex.width;
    const blurHeight = thresholdTex.height;

    this.blurHFilter.uniforms.u_blurDirection[0] = 1.0 / blurWidth;
    this.blurHFilter.uniforms.u_blurDirection[1] = 0.0;
    this.blurVFilter.uniforms.u_blurDirection[0] = 0.0;
    this.blurVFilter.uniforms.u_blurDirection[1] = 1.0 / blurHeight;

    // First H+V pass: threshold → ping → pong
    filterManager.applyFilter(
      this.blurHFilter,
      thresholdTex,
      pingTex,
      CLEAR_MODES_ENUM.CLEAR
    );
    filterManager.applyFilter(
      this.blurVFilter,
      pingTex,
      pongTex,
      CLEAR_MODES_ENUM.CLEAR
    );

    // Additional blur passes for smoother, wider blur
    for (let i = 1; i < this.blurPasses; i++) {
      filterManager.applyFilter(
        this.blurHFilter,
        pongTex,
        pingTex,
        CLEAR_MODES_ENUM.CLEAR
      );
      filterManager.applyFilter(
        this.blurVFilter,
        pingTex,
        pongTex,
        CLEAR_MODES_ENUM.CLEAR
      );
    }

    // --- Pass 4: Composite blurred mask with original ---
    // The composite shader reads both the original (uSampler) and the
    // blurred mask (u_blurredMask). We set u_blurredMask as a uniform
    // texture. PixiJS handles sampler2D uniforms automatically.
    this.compositeFilter.uniforms.u_blurredMask = pongTex;
    filterManager.applyFilter(
      this.compositeFilter,
      input,
      output,
      clearMode
    );

    // --- Return temporary textures to the pool ---
    filterManager.returnFilterTexture(thresholdTex);
    filterManager.returnFilterTexture(pingTex);
    filterManager.returnFilterTexture(pongTex);
  }

  /**
   * Release all sub-filter GPU resources.
   */
  destroy(): void {
    this.thresholdFilter.destroy();
    this.blurHFilter.destroy();
    this.blurVFilter.destroy();
    this.compositeFilter.destroy();
    super.destroy();
  }
}
