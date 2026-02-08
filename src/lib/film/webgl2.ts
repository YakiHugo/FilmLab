import { featureFlags } from "@/lib/features";
import type { FilmProfile, LutAsset } from "@/types";
import { getFilmModule, normalizeFilmProfile } from "./profile";
import { resolveModuleSeed } from "./seed";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const vertexShaderSource = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = (a_position + 1.0) * 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const fragmentShaderSource = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_texture;
uniform sampler3D u_lutTexture;
uniform vec2 u_texel;
uniform float u_grainSeed;
uniform float u_defectsSeed;

uniform float u_colorAmount;
uniform float u_lutMix;
uniform float u_lutEnabled;
uniform float u_lutSize;
uniform vec3 u_rgbMix;
uniform float u_tempShift;
uniform float u_tintShift;

uniform float u_toneStrength;
uniform vec4 u_toneMain;
uniform vec4 u_toneExt;
uniform vec2 u_toneCurveMid;

uniform float u_scanStrength;
uniform vec4 u_scanMain;
uniform vec2 u_scanExtra;

uniform float u_grainStrength;
uniform vec4 u_grain;
uniform float u_shadowBoost;

uniform float u_defectsStrength;
uniform vec4 u_defects;

float luma(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

float hash12(vec2 p, float seed) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33 + seed * 0.000001);
  return fract((p3.x + p3.y) * p3.z);
}

float softBand(float x, float start, float end) {
  float a = smoothstep(start - 0.001, start + 0.001, x);
  float b = smoothstep(end - 0.001, end + 0.001, x);
  return clamp(a - b, 0.0, 1.0);
}

vec3 applyColorScience(vec3 color) {
  if (u_colorAmount <= 0.0) {
    return color;
  }

  float temp = (u_tempShift / 100.0) * 0.14 * u_colorAmount;
  float tint = (u_tintShift / 100.0) * 0.12 * u_colorAmount;

  color.r += temp + tint * 0.2;
  color.g += tint * 0.6;
  color.b -= temp + tint * 0.2;

  vec3 mixTarget = mix(vec3(1.0), u_rgbMix, u_colorAmount);
  color *= mixTarget;

  if (u_lutEnabled > 0.5 && u_lutMix > 0.0) {
    vec3 lutUv = clamp(color, 0.0, 1.0);
    lutUv = lutUv * ((u_lutSize - 1.0) / u_lutSize) + (0.5 / u_lutSize);
    vec3 lutColor = texture(u_lutTexture, lutUv).rgb;
    color = mix(color, lutColor, u_lutMix);
    return clamp(color, 0.0, 1.0);
  }

  float lum = luma(color);
  float cross = u_lutMix * 0.08;
  color.r += (color.g - color.b) * cross;
  color.g += (color.b - color.r) * cross * 0.65;
  color.b += (color.r - color.g) * cross;

  color = smoothstep(vec3(-u_lutMix * 0.2), vec3(1.0 + u_lutMix * 0.16), color);
  float satLift = 1.0 + u_lutMix * 0.12;
  color = mix(vec3(lum), color, satLift);

  return clamp(color, 0.0, 1.0);
}

