#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform bool u_printEnabled;
uniform float u_printDensity;
uniform float u_printContrast;
uniform float u_printWarmth;
uniform float u_printStock;
uniform bool u_printLutEnabled;
uniform float u_printLutIntensity;
uniform sampler3D u_printLut;

mat3 resolvePrintStock(float stockCode) {
  if (stockCode > 2.5) {
    return mat3(
      1.02, -0.01, -0.01,
      -0.01, 1.02, -0.01,
      -0.01, -0.01, 1.02
    );
  }
  if (stockCode > 1.5) {
    return mat3(
      0.96, 0.02, 0.02,
      0.01, 0.98, 0.01,
      0.02, 0.02, 0.96
    );
  }
  if (stockCode > 0.5) {
    return mat3(
      0.99, 0.01, 0.00,
      0.01, 1.00, -0.01,
      0.00, 0.02, 0.98
    );
  }
  return mat3(
    1.01, -0.01, 0.00,
    0.00, 1.00, 0.00,
    -0.01, 0.01, 1.00
  );
}

void main() {
  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 color = sampled.rgb;

  if (u_printEnabled) {
    color = resolvePrintStock(u_printStock) * color;

    float density = clamp(u_printDensity, -1.0, 1.0);
    color *= exp2(-density * 0.8);

    float contrast = clamp(u_printContrast, -1.0, 1.0);
    const float pivot = 0.18;
    color = pivot * pow(max(color / pivot, vec3(0.0)), vec3(1.0 + contrast));

    if (u_printLutEnabled && u_printStock > 2.5) {
      vec3 baseLinear = clamp(color, 0.0, 1.0);
      vec3 hdrOffset = max(color - vec3(1.0), vec3(0.0));
      vec3 lutColor = texture(u_printLut, baseLinear).rgb;
      vec3 mixed = mix(baseLinear, lutColor, clamp(u_printLutIntensity, 0.0, 1.0));
      color = mixed + hdrOffset;
    }

    float warmth = clamp(u_printWarmth, -1.0, 1.0);
    color += vec3(warmth * 0.05, warmth * 0.012, -warmth * 0.03);
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
