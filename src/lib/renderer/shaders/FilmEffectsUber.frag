#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform sampler2D u_damageTexture;
uniform sampler2D u_borderTexture;

uniform bool u_vignetteEnabled;
uniform float u_vignetteAmount;
uniform float u_vignetteMidpoint;
uniform float u_vignetteRoundness;
uniform float u_aspectRatio;

uniform bool u_filmBreathEnabled;
uniform float u_breathAmount;
uniform float u_breathSeed;

uniform bool u_filmDamageEnabled;
uniform float u_damageAmount;
uniform float u_damageSeed;

uniform bool u_gateWeaveEnabled;
uniform float u_gateWeaveAmount;
uniform float u_gateWeaveSeed;

uniform bool u_overscanEnabled;
uniform float u_overscanAmount;
uniform float u_overscanRoundness;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float roundedRectMask(vec2 uv, float roundness) {
  vec2 centered = abs(uv - 0.5) * 2.0;
  float corner = mix(0.02, 0.28, clamp(roundness, 0.0, 1.0));
  vec2 q = centered - vec2(1.0 - corner);
  float outside = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
  return 1.0 - smoothstep(-0.005, 0.03, outside);
}

vec2 applyGateWeave(vec2 uv, out bool outOfBounds) {
  outOfBounds = false;
  if (!u_gateWeaveEnabled || u_gateWeaveAmount <= 0.001) {
    return uv;
  }

  float amount = clamp(u_gateWeaveAmount, 0.0, 1.0);
  float seed = u_gateWeaveSeed * 0.0001;
  float offsetX = (hash12(vec2(seed, seed * 1.3)) - 0.5) * amount * 0.003;
  float offsetY = (hash12(vec2(seed * 2.1, seed)) - 0.5) * amount * 0.002;
  float rotation = (hash12(vec2(seed * 0.7, seed * 1.9)) - 0.5) * amount * 0.001;

  vec2 center = uv - 0.5;
  float c = cos(rotation);
  float s = sin(rotation);
  center = vec2(center.x * c - center.y * s, center.x * s + center.y * c);
  vec2 result = center + 0.5 + vec2(offsetX, offsetY);
  outOfBounds = result.x < 0.0 || result.x > 1.0 || result.y < 0.0 || result.y > 1.0;
  return result;
}

void main() {
  bool gateWeaveOutOfBounds = false;
  vec2 rawUv = applyGateWeave(vTextureCoord, gateWeaveOutOfBounds);
  vec2 warpedUv = clamp(rawUv, vec2(0.0), vec2(1.0));
  vec4 sampled = texture(uSampler, warpedUv);
  vec3 color = sampled.rgb;

  if (gateWeaveOutOfBounds && u_gateWeaveEnabled) {
    vec3 borderColor = u_overscanEnabled
      ? texture(u_borderTexture, fract(vTextureCoord * vec2(1.0, 1.5))).rgb * 0.08
      : vec3(0.01);
    color = mix(color, borderColor, 0.95);
  }

  if (u_filmBreathEnabled && u_breathAmount > 0.001) {
    float amount = clamp(u_breathAmount, 0.0, 1.0);
    float seed = u_breathSeed * 0.0001;
    float n0 = hash12(vec2(seed, seed * 1.7));
    float n1 = hash12(vec2(seed * 3.1, seed * 0.91));
    float n2 = hash12(vec2(seed * 1.3, seed * 2.4));

    vec2 seedOffset = vec2(fract(seed * 0.73), fract(seed * 0.37));
    vec2 spatialUv = warpedUv * 0.5 + seedOffset;
    float spatialNoise = hash12(floor(spatialUv * 4.0)) * 0.5 + 0.5;

    float exposure = (n0 - 0.5) * 0.16 * amount;
    float contrast = (n1 - 0.5) * 0.22 * amount;
    float localExposure = exposure * (0.7 + spatialNoise * 0.6);
    float localContrast = contrast * (0.8 + spatialNoise * 0.4);
    vec3 tint = vec3((n2 - 0.5) * 0.035, 0.0, (0.5 - n2) * 0.03) * amount;

    color *= exp2(localExposure);
    const float pivot = 0.18;
    color = pivot * pow(max(color / pivot, vec3(0.0)), vec3(1.0 + localContrast));
    color += tint * (0.8 + spatialNoise * 0.4);
  }

  if (u_filmDamageEnabled && u_damageAmount > 0.001) {
    float amount = clamp(u_damageAmount, 0.0, 1.0);
    vec2 seedOffset = vec2(
      fract(u_damageSeed * 0.00013),
      fract(u_damageSeed * 0.00027)
    );

    vec2 damageUv = fract(warpedUv * vec2(1.2, 1.35) + seedOffset);
    vec3 damageTex = texture(u_damageTexture, damageUv).rgb;

    float dust = smoothstep(0.92, 1.0, damageTex.r + hash12(damageUv * 127.0) * 0.12);
    float scratches = smoothstep(0.8, 1.0, abs(fract((damageUv.x + seedOffset.x) * 90.0) - 0.5) * 2.0);
    scratches *= smoothstep(0.6, 1.0, damageTex.g + hash12(damageUv.yx * 191.0) * 0.2);

    color = mix(color, color * 0.6, dust * amount * 0.55);
    color += vec3(scratches * amount * 0.11);
  }

  if (u_vignetteEnabled && abs(u_vignetteAmount) >= 0.001) {
    vec2 center = warpedUv - 0.5;
    center.x *= mix(1.0, u_aspectRatio, u_vignetteRoundness);

    float dist = length(center) * 2.0;
    float edge = smoothstep(u_vignetteMidpoint, 1.0, dist);

    if (u_vignetteAmount > 0.0) {
      float darkening = 1.0 - edge * edge * u_vignetteAmount;
      float contrastReduction = 1.0 - edge * u_vignetteAmount * 0.15;
      color = mix(vec3(0.18), color, contrastReduction) * darkening;
    } else {
      color += vec3(edge * edge * abs(u_vignetteAmount) * 0.35);
    }
  }

  if (u_overscanEnabled && u_overscanAmount > 0.001) {
    float amount = clamp(u_overscanAmount, 0.0, 1.0);
    float frameMask = roundedRectMask(vTextureCoord, u_overscanRoundness);
    float edge = 1.0 - frameMask;

    float sprocketBandLeft = 1.0 - smoothstep(0.02, 0.035, vTextureCoord.x);
    float sprocketBandRight = smoothstep(0.965, 0.98, vTextureCoord.x);
    float holeLeft = 1.0 - smoothstep(0.08, 0.12, abs(fract(vTextureCoord.y * 8.0) - 0.5));
    float holeRight =
      1.0 - smoothstep(0.08, 0.12, abs(fract(vTextureCoord.y * 8.0 + 0.5) - 0.5));
    float sprocketLeft = sprocketBandLeft * holeLeft;
    float sprocketRight = sprocketBandRight * holeRight;
    float sprocketMask = clamp(sprocketLeft + sprocketRight, 0.0, 1.0);

    vec3 borderTex = texture(u_borderTexture, fract(vTextureCoord * vec2(1.0, 1.5))).rgb;
    vec3 borderColor = mix(vec3(0.015), borderTex * 0.12, 0.45);

    color = mix(color, borderColor, edge * amount * 0.92);
    color = mix(color, vec3(0.0), sprocketMask * amount * 0.8);
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
