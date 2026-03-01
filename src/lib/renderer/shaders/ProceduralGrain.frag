#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform bool u_grainEnabled;
uniform float u_grainAmount;
uniform float u_grainSize;
uniform float u_grainRoughness;
uniform float u_grainShadowBias;
uniform float u_grainSeed;
uniform bool u_grainIsColor;
uniform vec2 u_textureSize;
uniform sampler2D u_blueNoise;

uniform float u_grainModel;
uniform float u_crystalDensity;
uniform float u_crystalSizeMean;
uniform float u_crystalSizeVariance;
uniform vec3 u_grainColorSeparation;
uniform float u_scannerMTF;
uniform float u_filmFormat;

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float grainFromBlueNoise(vec2 uv, float grainScale, float roughness, vec2 seedOffset) {
  vec2 noiseUv = fract((uv * u_textureSize / 64.0) * grainScale + seedOffset);
  float coarse = texture(u_blueNoise, noiseUv).r - 0.5;
  float fine = texture(u_blueNoise, fract(noiseUv * 1.97 + vec2(0.37, 0.73))).r - 0.5;
  return mix(coarse, fine, roughness);
}

float crystalCell(vec2 uv, float cellScale, float variance, float seed) {
  vec2 grid = uv * cellScale;
  vec2 base = floor(grid);
  vec2 fracPart = fract(grid);
  float minDist = 10.0;

  for (int y = -1; y <= 1; y += 1) {
    for (int x = -1; x <= 1; x += 1) {
      vec2 offset = vec2(float(x), float(y));
      vec2 cell = base + offset;
      float jitterX = hash12(cell + vec2(seed, seed * 0.61));
      float jitterY = hash12(cell.yx + vec2(seed * 0.37, seed * 0.91));
      vec2 point = offset + vec2(jitterX, jitterY);
      vec2 delta = point - fracPart;
      minDist = min(minDist, dot(delta, delta));
    }
  }

  float softness = mix(0.8, 3.0, clamp(variance, 0.0, 1.0));
  return exp(-minDist * softness) - 0.5;
}

float proceduralGrain(vec2 uv, float density, float sizeMean, float sizeVariance, float seed) {
  float formatScale = mix(2.6, 0.75, clamp(u_filmFormat / 3.0, 0.0, 1.0));
  float densityScale = mix(4.0, 16.0, clamp(density, 0.0, 1.0)) * formatScale;
  float sizeScale = mix(1.8, 0.55, clamp(sizeMean, 0.0, 1.0));
  return crystalCell(uv * sizeScale, densityScale, sizeVariance, seed);
}

void main() {
  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 color = sampled.rgb;

  if (u_grainEnabled && u_grainAmount > 0.0) {
    float lum = max(luminance(color), 0.0);
    float lumCompressed = lum / (1.0 + lum);
    float shadowWeight = 1.0 + (1.0 - lumCompressed) * u_grainShadowBias;
    float blackFloorMask = smoothstep(0.003, 0.03, lum);
    float highlightWeight = 1.0 / (1.0 + max(lum - 1.0, 0.0) * 0.55);
    float mtf = mix(0.75, 1.3, clamp(u_scannerMTF, 0.0, 1.0));

    float grainScale = mix(3.0, 0.55, u_grainSize);
    vec2 seedOffset = vec2(
      fract(u_grainSeed * 0.000123),
      fract(u_grainSeed * 0.000217)
    );

    float monoNoise = 0.0;
    if (u_grainModel < 0.5) {
      monoNoise = grainFromBlueNoise(vTextureCoord, grainScale, u_grainRoughness, seedOffset);
    } else {
      monoNoise = proceduralGrain(
        vTextureCoord + seedOffset,
        u_crystalDensity,
        u_crystalSizeMean,
        u_crystalSizeVariance,
        u_grainSeed * 0.000013
      );
      monoNoise = mix(monoNoise, grainFromBlueNoise(vTextureCoord, grainScale, 0.5, seedOffset), 0.2);
    }

    float noiseStrength = monoNoise * u_grainAmount * 0.6 * shadowWeight * mtf;
    noiseStrength *= blackFloorMask * highlightWeight;

    if (u_grainIsColor) {
      vec3 separation = max(u_grainColorSeparation, vec3(0.001));
      float nR = monoNoise + hash12(vTextureCoord * u_textureSize * 0.47 + vec2(seedOffset.x, 0.13)) - 0.5;
      float nG = monoNoise + hash12(vTextureCoord * u_textureSize * 0.53 + vec2(seedOffset.y, 0.37)) - 0.5;
      float nB = monoNoise + hash12(vTextureCoord * u_textureSize * 0.61 + vec2(0.71, seedOffset.x)) - 0.5;
      vec3 rgbNoise = vec3(nR, nG, nB) * vec3(0.42) * separation;
      color += rgbNoise * (u_grainAmount * shadowWeight * blackFloorMask * highlightWeight);
    } else {
      color += vec3(noiseStrength);
    }
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
