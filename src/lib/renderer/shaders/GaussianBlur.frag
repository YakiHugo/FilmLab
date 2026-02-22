#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;

// Blur direction: (1/width, 0) for horizontal, (0, 1/height) for vertical
uniform vec2 u_blurDirection;
// Blur radius in pixels (maps to kernel spread)
uniform float u_blurRadius;

// 9-tap Gaussian blur with weights pre-computed for sigma ~= radius/3.
// Offsets are scaled by u_blurDirection to work for both H and V passes.
// For larger radii, we space samples further apart (scaled by radius).

void main() {
  // Gaussian weights for a 9-tap kernel (sigma = 1.5, normalized)
  const float weight0 = 0.2270270270;
  const float weight1 = 0.1945945946;
  const float weight2 = 0.1216216216;
  const float weight3 = 0.0540540541;
  const float weight4 = 0.0162162162;

  // Scale offsets by blur radius so larger radii spread the kernel wider
  float spread = max(u_blurRadius, 1.0);
  vec2 step = u_blurDirection * spread;

  vec4 result = texture(uSampler, vTextureCoord) * weight0;

  result += texture(uSampler, vTextureCoord + step * 1.0) * weight1;
  result += texture(uSampler, vTextureCoord - step * 1.0) * weight1;

  result += texture(uSampler, vTextureCoord + step * 2.0) * weight2;
  result += texture(uSampler, vTextureCoord - step * 2.0) * weight2;

  result += texture(uSampler, vTextureCoord + step * 3.0) * weight3;
  result += texture(uSampler, vTextureCoord - step * 3.0) * weight3;

  result += texture(uSampler, vTextureCoord + step * 4.0) * weight4;
  result += texture(uSampler, vTextureCoord - step * 4.0) * weight4;

  outColor = result;
}
