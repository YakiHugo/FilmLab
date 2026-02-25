import { Filter } from "pixi.js";
import type { HSLUniforms } from "../types";

import vertexSrc from "../shaders/default.vert?raw";
import fragmentSrc from "../shaders/HSL.frag?raw";

export class HSLFilter extends Filter {
  constructor() {
    super(vertexSrc, fragmentSrc, {
      u_enabled: false,
      u_hue: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0]),
      u_saturation: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0]),
      u_luminance: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0]),
      u_bwEnabled: false,
      u_bwMix: new Float32Array([0.2126, 0.7152, 0.0722]),
      u_calibrationEnabled: false,
      u_calibrationHue: new Float32Array([0, 0, 0]),
      u_calibrationSaturation: new Float32Array([0, 0, 0]),
    });
  }

  updateUniforms(u: HSLUniforms): void {
    this.uniforms.u_enabled = u.enabled;
    for (let i = 0; i < 8; i += 1) {
      this.uniforms.u_hue[i] = u.hue[i];
      this.uniforms.u_saturation[i] = u.saturation[i];
      this.uniforms.u_luminance[i] = u.luminance[i];
    }
    this.uniforms.u_bwEnabled = u.bwEnabled;
    this.uniforms.u_bwMix[0] = u.bwMix[0];
    this.uniforms.u_bwMix[1] = u.bwMix[1];
    this.uniforms.u_bwMix[2] = u.bwMix[2];
    this.uniforms.u_calibrationEnabled = u.calibrationEnabled;
    this.uniforms.u_calibrationHue[0] = u.calibrationHue[0];
    this.uniforms.u_calibrationHue[1] = u.calibrationHue[1];
    this.uniforms.u_calibrationHue[2] = u.calibrationHue[2];
    this.uniforms.u_calibrationSaturation[0] = u.calibrationSaturation[0];
    this.uniforms.u_calibrationSaturation[1] = u.calibrationSaturation[1];
    this.uniforms.u_calibrationSaturation[2] = u.calibrationSaturation[2];
  }
}
