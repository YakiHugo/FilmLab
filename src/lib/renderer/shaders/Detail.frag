#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform bool u_enabled;
uniform vec2 u_texelSize;
uniform float u_shortEdgePx;

uniform float u_texture;
uniform float u_clarity;
uniform float u_sharpening;
uniform float u_sharpenRadius;
uniform float u_sharpenDetail;
uniform float u_masking;
uniform float u_noiseReduction;
uniform float u_colorNoiseReduction;
uniform float u_nrKernelRadius;

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

float resolveShortEdgePx() {
  if (u_shortEdgePx > 0.0) {
    return u_shortEdgePx;
  }
  float maxTexel = max(u_texelSize.x, u_texelSize.y);
  if (maxTexel <= 0.0) {
    return 1.0;
  }
  return 1.0 / maxTexel;
}

vec3 sampleCrossBlur(vec2 uv, float radiusPx) {
  vec2 dx = vec2(u_texelSize.x * radiusPx, 0.0);
  vec2 dy = vec2(0.0, u_texelSize.y * radiusPx);

  vec3 north = texture(uSampler, uv - dy).rgb;
  vec3 south = texture(uSampler, uv + dy).rgb;
  vec3 east = texture(uSampler, uv + dx).rgb;
  vec3 west = texture(uSampler, uv - dx).rgb;
  vec3 center = texture(uSampler, uv).rgb;
  return (center * 4.0 + north + south + east + west) / 8.0;
}

vec3 sampleRingBlur(vec2 uv, float radiusPx) {
  vec2 dx = vec2(u_texelSize.x * radiusPx, 0.0);
  vec2 dy = vec2(0.0, u_texelSize.y * radiusPx);
  vec2 ddx = dx * 0.70710678;
  vec2 ddy = dy * 0.70710678;

  vec3 p0 = texture(uSampler, uv + dx).rgb;
  vec3 p1 = texture(uSampler, uv - dx).rgb;
  vec3 p2 = texture(uSampler, uv + dy).rgb;
  vec3 p3 = texture(uSampler, uv - dy).rgb;
  vec3 p4 = texture(uSampler, uv + ddx + ddy).rgb;
  vec3 p5 = texture(uSampler, uv + ddx - ddy).rgb;
  vec3 p6 = texture(uSampler, uv - ddx + ddy).rgb;
  vec3 p7 = texture(uSampler, uv - ddx - ddy).rgb;
  return (p0 + p1 + p2 + p3 + p4 + p5 + p6 + p7) * 0.125;
}

void main() {
  vec3 center = texture(uSampler, vTextureCoord).rgb;
  if (!u_enabled) {
    outColor = vec4(center, 1.0);
    return;
  }

  float sharpenRadius = mix(0.8, 2.4, clamp(u_sharpenRadius * 0.01, 0.0, 1.0));
  float shortEdgePx = max(resolveShortEdgePx(), 1.0);
  float mediumRadiusPx = max(1.0, shortEdgePx * 0.008);
  float coarseRadiusPx = max(mediumRadiusPx + 0.5, shortEdgePx * 0.03);
  vec3 blurFine = sampleCrossBlur(vTextureCoord, sharpenRadius);
  vec3 blurMedium = sampleRingBlur(vTextureCoord, mediumRadiusPx);
  vec3 blurCoarse = sampleRingBlur(vTextureCoord, coarseRadiusPx);
  vec3 blurClarity = mix(blurMedium, blurCoarse, 0.55);

  vec3 highPassFine = center - blurFine;
  vec3 highPassCoarse = center - blurClarity;

  float lumCenter = luminance(center);
  float lumBlurFine = luminance(blurFine);
  float lumEdge = lumCenter - lumBlurFine;
  float edgeStrength = abs(lumEdge);

  vec3 color = center;

  color += highPassFine * (u_texture * 0.01) * 0.75;

  float lumCoarse = luminance(highPassCoarse);
  color += vec3(lumCoarse * (u_clarity * 0.01) * 0.95);

  float sharpen = clamp(u_sharpening * 0.01, 0.0, 1.0);
  if (sharpen > 0.0) {
    float detailGain = mix(0.55, 1.75, clamp(u_sharpenDetail * 0.01, 0.0, 1.0));
    float maskThreshold = mix(0.0, 0.28, clamp(u_masking * 0.01, 0.0, 1.0));
    float edgeMask = smoothstep(maskThreshold, maskThreshold + 0.18, edgeStrength * 4.0);
    color += highPassFine * sharpen * detailGain * edgeMask;
  }

  // Keep a mild in-pass NR blend; stronger multi-scale NR is handled by dedicated passes.
  float nrLuma = clamp(u_noiseReduction * 0.01, 0.0, 1.0) * 0.35;
  float nrChroma = clamp(u_colorNoiseReduction * 0.01, 0.0, 1.0) * 0.35;
  if (nrLuma > 0.0 || nrChroma > 0.0) {
    vec3 soft = mix(blurFine, blurMedium, 0.45);
    float lumaColor = luminance(color);
    float lumaSoft = luminance(soft);
    float flatMask = 1.0 - smoothstep(0.02, 0.14, edgeStrength * 3.0);
    float outLuma = mix(lumaColor, lumaSoft, nrLuma * flatMask);
    vec3 outChroma = mix(color - vec3(lumaColor), soft - vec3(lumaSoft), nrChroma * flatMask);
    color = vec3(outLuma) + outChroma;
  }

  outColor = vec4(max(color, vec3(0.0)), 1.0);
}
