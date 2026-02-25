import { Filter } from "pixi.js";
import type { DetailUniforms } from "../types";

import vertexSrc from "../shaders/default.vert?raw";
import fragmentSrc from "../shaders/Detail.frag?raw";

export class DetailFilter extends Filter {
  constructor() {
    super(vertexSrc, fragmentSrc, {
      u_enabled: false,
      u_texelSize: new Float32Array([1, 1]),
      u_texture: 0,
      u_clarity: 0,
      u_sharpening: 0,
      u_sharpenRadius: 40,
      u_sharpenDetail: 25,
      u_masking: 0,
      u_noiseReduction: 0,
      u_colorNoiseReduction: 0,
      u_nrKernelRadius: 2,
    });
  }

  updateImageDimensions(width: number, height: number): void {
    this.uniforms.u_texelSize[0] = 1 / Math.max(1, width);
    this.uniforms.u_texelSize[1] = 1 / Math.max(1, height);
  }

  updateUniforms(u: DetailUniforms): void {
    this.uniforms.u_enabled = u.enabled;
    this.uniforms.u_texture = u.texture;
    this.uniforms.u_clarity = u.clarity;
    this.uniforms.u_sharpening = u.sharpening;
    this.uniforms.u_sharpenRadius = u.sharpenRadius;
    this.uniforms.u_sharpenDetail = u.sharpenDetail;
    this.uniforms.u_masking = u.masking;
    this.uniforms.u_noiseReduction = u.noiseReduction;
    this.uniforms.u_colorNoiseReduction = u.colorNoiseReduction;
  }

  setNoiseReductionKernelRadius(radius: 1 | 2): void {
    this.uniforms.u_nrKernelRadius = radius;
  }
}
