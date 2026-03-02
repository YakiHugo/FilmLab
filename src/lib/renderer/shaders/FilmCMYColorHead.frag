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
    float cyan = sign(u_cyan) * pow(abs(clamp(u_cyan, -1.0, 1.0)), 0.9);
    float magenta = sign(u_magenta) * pow(abs(clamp(u_magenta, -1.0, 1.0)), 0.9);
    float yellow = sign(u_yellow) * pow(abs(clamp(u_yellow, -1.0, 1.0)), 0.9);

    mat3 cmyMatrix = mat3(
      1.0 - cyan * 0.35,      magenta * 0.08,         yellow * 0.05,
      cyan * 0.06,            1.0 - magenta * 0.38,   yellow * 0.08,
      cyan * 0.05,            magenta * 0.06,         1.0 - yellow * 0.32
    );

    float exposureCompensation = max(
      0.75,
      1.0 - (abs(cyan) + abs(magenta) + abs(yellow)) * 0.04
    );
    color = max(cmyMatrix * color, vec3(0.0)) * exposureCompensation;
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
