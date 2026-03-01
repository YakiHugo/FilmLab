#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform vec2 u_texelSize;
uniform float u_sigmaRange;
uniform float u_strength;

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec3 center = texture(uSampler, vTextureCoord).rgb;
  float centerLum = luminance(center);

  vec3 sum = vec3(0.0);
  float weightSum = 0.0;
  float sigmaSpatial = 1.5;
  float invTwoSpatialVar = 1.0 / (2.0 * sigmaSpatial * sigmaSpatial);
  float invTwoRangeVar = 1.0 / max(2.0 * u_sigmaRange * u_sigmaRange, 1.0e-5);

  for (int y = -2; y <= 2; y += 1) {
    for (int x = -2; x <= 2; x += 1) {
      vec2 offset = vec2(float(x), float(y)) * u_texelSize;
      vec3 sampleColor = texture(uSampler, vTextureCoord + offset).rgb;
      float spatialWeight = exp(-float(x * x + y * y) * invTwoSpatialVar);
      float rangeDiff = luminance(sampleColor) - centerLum;
      float rangeWeight = exp(-(rangeDiff * rangeDiff) * invTwoRangeVar);
      float w = spatialWeight * rangeWeight;
      sum += sampleColor * w;
      weightSum += w;
    }
  }

  vec3 filtered = sum / max(weightSum, 1.0e-5);
  vec3 color = mix(center, filtered, clamp(u_strength, 0.0, 1.0));
  outColor = vec4(color, 1.0);
}
