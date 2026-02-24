#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform bool u_enabled;
uniform vec2 u_texelSize;

uniform float u_texture;
uniform float u_clarity;
uniform float u_sharpening;
uniform float u_sharpenRadius;
uniform float u_sharpenDetail;
uniform float u_masking;
uniform float u_noiseReduction;
uniform float u_colorNoiseReduction;

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec3 center = texture(uSampler, vTextureCoord).rgb;
  if (!u_enabled) {
    outColor = vec4(center, 1.0);
    return;
  }

  float radius = mix(0.8, 2.2, clamp(u_sharpenRadius * 0.01, 0.0, 1.0));
  vec2 dx = vec2(u_texelSize.x * radius, 0.0);
  vec2 dy = vec2(0.0, u_texelSize.y * radius);

  vec3 north = texture(uSampler, vTextureCoord - dy).rgb;
  vec3 south = texture(uSampler, vTextureCoord + dy).rgb;
  vec3 east = texture(uSampler, vTextureCoord + dx).rgb;
  vec3 west = texture(uSampler, vTextureCoord - dx).rgb;

  vec3 blur = (center * 4.0 + north + south + east + west) / 8.0;
  vec3 highPass = center - blur;

  float lumCenter = luminance(center);
  float lumBlur = luminance(blur);
  float lumEdge = lumCenter - lumBlur;
  float edgeStrength = abs(lumEdge);

  vec3 color = center;

  // Texture + clarity use local high-frequency detail.
  color += highPass * (u_texture * 0.01) * 0.85;
  color += vec3(lumEdge * (u_clarity * 0.01) * 0.8);

  // Sharpening with edge masking.
  float sharpen = clamp(u_sharpening * 0.01, 0.0, 1.0);
  if (sharpen > 0.0) {
    float detailGain = mix(0.55, 1.75, clamp(u_sharpenDetail * 0.01, 0.0, 1.0));
    float maskThreshold = mix(0.0, 0.28, clamp(u_masking * 0.01, 0.0, 1.0));
    float edgeMask = smoothstep(maskThreshold, maskThreshold + 0.18, edgeStrength * 4.0);
    color += highPass * sharpen * detailGain * edgeMask;
  }

  // Noise reduction is stronger in flat regions.
  float flatMask = 1.0 - smoothstep(0.02, 0.14, edgeStrength * 3.0);
  float lumaNr = clamp(u_noiseReduction * 0.01, 0.0, 1.0);
  if (lumaNr > 0.0) {
    color = mix(color, blur, lumaNr * 0.6 * flatMask);
  }

  float chromaNr = clamp(u_colorNoiseReduction * 0.01, 0.0, 1.0);
  if (chromaNr > 0.0) {
    float lumColor = luminance(color);
    float lumBlurred = luminance(blur);
    vec3 chroma = color - vec3(lumColor);
    vec3 chromaBlur = blur - vec3(lumBlurred);
    chroma = mix(chroma, chromaBlur, chromaNr * 0.8 * flatMask);
    color = vec3(lumColor) + chroma;
  }

  outColor = vec4(max(color, vec3(0.0)), 1.0);
}

