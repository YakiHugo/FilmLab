#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;
uniform sampler2D u_halfScale;
uniform sampler2D u_quarterScale;
uniform float u_lumaStrength;
uniform float u_chromaStrength;

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec3 base = texture(uSampler, vTextureCoord).rgb;
  vec3 halfRes = texture(u_halfScale, vTextureCoord).rgb;
  vec3 quarter = texture(u_quarterScale, vTextureCoord).rgb;

  vec3 denoised = mix(halfRes, quarter, 0.38);
  float lumaBase = luminance(base);
  float lumaDenoised = luminance(denoised);

  float lumaMix = clamp(u_lumaStrength, 0.0, 1.0);
  float chromaMix = clamp(u_chromaStrength, 0.0, 1.0);

  float outLuma = mix(lumaBase, lumaDenoised, lumaMix);
  vec3 baseChroma = base - vec3(lumaBase);
  vec3 denoisedChroma = denoised - vec3(lumaDenoised);
  vec3 outChroma = mix(baseChroma, denoisedChroma, chromaMix);

  outColor = vec4(max(vec3(outLuma) + outChroma, vec3(0.0)), 1.0);
}
