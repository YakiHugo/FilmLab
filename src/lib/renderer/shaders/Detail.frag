#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform bool u_enabled;
uniform vec2 u_texelSize;

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

vec3 sampleBilateral(vec2 uv, vec3 center, float sigmaRange, int kernelRadius) {
  float sigmaSpatial = 1.65;
  float invTwoSpatialVar = 1.0 / (2.0 * sigmaSpatial * sigmaSpatial);
  float invTwoRangeVar = 1.0 / max(2.0 * sigmaRange * sigmaRange, 1.0e-5);
  float centerLum = luminance(center);

  vec3 weightedSum = vec3(0.0);
  float weightSum = 0.0;

  for (int y = -2; y <= 2; y += 1) {
    for (int x = -2; x <= 2; x += 1) {
      if (abs(x) > kernelRadius || abs(y) > kernelRadius) {
        continue;
      }
      vec2 offset = vec2(float(x), float(y)) * u_texelSize;
      vec3 sampleColor = texture(uSampler, uv + offset).rgb;

      float spatialDist2 = float(x * x + y * y);
      float spatialWeight = exp(-spatialDist2 * invTwoSpatialVar);

      float rangeDiff = luminance(sampleColor) - centerLum;
      float rangeWeight = exp(-(rangeDiff * rangeDiff) * invTwoRangeVar);

      float weight = spatialWeight * rangeWeight;
      weightedSum += sampleColor * weight;
      weightSum += weight;
    }
  }

  return weightedSum / max(weightSum, 1.0e-5);
}

void main() {
  vec3 center = texture(uSampler, vTextureCoord).rgb;
  if (!u_enabled) {
    outColor = vec4(center, 1.0);
    return;
  }

  float sharpenRadius = mix(0.8, 2.4, clamp(u_sharpenRadius * 0.01, 0.0, 1.0));
  vec3 blurFine = sampleCrossBlur(vTextureCoord, sharpenRadius);
  vec3 blurMedium = sampleRingBlur(vTextureCoord, 8.0);
  vec3 blurCoarse = sampleRingBlur(vTextureCoord, 32.0);
  vec3 blurClarity = mix(blurMedium, blurCoarse, 0.55);

  vec3 highPassFine = center - blurFine;
  vec3 highPassCoarse = center - blurClarity;

  float lumCenter = luminance(center);
  float lumBlurFine = luminance(blurFine);
  float lumEdge = lumCenter - lumBlurFine;
  float edgeStrength = abs(lumEdge);

  vec3 color = center;

  // Texture: fine-scale micro-contrast.
  color += highPassFine * (u_texture * 0.01) * 0.75;

  // Clarity: large-scale local contrast (closer to Lightroom behavior).
  float lumCoarse = luminance(highPassCoarse);
  color += vec3(lumCoarse * (u_clarity * 0.01) * 0.95);

  // Sharpening with edge masking.
  float sharpen = clamp(u_sharpening * 0.01, 0.0, 1.0);
  if (sharpen > 0.0) {
    float detailGain = mix(0.55, 1.75, clamp(u_sharpenDetail * 0.01, 0.0, 1.0));
    float maskThreshold = mix(0.0, 0.28, clamp(u_masking * 0.01, 0.0, 1.0));
    float edgeMask = smoothstep(maskThreshold, maskThreshold + 0.18, edgeStrength * 4.0);
    color += highPassFine * sharpen * detailGain * edgeMask;
  }

  // Noise reduction is stronger in flat regions, using bilateral filtering.
  float flatMask = 1.0 - smoothstep(0.02, 0.14, edgeStrength * 3.0);
  float sigmaRange = mix(0.02, 0.12, clamp(u_noiseReduction * 0.01, 0.0, 1.0));
  int kernelRadius = int(clamp(round(u_nrKernelRadius), 1.0, 2.0));
  vec3 bilateral = sampleBilateral(vTextureCoord, center, sigmaRange, kernelRadius);

  float lumaNr = clamp(u_noiseReduction * 0.01, 0.0, 1.0);
  if (lumaNr > 0.0) {
    color = mix(color, bilateral, lumaNr * 0.7 * flatMask);
  }

  float chromaNr = clamp(u_colorNoiseReduction * 0.01, 0.0, 1.0);
  if (chromaNr > 0.0) {
    float lumColor = luminance(color);
    float lumBilateral = luminance(bilateral);
    vec3 chroma = color - vec3(lumColor);
    vec3 chromaBilateral = bilateral - vec3(lumBilateral);
    chroma = mix(chroma, chromaBilateral, chromaNr * 0.8 * flatMask);
    color = vec3(lumColor) + chroma;
  }

  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
