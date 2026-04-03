#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;

void main() {
  float alpha = 1.0 - texture(uSampler, vTextureCoord).a;
  outColor = vec4(vec3(1.0), clamp(alpha, 0.0, 1.0));
}
