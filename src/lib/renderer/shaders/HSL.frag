#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform bool u_enabled;
uniform float u_hue[8];
uniform float u_saturation[8];
uniform float u_luminance[8];
uniform bool u_bwEnabled;
uniform vec3 u_bwMix;
uniform bool u_calibrationEnabled;
uniform float u_calibrationHue[3];
uniform float u_calibrationSaturation[3];

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

vec3 rgb2oklab(vec3 c) {
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

vec3 gamutMapSoftClip(vec3 color) {
  float minC = min(color.r, min(color.g, color.b));
  float maxC = max(color.r, max(color.g, color.b));
  if (minC >= 0.0 && maxC <= 1.0) {
    return color;
  }

  float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
  vec3 chroma = color - vec3(lum);

  float scale = 1.0;
  float upperDelta = maxC - lum;
  float lowerDelta = lum - minC;
  if (maxC > 1.0 && upperDelta > 1.0e-5) {
    scale = min(scale, (1.0 - lum) / upperDelta);
  }
  if (minC < 0.0 && lowerDelta > 1.0e-5) {
    scale = min(scale, lum / lowerDelta);
  }

  float excursion = max(maxC - 1.0, -minC);
  float knee = smoothstep(0.0, 0.25, excursion);
  float softScale = mix(1.0, scale, knee);
  return vec3(lum) + chroma * softScale;
}

float hueCenter(int index) {
  if (index == 0) return 0.0;   // red
  if (index == 1) return 30.0;  // orange
  if (index == 2) return 60.0;  // yellow
  if (index == 3) return 120.0; // green
  if (index == 4) return 180.0; // aqua
  if (index == 5) return 240.0; // blue
  if (index == 6) return 285.0; // purple
  return 320.0;                 // magenta
}

float hueDistance(float a, float b) {
  float d = abs(a - b);
  return min(d, 360.0 - d);
}

float hueWeight(float hueDeg, float centerDeg) {
  // Soft triangular window: full effect near center, smooth falloff by 55 degrees.
  float d = hueDistance(hueDeg, centerDeg);
  return 1.0 - smoothstep(18.0, 55.0, d);
}

float calibrationCenter(int index) {
  if (index == 0) return 12.0;   // red primary
  if (index == 1) return 120.0;  // green primary
  return 240.0;                  // blue primary
}

float calibrationWeight(float hueDeg, float centerDeg) {
  float d = hueDistance(hueDeg, centerDeg);
  return 1.0 - smoothstep(8.0, 35.0, d);
}

void main() {
  vec3 color = texture(uSampler, vTextureCoord).rgb;
  if (!u_enabled) {
    outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    return;
  }

  vec3 linear = srgb2linear(clamp(color, 0.0, 1.0));
  vec3 lab = rgb2oklab(max(linear, vec3(0.0)));
  vec2 ab = lab.yz;
  float chroma = length(ab);
  float hueDeg = 0.0;
  if (chroma > 1.0e-5) {
    hueDeg = degrees(atan(ab.y, ab.x));
    if (hueDeg < 0.0) {
      hueDeg += 360.0;
    }
  }

  float weightSum = 0.0;
  float hueShift = 0.0;
  float satDelta = 0.0;
  float lumDelta = 0.0;
  float chromaWeight = smoothstep(0.01, 0.08, chroma);

  for (int i = 0; i < 8; i += 1) {
    float w = hueWeight(hueDeg, hueCenter(i)) * chromaWeight;
    weightSum += w;
    hueShift += u_hue[i] * w;
    satDelta += u_saturation[i] * w;
    lumDelta += u_luminance[i] * w;
  }

  if (weightSum > 1.0e-5) {
    hueShift /= weightSum;
    satDelta /= weightSum;
    lumDelta /= weightSum;
  }

  // Map UI range [-100, 100] to practical editing range.
  float hueShiftDeg = hueShift * 0.45; // +/-45deg
  float satScale = max(0.0, 1.0 + satDelta * 0.01);
  float lumScale = max(0.0, 1.0 + lumDelta * 0.01);

  if (chroma > 1.0e-5) {
    float hueRad = atan(ab.y, ab.x) + radians(hueShiftDeg);
    float adjustedChroma = chroma * satScale;
    ab = vec2(cos(hueRad), sin(hueRad)) * adjustedChroma;
  } else {
    ab *= satScale;
  }

  lab.yz = ab;
  lab.x = clamp(lab.x * lumScale, 0.0, 1.0);

  if (u_calibrationEnabled) {
    vec2 calAb = lab.yz;
    float calChroma = length(calAb);
    if (calChroma > 1.0e-5) {
      float calHueRad = atan(calAb.y, calAb.x);
      float calHueDeg = degrees(calHueRad);
      if (calHueDeg < 0.0) {
        calHueDeg += 360.0;
      }

      float calWeightSum = 0.0;
      float calHueShift = 0.0;
      float calSatDelta = 0.0;
      for (int i = 0; i < 3; i += 1) {
        float w = calibrationWeight(calHueDeg, calibrationCenter(i));
        calWeightSum += w;
        calHueShift += u_calibrationHue[i] * w;
        calSatDelta += u_calibrationSaturation[i] * w;
      }
      if (calWeightSum > 1.0e-5) {
        calHueShift /= calWeightSum;
        calSatDelta /= calWeightSum;
      }

      float calibratedHue = calHueRad + radians(calHueShift * 0.35);
      float calibratedChroma = calChroma * max(0.0, 1.0 + calSatDelta * 0.01);
      lab.yz = vec2(cos(calibratedHue), sin(calibratedHue)) * calibratedChroma;
    }
  }

  vec3 adjustedLinear = clamp(gamutMapSoftClip(oklab2rgb(lab)), 0.0, 1.0);
  vec3 adjusted = linear2srgb(adjustedLinear);
  if (u_bwEnabled) {
    vec3 bwWeights = max(u_bwMix, vec3(0.0));
    float bwWeightSum = max(bwWeights.r + bwWeights.g + bwWeights.b, 1.0e-5);
    bwWeights /= bwWeightSum;
    float bwLum = dot(adjusted, bwWeights);
    adjusted = vec3(bwLum);
  }
  outColor = vec4(clamp(adjusted, 0.0, 1.0), 1.0);
}
