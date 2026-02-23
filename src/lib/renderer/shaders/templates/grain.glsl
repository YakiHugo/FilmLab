// ---- Layer 5: Grain ----

vec3 applyGrain(vec3 color) {
  if (!u_grainEnabled || u_grainAmount <= 0.0) return color;

  float grainScale = mix(2.8, 0.45, u_grainSize);
  vec2 grainCoord = floor(vTextureCoord * u_textureSize * grainScale);

  float coarse = hash12(grainCoord, u_grainSeed) - 0.5;
  float fine = hash12(vTextureCoord * u_textureSize * 2.0, u_grainSeed + 1.0) - 0.5;
  float mixed = mix(coarse, fine, u_grainRoughness);

  float lum = luminance(color);
  float shadowWeight = 1.0 + (1.0 - lum) * u_grainShadowBias;
  float noiseStrength = mixed * u_grainAmount * 0.55 * shadowWeight;

  if (u_grainIsColor) {
    float cR = (hash12(vTextureCoord * u_textureSize * 1.17, u_grainSeed + 2.0) - 0.5) * 0.15;
    float cG = (hash12(vTextureCoord * u_textureSize * 1.22, u_grainSeed + 3.0) - 0.5) * 0.15;
    float cB = (hash12(vTextureCoord * u_textureSize * 1.28, u_grainSeed + 4.0) - 0.5) * 0.15;
    color.r += noiseStrength * (1.0 + cR);
    color.g += noiseStrength * (1.0 + cG);
    color.b += noiseStrength * (1.0 + cB);
  } else {
    color += vec3(noiseStrength);
  }

  return clamp(color, 0.0, 1.0);
}