vec3 applyTone(vec3 color) {
  if (u_toneStrength <= 0.0) {
    return color;
  }

  float exposure = exp2((u_toneMain.x / 100.0) * 1.35 * u_toneStrength);
  float contrast = 1.0 + (u_toneMain.y / 100.0) * 0.9 * u_toneStrength;
  float highlights = (u_toneMain.z / 100.0) * 0.35 * u_toneStrength;
  float shadows = (u_toneMain.w / 100.0) * 0.35 * u_toneStrength;
  float whites = (u_toneExt.x / 100.0) * 0.28 * u_toneStrength;
  float blacks = (u_toneExt.y / 100.0) * 0.28 * u_toneStrength;

  color *= exposure;

  float lum = luma(color);
  float hiMask = smoothstep(0.52, 1.0, lum);
  float shMask = 1.0 - smoothstep(0.0, 0.48, lum);
  float whMask = smoothstep(0.78, 1.0, lum);
  float blMask = 1.0 - smoothstep(0.0, 0.22, lum);

  color += vec3(hiMask * highlights);
  color += vec3(shMask * shadows);
  color += vec3(whMask * whites);
  color += vec3(blMask * blacks);

  color = (color - 0.5) * contrast + 0.5;

  lum = luma(color);
  float curveHi = (u_toneExt.z / 100.0) * 0.25 * u_toneStrength;
  float curveLo = (u_toneExt.w / 100.0) * 0.25 * u_toneStrength;
  float curveMidHi = (u_toneCurveMid.x / 100.0) * 0.2 * u_toneStrength;
  float curveMidLo = (u_toneCurveMid.y / 100.0) * 0.2 * u_toneStrength;

  float curveDelta =
    smoothstep(0.7, 1.0, lum) * curveHi +
    softBand(lum, 0.45, 0.72) * curveMidHi +
    softBand(lum, 0.18, 0.45) * curveMidLo +
    (1.0 - smoothstep(0.12, 0.35, lum)) * curveLo;

  color += vec3(curveDelta);
  return clamp(color, 0.0, 1.0);
}

vec3 applyScan(vec3 color) {
  if (u_scanStrength <= 0.0) {
    return color;
  }

  float halThres = u_scanMain.x;
  float halAmount = u_scanMain.y * u_scanStrength;
  float bloomThres = u_scanMain.z;
  float bloomAmount = u_scanMain.w * u_scanStrength;

  float halRadius = mix(1.0, 8.0, u_scanMain.y);
  float bloomRadius = mix(1.0, 10.0, u_scanMain.w);

  vec2 offsets[8];
  offsets[0] = vec2(1.0, 0.0);
  offsets[1] = vec2(-1.0, 0.0);
  offsets[2] = vec2(0.0, 1.0);
  offsets[3] = vec2(0.0, -1.0);
  offsets[4] = vec2(1.0, 1.0);
  offsets[5] = vec2(-1.0, 1.0);
  offsets[6] = vec2(1.0, -1.0);
  offsets[7] = vec2(-1.0, -1.0);

  float halAccum = 0.0;
  float bloomAccum = 0.0;
  for (int i = 0; i < 8; i++) {
    vec3 sampleColor = texture(u_texture, v_uv + offsets[i] * u_texel * halRadius).rgb;
    float sampleLum = luma(sampleColor);
    halAccum += clamp((sampleLum - halThres) / max(0.001, 1.0 - halThres), 0.0, 1.0);

    vec3 bloomSample = texture(u_texture, v_uv + offsets[i] * u_texel * bloomRadius).rgb;
    float bloomLum = luma(bloomSample);
    bloomAccum += clamp((bloomLum - bloomThres) / max(0.001, 1.0 - bloomThres), 0.0, 1.0);
  }

  float halation = (halAccum / 8.0) * halAmount;
  float bloom = (bloomAccum / 8.0) * bloomAmount;

  color.r += bloom * 0.22 + halation * 0.28;
  color.g += bloom * 0.14 + halation * 0.08;
  color.b += bloom * 0.10;

  float warmth = (u_scanExtra.y / 100.0) * 0.12 * u_scanStrength;
  color.r += warmth;
  color.b -= warmth;

  float vignette = u_scanExtra.x * u_scanStrength;
  float dist = distance(v_uv, vec2(0.5));
  float edge = smoothstep(0.15, 0.75, dist);

  if (vignette >= 0.0) {
    float gain = 1.0 - edge * edge * abs(vignette);
    color *= gain;
  } else {
    float lift = edge * edge * abs(vignette) * 0.35;
    color += vec3(lift);
  }

  return clamp(color, 0.0, 1.0);
}

