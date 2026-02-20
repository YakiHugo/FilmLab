import { Filter } from "pixi.js";
import type { MasterUniforms } from "../types";

import vertexSrc from "../shaders/default.vert?raw";
import fragmentSrc from "../shaders/generated/MasterAdjustment.frag?raw";

/**
 * PixiJS Filter that applies Master-level image adjustments:
 * - Exposure (linear space)
 * - LMS white balance (color temperature + tint)
 * - Contrast (linear space, mid-gray pivot)
 * - Tonal range (highlights / shadows / whites / blacks)
 * - Curves (4-segment additive)
 * - OKLab HSL (hue shift, saturation, vibrance, luminance)
 * - Dehaze
 *
 * All color math runs in linear space with sRGB conversion at input/output.
 */
export class MasterAdjustmentFilter extends Filter {
  constructor() {
    super(vertexSrc, fragmentSrc, {
      u_exposure: 0.0,
      u_contrast: 0.0,
      u_temperature: 0.0,
      u_tint: 0.0,
      u_tonalRange: new Float32Array([0, 0, 0, 0]),
      u_curve: new Float32Array([0, 0, 0, 0]),
      u_hueShift: 0.0,
      u_saturation: 0.0,
      u_vibrance: 0.0,
      u_luminance: 0.0,
      u_colorGradeShadows: new Float32Array([0, 0, 0]),
      u_colorGradeMidtones: new Float32Array([0, 0, 0]),
      u_colorGradeHighlights: new Float32Array([0, 0, 0]),
      u_colorGradeBlend: 0.5,
      u_colorGradeBalance: 0.0,
      u_dehaze: 0.0,
    });
  }

  /**
   * Update all Master uniforms from a MasterUniforms data object.
   */
  updateUniforms(u: MasterUniforms): void {
    this.uniforms.u_exposure = u.exposure;
    this.uniforms.u_contrast = u.contrast;
    this.uniforms.u_temperature = u.temperature;
    this.uniforms.u_tint = u.tint;

    this.uniforms.u_tonalRange[0] = u.highlights;
    this.uniforms.u_tonalRange[1] = u.shadows;
    this.uniforms.u_tonalRange[2] = u.whites;
    this.uniforms.u_tonalRange[3] = u.blacks;

    this.uniforms.u_curve[0] = u.curveHighlights;
    this.uniforms.u_curve[1] = u.curveLights;
    this.uniforms.u_curve[2] = u.curveDarks;
    this.uniforms.u_curve[3] = u.curveShadows;

    this.uniforms.u_hueShift = u.hueShift;
    this.uniforms.u_saturation = u.saturation;
    this.uniforms.u_vibrance = u.vibrance;
    this.uniforms.u_luminance = u.luminance;
    this.uniforms.u_colorGradeShadows[0] = u.colorGradeShadows[0];
    this.uniforms.u_colorGradeShadows[1] = u.colorGradeShadows[1];
    this.uniforms.u_colorGradeShadows[2] = u.colorGradeShadows[2];
    this.uniforms.u_colorGradeMidtones[0] = u.colorGradeMidtones[0];
    this.uniforms.u_colorGradeMidtones[1] = u.colorGradeMidtones[1];
    this.uniforms.u_colorGradeMidtones[2] = u.colorGradeMidtones[2];
    this.uniforms.u_colorGradeHighlights[0] = u.colorGradeHighlights[0];
    this.uniforms.u_colorGradeHighlights[1] = u.colorGradeHighlights[1];
    this.uniforms.u_colorGradeHighlights[2] = u.colorGradeHighlights[2];
    this.uniforms.u_colorGradeBlend = u.colorGradeBlend;
    this.uniforms.u_colorGradeBalance = u.colorGradeBalance;
    this.uniforms.u_dehaze = u.dehaze;
  }
}
