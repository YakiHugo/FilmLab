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

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
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
    vec4 noiseSample = texture(u_blueNoise, noiseUv);

    float coarse = noiseSample.r - 0.5;
    float fine = noiseSample.g - 0.5;
    float mixed = mix(coarse, fine, clamp(u_grainRoughness, 0.0, 1.0));

    float lum = max(luminance(color), 0.0);
    float lumCompressed = lum / (1.0 + lum);
    float shadowWeight = 1.0 + (1.0 - lumCompressed) * u_grainShadowBias;
    float blackFloorMask = smoothstep(0.003, 0.03, lum);
    float highlightWeight = 1.0 / (1.0 + max(lum - 1.0, 0.0) * 0.55);
    float noiseStrength = mixed * u_grainAmount * 0.55 * shadowWeight;
    noiseStrength *= blackFloorMask * highlightWeight;

    if (u_grainIsColor) {
      float blueChannelNoise = hash12(noiseUv * 127.0 + vec2(0.31, 0.67)) - 0.5;
      vec3 colorOffset = vec3(
        noiseSample.b - 0.5,
        noiseSample.a - 0.5,
        blueChannelNoise
      );
      vec3 channelGain = vec3(1.0) + colorOffset * vec3(0.14, 0.14, 0.17);
      color += noiseStrength * channelGain;
    } else {
      color += vec3(noiseStrength);
    }
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
