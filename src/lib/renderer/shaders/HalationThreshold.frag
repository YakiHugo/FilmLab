#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 outColor;

uniform sampler2D uSampler;

// Halation params
uniform float u_halationThreshold; // [0.5, 1.0]
// Bloom params
uniform float u_bloomThreshold;    // [0.5, 1.0]

vec3 srgb2linear(vec3 c) {
  return mix(
    c / 12.92,
    pow((c + 0.055) / 1.055, vec3(2.4)),
    step(0.04045, c)
  );
}

float luminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec3 color = texture(uSampler, vTextureCoord).rgb;
  float lum = luminance(srgb2linear(clamp(color, 0.0, 1.0)));

  // R channel: halation mask (bright pixels above halation threshold)
  float halMask = clamp(
    (lum - u_halationThreshold) / max(1.0 - u_halationThreshold, 0.001),
    0.0, 1.0
  );

  // G channel: bloom mask (bright pixels above bloom threshold)
  float bloomMask = clamp(
    (lum - u_bloomThreshold) / max(1.0 - u_bloomThreshold, 0.001),
    0.0, 1.0
  );

  // Pack both masks into a single texture for efficiency
  // R = halation mask, G = bloom mask, B = unused, A = 1
  outColor = vec4(halMask, bloomMask, 0.0, 1.0);
}
