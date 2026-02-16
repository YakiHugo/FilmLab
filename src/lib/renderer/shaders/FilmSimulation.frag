#version 300 es
precision highp float;
precision highp sampler3D;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;     // Master Pass output
uniform sampler3D u_lut;        // 3D LUT texture

// Layer 1: Tone Response
uniform bool  u_toneEnabled;
uniform float u_shoulder;       // [0, 1]
uniform float u_toe;            // [0, 1]
uniform float u_gamma;          // [0.5, 2.0]

// Layer 3: LUT
uniform bool  u_lutEnabled;
uniform float u_lutIntensity;   // [0, 1]

// Layer 4: Color Cast (per-zone tinting)
uniform bool  u_colorCastEnabled;
uniform vec3  u_colorCastShadows;    // RGB offset for shadows
uniform vec3  u_colorCastMidtones;   // RGB offset for midtones
uniform vec3  u_colorCastHighlights; // RGB offset for highlights

// Layer 6: Grain
uniform bool  u_grainEnabled;
uniform float u_grainAmount;
uniform float u_grainSize;
uniform float u_grainRoughness;
uniform float u_grainShadowBias;
uniform float u_grainSeed;
uniform bool  u_grainIsColor;

// Layer 6: Vignette
uniform bool  u_vignetteEnabled;
uniform float u_vignetteAmount;
uniform float u_vignetteMidpoint;
uniform float u_vignetteRoundness;

// ---- Utility ----

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

float hash12(vec2 p, float seed) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33 + seed * 0.000001);
  return fract((p3.x + p3.y) * p3.z);
}

// ---- Layer 1: Film tone response curve ----

vec3 applyToneResponse(vec3 color) {
  if (!u_toneEnabled) return color;

  // Filmic S-curve: shoulder controls highlight compression, toe controls shadow lift
  color = pow(max(color, vec3(0.0)), vec3(u_gamma));

  // Shoulder: soft-clip highlights
  vec3 shoulderCurve = 1.0 - exp(-color / max(u_shoulder, 0.01));
  color = mix(color, shoulderCurve, u_shoulder);

  // Toe: lift shadows
  vec3 toeCurve = pow(max(color, vec3(0.0)), vec3(1.0 - u_toe * 0.5));
  color = mix(color, toeCurve, u_toe);

  return clamp(color, 0.0, 1.0);
}

// ---- Layer 3: 3D LUT sampling ----

vec3 applyLUT(vec3 color) {
  if (!u_lutEnabled || u_lutIntensity <= 0.0) return color;
  vec3 lutColor = texture(u_lut, clamp(color, 0.0, 1.0)).rgb;
  return mix(color, lutColor, u_lutIntensity);
}

// ---- Layer 4: Color Cast ----

vec3 applyColorCast(vec3 color) {
  if (!u_colorCastEnabled) return color;

  float lum = luminance(color);
  // Smooth masks for shadow / midtone / highlight regions
  float shMask = 1.0 - smoothstep(0.0, 0.4, lum);
  float hiMask = smoothstep(0.6, 1.0, lum);
  float midMask = 1.0 - shMask - hiMask;

  color += u_colorCastShadows * shMask
         + u_colorCastMidtones * midMask
         + u_colorCastHighlights * hiMask;

  return clamp(color, 0.0, 1.0);
}

// ---- Layer 6: Grain ----

vec3 applyGrain(vec3 color) {
  if (!u_grainEnabled || u_grainAmount <= 0.0) return color;

  float grainScale = mix(2.8, 0.45, u_grainSize);
  vec2 grainCoord = floor(vTextureCoord * vec2(1800.0) * grainScale);

  float coarse = hash12(grainCoord, u_grainSeed) - 0.5;
  float fine = hash12(vTextureCoord * vec2(3600.0), u_grainSeed + 1.0) - 0.5;
  float mixed = mix(coarse, fine, u_grainRoughness);

  float lum = luminance(color);
  float shadowWeight = 1.0 + (1.0 - lum) * u_grainShadowBias;
  float noiseStrength = mixed * u_grainAmount * 0.55 * shadowWeight;

  if (u_grainIsColor) {
    float cR = (hash12(vTextureCoord * vec2(2100.0), u_grainSeed + 2.0) - 0.5) * 0.15;
    float cG = (hash12(vTextureCoord * vec2(2200.0), u_grainSeed + 3.0) - 0.5) * 0.15;
    float cB = (hash12(vTextureCoord * vec2(2300.0), u_grainSeed + 4.0) - 0.5) * 0.15;
    color.r += noiseStrength * (1.0 + cR);
    color.g += noiseStrength * (1.0 + cG);
    color.b += noiseStrength * (1.0 + cB);
  } else {
    color += vec3(noiseStrength);
  }

  return clamp(color, 0.0, 1.0);
}

// ---- Layer 6: Vignette ----

vec3 applyVignette(vec3 color) {
  if (!u_vignetteEnabled || abs(u_vignetteAmount) < 0.001) return color;

  vec2 center = vTextureCoord - 0.5;
  // roundness controls ellipse shape
  float aspect = 1.0; // TODO: pass actual aspect ratio via uniform
  center.x *= mix(1.0, aspect, u_vignetteRoundness);

  float dist = length(center) * 2.0;
  float edge = smoothstep(u_vignetteMidpoint, 1.0, dist);

  if (u_vignetteAmount > 0.0) {
    color *= 1.0 - edge * edge * u_vignetteAmount;
  } else {
    color += vec3(edge * edge * abs(u_vignetteAmount) * 0.35);
  }

  return clamp(color, 0.0, 1.0);
}

// ---- Main ----

void main() {
  vec3 color = texture(uSampler, vTextureCoord).rgb;

  color = applyToneResponse(color);
  color = applyLUT(color);
  color = applyColorCast(color);
  color = applyGrain(color);
  color = applyVignette(color);

  outColor = vec4(color, 1.0);
}
