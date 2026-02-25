#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;

void main() {
  outColor = texture(uSampler, vTextureCoord);
}
