#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;

vec3 srgb2linear(vec3 c) {
  return mix(
    c / 12.92,
    pow((c + 0.055) / 1.055, vec3(2.4)),
    step(0.04045, c)
  );
}

void main() {
  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 color = clamp(sampled.rgb, 0.0, 1.0);
  outColor = vec4(srgb2linear(color), sampled.a);
}
