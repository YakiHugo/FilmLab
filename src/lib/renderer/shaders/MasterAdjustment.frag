#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;

// -- Basic --
uniform float u_exposure;
uniform float u_contrast;
uniform vec4  u_tonalRange;  // (highlights, shadows, whites, blacks)
uniform vec4  u_curve;       // (curveHi, curveLights, curveDarks, curveShadows)

// -- White Balance --
uniform float u_temperature;
uniform float u_tint;

// -- OKLab HSL --
uniform float u_hueShift;
uniform float u_saturation;
uniform float u_vibrance;
uniform float u_luminance;

// -- Color Grading --
uniform vec3  u_colorGradeShadows;    // (hueDeg, sat, luminance)
uniform vec3  u_colorGradeMidtones;   // (hueDeg, sat, luminance)
uniform vec3  u_colorGradeHighlights; // (hueDeg, sat, luminance)
uniform float u_colorGradeBlend;      // [0, 1]
uniform float u_colorGradeBalance;    // [-1, 1]

// -- Detail --
uniform float u_dehaze;

// -- Output --
uniform bool u_outputSRGB;  // true when Film pass is skipped

// ---- sRGB <-> Linear ----

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
    1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055,
    step(0.0031308, c)
  );
}

// ---- OKLab ----
// Bjorn Ottosson, https://bottosson.github.io/posts/oklab/

vec3 rgb2oklab(vec3 c) {
  // Input: linear sRGB
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;

  l = pow(max(l, 0.0), 1.0 / 3.0);
  m = pow(max(m, 0.0), 1.0 / 3.0);
  s = pow(max(s, 0.0), 1.0 / 3.0);

  return vec3(
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  );
}

