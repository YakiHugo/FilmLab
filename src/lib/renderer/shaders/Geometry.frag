#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;

// Crop rectangle in source UV space: (x, y, w, h)
uniform vec4 u_cropRect;
// Output target size in pixels
uniform vec2 u_outputSize;
// Translation in output pixel space
uniform vec2 u_translatePx;
// Rotation in radians
uniform float u_rotate;
// Scale factor
uniform float u_scale;
// Flip multipliers (-1 or 1)
uniform vec2 u_flip;
uniform bool u_enabled;

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

  // Outside the transformed output quad -> black.
  if (localUv.x < 0.0 || localUv.x > 1.0 || localUv.y < 0.0 || localUv.y > 1.0) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec2 sourceUv = u_cropRect.xy + localUv * u_cropRect.zw;
  outColor = texture(uSampler, sourceUv);
}
