#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform bool u_glowEnabled;
uniform float u_glowIntensity;
uniform float u_glowMidtoneFocus;
uniform float u_glowBias;

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec3 color = texture(uSampler, vTextureCoord).rgb;
  if (!u_glowEnabled || u_glowIntensity <= 0.001) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  float lum = max(luminance(max(color, vec3(0.0))), 0.0);
  float lumNorm = lum / (1.0 + lum);
  float focus = clamp(u_glowMidtoneFocus, 0.0, 1.0);
  float sigma = mix(0.08, 0.36, clamp(u_glowBias, 0.0, 1.0));
  float midtoneMask = exp(-pow((lumNorm - focus) / max(sigma, 0.03), 2.0));
  float highlightMask = smoothstep(max(0.0, focus * 0.45), 0.95, lumNorm);
  float highlightEnergy = 1.0 + log2(1.0 + max(lum - 1.0, 0.0)) * (0.35 + 0.4 * clamp(u_glowBias, 0.0, 1.0));
  float mask = clamp(midtoneMask * 0.72 + highlightMask * 0.58 * highlightEnergy, 0.0, 4.0);

  outColor = vec4(color * mask, 1.0);
}
