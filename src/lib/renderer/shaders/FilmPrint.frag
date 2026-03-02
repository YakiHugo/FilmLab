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
uniform float u_printTargetWhiteKelvin;
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

vec3 kelvinToRgb(float kelvin) {
  float temp = clamp(kelvin, 1000.0, 40000.0) / 100.0;
  float red;
  float green;
  float blue;

  if (temp <= 66.0) {
    red = 1.0;
    green = clamp((99.4708 * log(max(temp, 1.0)) - 161.11957) / 255.0, 0.0, 1.0);
    if (temp <= 19.0) {
      blue = 0.0;
    } else {
      blue = clamp((138.51773 * log(temp - 10.0) - 305.0448) / 255.0, 0.0, 1.0);
    }
  } else {
    float tempMinus60 = temp - 60.0;
    red = clamp((329.69873 * pow(tempMinus60, -0.13320476)) / 255.0, 0.0, 1.0);
    green = clamp((288.12216 * pow(tempMinus60, -0.075514846)) / 255.0, 0.0, 1.0);
    blue = 1.0;
  }

  return vec3(red, green, blue);
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

    float targetWhiteKelvin =
      u_printTargetWhiteKelvin > 0.0
        ? clamp(u_printTargetWhiteKelvin, 5500.0, 6500.0)
        : 6500.0;
    vec3 d65White = kelvinToRgb(6500.0);
    vec3 targetWhite = kelvinToRgb(targetWhiteKelvin);
    vec3 whiteShift = d65White / max(targetWhite, vec3(0.1));
    whiteShift = clamp(whiteShift, vec3(0.7), vec3(1.5));
    color *= whiteShift;

    float warmth = clamp(u_printWarmth, -1.0, 1.0);
    color += vec3(warmth * 0.05, warmth * 0.012, -warmth * 0.03);
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
