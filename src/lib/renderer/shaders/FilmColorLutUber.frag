#version 300 es
precision highp float;
precision highp sampler3D;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;

uniform bool u_colorMatrixEnabled;
uniform mat3 u_colorMatrix;

uniform sampler3D u_lut;
uniform bool u_lutEnabled;
uniform float u_lutIntensity;
uniform bool u_lutMixEnabled;
uniform float u_lutMixFactor;
uniform sampler3D u_lutBlend;

uniform sampler3D u_customLut;
uniform bool u_customLutEnabled;
uniform float u_customLutIntensity;

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

vec3 sampleLutColor(sampler3D lutTex, vec3 color) {
  vec3 clamped = clamp(color, 0.0, 1.0);
  float lutSize = float(textureSize(lutTex, 0).x);
  vec3 uvw = (clamped * (lutSize - 1.0) + 0.5) / lutSize;
  return texture(lutTex, uvw).rgb;
}

void main() {
  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 color = max(sampled.rgb, vec3(0.0));

  if (u_colorMatrixEnabled) {
    color = max(u_colorMatrix * color, vec3(0.0));
  }

  if (u_lutEnabled && u_lutIntensity > 0.0) {
    vec3 baseLinear = clamp(color, 0.0, 1.0);
    vec3 hdrOffset = max(color - vec3(1.0), vec3(0.0));
    vec3 baseSrgb = linear2srgb(baseLinear);
    vec3 lutMapped = sampleLutColor(u_lut, baseSrgb);
    if (u_lutMixEnabled) {
      vec3 blendMapped = sampleLutColor(u_lutBlend, baseSrgb);
      lutMapped = mix(lutMapped, blendMapped, clamp(u_lutMixFactor, 0.0, 1.0));
    }
    vec3 lutColor = mix(baseSrgb, lutMapped, clamp(u_lutIntensity, 0.0, 1.0));
    color = srgb2linear(max(lutColor, vec3(0.0))) + hdrOffset;
  }

  if (u_customLutEnabled && u_customLutIntensity > 0.0) {
    vec3 baseLinear = clamp(color, 0.0, 1.0);
    vec3 hdrOffset = max(color - vec3(1.0), vec3(0.0));
    vec3 baseSrgb = linear2srgb(baseLinear);
    vec3 customMapped = sampleLutColor(u_customLut, baseSrgb);
    vec3 lutColor = mix(baseSrgb, customMapped, clamp(u_customLutIntensity, 0.0, 1.0));
    color = srgb2linear(max(lutColor, vec3(0.0))) + hdrOffset;
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
