#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform bool u_printToningEnabled;
uniform vec3 u_toningShadows;
uniform vec3 u_toningMidtones;
uniform vec3 u_toningHighlights;
uniform float u_toningStrength;

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 color = sampled.rgb;

  if (u_printToningEnabled && u_toningStrength > 0.001) {
    float lum = max(luminance(color), 0.0);
    float lumNorm = lum / (1.0 + lum);
    float shadowMask = 1.0 - smoothstep(0.0, 0.36, lumNorm);
    float highlightMask = smoothstep(0.44, 0.86, lumNorm);
    float midMask = clamp(1.0 - shadowMask - highlightMask, 0.0, 1.0);
    float highlightEnergy = 1.0 + log2(1.0 + max(lum - 1.0, 0.0)) * 0.3;

    vec3 tone =
      u_toningShadows * shadowMask +
      u_toningMidtones * midMask +
      u_toningHighlights * highlightMask * highlightEnergy;
    color += tone * clamp(u_toningStrength, 0.0, 1.0);
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
