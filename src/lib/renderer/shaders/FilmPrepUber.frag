#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;

uniform bool u_expandEnabled;
uniform float u_expandBlackPoint;
uniform float u_expandWhitePoint;

uniform bool u_filmCompressionEnabled;
uniform float u_highlightRolloff;
uniform float u_shoulderWidth;

uniform bool u_filmDeveloperEnabled;
uniform float u_developerContrast;
uniform float u_developerGamma;
uniform vec3 u_colorSeparation;

uniform bool u_toneEnabled;
uniform float u_shoulder;
uniform float u_toe;
uniform float u_gamma;

uniform float u_pushPullEv;

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

float compressHighlightChannel(float x, float rolloff, float shoulderWidth) {
  float start = clamp(1.0 - shoulderWidth, 0.35, 0.98);
  if (x <= start) {
    return x;
  }

  float t = clamp((x - start) / max(1.0 - start, 0.001), 0.0, 4.0);
  float k = max(0.1, rolloff * 4.0 + 0.1);
  float compressed = start + (1.0 - start) * (1.0 - exp(-t * k));
  return mix(x, compressed, clamp(rolloff, 0.0, 1.0));
}

float toneChannel(float x, float shoulder, float toe, float gamma) {
  x = pow(max(x, 0.0), gamma);

  float k = shoulder * 2.0;
  float compressed = x * (1.0 + k) / (x + k + 0.0001);
  x = mix(x, compressed, shoulder);

  float toeGamma = 1.0 / (1.0 + toe);
  float lifted = pow(max(x, 0.0), toeGamma);
  x = mix(x, lifted, toe);

  return max(x, 0.0);
}

void main() {
  vec4 sampled = texture(uSampler, vTextureCoord);
  vec3 color = sampled.rgb;

  float pushPullEv = clamp(u_pushPullEv, -2.0, 2.0);

  if (u_expandEnabled) {
    float blackPoint = clamp(u_expandBlackPoint, 0.0, 0.99);
    float whitePoint = clamp(u_expandWhitePoint, blackPoint + 0.001, 1.5);
    color = (color - vec3(blackPoint)) / max(whitePoint - blackPoint, 0.001);
  }

  if (u_filmCompressionEnabled && u_highlightRolloff > 0.001) {
    color.r = compressHighlightChannel(color.r, u_highlightRolloff, u_shoulderWidth);
    color.g = compressHighlightChannel(color.g, u_highlightRolloff, u_shoulderWidth);
    color.b = compressHighlightChannel(color.b, u_highlightRolloff, u_shoulderWidth);
  }

  if (u_filmDeveloperEnabled) {
    vec3 separation = max(u_colorSeparation, vec3(0.0));
    color *= separation;

    float developerExposure = exp2(pushPullEv * 0.16);
    color *= developerExposure;

    float gammaValue = max(0.25, u_developerGamma - pushPullEv * 0.06);
    color = pow(max(color, vec3(0.0)), vec3(1.0 / gammaValue));

    float contrast = clamp(u_developerContrast + pushPullEv * 0.08, -1.0, 1.0);
    const float pivot = 0.18;
    color = pivot * pow(max(color / pivot, vec3(0.0)), vec3(1.0 + contrast));
  }

  if (u_toneEnabled) {
    float lum = luminance(color);
    float mappedLum = toneChannel(lum, u_shoulder, u_toe, max(0.5, u_gamma - pushPullEv * 0.04));
    if (lum <= 1e-5) {
      color = vec3(mappedLum);
    } else {
      float ratio = mappedLum / lum;
      color = color * ratio;
    }
  }

  outColor = vec4(max(color, vec3(0.0)), sampled.a);
}
