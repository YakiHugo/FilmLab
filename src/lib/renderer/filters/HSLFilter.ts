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
    });
  }

  updateUniforms(u: HSLUniforms): void {
    this.uniforms.u_enabled = u.enabled;
    for (let i = 0; i < 8; i += 1) {
      this.uniforms.u_hue[i] = u.hue[i];
      this.uniforms.u_saturation[i] = u.saturation[i];
      this.uniforms.u_luminance[i] = u.luminance[i];
    }
  }
}

