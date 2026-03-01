#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;

// Halation params
uniform float u_halationThreshold; // [0.5, 1.0]
// Bloom params
uniform float u_bloomThreshold;    // [0.5, 1.0]

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec3 color = max(texture(uSampler, vTextureCoord).rgb, vec3(0.0));
  float lum = luminance(color);
  float redWeightedLum = dot(color, vec3(0.55, 0.35, 0.10));

  // Store HDR energy, not normalized masks, so highlights above 1.0 drive stronger optics.
  float halationEnergy = max(redWeightedLum - u_halationThreshold, 0.0);
  float bloomEnergy = max(lum - u_bloomThreshold, 0.0);

  // RGB: halation energy tinted by source color, A: neutral bloom energy.
  outColor = vec4(color * halationEnergy, bloomEnergy);
}
