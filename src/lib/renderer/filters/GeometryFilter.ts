import { Filter } from "pixi.js";
import type { GeometryUniforms } from "../types";

import vertexSrc from "../shaders/default.vert?raw";
import fragmentSrc from "../shaders/Geometry.frag?raw";

/**
 * GPU geometry pass for crop/rotate/scale/flip/translate.
 * Operates in source texture space and outputs transformed sRGB pixels.
 */
export class GeometryFilter extends Filter {
  constructor() {
    super(vertexSrc, fragmentSrc, {
      u_cropRect: new Float32Array([0, 0, 1, 1]),
      u_sourceSize: new Float32Array([1, 1]),
      u_outputSize: new Float32Array([1, 1]),
      u_translatePx: new Float32Array([0, 0]),
      u_rotate: 0,
      u_perspectiveEnabled: false,
      u_homography: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
      u_scale: 1,
      u_flip: new Float32Array([1, 1]),
      u_lensEnabled: false,
      u_lensK1: 0,
      u_lensK2: 0,
      u_lensVignetteBoost: 0,
      u_caEnabled: false,
      u_caAmountPxRgb: new Float32Array([0, 0, 0]),
      u_enabled: true,
    });
  }

  updateUniforms(u: GeometryUniforms): void {
    this.uniforms.u_enabled = u.enabled;
    this.uniforms.u_cropRect[0] = u.cropRect[0];
    this.uniforms.u_cropRect[1] = u.cropRect[1];
    this.uniforms.u_cropRect[2] = u.cropRect[2];
    this.uniforms.u_cropRect[3] = u.cropRect[3];
    this.uniforms.u_sourceSize[0] = u.sourceSize[0];
    this.uniforms.u_sourceSize[1] = u.sourceSize[1];
    this.uniforms.u_outputSize[0] = u.outputSize[0];
    this.uniforms.u_outputSize[1] = u.outputSize[1];
    this.uniforms.u_translatePx[0] = u.translatePx[0];
    this.uniforms.u_translatePx[1] = u.translatePx[1];
    this.uniforms.u_rotate = u.rotate;
    this.uniforms.u_perspectiveEnabled = u.perspectiveEnabled;
    for (let i = 0; i < 9; i += 1) {
      this.uniforms.u_homography[i] = u.homography[i] ?? (i % 4 === 0 ? 1 : 0);
    }
    this.uniforms.u_scale = u.scale;
    this.uniforms.u_flip[0] = u.flip[0];
    this.uniforms.u_flip[1] = u.flip[1];
    this.uniforms.u_lensEnabled = u.lensEnabled;
    this.uniforms.u_lensK1 = u.lensK1;
    this.uniforms.u_lensK2 = u.lensK2;
    this.uniforms.u_lensVignetteBoost = u.lensVignetteBoost;
    this.uniforms.u_caEnabled = u.caEnabled;
    this.uniforms.u_caAmountPxRgb[0] = u.caAmountPxRgb[0];
    this.uniforms.u_caAmountPxRgb[1] = u.caAmountPxRgb[1];
    this.uniforms.u_caAmountPxRgb[2] = u.caAmountPxRgb[2];
  }
}
