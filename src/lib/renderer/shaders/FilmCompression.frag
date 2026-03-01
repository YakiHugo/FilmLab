#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform bool u_filmCompressionEnabled;
uniform float u_highlightRolloff;
uniform float u_shoulderWidth;

float compressHighlightChannel(float x, float rolloff, float shoulderWidth) {
  float start = clamp(1.0 - shoulderWidth, 0.35, 0.98);
  if (x <= start) {
    return x;
  }

  float t = clamp((x - start) / max(1.0 - start, 0.001), 0.0, 4.0);
  float k = max(0.1, rolloff * 4.0 + 0.1);
  float compressed = start + (1.0 - start) * (1.0 - exp(-t * k));
  return mix(x, compressed, clamp(rolloff, 0.0, 1.0));
}

void main() {
  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 color = sampled.rgb;

  if (u_filmCompressionEnabled && u_highlightRolloff > 0.001) {
    color.r = compressHighlightChannel(color.r, u_highlightRolloff, u_shoulderWidth);
    color.g = compressHighlightChannel(color.g, u_highlightRolloff, u_shoulderWidth);
    color.b = compressHighlightChannel(color.b, u_highlightRolloff, u_shoulderWidth);
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
