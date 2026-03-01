#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform bool u_cmyColorHeadEnabled;
uniform float u_cyan;
uniform float u_magenta;
uniform float u_yellow;

void main() {
  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 color = sampled.rgb;

  if (u_cmyColorHeadEnabled) {
    float cyan = clamp(u_cyan, -1.0, 1.0);
    float magenta = clamp(u_magenta, -1.0, 1.0);
    float yellow = clamp(u_yellow, -1.0, 1.0);

    color.r *= (1.0 - cyan * 0.42);
    color.g *= (1.0 - magenta * 0.42);
    color.b *= (1.0 - yellow * 0.42);
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