vec3 applyGrain(vec3 color) {
  if (u_grainStrength <= 0.0) {
    return color;
  }

  float amount = u_grain.x * u_grainStrength;
  if (amount <= 0.0) {
    return color;
  }

  float grainScale = mix(2.8, 0.45, u_grain.y);
  float roughness = u_grain.z;
  float chroma = u_grain.w;
  float lum = luma(color);
  float shadowWeight = 1.0 + (1.0 - lum) * u_shadowBoost;

  vec2 grainCoord = floor(v_uv * vec2(1800.0) * grainScale);
  float coarse = hash12(grainCoord, u_grainSeed) - 0.5;
  float fine = hash12(v_uv * vec2(3600.0) + vec2(17.0, 31.0), u_grainSeed) - 0.5;
  float mixed = mix(coarse, fine, roughness);
  float noiseStrength = mixed * amount * 0.55 * shadowWeight;

  float cR = (hash12(v_uv * vec2(2100.0) + vec2(13.0, 1.0), u_grainSeed) - 0.5) * chroma;
  float cG = (hash12(v_uv * vec2(2200.0) + vec2(5.0, 19.0), u_grainSeed) - 0.5) * chroma;
  float cB = (hash12(v_uv * vec2(2300.0) + vec2(37.0, 11.0), u_grainSeed) - 0.5) * chroma;

  color.r += noiseStrength * (1.0 + cR);
  color.g += noiseStrength * (1.0 + cG);
  color.b += noiseStrength * (1.0 + cB);

  return clamp(color, 0.0, 1.0);
}

vec3 applyDefects(vec3 color) {
  if (u_defectsStrength <= 0.0) {
    return color;
  }

  float leakProb = u_defects.x * u_defectsStrength;
  float leakStrength = u_defects.y * u_defectsStrength;
  float dustAmount = u_defects.z * u_defectsStrength;
  float scratchAmount = u_defects.w * u_defectsStrength;

  float leakGate = step(hash12(vec2(13.0, 17.0), u_defectsSeed), leakProb);
  vec2 leakCenter = vec2(
    mix(-0.2, 1.2, hash12(vec2(7.0, 11.0), u_defectsSeed)),
    mix(-0.2, 1.2, hash12(vec2(19.0, 23.0), u_defectsSeed))
  );
  float leak = clamp(1.0 - distance(v_uv, leakCenter) * 1.2, 0.0, 1.0) * leakGate;

  color.r += leak * leakStrength * 0.34;
  color.g += leak * leakStrength * 0.16;
  color.b += leak * leakStrength * 0.05;

  float dustNoise = hash12(floor(v_uv * vec2(1200.0)), u_defectsSeed);
  float dustMask = step(1.0 - dustAmount * 0.08, dustNoise);
  float dustSign = step(0.5, hash12(floor(v_uv * vec2(1400.0)) + vec2(3.0, 9.0), u_defectsSeed)) * 2.0 - 1.0;
  color += vec3(dustMask * dustSign * 0.12 * dustAmount);

  float scratchGate = step(1.0 - scratchAmount * 0.06, hash12(vec2(floor(v_uv.x * 420.0), 29.0), u_defectsSeed));
  float scratchLine = smoothstep(0.02, 0.0, abs(fract(v_uv.x * 160.0 + hash12(vec2(43.0, 53.0), u_defectsSeed) * 0.7) - 0.5));
  float scratchSign = step(0.5, hash12(vec2(floor(v_uv.y * 360.0), 61.0), u_defectsSeed)) * 2.0 - 1.0;
  color += vec3(scratchGate * scratchLine * scratchSign * 0.09 * scratchAmount);

  return clamp(color, 0.0, 1.0);
}

