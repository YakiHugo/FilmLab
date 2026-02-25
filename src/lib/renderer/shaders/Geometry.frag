#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;

// Crop rectangle in source UV space: (x, y, w, h)
uniform vec4 u_cropRect;
// Source texture size in pixels
uniform vec2 u_sourceSize;
// Output target size in pixels
uniform vec2 u_outputSize;
// Translation in output pixel space
uniform vec2 u_translatePx;
// Rotation in radians
uniform float u_rotate;
// Perspective correction (homography in normalized [-1, 1] space)
uniform bool u_perspectiveEnabled;
uniform mat3 u_homography;
// Scale factor
uniform float u_scale;
// Flip multipliers (-1 or 1)
uniform vec2 u_flip;
// Lens profile correction and chromatic aberration correction
uniform bool u_lensEnabled;
uniform float u_lensK1;
uniform float u_lensK2;
uniform float u_lensVignetteBoost;
uniform bool u_caEnabled;
uniform vec3 u_caAmountPxRgb;
uniform bool u_enabled;

vec2 applyLensRemap(vec2 uv, float k1, float k2) {
  vec2 p = uv * 2.0 - 1.0;
  float r2 = dot(p, p);
  float r4 = r2 * r2;
  vec2 remapped = p * (1.0 + k1 * r2 + k2 * r4);
  return remapped * 0.5 + 0.5;
}

vec2 applyHomography(vec2 uv, mat3 h) {
  vec2 p = uv * 2.0 - 1.0;
  vec3 hp = h * vec3(p, 1.0);
  float w = hp.z;
  if (abs(w) < 1.0e-5) {
    return vec2(-1.0);
  }
  vec2 mapped = hp.xy / w;
  return mapped * 0.5 + 0.5;
}

void main() {
  if (!u_enabled) {
    outColor = texture(uSampler, vTextureCoord);
    return;
  }

  vec2 outSize = max(u_outputSize, vec2(1.0));
  vec2 center = outSize * 0.5 + u_translatePx;
  vec2 pixel = vTextureCoord * outSize;
  vec2 centered = pixel - center;

  // Inverse transform: undo rotate then scale/flip.
  float c = cos(-u_rotate);
  float s = sin(-u_rotate);
  vec2 unrotated = vec2(
    centered.x * c - centered.y * s,
    centered.x * s + centered.y * c
  );

  vec2 denom = vec2(
    max(abs(u_scale * u_flip.x), 1e-5) * sign(u_scale * u_flip.x),
    max(abs(u_scale * u_flip.y), 1e-5) * sign(u_scale * u_flip.y)
  );
  vec2 local = unrotated / denom + outSize * 0.5;
  vec2 localUv = local / outSize;

  vec2 perspectiveUv = localUv;
  if (u_perspectiveEnabled) {
    perspectiveUv = applyHomography(localUv, u_homography);
  }

  vec2 opticsUv = perspectiveUv;
  if (u_lensEnabled) {
    opticsUv = applyLensRemap(perspectiveUv, u_lensK1, u_lensK2);
  }

  // Outside the transformed output quad -> black.
  if (opticsUv.x < 0.0 || opticsUv.x > 1.0 || opticsUv.y < 0.0 || opticsUv.y > 1.0) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec2 sourceUv = u_cropRect.xy + opticsUv * u_cropRect.zw;
  vec4 sampled;
  float caAmountMax = max(abs(u_caAmountPxRgb.r), max(abs(u_caAmountPxRgb.g), abs(u_caAmountPxRgb.b)));
  if (!u_caEnabled || caAmountMax <= 0.001) {
    sampled = texture(uSampler, sourceUv);
  } else {
    vec2 sourceSize = max(u_sourceSize, vec2(1.0));
    vec2 cropMin = u_cropRect.xy;
    vec2 cropMax = u_cropRect.xy + u_cropRect.zw;
    vec2 uvPerPixel = vec2(1.0) / sourceSize;
    vec2 radial = opticsUv - 0.5;
    float radialLen = length(radial);
    vec2 radialDir = radialLen > 1e-5 ? radial / radialLen : vec2(1.0, 0.0);
    vec2 caOffsetUnit = radialDir * uvPerPixel;
    vec2 sourceUvR = clamp(sourceUv + caOffsetUnit * u_caAmountPxRgb.r, cropMin, cropMax);
    vec2 sourceUvG = clamp(sourceUv + caOffsetUnit * u_caAmountPxRgb.g, cropMin, cropMax);
    vec2 sourceUvB = clamp(sourceUv + caOffsetUnit * u_caAmountPxRgb.b, cropMin, cropMax);
    vec4 c0 = texture(uSampler, sourceUv);
    vec4 cR = texture(uSampler, sourceUvR);
    vec4 cG = texture(uSampler, sourceUvG);
    vec4 cB = texture(uSampler, sourceUvB);
    sampled = vec4(cR.r, cG.g, cB.b, c0.a);
  }

  if (u_lensVignetteBoost > 0.001) {
    float edge = clamp(length(opticsUv - 0.5) * 1.41421356, 0.0, 1.0);
    edge = smoothstep(0.25, 1.0, edge);
    float lift = 1.0 + edge * edge * u_lensVignetteBoost * 0.65;
    sampled.rgb *= lift;
  }

  outColor = vec4(clamp(sampled.rgb, 0.0, 1.0), sampled.a);
}
