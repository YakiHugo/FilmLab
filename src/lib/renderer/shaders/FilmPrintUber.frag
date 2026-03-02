#version 300 es
precision highp float;
precision highp sampler3D;

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
uniform float u_printTargetWhiteKelvin;

uniform bool u_cmyColorHeadEnabled;
uniform float u_cyan;
uniform float u_magenta;
uniform float u_yellow;

uniform bool u_colorCastEnabled;
uniform vec3 u_colorCastShadows;
uniform vec3 u_colorCastMidtones;
uniform vec3 u_colorCastHighlights;

uniform bool u_printToningEnabled;
uniform vec3 u_toningShadows;
uniform vec3 u_toningMidtones;
uniform vec3 u_toningHighlights;
uniform float u_toningStrength;

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

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 srgb2linear(vec3 c) {
  return mix(
    c / 12.92,
    pow((c + 0.055) / 1.055, vec3(2.4)),
    step(0.04045, c)
  );
}

vec3 kelvinToRgb(float kelvin) {
  float t = clamp(kelvin, 1000.0, 40000.0) / 100.0;
  float r;
  float g;
  float b;

  if (t <= 66.0) {
    r = 1.0;
    g = clamp((99.4708 * log(max(t, 1.0)) - 161.11957) / 255.0, 0.0, 1.0);
    if (t <= 19.0) {
      b = 0.0;
    } else {
      b = clamp((138.51773 * log(max(t - 10.0, 1.0)) - 305.0448) / 255.0, 0.0, 1.0);
    }
  } else {
    r = clamp((329.69873 * pow(t - 60.0, -0.13320476)) / 255.0, 0.0, 1.0);
    g = clamp((288.12216 * pow(t - 60.0, -0.075514846)) / 255.0, 0.0, 1.0);
    b = 1.0;
  }

  return vec3(r, g, b);
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
      float lutSize = float(textureSize(u_printLut, 0).x);
      vec3 uvw = (baseLinear * (lutSize - 1.0) + 0.5) / lutSize;
      vec3 lutColor = texture(u_printLut, uvw).rgb;
      vec3 mixed = mix(baseLinear, lutColor, clamp(u_printLutIntensity, 0.0, 1.0));
      color = mixed + hdrOffset;
    }

    vec3 targetWhite = srgb2linear(kelvinToRgb(clamp(u_printTargetWhiteKelvin, 5500.0, 6500.0)));
    vec3 d65White = srgb2linear(kelvinToRgb(6500.0));
    vec3 whiteScale = d65White / max(targetWhite, vec3(0.1));
    whiteScale = clamp(whiteScale, vec3(0.7), vec3(1.5));
    color *= whiteScale;

    float warmth = clamp(u_printWarmth, -1.0, 1.0);
    color += vec3(warmth * 0.05, warmth * 0.012, -warmth * 0.03);
  }

  if (u_cmyColorHeadEnabled) {
    float cyan = sign(u_cyan) * pow(abs(clamp(u_cyan, -1.0, 1.0)), 0.9);
    float magenta = sign(u_magenta) * pow(abs(clamp(u_magenta, -1.0, 1.0)), 0.9);
    float yellow = sign(u_yellow) * pow(abs(clamp(u_yellow, -1.0, 1.0)), 0.9);

    mat3 cmyMatrix = mat3(
      1.0 - cyan * 0.35,      magenta * 0.08,         yellow * 0.05,
      cyan * 0.06,            1.0 - magenta * 0.38,   yellow * 0.08,
      cyan * 0.05,            magenta * 0.06,         1.0 - yellow * 0.32
    );

    float exposureCompensation = max(
      0.75,
      1.0 - (abs(cyan) + abs(magenta) + abs(yellow)) * 0.04
    );
    color = max(cmyMatrix * color, vec3(0.0)) * exposureCompensation;
  }

  if (u_colorCastEnabled) {
    float lum = max(luminance(color), 0.0);
    float lumNorm = lum / (1.0 + lum);
    float shMask = 1.0 - smoothstep(0.0, 0.34, lumNorm);
    float hiMask = smoothstep(0.46, 0.86, lumNorm);
    float midMask = clamp(1.0 - shMask - hiMask, 0.0, 1.0);
    float highlightEnergy = 1.0 + log2(1.0 + max(lum - 1.0, 0.0)) * 0.35;

    color += u_colorCastShadows * shMask
      + u_colorCastMidtones * midMask
      + u_colorCastHighlights * hiMask * highlightEnergy;
  }

  if (u_printToningEnabled && u_toningStrength > 0.001) {
    float lum = max(luminance(color), 0.0);
    float lumNorm = lum / (1.0 + lum);
    float shadowMask = 1.0 - smoothstep(0.0, 0.36, lumNorm);
    float highlightMask = smoothstep(0.44, 0.86, lumNorm);
    float midMask = clamp(1.0 - shadowMask - highlightMask, 0.0, 1.0);
    float highlightEnergy = 1.0 + log2(1.0 + max(lum - 1.0, 0.0)) * 0.3;

    vec3 tone =
      u_toningShadows * shadowMask +
      u_toningMidtones * midMask +
      u_toningHighlights * highlightMask * highlightEnergy;
    color += tone * clamp(u_toningStrength, 0.0, 1.0);
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
