#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform sampler2D u_curveLut;
uniform bool u_enabled;

vec3 srgb2linear(vec3 c) {
  return mix(
    c / 12.92,
    pow((c + 0.055) / 1.055, vec3(2.4)),
    step(0.04045, c)
  );
}

vec3 linear2srgb(vec3 c) {
  return mix(
    c * 12.92,
    1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
    step(0.0031308, c)
  );
}

void main() {
  vec3 colorLinear = max(texture(uSampler, vTextureCoord).rgb, vec3(0.0));
  if (!u_enabled) {
    outColor = vec4(colorLinear, 1.0);
    return;
  }

  // Keep existing curve LUT behavior by doing the lookup in sRGB space.
  vec3 color = linear2srgb(colorLinear);

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

  vec3 curvedLinear = srgb2linear(max(vec3(r, g, b), vec3(0.0)));
  vec3 hdrOffset = max(colorLinear - vec3(1.0), vec3(0.0));
  outColor = vec4(max(curvedLinear + hdrOffset, vec3(0.0)), 1.0);
}