vec3 oklab2rgb(vec3 o) {
  // Output: linear sRGB
  float l = o.x + 0.3963377774 * o.y + 0.2158037573 * o.z;
  float m = o.x - 0.1055613458 * o.y - 0.0638541728 * o.z;
  float s = o.x - 0.0894841775 * o.y - 1.2914855480 * o.z;

  l = l * l * l;
  m = m * m * m;
  s = s * s * s;

  return vec3(
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

// ---- LMS (CAT02 chromatic adaptation) ----

// NOTE: GLSL mat3 constructor is column-major.
// Values below are laid out as columns so the matrix math matches
// the canonical CAT02 row-major coefficients.
const mat3 RGB_TO_LMS = mat3(
   0.7328, -0.7036, 0.0030,
   0.4296,  1.6975, 0.0136,
  -0.1624,  0.0061, 0.9834
);
const mat3 LMS_TO_RGB = mat3(
   1.0961,  0.4544, -0.0096,
  -0.2789,  0.4735, -0.0057,
   0.1827,  0.0721,  1.0153
);

vec3 whiteBalanceLMS(vec3 linearRgb, float temp, float tintVal) {
  vec3 lms = RGB_TO_LMS * linearRgb;
  // Temperature: adjust L (long-wave/red) and S (short-wave/blue) channels
  float t = temp * 0.10;
  lms.x *= (1.0 + t);
  lms.z *= (1.0 - t);
  // Tint: adjust M (medium-wave/green) channel
  lms.y *= (1.0 + tintVal * 0.05);
  return LMS_TO_RGB * lms;
}

// ---- Utility ----

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// ---- 3-way color grading ----
vec3 hsv2rgbFast(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  vec3 rgb = clamp(p - 1.0, 0.0, 1.0);
  return c.z * mix(vec3(1.0), rgb, c.y);
}

vec3 gradeTint(vec3 grade) {
  float hue = fract((grade.x + 180.0) / 360.0);
  float sat = clamp(grade.y, 0.0, 1.0);
  vec3 rgb = hsv2rgbFast(vec3(hue, 1.0, 1.0));
  return (rgb - vec3(0.5)) * sat;
}

vec3 applyColorGrading(vec3 color, float lum) {
  float blend = clamp(u_colorGradeBlend, 0.0, 1.0);
  if (blend < 0.0001) {
    return color;
  }

  float balance = clamp(u_colorGradeBalance, -1.0, 1.0);
  float shadowEdge = clamp(0.45 + balance * 0.2, 0.2, 0.7);
  float highlightEdge = clamp(0.55 + balance * 0.2, 0.3, 0.8);
  float wShadows = 1.0 - smoothstep(0.05, shadowEdge, lum);
  float wHighlights = smoothstep(highlightEdge, 0.95, lum);
  float wMidtones = clamp(1.0 - wShadows - wHighlights, 0.0, 1.0);

  vec3 tint = gradeTint(u_colorGradeShadows) * wShadows + gradeTint(u_colorGradeMidtones) * wMidtones + gradeTint(u_colorGradeHighlights) * wHighlights;
  color += tint * blend * 0.45;

  float luminanceShift = (u_colorGradeShadows.z * wShadows + u_colorGradeMidtones.z * wMidtones + u_colorGradeHighlights.z * wHighlights) * blend * 0.25;
  color *= (1.0 + luminanceShift);

  return clamp(color, 0.0, 1.0);
}

// ---- Main ----

void main() {
  vec3 color = texture(uSampler, vTextureCoord).rgb;

  // Step 1: sRGB -> Linear
  color = srgb2linear(color);

  // Step 2: Exposure (linear space, physically accurate)
  color *= exp2(u_exposure);

  // Step 3: LMS white balance
  color = whiteBalanceLMS(color, u_temperature / 100.0, u_tint / 100.0);

  // Step 4: Contrast (linear space, pivot = 0.18 mid-gray)
  float pivot = 0.18;
  color = pivot * pow(max(color / pivot, vec3(0.0)), vec3(1.0 + u_contrast * 0.01));

  // Step 5: Tonal range adjustments
  float lum = luminance(color);
  float hiMask = smoothstep(0.5, 1.0, lum);
  float shMask = 1.0 - smoothstep(0.0, 0.5, lum);
  float whMask = smoothstep(0.75, 1.0, lum);
  float blMask = 1.0 - smoothstep(0.0, 0.25, lum);

  float tonalDelta = hiMask * u_tonalRange.x * 0.01
                   + shMask * u_tonalRange.y * 0.01
                   + whMask * u_tonalRange.z * 0.01
                   + blMask * u_tonalRange.w * 0.01;
  color += color * tonalDelta;

  // Step 6: Curves (4 segment additive)
  lum = luminance(color);
  float curveDelta = smoothstep(0.7, 1.0, lum) * u_curve.x * 0.01
                   + smoothstep(0.4, 0.7, lum) * (1.0 - smoothstep(0.7, 0.85, lum)) * u_curve.y * 0.01
                   + smoothstep(0.15, 0.4, lum) * (1.0 - smoothstep(0.4, 0.55, lum)) * u_curve.z * 0.01
                   + (1.0 - smoothstep(0.1, 0.3, lum)) * u_curve.w * 0.01;
  color += color * curveDelta;

  // Step 7: OKLab HSL adjustments
  vec3 lab = rgb2oklab(color);
  // Hue rotation
  float angle = u_hueShift * 3.14159265 / 180.0;
  float ca = cos(angle), sa = sin(angle);
  lab.yz = vec2(lab.y * ca - lab.z * sa, lab.y * sa + lab.z * ca);
  // Saturation
  lab.yz *= (1.0 + u_saturation * 0.01);
  // Vibrance (low-saturation pixels boosted more)
  float chroma = length(lab.yz);
  float vibranceBoost = u_vibrance * 0.01 * (1.0 - smoothstep(0.0, 0.15, chroma));
  lab.yz *= (1.0 + vibranceBoost);
  // Luminance
  lab.x *= (1.0 + u_luminance * 0.01);
  color = oklab2rgb(lab);
  color = max(color, vec3(0.0));  // gamut clamp after OKLab round-trip

  // Step 8: 3-way color grading
  lum = luminance(color);
  color = applyColorGrading(color, lum);

  // Step 9: Dehaze
  if (abs(u_dehaze) > 0.001) {
    float haze = u_dehaze * 0.01;
    color = (color - haze * 0.1) / max(1.0 - haze * 0.3, 0.1);
    color = max(color, vec3(0.0));
  }

  // Step 10: Output (linear if Film follows, sRGB if final)
  color = clamp(color, 0.0, 1.0);
  if (u_outputSRGB) {
    color = linear2srgb(color);
  }

  outColor = vec4(color, 1.0);
}
