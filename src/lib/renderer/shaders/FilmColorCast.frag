#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform bool u_colorCastEnabled;
uniform vec3 u_colorCastShadows;
uniform vec3 u_colorCastMidtones;
uniform vec3 u_colorCastHighlights;

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 color = sampled.rgb;

  if (u_colorCastEnabled) {
    float lum = max(luminance(color), 0.0);
    float lumNorm = lum / (1.0 + lum);
    float shMask = 1.0 - smoothstep(0.0, 0.34, lumNorm);
    float hiMask = smoothstep(0.46, 0.86, lumNorm);
    float midMask = clamp(1.0 - shMask - hiMask, 0.0, 1.0);
    float highlightEnergy = 1.0 + log2(1.0 + max(lum - 1.0, 0.0)) * 0.35;

    color += u_colorCastShadows * shMask
      + u_colorCastMidtones * midMask
      + u_colorCastHighlights * hiMask * highlightEnergy;
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
