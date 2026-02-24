// ---- Layer 5: Grain ----

vec3 applyGrain(vec3 color) {
  if (!u_grainEnabled || u_grainAmount <= 0.0) return color;

  // Blue-noise driven grain (single texture source, multi-frequency sampling).
  float grainScale = mix(3.0, 0.55, u_grainSize);
  vec2 seedOffset = vec2(
    fract(u_grainSeed * 0.000123),
    fract(u_grainSeed * 0.000217)
  );
  vec2 noiseUv = fract((vTextureCoord * u_textureSize / 64.0) * grainScale + seedOffset);

  float coarse = texture(u_blueNoise, noiseUv).r - 0.5;
  float fine = texture(u_blueNoise, fract(noiseUv * 1.97 + vec2(0.37, 0.73))).r - 0.5;
  float mixed = mix(coarse, fine, u_grainRoughness);

  float lum = clamp(luminance(color), 0.0, 1.0);
  float shadowWeight = 1.0 + (1.0 - lum) * u_grainShadowBias;
  // Suppress grain in near-pure black fill regions to avoid dirty background speckles.
  float blackFloorMask = smoothstep(0.003, 0.03, lum);
  float noiseStrength = mixed * u_grainAmount * 0.55 * shadowWeight;
  noiseStrength *= blackFloorMask;

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

  return clamp(color, 0.0, 1.0);
}