void main() {
  vec3 color = texture(u_texture, v_uv).rgb;
  color = applyColorScience(color);
  color = applyTone(color);
  color = applyScan(color);
  color = applyGrain(color);
  color = applyDefects(color);
  outColor = vec4(color, 1.0);
}
`;

type UniformLocationMap = Record<string, WebGLUniformLocation | null>;

interface FilmUniforms {
  grainSeed: number;
  defectsSeed: number;
  colorAmount: number;
  lutMix: number;
  lutEnabled: number;
  lutSize: number;
  rgbMix: [number, number, number];
  temperatureShift: number;
  tintShift: number;
  toneStrength: number;
  toneMain: [number, number, number, number];
  toneExt: [number, number, number, number];
  toneCurveMid: [number, number];
  scanStrength: number;
  scanMain: [number, number, number, number];
  scanExtra: [number, number];
  grainStrength: number;
  grain: [number, number, number, number];
  shadowBoost: number;
  defectsStrength: number;
  defects: [number, number, number, number];
}

interface RenderFilmWebGL2Options {
  seedKey?: string;
  seedSalt?: number;
  renderSeed?: number;
  exportSeed?: number;
  lutAsset?: Pick<LutAsset, "id" | "size" | "data"> | null;
}

const resolveFilmUniforms = (
  profile: FilmProfile,
  options: RenderFilmWebGL2Options
): FilmUniforms => {
  const normalized = normalizeFilmProfile(profile);
  const color = getFilmModule(normalized, "colorScience");
  const tone = getFilmModule(normalized, "tone");
  const scan = getFilmModule(normalized, "scan");
  const grain = getFilmModule(normalized, "grain");
  const defects = getFilmModule(normalized, "defects");

  const colorAmount = color && color.enabled ? clamp(color.amount / 100, 0, 1) : 0;
  const lutMix = colorAmount * (color?.params.lutStrength ?? 0);
  const hasLut =
    featureFlags.enableCubeLut &&
    Boolean(color?.params.lutAssetId) &&
    Boolean(options.lutAsset);
  const toneStrength = tone && tone.enabled ? clamp(tone.amount / 100, 0, 1) : 0;
  const scanStrength = scan && scan.enabled ? clamp(scan.amount / 100, 0, 1) : 0;
  const grainStrength = grain && grain.enabled ? clamp(grain.amount / 100, 0, 1) : 0;
  const defectsStrength =
    defects && defects.enabled ? clamp(defects.amount / 100, 0, 1) : 0;

  return {
    grainSeed: grain
      ? resolveModuleSeed(grain, options)
      : resolveModuleSeed(
          { id: "grain", seedMode: "perAsset", seed: undefined },
          options
        ),
    defectsSeed: defects
      ? resolveModuleSeed(defects, options)
      : resolveModuleSeed(
          { id: "defects", seedMode: "perAsset", seed: undefined },
          options
        ),
    colorAmount,
    lutMix,
    lutEnabled: hasLut ? 1 : 0,
    lutSize: options.lutAsset?.size ?? 1,
    rgbMix: color?.params.rgbMix ?? [1, 1, 1],
    temperatureShift: color?.params.temperatureShift ?? 0,
    tintShift: color?.params.tintShift ?? 0,
    toneStrength,
    toneMain: [
      tone?.params.exposure ?? 0,
      tone?.params.contrast ?? 0,
      tone?.params.highlights ?? 0,
      tone?.params.shadows ?? 0,
    ],
    toneExt: [
      tone?.params.whites ?? 0,
      tone?.params.blacks ?? 0,
      tone?.params.curveHighlights ?? 0,
      tone?.params.curveShadows ?? 0,
    ],
    toneCurveMid: [tone?.params.curveLights ?? 0, tone?.params.curveDarks ?? 0],
    scanStrength,
    scanMain: [
      scan?.params.halationThreshold ?? 0.88,
      scan?.params.halationAmount ?? 0,
      scan?.params.bloomThreshold ?? 0.82,
      scan?.params.bloomAmount ?? 0,
    ],
    scanExtra: [scan?.params.vignetteAmount ?? 0, scan?.params.scanWarmth ?? 0],
    grainStrength,
    grain: [
      grain?.params.amount ?? 0,
      grain?.params.size ?? 0.5,
      grain?.params.roughness ?? 0.5,
      grain?.params.color ?? 0.08,
    ],
    shadowBoost: grain?.params.shadowBoost ?? 0.45,
    defectsStrength,
    defects: [
      defects?.params.leakProbability ?? 0,
      defects?.params.leakStrength ?? 0,
      defects?.params.dustAmount ?? 0,
      defects?.params.scratchAmount ?? 0,
    ],
  };
};

class WebGLFilmRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private texture: WebGLTexture;
  private lutTexture: WebGLTexture;
  private lastLutCacheKey: string | null = null;
  private attribPosition: number;
  private uniforms: UniformLocationMap;

  constructor() {
    this.canvas = document.createElement("canvas");
    const gl = this.canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      premultipliedAlpha: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      throw new Error("WebGL2 is not available.");
    }
    this.gl = gl;

    const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
    this.program = this.createProgram(vertexShader, fragmentShader);

    const positionBuffer = gl.createBuffer();
    if (!positionBuffer) {
      throw new Error("Failed to create position buffer.");
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    this.attribPosition = gl.getAttribLocation(this.program, "a_position");
    gl.useProgram(this.program);
    gl.enableVertexAttribArray(this.attribPosition);
    gl.vertexAttribPointer(this.attribPosition, 2, gl.FLOAT, false, 0, 0);

    const texture = gl.createTexture();
    if (!texture) {
      throw new Error("Failed to create texture.");
    }
    this.texture = texture;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const lutTexture = gl.createTexture();
    if (!lutTexture) {
      throw new Error("Failed to create LUT texture.");
    }
    this.lutTexture = lutTexture;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTexture);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.uniforms = {
      u_texture: gl.getUniformLocation(this.program, "u_texture"),
      u_lutTexture: gl.getUniformLocation(this.program, "u_lutTexture"),
      u_texel: gl.getUniformLocation(this.program, "u_texel"),
      u_grainSeed: gl.getUniformLocation(this.program, "u_grainSeed"),
      u_defectsSeed: gl.getUniformLocation(this.program, "u_defectsSeed"),
      u_colorAmount: gl.getUniformLocation(this.program, "u_colorAmount"),
      u_lutMix: gl.getUniformLocation(this.program, "u_lutMix"),
      u_lutEnabled: gl.getUniformLocation(this.program, "u_lutEnabled"),
      u_lutSize: gl.getUniformLocation(this.program, "u_lutSize"),
      u_rgbMix: gl.getUniformLocation(this.program, "u_rgbMix"),
      u_tempShift: gl.getUniformLocation(this.program, "u_tempShift"),
      u_tintShift: gl.getUniformLocation(this.program, "u_tintShift"),
      u_toneStrength: gl.getUniformLocation(this.program, "u_toneStrength"),
      u_toneMain: gl.getUniformLocation(this.program, "u_toneMain"),
      u_toneExt: gl.getUniformLocation(this.program, "u_toneExt"),
      u_toneCurveMid: gl.getUniformLocation(this.program, "u_toneCurveMid"),
      u_scanStrength: gl.getUniformLocation(this.program, "u_scanStrength"),
      u_scanMain: gl.getUniformLocation(this.program, "u_scanMain"),
      u_scanExtra: gl.getUniformLocation(this.program, "u_scanExtra"),
      u_grainStrength: gl.getUniformLocation(this.program, "u_grainStrength"),
      u_grain: gl.getUniformLocation(this.program, "u_grain"),
      u_shadowBoost: gl.getUniformLocation(this.program, "u_shadowBoost"),
      u_defectsStrength: gl.getUniformLocation(this.program, "u_defectsStrength"),
      u_defects: gl.getUniformLocation(this.program, "u_defects"),
    };

    gl.uniform1i(this.uniforms.u_texture, 0);
    gl.uniform1i(this.uniforms.u_lutTexture, 1);
  }

  private createShader(type: number, source: string) {
    const shader = this.gl.createShader(type);
    if (!shader) {
      throw new Error("Failed to create shader.");
    }
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const info = this.gl.getShaderInfoLog(shader);
      this.gl.deleteShader(shader);
      throw new Error(`Shader compilation failed: ${info ?? "unknown"}`);
    }
    return shader;
  }

  private createProgram(vertexShader: WebGLShader, fragmentShader: WebGLShader) {
    const program = this.gl.createProgram();
    if (!program) {
      throw new Error("Failed to create WebGL program.");
    }
    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const info = this.gl.getProgramInfoLog(program);
      this.gl.deleteProgram(program);
      throw new Error(`Program link failed: ${info ?? "unknown"}`);
    }
    return program;
  }

  private ensureSize(width: number, height: number) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  private uploadLutTexture(
    lutAsset?: Pick<LutAsset, "id" | "size" | "data"> | null
  ) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTexture);

    if (!lutAsset || !featureFlags.enableCubeLut) {
      this.lastLutCacheKey = null;
      return;
    }

    const cacheKey = `${lutAsset.id}:${lutAsset.size}:${lutAsset.data.length}`;
    if (this.lastLutCacheKey === cacheKey) {
      return;
    }

    const lutPixels = new Uint8Array(lutAsset.data.length);
    for (let index = 0; index < lutAsset.data.length; index += 1) {
      const value = Math.max(0, Math.min(1, lutAsset.data[index] ?? 0));
      lutPixels[index] = Math.round(value * 255);
    }

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.RGB8,
      lutAsset.size,
      lutAsset.size,
      lutAsset.size,
      0,
      gl.RGB,
      gl.UNSIGNED_BYTE,
      lutPixels
    );
    this.lastLutCacheKey = cacheKey;
  }

  private setUniforms(uniforms: FilmUniforms) {
    const gl = this.gl;
    gl.uniform1f(this.uniforms.u_grainSeed, uniforms.grainSeed);
    gl.uniform1f(this.uniforms.u_defectsSeed, uniforms.defectsSeed);
    gl.uniform1f(this.uniforms.u_colorAmount, uniforms.colorAmount);
    gl.uniform1f(this.uniforms.u_lutMix, uniforms.lutMix);
    gl.uniform1f(this.uniforms.u_lutEnabled, uniforms.lutEnabled);
    gl.uniform1f(this.uniforms.u_lutSize, uniforms.lutSize);
    gl.uniform3f(this.uniforms.u_rgbMix, ...uniforms.rgbMix);
    gl.uniform1f(this.uniforms.u_tempShift, uniforms.temperatureShift);
    gl.uniform1f(this.uniforms.u_tintShift, uniforms.tintShift);

    gl.uniform1f(this.uniforms.u_toneStrength, uniforms.toneStrength);
    gl.uniform4f(this.uniforms.u_toneMain, ...uniforms.toneMain);
    gl.uniform4f(this.uniforms.u_toneExt, ...uniforms.toneExt);
    gl.uniform2f(this.uniforms.u_toneCurveMid, ...uniforms.toneCurveMid);

    gl.uniform1f(this.uniforms.u_scanStrength, uniforms.scanStrength);
    gl.uniform4f(this.uniforms.u_scanMain, ...uniforms.scanMain);
    gl.uniform2f(this.uniforms.u_scanExtra, ...uniforms.scanExtra);

    gl.uniform1f(this.uniforms.u_grainStrength, uniforms.grainStrength);
    gl.uniform4f(this.uniforms.u_grain, ...uniforms.grain);
    gl.uniform1f(this.uniforms.u_shadowBoost, uniforms.shadowBoost);

    gl.uniform1f(this.uniforms.u_defectsStrength, uniforms.defectsStrength);
    gl.uniform4f(this.uniforms.u_defects, ...uniforms.defects);
  }

  render(source: CanvasImageSource, profile: FilmProfile, options: RenderFilmWebGL2Options) {
    const width = (source as HTMLCanvasElement).width;
    const height = (source as HTMLCanvasElement).height;
    if (!width || !height) {
      return null;
    }

    this.ensureSize(width, height);
    const uniforms = resolveFilmUniforms(profile, options);
    const gl = this.gl;

    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);

    this.uploadLutTexture(options.lutAsset);
    gl.uniform2f(this.uniforms.u_texel, 1 / width, 1 / height);
    this.setUniforms(uniforms);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return this.canvas;
  }
}

let renderer: WebGLFilmRenderer | null = null;
let unavailable = false;

export const isWebGL2FilmAvailable = () => {
  if (unavailable || typeof document === "undefined") {
    return false;
  }
  if (renderer) {
    return true;
  }
  const probe = document.createElement("canvas");
  const gl = probe.getContext("webgl2");
  if (!gl) {
    unavailable = true;
    return false;
  }
  return true;
};

export const renderFilmProfileWebGL2 = (
  sourceCanvas: HTMLCanvasElement,
  profile: FilmProfile,
  options: RenderFilmWebGL2Options = {}
) => {
  if (!isWebGL2FilmAvailable()) {
    return null;
  }

  try {
    if (!renderer) {
      renderer = new WebGLFilmRenderer();
    }
    return renderer.render(sourceCanvas, profile, options);
  } catch {
    unavailable = true;
    return null;
  }
};
