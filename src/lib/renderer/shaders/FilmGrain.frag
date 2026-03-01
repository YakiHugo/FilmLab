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

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 color = sampled.rgb;

  if (u_grainEnabled && u_grainAmount > 0.0) {
    float grainScale = mix(3.0, 0.55, u_grainSize);
    vec2 seedOffset = vec2(
      fract(u_grainSeed * 0.000123),
      fract(u_grainSeed * 0.000217)
    );
    vec2 noiseUv = fract((vTextureCoord * u_textureSize / 64.0) * grainScale + seedOffset);

    float coarse = texture(u_blueNoise, noiseUv).r - 0.5;
    float fine = texture(u_blueNoise, fract(noiseUv * 1.97 + vec2(0.37, 0.73))).r - 0.5;
    float mixed = mix(coarse, fine, u_grainRoughness);

    float lum = max(luminance(color), 0.0);
    float lumCompressed = lum / (1.0 + lum);
    float shadowWeight = 1.0 + (1.0 - lumCompressed) * u_grainShadowBias;
    float blackFloorMask = smoothstep(0.003, 0.03, lum);
    float highlightWeight = 1.0 / (1.0 + max(lum - 1.0, 0.0) * 0.55);
    float noiseStrength = mixed * u_grainAmount * 0.55 * shadowWeight;
    noiseStrength *= blackFloorMask * highlightWeight;

    if (u_grainIsColor) {
      float cR = (texture(u_blueNoise, fract(noiseUv * 1.07 + vec2(0.13, 0.41))).r - 0.5) * 0.14;
      float cG = (texture(u_blueNoise, fract(noiseUv * 1.23 + vec2(0.53, 0.17))).r - 0.5) * 0.14;
      float cB = (texture(u_blueNoise, fract(noiseUv * 1.51 + vec2(0.31, 0.67))).r - 0.5) * 0.17;
      color.r += noiseStrength * (1.0 + cR);
      color.g += noiseStrength * (1.0 + cG);
      color.b += noiseStrength * (1.0 + cB);
    } else {
      color += vec3(noiseStrength);
    }
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
