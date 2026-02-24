#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform bool u_enabled;
uniform float u_hue[8];
uniform float u_saturation[8];
uniform float u_luminance[8];

vec3 rgb2hsv(vec3 c) {
  vec4 k = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, k.wz), vec4(c.gb, k.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  vec3 rgb = clamp(p - 1.0, 0.0, 1.0);
  return c.z * mix(vec3(1.0), rgb, c.y);
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

void main() {
  vec3 color = texture(uSampler, vTextureCoord).rgb;
  if (!u_enabled) {
    outColor = vec4(color, 1.0);
    return;
  }

  vec3 hsv = rgb2hsv(clamp(color, 0.0, 1.0));
  float hueDeg = hsv.x * 360.0;

  float weightSum = 0.0;
  float hueShift = 0.0;
  float satDelta = 0.0;
  float lumDelta = 0.0;

  for (int i = 0; i < 8; i += 1) {
    float w = hueWeight(hueDeg, hueCenter(i));
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
  float satScale = 1.0 + satDelta * 0.01;
  float lumScale = 1.0 + lumDelta * 0.01;

  hsv.x = fract(hsv.x + hueShiftDeg / 360.0);
  hsv.y = clamp(hsv.y * satScale, 0.0, 1.0);
  hsv.z = clamp(hsv.z * lumScale, 0.0, 1.0);

  vec3 adjusted = hsv2rgb(hsv);
  outColor = vec4(max(adjusted, vec3(0.0)), 1.0);
}

