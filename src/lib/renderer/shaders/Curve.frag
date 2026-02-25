#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform sampler2D u_curveLut;
uniform bool u_enabled;

void main() {
  vec3 color = texture(uSampler, vTextureCoord).rgb;
  if (!u_enabled) {
    outColor = vec4(color, 1.0);
    return;
  }

  // Channel packing in LUT:
  // R: RGB composite curve
  // G: Red curve
  // B: Green curve
  // A: Blue curve
  float r = texture(u_curveLut, vec2((clamp(color.r, 0.0, 1.0) * 255.0 + 0.5) / 256.0, 0.5)).r;
  float g = texture(u_curveLut, vec2((clamp(color.g, 0.0, 1.0) * 255.0 + 0.5) / 256.0, 0.5)).r;
  float b = texture(u_curveLut, vec2((clamp(color.b, 0.0, 1.0) * 255.0 + 0.5) / 256.0, 0.5)).r;

  r = texture(u_curveLut, vec2((clamp(r, 0.0, 1.0) * 255.0 + 0.5) / 256.0, 0.5)).g;
  g = texture(u_curveLut, vec2((clamp(g, 0.0, 1.0) * 255.0 + 0.5) / 256.0, 0.5)).b;
  b = texture(u_curveLut, vec2((clamp(b, 0.0, 1.0) * 255.0 + 0.5) / 256.0, 0.5)).a;

  outColor = vec4(max(vec3(r, g, b), vec3(0.0)), 1.0);
}
