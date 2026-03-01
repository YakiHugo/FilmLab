#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform vec2 u_texelSize;

void main() {
  vec2 d = u_texelSize;
  vec3 c0 = texture(uSampler, vTextureCoord + vec2(-d.x, -d.y)).rgb;
  vec3 c1 = texture(uSampler, vTextureCoord + vec2(d.x, -d.y)).rgb;
  vec3 c2 = texture(uSampler, vTextureCoord + vec2(-d.x, d.y)).rgb;
  vec3 c3 = texture(uSampler, vTextureCoord + vec2(d.x, d.y)).rgb;
  outColor = vec4((c0 + c1 + c2 + c3) * 0.25, 1.0);
}
