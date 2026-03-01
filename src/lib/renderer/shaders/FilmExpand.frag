#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform bool u_expandEnabled;
uniform float u_expandBlackPoint;
uniform float u_expandWhitePoint;

void main() {
  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 color = sampled.rgb;

  if (u_expandEnabled) {
    float blackPoint = clamp(u_expandBlackPoint, 0.0, 0.99);
    float whitePoint = clamp(u_expandWhitePoint, blackPoint + 0.001, 1.5);
    color = (color - vec3(blackPoint)) / max(whitePoint - blackPoint, 0.001);
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
