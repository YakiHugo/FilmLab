#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform vec2 u_texelSize;
uniform int u_radius;

void main() {
  vec4 maxSample = texture(uSampler, vTextureCoord);

  for (int y = -4; y <= 4; y += 1) {
    for (int x = -4; x <= 4; x += 1) {
      if (abs(x) > u_radius || abs(y) > u_radius) {
        continue;
      }
      vec2 offset = vec2(float(x), float(y)) * u_texelSize;
      maxSample = max(maxSample, texture(uSampler, vTextureCoord + offset));
    }
  }

  outColor = maxSample;
}
