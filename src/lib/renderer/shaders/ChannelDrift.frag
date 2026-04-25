#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform vec2 u_canvasSize;
uniform vec2 u_redOffset;
uniform vec2 u_greenOffset;
uniform vec2 u_blueOffset;
uniform float u_intensity;

void main() {
  vec2 texelSize = 1.0 / u_canvasSize;
  vec2 rUv = vTextureCoord + u_redOffset * texelSize * u_intensity;
  vec2 gUv = vTextureCoord + u_greenOffset * texelSize * u_intensity;
  vec2 bUv = vTextureCoord + u_blueOffset * texelSize * u_intensity;

  float r = texture(uSampler, rUv).r;
  float g = texture(uSampler, gUv).g;
  float b = texture(uSampler, bUv).b;
  float a = texture(uSampler, vTextureCoord).a;

  outColor = vec4(r, g, b, a);
}
