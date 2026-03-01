#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform bool u_colorMatrixEnabled;
uniform mat3 u_colorMatrix;

void main() {
  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 color = sampled.rgb;

  if (u_colorMatrixEnabled) {
    color = max(u_colorMatrix * color, vec3(0.0));
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
