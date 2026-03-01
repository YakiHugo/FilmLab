#version 300 es
precision highp float;
precision highp sampler3D;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform sampler3D u_lut;
uniform bool u_lutEnabled;
uniform float u_lutIntensity;

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

vec3 applyLUT(vec3 color) {
  vec3 clamped = clamp(color, 0.0, 1.0);
  float lutSize = float(textureSize(u_lut, 0).x);
  vec3 uvw = (clamped * (lutSize - 1.0) + 0.5) / lutSize;
  vec3 lutColor = texture(u_lut, uvw).rgb;
  return mix(color, lutColor, clamp(u_lutIntensity, 0.0, 1.0));
}

void main() {
  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 color = max(sampled.rgb, vec3(0.0));

  if (u_lutEnabled && u_lutIntensity > 0.0) {
    // Keep LUT lookup in [0,1], but preserve HDR energy above 1.0 for later film stages.
    vec3 baseLinear = clamp(color, 0.0, 1.0);
    vec3 hdrOffset = max(color - vec3(1.0), vec3(0.0));
    vec3 lutColor = linear2srgb(baseLinear);
    lutColor = applyLUT(lutColor);
    color = srgb2linear(max(lutColor, vec3(0.0))) + hdrOffset;
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
