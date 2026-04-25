#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform vec2 u_canvasSize;
uniform float u_frequency;
uniform float u_angle;
uniform float u_shape;         // 0 = circle, 1 = diamond, 2 = line, 3 = square
uniform float u_colorMode;     // 0 = mono, 1 = cmyk, 2 = rgb
uniform float u_dotScale;
uniform float u_contrast;
uniform bool u_invert;
uniform vec4 u_backgroundColor;
uniform float u_backgroundOpacity;

const float PI = 3.14159265359;

mat2 rotationMatrix(float angleDeg) {
  float a = angleDeg * PI / 180.0;
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

float halftoneCell(vec2 pos, float luminance) {
  float threshold = clamp(luminance, 0.0, 1.0);
  threshold = pow(threshold, u_contrast);
  float radius = threshold * u_dotScale;

  if (u_shape < 0.5) {
    float dist = length(pos - vec2(0.5));
    return smoothstep(radius + 0.02, radius - 0.02, dist);
  }
  if (u_shape < 1.5) {
    float dist = abs(pos.x - 0.5) + abs(pos.y - 0.5);
    return smoothstep(radius * 1.414 + 0.02, radius * 1.414 - 0.02, dist);
  }
  if (u_shape < 2.5) {
    float dist = abs(pos.y - 0.5);
    return smoothstep(radius * 0.5 + 0.01, radius * 0.5 - 0.01, dist);
  }
  float dist = max(abs(pos.x - 0.5), abs(pos.y - 0.5));
  return smoothstep(radius + 0.02, radius - 0.02, dist);
}

float screenChannel(vec2 pixel, float channelValue, float angleDeg) {
  mat2 rot = rotationMatrix(angleDeg);
  vec2 rotated = rot * pixel;
  float cellSize = max(2.0, u_canvasSize.y / max(1.0, u_frequency));
  vec2 cellCoord = fract(rotated / cellSize);
  return halftoneCell(cellCoord, channelValue);
}

void main() {
  vec4 src = texture(uSampler, vTextureCoord);
  vec2 pixel = vTextureCoord * u_canvasSize;
  vec4 bg = vec4(u_backgroundColor.rgb, u_backgroundOpacity);

  vec4 result;

  if (u_colorMode < 0.5) {
    float lum = dot(src.rgb, vec3(0.2126, 0.7152, 0.0722));
    if (u_invert) lum = 1.0 - lum;
    float dot = screenChannel(pixel, lum, u_angle);
    vec3 fg = u_invert ? vec3(0.0) : vec3(1.0);
    result = vec4(mix(bg.rgb, fg, dot), mix(bg.a, 1.0, dot) * src.a);
  } else if (u_colorMode < 1.5) {
    float c = 1.0 - src.r;
    float m = 1.0 - src.g;
    float y = 1.0 - src.b;
    float k = min(c, min(m, y));
    c = (c - k) / max(1.0 - k, 0.001);
    m = (m - k) / max(1.0 - k, 0.001);
    y = (y - k) / max(1.0 - k, 0.001);

    float cDot = screenChannel(pixel, c, u_angle + 15.0);
    float mDot = screenChannel(pixel, m, u_angle + 75.0);
    float yDot = screenChannel(pixel, y, u_angle);
    float kDot = screenChannel(pixel, k, u_angle + 45.0);

    vec3 white = vec3(1.0);
    vec3 cmykResult = white;
    cmykResult -= cDot * vec3(1.0, 0.0, 0.0);
    cmykResult -= mDot * vec3(0.0, 1.0, 0.0);
    cmykResult -= yDot * vec3(0.0, 0.0, 1.0);
    cmykResult -= kDot * vec3(1.0, 1.0, 1.0);
    cmykResult = clamp(cmykResult, 0.0, 1.0);

    if (u_invert) cmykResult = 1.0 - cmykResult;
    result = vec4(mix(bg.rgb, cmykResult, src.a), mix(bg.a, 1.0, src.a));
  } else {
    float rDot = screenChannel(pixel, u_invert ? 1.0 - src.r : src.r, u_angle);
    float gDot = screenChannel(pixel, u_invert ? 1.0 - src.g : src.g, u_angle + 30.0);
    float bDot = screenChannel(pixel, u_invert ? 1.0 - src.b : src.b, u_angle + 60.0);

    vec3 fg = u_invert ? vec3(0.0) : vec3(1.0);
    vec3 rgbResult = vec3(
      mix(bg.r, fg.r, rDot),
      mix(bg.g, fg.g, gDot),
      mix(bg.b, fg.b, bDot)
    );
    result = vec4(rgbResult, mix(bg.a, 1.0, max(rDot, max(gDot, bDot))) * src.a);
  }

  outColor = result;
}
