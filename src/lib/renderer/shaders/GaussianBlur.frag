#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;

// Blur direction: (1/width, 0) for horizontal, (0, 1/height) for vertical
uniform vec2 u_blurDirection;
// Blur radius in pixels (maps to kernel spread)
uniform float u_blurRadius;

// 13-tap Gaussian blur with weights pre-computed for sigma ~= 2.5.
// Offsets are scaled by u_blurDirection to work for both H and V passes.
// For larger radii, we space samples further apart (scaled by radius).

void main() {
  // Gaussian weights for a 13-tap kernel (sigma = 2.5, normalized)
  const float weight0 = 0.1610;
  const float weight1 = 0.1486;
  const float weight2 = 0.1169;
  const float weight3 = 0.0784;
  const float weight4 = 0.0448;
  const float weight5 = 0.0218;
  const float weight6 = 0.0090;

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

  result += texture(uSampler, vTextureCoord + step * 5.0) * weight5;
  result += texture(uSampler, vTextureCoord - step * 5.0) * weight5;

  result += texture(uSampler, vTextureCoord + step * 6.0) * weight6;
  result += texture(uSampler, vTextureCoord - step * 6.0) * weight6;

  outColor = result;
}
